/**
 * Kalıcılık: veriyi IndexedDB'de tutar, her değişiklikte yerel sürüm
 * (otomatik yedek) kaydeder, sekmeler arasında senkron kalır.
 *
 * Açılışta IndexedDB geçici olarak açılamazsa (iPhone'da bilinen bir durum) birkaç kez
 * yeniden denenir. Yine açılamazsa veriler localStorage'daki acil kopyaya yazılır ve
 * organizatör uyarılır; bir sonraki başarılı açılışta acil kopya asıl depodakinden yeniyse
 * geri yüklenir (öncesi kilitli sürüm olarak saklanır). Veri uygulamanın daha yeni bir
 * sürümüyle kaydedilmişse hiçbir şey yazılmaz: önce güncellemek gerekir.
 */
import type { State } from "../domain/types";
import { BackupError, migrate } from "../domain/migrate";
import { SCHEMA_VERSION } from "../domain/schema";
import { closeDB, kvGet, kvSet, snapGet, snapList, snapPut, type Snapshot } from "./db";
import { clearFallback, FALLBACK_KEY, LEGACY_KEY, newerThan, readFallback, readLocalBest, writeFallback } from "./local";

export const KEEP_SNAPSHOTS = 10;
/** Bir sürüm açıldıktan sonraki bu süre içindeki değişiklikler aynı sürümde birleşir. */
export const COALESCE_MS = 5 * 60 * 1000;

export interface Meta {
  firstUseAt: number;
  lastExportAt: number;
  reminderSnoozeUntil: number;
  persisted?: boolean;
}

/** idb: asıl depo; local: asıl depo açılamadı, acil kopyaya yazılıyor; blocked: veri daha yeni sürümün, yazılmaz */
type Mode = "idb" | "local" | "blocked";
let mode: Mode = "idb";
/** Açılıştaki durum: "local" asıl depo açılamadı, "future" veri daha yeni sürümle kaydedilmiş, "recovered" acil kopya geri yüklendi */
export type LoadIssue = "" | "local" | "future" | "recovered";
let issue: LoadIssue = "";
let onBlocked: () => void = () => undefined;
/** Açılışta asıl depoyu yeniden deneme aralıkları (ms) */
export const RETRY_MS = [200, 800, 2000];
let meta: Meta = { firstUseAt: Date.now(), lastExportAt: 0, reminderSnoozeUntil: 0 };
let onError: (e: unknown) => void = () => undefined;
let channel: BroadcastChannel | null = null;
const tabId = Math.random().toString(36).slice(2);

export const storageMode = (): Mode => mode;
export const loadIssue = (): LoadIssue => issue;
export const getMeta = (): Meta => meta;

/** Uygulama açıkken verinin daha yeni bir sürümle kaydedildiği anlaşılırsa (başka pencere güncellendi). */
export function onStorageBlocked(fn: () => void): void {
  onBlocked = fn;
}

const isFuture = (e: unknown) => e instanceof BackupError && e.code === "future";

function block(): void {
  if (mode === "blocked") return;
  mode = "blocked";
  issue = "future";
  onBlocked();
}

export function onSaveError(fn: (e: unknown) => void): void {
  onError = fn;
}

const summary = (s: { players?: unknown[]; matches?: unknown[] }) => ({
  players: Array.isArray(s.players) ? s.players.length : 0,
  matches: Array.isArray(s.matches) ? s.matches.length : 0,
});

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Uygulama açılışında veriyi yükler (gerekirse eski sürümden taşır). */
export async function loadState(): Promise<State> {
  for (let i = 0; ; i++) {
    try {
      const s = await loadFromIDB();
      mode = "idb";
      return s;
    } catch (e) {
      if (isFuture(e)) return blocked();
      // Geçici hata: bağlantıyı sıfırlayıp yeniden dene (IndexedDB hiç yoksa denemenin anlamı yok)
      if (typeof indexedDB !== "undefined" && i < RETRY_MS.length) {
        await closeDB();
        await sleep(RETRY_MS[i]);
        continue;
      }
      console.warn("IndexedDB açılamadı; veriler acil kopyaya yazılacak", e);
      mode = "local";
      issue = "local";
      try {
        return migrate(readLocalBest()?.raw ?? null);
      } catch (e2) {
        if (isFuture(e2)) return blocked();
        return migrate(null);
      }
    }
  }
}

/** Veri daha yeni bir sürümle kaydedilmiş: boş durum gösterilir, hiçbir şey yazılmaz (önce güncelle). */
function blocked(): State {
  mode = "blocked";
  issue = "future";
  return migrate(null);
}

