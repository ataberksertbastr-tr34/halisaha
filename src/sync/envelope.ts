/**
 * Buluttaki belge: uygulama verisi sıkıştırılıp (gzip + base64) tek bir metin
 * alanında saklanır. Firestore'da bir alan en fazla ~1 MB olabilir; sıkıştırma
 * yıllarca veriye yetecek yer açar.
 */
import type { State } from "../domain/types";
import { SCHEMA_VERSION } from "../domain/schema";
import { BackupError, migrate } from "../domain/migrate";

export interface Envelope {
  /** Belge biçimi */
  fmt: 1;
  /** Verinin şema sürümü */
  schema: number;
  /** Her yazmada bir artar */
  rev: number;
  /** Yazma anı (ms) */
  at: number;
  /** Yazan cihaz */
  dev: string;
  enc: "gz64" | "json";
  data: string;
}

export type SyncErrorCode = "future" | "tooLarge" | "corrupt";
export class SyncError extends Error {
  constructor(public code: SyncErrorCode) {
    super(code);
    this.name = "SyncError";
  }
}

/** Firestore metin alanı sınırının (1.048.487 bayt) güvenli altı. */
export const MAX_DATA = 1_000_000;

const canGzip = (): boolean => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, t: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function pack(s: State, rev: number, dev: string, at = Date.now()): Promise<Envelope> {
  const json = JSON.stringify(s);
  let enc: Envelope["enc"] = "json";
  let data = json;
  if (canGzip()) {
    enc = "gz64";
    data = toB64(await pipe(new TextEncoder().encode(json), new CompressionStream("gzip")));
  }
  if (data.length > MAX_DATA) throw new SyncError("tooLarge");
  return { fmt: 1, schema: s.v || SCHEMA_VERSION, rev, at, dev, enc, data };
}

/** Belgeyi açar ve güncel şemaya taşır. Daha yeni bir uygulamanın yazdığı veride SyncError("future"). */
export async function unpack(e: Envelope): Promise<State> {
  if (e.schema > SCHEMA_VERSION) throw new SyncError("future");
  let json: string;
  try {
    if (e.enc === "gz64") {
      if (!canGzip()) throw new SyncError("corrupt");
      json = new TextDecoder().decode(await pipe(fromB64(e.data), new DecompressionStream("gzip")));
    } else json = e.data;
  } catch (err) {
    if (err instanceof SyncError) throw err;
    throw new SyncError("corrupt");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SyncError("corrupt");
  }
  try {
    return migrate(raw);
  } catch (err) {
    if (err instanceof BackupError && err.code === "future") throw new SyncError("future");
    throw new SyncError("corrupt");
  }
}
