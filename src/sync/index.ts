/**
 * Cihazlar arası eşitleme: Firebase girişi + Firestore'daki tek belge.
 * Giriş kodu (Firebase SDK) yalnızca gerektiğinde yüklenir. Daha önce giriş
 * yapılmış cihazda açılıştan kısa süre sonra, hiç giriş yapılmamışsa ancak
 * "Giriş yap"a dokununca.
 */
import type { State } from "../domain/types";
import { activeConfig, builtIn, EMULATOR, EMULATOR_HOST, parseConfig, storeConfig } from "./config";
import { createEngine, type Engine, type SyncMeta, type SyncStatus } from "./engine";
import { firestoreRemote, firestoreBase, type Remote } from "./firestore";
import { pack, unpack } from "./envelope";
import { hasUserData, merge3 } from "./merge";
import type { SyncUser } from "./auth";
import { kvGet, kvSet } from "../data/db";

export type { SyncUser } from "./auth";
export type { SyncStatus } from "./engine";

export interface SyncDeps {
  getState(): State;
  version(): number;
  apply(s: State): boolean;
  lock(s: State, reason: string): Promise<void>;
  hasData(s: State): boolean;
  lang(): string;
}

export interface SyncView {
  /** Firebase yapılandırması var mı */
  configured: boolean;
  /** Yapılandırma kodun içinde mi (ayarlardan değiştirilemez) */
  builtIn: boolean;
  /** Giriş modülü yükleniyor / oturum açılıyor */
  loading: boolean;
  user: SyncUser | null;
  status: SyncStatus;
}

type AuthMod = typeof import("./auth");

const ON_KEY = "halisaha.sync.on";
const DEVICE_KEY = "halisaha.device";
const POLL_MS = 30_000;
const THROTTLE_MS = 3_000;

let deps: SyncDeps | null = null;
let engine: Engine | null = null;
let authMod: AuthMod | null = null;
let authLoading: Promise<AuthMod> | null = null;
let user: SyncUser | null = null;
let remote: Remote | null = null;
let loading = false;
let lastKick = 0;
const listeners = new Set<() => void>();

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null): void {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* kapalı depolama */
    }
  },
};

function deviceId(): string {
  let id = ls.get(DEVICE_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    ls.set(DEVICE_KEY, id);
  }
  return id;
}

const notify = () => listeners.forEach((fn) => fn());

async function loadMeta(uid: string): Promise<SyncMeta | null> {
  try {
    return (await kvGet<SyncMeta>("sync:" + uid)) ?? null;
  } catch {
    const raw = ls.get("halisaha.sync." + uid);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  }
}

async function saveMeta(m: SyncMeta): Promise<void> {
  try {
    await kvSet("sync:" + m.uid, JSON.parse(JSON.stringify(m)));
  } catch {
    ls.set("halisaha.sync." + m.uid, JSON.stringify(m));
  }
}

function onUser(u: SyncUser | null): void {
  user = u;
  loading = false;
  const cfg = activeConfig();
  if (u && cfg && authMod) {
    ls.set(ON_KEY, "1");
    const mod = authMod;
    remote = firestoreRemote({ projectId: cfg.projectId, uid: u.uid, getToken: (force) => mod.idToken(force), base: firestoreBase(EMULATOR ? EMULATOR_HOST : undefined) });
  } else {
    ls.set(ON_KEY, null);
    remote = null;
  }
  notify();
  void engine?.userChanged();
}

/** Giriş modülünü yükler ve Firebase'i başlatır (bir kez). */
function loadAuth(): Promise<AuthMod> {
  const cfg = activeConfig();
  if (!cfg || !deps) return Promise.reject(Object.assign(new Error("setup"), { code: "auth/configuration-not-found" }));
  if (!authLoading) {
    const d = deps;
    authLoading = import("./auth").then((m) => {
      authMod = m;
      m.start(cfg, d.lang(), onUser);
      return m;
    });
    authLoading.catch(() => {
      authLoading = null;
    });
  }
  return authLoading;
}

/** Belirli aralıklarla ve uygulama öne gelince eşitle. */
function kick(force = false): void {
  if (!engine || !user) return;
  const now = Date.now();
  if (!force && now - lastKick < THROTTLE_MS) return;
  lastKick = now;
  void engine.syncNow();
}

function bindTriggers(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
    else if (engine?.status().pending) kick(true);
  });
  window.addEventListener("focus", () => kick());
  // Bağlantı gelince hemen değil, kısa ve rastgele bir gecikmeyle: aynı anda bağlanan iki cihaz çakışmasın.
  window.addEventListener("online", () => setTimeout(() => kick(true), 300 + Math.random() * 1500));
  window.addEventListener("offline", () => notify());
  window.addEventListener("pagehide", () => {
    if (engine?.status().pending) kick(true);
  });
  setInterval(() => {
    if (document.visibilityState === "visible") kick();
  }, POLL_MS);
}

