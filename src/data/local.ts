/**
 * localStorage'daki iki kopya:
 *  - LEGACY_KEY: eski uygulamanın verisi (aynı adreste açılmışsa ilk açılışta devralınır).
 *  - FALLBACK_KEY: asıl depo (IndexedDB) açılamadığında ya da yazılamadığında alınan acil kopya;
 *    sonraki başarılı açılışta asıl depodakinden yeniyse geri yüklenir.
 */
import type { State } from "../domain/types";

export const LEGACY_KEY = "halisaha.v1";
export const FALLBACK_KEY = "halisaha.fallback";

function readKey(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readLegacyLocal(): unknown | null {
  return readKey(LEGACY_KEY);
}

export function readFallback(): unknown | null {
  return readKey(FALLBACK_KEY);
}

/** Acil kopyayı yazar; depolama dolu ya da kapalıysa false. */
export function writeFallback(s: State): boolean {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearFallback(): void {
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    /* depolama kapalı */
  }
}

const stamp = (x: unknown) => Number((x as { updatedAt?: unknown } | null)?.updatedAt) || 0;

/** a, b'den sonra mı kaydedildi (updatedAt). */
export const newerThan = (a: unknown, b: unknown): boolean => stamp(a) > stamp(b);

/** localStorage'daki en yeni kopya: acil kopya ya da eski uygulamanın verisi (eşitse acil kopya). */
export function readLocalBest(): { raw: unknown; key: string } | null {
  const fb = readFallback();
  const legacy = readLegacyLocal();
  if (fb && (!legacy || !newerThan(legacy, fb))) return { raw: fb, key: FALLBACK_KEY };
  return legacy ? { raw: legacy, key: LEGACY_KEY } : null;
}