async function loadFromIDB(): Promise<State> {
  let raw = await kvGet<unknown>("state");
  const m = await kvGet<Meta>("meta");
  if (m) meta = { ...meta, ...m };
  else await kvSet("meta", meta);
  // Asıl deponun açılamadığı (ya da yazılamadığı) bir oturumdan kalan acil kopya
  const fb = readFallback();
  let source: "idb" | "legacy" | "fallback" | "empty" = "idb";
  if (raw == null) {
    // İlk açılış: acil kopya ya da aynı adreste kullanılmış eski uygulamanın verisi (hangisi yeniyse)
    const best = readLocalBest();
    raw = best ? best.raw : null;
    source = !best ? "empty" : best.key === FALLBACK_KEY ? "fallback" : "legacy";
  } else if (fb && newerThan(fb, raw)) {
    // Acil kopya daha yeni: o oturumda girilenler geri gelir, asıl depodaki hâl kilitli sürüm olur
    await snapshotRaw(JSON.stringify(raw), "before-recovery");
    raw = fb;
    source = "fallback";
  }
  const rawObj = raw as { v?: number } | null;
  const needsMigration = !!rawObj && typeof rawObj === "object" && Number(rawObj.v || 1) < SCHEMA_VERSION;
  if (rawObj && (needsMigration || source === "legacy")) {
    // Taşıma öncesi ham veriyi kilitli sürüm olarak sakla (geri dönülebilsin).
    await snapshotRaw(JSON.stringify(rawObj), source === "legacy" ? "legacy-import" : "pre-migration");
  }
  const s = migrate(raw);
  if (source !== "idb" || needsMigration) await kvSet("state", JSON.parse(JSON.stringify(s)));
  // Asıl depo artık en yeni hâli tutuyor; acil kopya (eskiyse de) silinir
  if (fb) clearFallback();
  if (source === "fallback") issue = "recovered";
  return s;
}

async function snapshotRaw(data: string, reason: string): Promise<void> {
  const sm = summary(JSON.parse(data));
  await snapPut({ at: Date.now(), data, ...sm, locked: true, reason }, { coalesceMs: COALESCE_MS, keep: KEEP_SNAPSHOTS, forceNew: true });
}

async function writeNow(s: State): Promise<void> {
  if (mode === "blocked") return;
  if (mode === "local") {
    if (!writeFallback(s)) throw new Error("localStorage");
    return;
  }
  // Uygulama başka pencerede güncellendiyse bu pencere yeni şemadaki veriyi eskisiyle ezmesin
  const cur = await kvGet<{ v?: number }>("state");
  if (cur && Number(cur.v || 1) > SCHEMA_VERSION) return block();
  const data = JSON.stringify(s);
  await kvSet("state", JSON.parse(data));
  await snapPut({ at: Date.now(), data, ...summary(s) }, { coalesceMs: COALESCE_MS, keep: KEEP_SNAPSHOTS });
  channel?.postMessage({ type: "saved", from: tabId, updatedAt: s.updatedAt });
}

/**
 * Sıralı yazma kuyruğu: kilitli sürümler ve kayıtlar geldiği sırayla yazılır.
 * Art arda gelen kayıtlar tek yazmada birleşir (her zaman en son durum yazılır).
 */
type Op = { kind: "lock"; data: string; reason: string } | { kind: "save" };
const queue: Op[] = [];
let latest: State | null = null;
let running: Promise<void> | null = null;

function run(): Promise<void> {
  if (running) return running;
  running = (async () => {
    while (queue.length) {
      const op = queue.shift()!;
      try {
        if (op.kind === "lock") {
          if (mode === "idb") await snapPut({ at: Date.now(), data: op.data, ...summary(JSON.parse(op.data)), locked: true, reason: op.reason }, { coalesceMs: COALESCE_MS, keep: KEEP_SNAPSHOTS, forceNew: true });
        } else if (latest) {
          const s = latest;
          try {
            await writeNow(s);
          } catch (e) {
            onError(e);
            // Son çare: acil kopya (sonraki açılışta asıl depodakinden yeniyse geri yüklenir)
            if (mode === "idb") writeFallback(s);
          }
        }
      } catch (e) {
        console.warn(e);
      }
    }
    running = null;
  })();
  return running;
}

/** Değişikliği sıraya koyar. */
export function saveState(s: State): Promise<void> {
  latest = s;
  if (!queue.some((o) => o.kind === "save")) queue.push({ kind: "save" });
  return run();
}

/** Bekleyen yazmaların bitmesini bekler (güncelleme/kapanış öncesi). */
export async function flush(): Promise<void> {
  while (running) await running;
}

/** Riskli işlemden önceki durumu kilitli sürüm olarak sıraya koyar (sonraki kayıttan önce yazılır). */
export function lockedSnapshot(s: State, reason: string): Promise<void> {
  queue.push({ kind: "lock", data: JSON.stringify(s), reason });
  return run();
}

export async function listSnapshots(): Promise<Snapshot[]> {
  if (mode !== "idb") return [];
  return snapList();
}

export async function readSnapshot(id: number): Promise<State | null> {
  const s = await snapGet(id);
  return s ? migrate(JSON.parse(s.data)) : null;
}

export async function updateMeta(patch: Partial<Meta>): Promise<void> {
  meta = { ...meta, ...patch };
  if (mode === "idb") await kvSet("meta", meta).catch(() => undefined);
}

/** Tarayıcıdan verinin silinmemesini (kalıcı depolama) ister. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    const already = await navigator.storage.persisted();
    const ok = already || (await navigator.storage.persist());
    if (ok !== meta.persisted) await updateMeta({ persisted: ok });
    return ok;
  } catch {
    return false;
  }
}

/** Başka bir sekmede kaydedilen değişiklikleri dinler. */
export function listenOtherTabs(onChange: (s: State) => void): void {
  if (typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("halisaha");
  channel.onmessage = async (ev) => {
    const d = ev.data as { type?: string; from?: string };
    if (d?.type !== "saved" || d.from === tabId) return;
    const raw = await kvGet<unknown>("state").catch(() => null);
    if (!raw) return;
    let next: State;
    try {
      next = migrate(raw);
    } catch (e) {
      // Öbür pencere yeni sürümle kaydetti: bu pencere artık yazmaz
      if (isFuture(e)) block();
      return;
    }
    onChange(next);
  };
}

export { FALLBACK_KEY, LEGACY_KEY };