export function initSync(d: SyncDeps): void {
  deps = d;
  engine = createEngine({
    getState: d.getState,
    version: d.version,
    apply: d.apply,
    uid: () => (user && remote ? user.uid : null),
    remote: () => remote,
    loadMeta,
    saveMeta,
    lock: d.lock,
    merge: merge3,
    encode: (s, rev) => pack(s, rev, deviceId()),
    decode: unpack,
    hasData: d.hasData,
    isEmpty: (s) => !hasUserData(s),
    online: () => navigator.onLine !== false,
    now: () => Date.now(),
  });
  engine.onStatus(notify);
  bindTriggers();
  // Bu cihazda daha önce giriş yapıldıysa, açılış bittikten sonra oturumu geri yükle.
  if (activeConfig() && ls.get(ON_KEY) === "1") {
    loading = true;
    const later = (fn: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));
    later(() => {
      loadAuth().catch(() => {
        loading = false;
        notify();
      });
    });
  }
}

export function onSyncChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function syncView(): SyncView {
  const cfg = activeConfig();
  const status: SyncStatus = engine ? engine.status() : { state: "off", lastSyncAt: 0, pending: false };
  return { configured: !!cfg, builtIn: builtIn(), loading, user, status: cfg ? (navigator.onLine === false && user ? { ...status, state: "offline" } : status) : { ...status, state: "off" } };
}

/** Yerel değişiklik oldu (store.commit). */
export function syncChanged(): void {
  engine?.changed();
}

export function syncNow(): Promise<void> {
  return engine && user ? engine.syncNow() : Promise.resolve();
}

async function withAuth<T>(fn: (m: AuthMod) => Promise<T>): Promise<T> {
  loading = true;
  notify();
  try {
    const m = await loadAuth();
    return await fn(m);
  } finally {
    loading = false;
    notify();
  }
}

/** Hata durumunda Firebase hata koduna karşılık gelen anahtarla (ör. "badLogin") Error atar. */
async function guarded<T>(fn: (m: AuthMod) => Promise<T>): Promise<T> {
  try {
    return await withAuth(fn);
  } catch (e) {
    const key = authMod ? authMod.errorKey(e) : String((e as { code?: string })?.code || "").startsWith("auth/") ? "setup" : "network";
    if (key === "unknown") console.warn("giriş hatası", e);
    throw new Error(key, { cause: e });
  }
}

/**
 * Giriş modülünü önceden yükler (Ayarlar'daki eşitleme bölümü açılınca). Böylece
 * "Google ile giriş yap"a dokununca pencere hemen, dokunuşun içinde açılır;
 * iPhone Safari gecikmeli açılan pencereleri engeller.
 */
export function prewarmAuth(): void {
  if (!activeConfig() || authLoading) return;
  loadAuth().catch(() => undefined);
}

/** Google penceresini açar. Modül yüklüyse araya hiç bekleme koymadan (dokunuşun içinde) çağrılır. */
export function signInGoogle(): Promise<void> {
  const m = authMod;
  if (!m) return guarded((mod) => mod.signInGoogle());
  loading = true;
  notify();
  const run = m.signInGoogle(); // signInWithPopup burada, eşzamanlı olarak pencereyi açar
  return run.then(
    () => {
      loading = false;
      notify();
    },
    (e: unknown) => {
      loading = false;
      notify();
      const key = m.errorKey(e);
      if (key === "unknown") console.warn("giriş hatası", e);
      throw new Error(key, { cause: e });
    },
  );
}
export const signInEmail = (email: string, pw: string) => guarded((m) => m.signInEmail(email, pw));
export const signUpEmail = (email: string, pw: string) => guarded((m) => m.signUpEmail(email, pw));
export const resetPassword = (email: string) => guarded((m) => m.resetPassword(email));
export async function setPassword(pw: string): Promise<void> {
  const u = await guarded((m) => m.setPassword(pw));
  if (u) user = u;
  notify();
}
export async function signOutSync(): Promise<void> {
  await syncNow().catch(() => undefined);
  await guarded((m) => m.signOut());
}

export function setLanguage(lang: string): void {
  authMod?.setLanguage(lang);
}

/** Organizatörün yapıştırdığı Firebase yapılandırmasını saklar (koddaki yoksa). */
export function saveConfigText(text: string): boolean {
  const cfg = parseConfig(text);
  if (!cfg) return false;
  storeConfig(cfg);
  notify();
  return true;
}

export function clearConfig(): void {
  storeConfig(null);
  notify();
}
