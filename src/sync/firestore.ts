/**
 * Firestore REST istemcisi (SDK'sız, küçük). Tek belge okunur/yazılır:
 *   users/{uid}/halisaha/state
 * Yazmalar ön koşulludur: belge son okunduğundan beri değiştiyse
 * ConflictError atılır, eşitleme yeniden okuyup birleştirir.
 */
import type { Envelope } from "./envelope";

export interface RemoteDoc {
  env: Envelope;
  /** Firestore updateTime: sonraki yazmanın ön koşulu */
  token: string;
}

export interface Remote {
  read(): Promise<RemoteDoc | null>;
  /** ifToken null: belge henüz yoksa yaz. Yeni token döner. */
  write(env: Envelope, ifToken: string | null): Promise<string>;
}

/** Belge bu arada başka cihazdan değişti. */
export class ConflictError extends Error {
  constructor() {
    super("conflict");
    this.name = "ConflictError";
  }
}
/** Oturum geçersiz ya da kurallar erişimi reddetti. */
export class AuthError extends Error {
  constructor(public status: number) {
    super("auth " + status);
    this.name = "AuthError";
  }
}
/** Ağ hatası, zaman aşımı, sunucu yoğun (tekrar denenebilir). */
export class NetError extends Error {
  constructor(public status = 0) {
    super("net " + status);
    this.name = "NetError";
  }
}

export interface FirestoreOpts {
  projectId: string;
  uid: string;
  getToken(force?: boolean): Promise<string>;
  /** Varsayılan: https://firestore.googleapis.com/v1 (emülatörde http://127.0.0.1:8080/v1) */
  base?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Value = { integerValue?: string; stringValue?: string };

const FIELDS: (keyof Envelope)[] = ["fmt", "schema", "rev", "at", "dev", "enc", "data"];
const INTS = new Set<keyof Envelope>(["fmt", "schema", "rev", "at"]);

function toFields(e: Envelope): Record<string, Value> {
  const f: Record<string, Value> = {};
  for (const k of FIELDS) f[k] = INTS.has(k) ? { integerValue: String(Math.trunc(Number(e[k]) || 0)) } : { stringValue: String(e[k]) };
  return f;
}

function fromFields(f: Record<string, Value> | undefined): Envelope | null {
  if (!f || !f.data || typeof f.data.stringValue !== "string") return null;
  const int = (k: string) => Number(f[k]?.integerValue ?? 0);
  const str = (k: string) => String(f[k]?.stringValue ?? "");
  const enc = str("enc") === "gz64" ? "gz64" : "json";
  return { fmt: 1, schema: int("schema"), rev: int("rev"), at: int("at"), dev: str("dev"), enc, data: str("data") };
}

export function firestoreRemote(o: FirestoreOpts): Remote {
  const base = (o.base || "https://firestore.googleapis.com/v1").replace(/\/$/, "");
  const db = `projects/${encodeURIComponent(o.projectId)}/databases/(default)/documents`;
  const name = `${db}/users/${encodeURIComponent(o.uid)}/halisaha/state`;
  const doFetch = o.fetch || ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeout = o.timeoutMs ?? 20000;

  async function call(url: string, init: RequestInit, retried = false): Promise<Response> {
    let token: string;
    try {
      token = await o.getToken(retried);
    } catch (e) {
      // Süresi dolan belirteç bağlantı yüzünden yenilenemediyse bu bir ağ sorunudur (birazdan tekrar denenir).
      if ((e as { code?: string })?.code === "auth/network-request-failed") throw new NetError(0);
      throw e;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    let r: Response;
    try {
      r = await doFetch(url, { ...init, signal: ctl.signal, headers: { "content-type": "application/json", authorization: "Bearer " + token } });
    } catch {
      throw new NetError(0);
    } finally {
      clearTimeout(timer);
    }
    if (r.status === 401 || r.status === 403) {
      // Kimlik belirteci süresi dolmuş olabilir: bir kez yenileyip dene.
      if (!retried) return call(url, init, true);
      throw new AuthError(r.status);
    }
    if (r.status === 429 || r.status >= 500) throw new NetError(r.status);
    return r;
  }

  return {
    async read() {
      // batchGet: belge yoksa 404 yerine "missing" döner (tarayıcı konsolunda hata görünmez).
      const r = await call(`${base}/${db}:batchGet`, { method: "POST", body: JSON.stringify({ documents: [name] }) });
      if (!r.ok) throw new NetError(r.status);
      const arr = (await r.json()) as { found?: { fields?: Record<string, Value>; updateTime?: string }; missing?: string }[];
      const found = Array.isArray(arr) ? arr.find((x) => x.found)?.found : undefined;
      if (!found) return null;
      const env = fromFields(found.fields);
      if (!env || !found.updateTime) return null;
      return { env, token: found.updateTime };
    },
    async write(env, ifToken) {
      const body = {
        writes: [{ update: { name, fields: toFields(env) }, currentDocument: ifToken ? { updateTime: ifToken } : { exists: false } }],
      };
      const r = await call(`${base}/${db}:commit`, { method: "POST", body: JSON.stringify(body) });
      if (r.status === 409) throw new ConflictError();
      if (r.status === 400 || r.status === 412) {
        const j = (await r.json().catch(() => ({}))) as { error?: { status?: string } };
        if (r.status === 412 || j.error?.status === "FAILED_PRECONDITION" || j.error?.status === "ALREADY_EXISTS") throw new ConflictError();
        throw new NetError(r.status);
      }
      if (!r.ok) throw new NetError(r.status);
      const j = (await r.json()) as { writeResults?: { updateTime?: string }[]; commitTime?: string };
      const t = j.writeResults?.[0]?.updateTime || j.commitTime;
      if (!t) throw new NetError(r.status);
      return t;
    },
  };
}

export const firestoreBase = (emulatorHost?: string): string => (emulatorHost ? `http://${emulatorHost}:8080/v1` : "https://firestore.googleapis.com/v1");
