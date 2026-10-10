/** Eski uygulamanın localStorage anahtarı (aynı adreste açılmışsa veriyi devralmak için). */
import type { State } from "../domain/types";

export const LEGACY_KEY = "halisaha.v1";

export function readLegacyLocal(): unknown | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocal(s: State): void {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(s));
  } catch {
    /* depolama dolu ya da kapalı */
  }
}
