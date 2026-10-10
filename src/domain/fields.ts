/** Kayıtlı sahalar, harita ve yol tarifi bağlantıları. */
import type { Field, Match, State } from "./types";
import { safeUrl } from "./text";

export function getField(s: State, id: string | null | undefined): Field | null {
  return (id && s.fields.find((f) => f.id === id)) || null;
}

/** Maçın sahası; saha silinmişse yalnızca adı (eski veri). */
export function fieldOf(s: State, m: Match): Partial<Field> & { name: string } | null {
  return getField(s, m.fieldId) || (m.field ? { name: m.field } : null);
}

const hasLoc = (f: Partial<Field>) => f.lat != null && f.lng != null;

export function mapsUrl(f: Partial<Field> | null): string {
  if (!f) return "";
  const l = safeUrl(f.link);
  if (l) return l;
  if (hasLoc(f)) return "https://www.google.com/maps/search/?api=1&query=" + f.lat + "," + f.lng;
  const q = [f.name, f.address].filter(Boolean).join(", ");
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "";
}

export function dirUrl(f: Partial<Field> | null): string {
  if (!f) return "";
  if (hasLoc(f)) return "https://www.google.com/maps/dir/?api=1&destination=" + f.lat + "," + f.lng;
  const l = safeUrl(f.link);
  if (l) return l;
  const q = [f.name, f.address].filter(Boolean).join(", ");
  return q ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(q) : "";
}

export function telHref(phone: string | undefined): string {
  return String(phone || "").replace(/[^\d+]/g, "");
}
