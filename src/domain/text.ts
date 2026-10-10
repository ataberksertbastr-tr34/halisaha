/** Metin yardımcıları: HTML kaçışı, Türkçe normalizasyon ve sıralama. */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Arama için: küçük harf (tr), Türkçe karakterleri sadeleştirir. "Çağrı" → "cagri", "IŞIK" → "isik". */
export function norm(s: unknown): string {
  return String(s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[âà]/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .trim();
}

const collator = new Intl.Collator("tr");
export function trCompare(a: string, b: string): number {
  return collator.compare(a, b);
}
export function trSort<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, "tr");
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

export function safeUrl(u: unknown): string {
  const s = String(u || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

/** Telefonu wa.me biçimine çevirir: 0555… → 90555…, 555… → 90555…, 00… → … */
export function phoneDigits(ph: unknown): string {
  let d = String(ph || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d[0] === "0") d = "9" + d;
  if (d.length === 10 && d[0] === "5") d = "90" + d;
  return d;
}

export function clampRating(r: unknown): number {
  const n = Math.round(Number(r));
  if (!n || Number.isNaN(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

export function pips(r: number | undefined): string {
  const v = clampRating(r || 3);
  return "●".repeat(v) + "○".repeat(5 - v);
}

/** Toplu eklemede satırı temizler: "12. Ahmet 😀" → "Ahmet" */
export function cleanBulkLine(l: string): string {
  return l.replace(/^\s*\d+\s*[.)\-:]?\s*/, "").replace(/[^\p{L}\p{N}\s.'-]/gu, "").trim();
}

export function cleanName(s: unknown): string {
  return String(s || "").trim().replace(/\s+/g, " ");
}
