/**
 * Eşitleme motoru: cihazdaki veri ile buluttaki tek belgeyi uzlaştırır.
 *
 * Her cihaz "taban" (base) tutar: buluttakiyle en son anlaşılan durum.
 *  - Bulut değişmemiş, cihaz değişmiş → cihazdaki veri yazılır.
 *  - Bulut değişmiş → üç yönlü birleştirme (taban, cihaz, bulut); sonuç
 *    cihaza uygulanır ve gerekirse buluta yazılır.
 * Yazmalar ön koşulludur; araya başka cihaz girerse baştan okunur. Motor
 * platformdan bağımsızdır (testte sahte bulut ve sahte saatle çalışır).
 */
import type { State } from "../domain/types";
import { ConflictError, AuthError, NetError, type Remote } from "./firestore";
import { SyncError, type Envelope } from "./envelope";

export type SyncState = "off" | "signedOut" | "idle" | "syncing" | "offline" | "error" | "needsUpdate";

export interface SyncStatus {
  state: SyncState;
  /** Son başarılı eşitleme (ms, 0 = hiç) */
  lastSyncAt: number;
  /** Hata türü (error durumunda) */
  error?: string;
  /** Gönderilmeyi bekleyen değişiklik var mı */
  pending: boolean;
}

export interface SyncMeta {
  uid: string;
  /** Buluttakiyle en son anlaşılan durum (null: bu cihaz bu hesapla hiç eşitlenmedi) */
  base: State | null;
  /** Son görülen bulut belgesinin sürüm belirteci */
  token: string | null;
  rev: number;
  lastSyncAt: number;
}

export interface EngineDeps {
  getState(): State;
  /** Her yerel değişiklikte artan sayaç */
  version(): number;
  /**
   * Birleştirilmiş veriyi cihaza uygular (updatedAt'e dokunmadan kaydeder, ekranı yeniler).
   * Verilen nesne uygulama durumu olur (motor kendi kopyasını saklar). Meşgulse false.
   */
  apply(s: State): boolean;
  /** Oturum açık değilse null */
  uid(): string | null;
  remote(): Remote | null;
  loadMeta(uid: string): Promise<SyncMeta | null>;
  saveMeta(m: SyncMeta): Promise<void>;
  /** İlk birleştirmeden önce cihazdaki veriyi kilitli yerel sürüm olarak saklar */
  lock(s: State, reason: string): Promise<void>;
  merge(base: State | null, local: State, remote: State): State;
  encode(s: State, rev: number): Promise<Envelope>;
  decode(e: Envelope): Promise<State>;
  hasData(s: State): boolean;
  /** Kullanıcı verisi yok (yalnızca varsayılanlar / otomatik planlanmış boş maçlar) */
  isEmpty(s: State): boolean;
  online(): boolean;
  now(): number;
}

export interface Engine {
  /** Yerel değişiklik oldu: kısa bir beklemeden sonra gönder. */
  changed(): void;
  /** Hemen eşitle (eşitleme sürüyorsa bittikten sonra bir tur daha). */
  syncNow(): Promise<void>;
  /** Oturum değişti: tabanı yeni hesaba göre yükle ve eşitle. */
  userChanged(): Promise<void>;
  status(): SyncStatus;
  onStatus(fn: (s: SyncStatus) => void): () => void;
  /** Bekleyen zamanlayıcıları durdurur. */
  stop(): void;
}

export const DEBOUNCE_MS = 1500;
const MAX_ATTEMPTS = 5;
const BACKOFF = [5000, 15000, 60000];
const BUSY_RETRY_MS = 5000;

