/**
 * Kalıcılık: veriyi IndexedDB'de tutar, her değişiklikte yerel sürüm
 * (otomatik yedek) kaydeder, sekmeler arasında senkron kalır.
 * IndexedDB kullanılamazsa localStorage'a düşer.
 */
import type { State } from "../domain/types";
import { migrate } from "../domain/migrate";
import { SCHEMA_VERSION } from "../domain/schema";
import { kvGet, kvSet, snapGet, snapList, snapPut, type Snapshot } from "./db";
import { LEGACY_KEY, readLegacyLocal, writeLocal } from "./local";

export const KEEP_SNAPSHOTS = 10;
/** Bir sürüm açıldıktan sonraki bu süre içindeki değişiklikler aynı sürümde birleşir. */
export const COALESCE_MS = 5 * 60 * 1000;

export interface Meta {
  firstUseAt: number;
  lastExportAt: number;
  reminderSnoozeUntil: number;
  persisted?: boolean;
}

type Mode = "idb" | "local";
let mode: Mode = "idb";
let meta: Meta = { firstUseAt: Date.now(), lastExportAt: 0, reminderSnoozeUntil: 0 };
let writing: Promise<void> | null = null;
let pending: State | null = null;
let onError: (e: unknown) => void = () => undefined;
let channel: BroadcastChannel | null = null;
const tabId = Math.random().toString(36).slice(2);

export const storageMode = (): Mode => mode;
export const getMeta = (): Meta => meta;

export function onSaveError(fn: (e: unknown) => void): void {
  onError = fn;
}

const summary = (s: { players?: unknown[]; matches?: unknown[] }) => ({
  players: Array.isArray(s.players) ? s.players.length : 0,
  matches: Array.isArray(s.matches) ? s.matches.length : 0,
});

/** Uygulama açılışında veriyi yükler (gerekirse eski sürümden taşır). */
export async function loadState(): Promise<State> {
  try {
    let raw = await kvGet<unknown>("state");
    const m = await kvGet<Meta>("meta");
    if (m) meta = { ...meta, ...m };
    else await kvSet("meta", meta);
    let source = "idb";
    if (raw == null) {
      // İlk açılış: aynı adreste eski uygulama kullanıldıysa verisini devral.
      raw = readLegacyLocal();
      source = raw ? "legacy" : "empty";
    }
    const rawObj = raw as { v?: number } | null;
    const needsMigration = !!rawObj && typeof rawObj === "object" && Number(rawObj.v || 1) < SCHEMA_VERSION;
    if (rawObj && (needsMigration || source === "legacy")) {
      // Taşıma öncesi ham veriyi kilitli sürüm olarak sakla (geri dönülebilsin).
      await snapshotRaw(JSON.stringify(rawObj), source === "legacy" ? "legacy-import" : "pre-migration");
    }
    const s = migrate(raw);
    if (source !== "idb" || needsMigration) await kvSet("state", JSON.parse(JSON.stringify(s)));
    mode = "idb";
    return s;
  } catch (e) {
    console.warn("IndexedDB kullanılamıyor, localStorage'a geçildi", e);
    mode = "local";
    return migrate(readLegacyLocal());
  }
}

async function snapshotRaw(data: string, reason: string): Promise<void> {
  const sm = summary(JSON.parse(data));
  await snapPut({ at: Date.now(), data, ...sm, locked: true, reason }, { coalesceMs: COALESCE_MS, keep: KEEP_SNAPSHOTS, forceNew: true });
}

async function writeNow(s: State): Promise<void> {
  const data = JSON.stringify(s);
  if (mode === "local") {
    writeLocal(s);
    return;
  }
  await kvSet("state", JSON.parse(data));
  await snapPut({ at: Date.now(), data, ...summary(s) }, { coalesceMs: COALESCE_MS, keep: KEEP_SNAPSHOTS });
  channel?.postMessage({ type: "saved", from: tabId, updatedAt: s.updatedAt });
}

/** Değişikliği sıraya koyar; aynı anda tek yazma yapılır, son durum mutlaka yazılır. */
export function saveState(s: State): Promise<void> {
  pending = s;
  if (writing) return writing;
  writing = (async () => {
    while (pending) {
      const next = pending;
      pending = null;
      try {
        await writeNow(next);
      } catch (e) {
        onError(e);
        // Son çare: localStorage'a da yaz
        writeLocal(next);
      }
    }
    writing = null;
  })();
  return writing;
}

/** Bekleyen yazma varsa bitmesini bekler (güncelleme/kapanış öncesi). */
export async function flush(): Promise<void> {
  while (writing) await writing;
}

/** Riskli işlemden (yedek yükleme, sıfırlama, sürüme dönme) önce mevcut durumu kilitli sürüm olarak sakla. */
export async function lockedSnapshot(s: State, reason: string): Promise<void> {
  if (mode !== "idb") return;
  await flush();
  await snapPut({ at: Date.now(), data: JSON.stringify(s), ...summary(s), locked: true, reason }, { coalesceMs: COALESCE_MS, keep: KEEP_SNAPSHOTS, forceNew: true });
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
    if (raw) onChange(migrate(raw));
  };
}

export { LEGACY_KEY };