/** Anahtar sırasından bağımsız, updatedAt'i yok sayan karşılaştırma. */
export function canon(s: unknown): string {
  return JSON.stringify(s, function (this: unknown, k, v: unknown) {
    if (k === "updatedAt" && this && typeof this === "object" && "settings" in (this as object)) return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(o).sort()) if (o[key] !== undefined) out[key] = o[key];
      return out;
    }
    return v;
  });
}
export const sameData = (a: State | null, b: State | null): boolean => !!a && !!b && canon(a) === canon(b);

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function createEngine(d: EngineDeps): Engine {
  let st: SyncStatus = { state: d.uid() ? "idle" : "signedOut", lastSyncAt: 0, pending: false };
  const listeners = new Set<(s: SyncStatus) => void>();
  let meta: SyncMeta | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let syncedVersion = -1;
  /** Bu oturumda ilk birleştirme öncesi kilitli sürümü alınmış hesaplar (her denemede tekrar alınmasın). */
  const locked = new Set<string>();

  const set = (patch: Partial<SyncStatus>) => {
    st = { ...st, ...patch };
    listeners.forEach((fn) => fn(st));
  };

  const schedule = (ms: number) => {
    if (retry) clearTimeout(retry);
    retry = setTimeout(() => {
      retry = null;
      void syncNow();
    }, ms);
  };

  async function ensureMeta(uid: string): Promise<SyncMeta> {
    if (meta && meta.uid === uid) return meta;
    const m = await d.loadMeta(uid).catch(() => null);
    meta = m && m.uid === uid ? m : { uid, base: null, token: null, rev: 0, lastSyncAt: 0 };
    if (meta.lastSyncAt) set({ lastSyncAt: meta.lastSyncAt });
    return meta;
  }

  async function commitMeta(m: SyncMeta, base: State, token: string, rev: number): Promise<void> {
    m.base = clone(base);
    m.token = token;
    m.rev = rev;
    m.lastSyncAt = d.now();
    await d.saveMeta(m).catch(() => undefined);
  }

  /** Tek tur. true: bitti; false: meşgul (sonra tekrar). */
  async function once(): Promise<boolean> {
    const uid = d.uid();
    const remote = d.remote();
    if (!uid || !remote) {
      set({ state: "signedOut" });
      return true;
    }
    if (!d.online()) {
      set({ state: "offline" });
      return true;
    }
    // Bekleyen değişiklik yokken yapılan arka plan kontrolünde durum "Eşitleniyor"a dönmez
    // (rozet her 30 sn'de bir yanıp sönmesin, ekran okuyucu boşuna duyurmasın).
    if (st.pending || st.state !== "idle") set({ state: "syncing" });
    const m = await ensureMeta(uid);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const v0 = d.version();
      // Kopya: uygulama durumu yerinde değişir; ağ beklenirken yapılan değişiklik
      // "gönderildi" sanılıp tabana girmesin (bir sonraki turda gönderilir).
      const local = clone(d.getState());
      const doc = await remote.read();
      try {
        if (!doc) {
          // Boş cihaz buluta boş belge yazmaz: sonra bağlanacak dolu cihazın ayarlarını ezmesin.
          if (d.isEmpty(local)) {
            syncedVersion = v0;
            return true;
          }
          // Bulutta henüz veri yok (ilk cihaz) ya da silinmiş: bu cihazdakini yaz.
          const token = await remote.write(await d.encode(local, 1), null);
          await commitMeta(m, local, token, 1);
          syncedVersion = v0;
          return true;
        }
        // Cihaz tamamen boşaldıysa (sıfırlama) bu, buluttaki her şeyi silme isteği sayılmaz:
        // taban unutulur, buluttaki veri cihaza geri gelir. Diğer cihazlar silinmez.
        if (m.base && d.isEmpty(local) && !d.isEmpty(m.base)) {
          m.base = null;
          m.token = null;
        }
        if (doc.token === m.token && m.base) {
          if (sameData(local, m.base)) {
            syncedVersion = v0;
            return true;
          }
          const rev = doc.env.rev + 1;
          const token = await remote.write(await d.encode(local, rev), doc.token);
          await commitMeta(m, local, token, rev);
          syncedVersion = v0;
          return true;
        }
        const theirs = await d.decode(doc.env);
        if (!m.base && d.hasData(local) && !locked.has(m.uid)) {
          locked.add(m.uid);
          await d.lock(local, "before-sync");
        }
        const merged = d.merge(m.base, local, theirs);
        // Bu arada cihazda yeni değişiklik olduysa baştan (yeni hâliyle) birleştir.
        if (d.version() !== v0) continue;
        const snap = clone(merged);
        if (!sameData(merged, local) && !d.apply(merged)) return false;
        const vApplied = d.version();
        let token = doc.token;
        let rev = doc.env.rev;
        if (!sameData(snap, theirs)) {
          rev = doc.env.rev + 1;
          token = await remote.write(await d.encode(snap, rev), doc.token);
        }
        await commitMeta(m, snap, token, rev);
        syncedVersion = vApplied;
        return true;
      } catch (e) {
        if (e instanceof ConflictError) continue;
        throw e;
      }
    }
    throw new ConflictError();
  }

  async function loop(): Promise<void> {
    do {
      again = false;
      try {
        const done = await once();
        if (!done) {
          // Uygulama meşgul (açık pencere ya da yazılmakta olan metin): biraz sonra tekrar.
          set({ state: "idle", pending: true });
          schedule(BUSY_RETRY_MS);
          return;
        }
        failures = 0;
        const signedIn = !!d.uid() && !!d.remote();
        // Son eşitleme: son başarılı kontrol (bir şey yazılmasa da bulutla aynı olduğu doğrulandı).
        if (signedIn && (st.state === "syncing" || st.state === "idle")) set({ state: "idle", error: undefined, lastSyncAt: d.now() });
        set({ pending: syncedVersion !== d.version() && signedIn });
      } catch (e) {
        if (e instanceof SyncError && e.code === "future") {
          set({ state: "needsUpdate", error: "future" });
          return;
        }
        if (e instanceof NetError) {
          set({ state: d.online() ? "error" : "offline", error: "net", pending: true });
          schedule(BACKOFF[Math.min(failures++, BACKOFF.length - 1)]);
          return;
        }
        if (e instanceof AuthError) {
          set({ state: "error", error: "auth", pending: true });
          return;
        }
        set({ state: "error", error: e instanceof SyncError ? e.code : e instanceof ConflictError ? "conflict" : "unknown", pending: true });
        schedule(BACKOFF[Math.min(failures++, BACKOFF.length - 1)]);
        return;
      }
    } while (again);
  }

  function syncNow(): Promise<void> {
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
    if (running) {
      again = true;
      return running;
    }
    running = loop().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    changed() {
      if (!d.uid()) return;
      set({ pending: true });
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void syncNow();
      }, DEBOUNCE_MS);
    },
    syncNow,
    async userChanged() {
      meta = null;
      syncedVersion = -1;
      const uid = d.uid();
      if (!uid) {
        set({ state: "signedOut", pending: false, error: undefined, lastSyncAt: 0 });
        return;
      }
      await ensureMeta(uid);
      await syncNow();
    },
    status: () => st,
    onStatus(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop() {
      if (debounce) clearTimeout(debounce);
      if (retry) clearTimeout(retry);
      debounce = retry = null;
    },
  };
}
