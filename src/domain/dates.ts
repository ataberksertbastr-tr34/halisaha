/** Tarih yardımcıları. Tarihler cihazın yerel saatine göre "YYYY-AA-GG" metni olarak tutulur. */

const p2 = (n: number) => String(n).padStart(2, "0");

export function iso(d: Date): string {
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

export function parseISO(s: string): Date {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): string {
  return iso(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function ddmm(s: string): string {
  const d = parseISO(s);
  return p2(d.getDate()) + "." + p2(d.getMonth() + 1);
}

export function weekday(s: string): number {
  return parseISO(s).getDay();
}

/** Maçın başlangıç anı (yerel saat). */
export function matchStart(date: string, time: string): Date {
  const d = parseISO(date);
  const [h, mi] = String(time || "21:00").split(":").map(Number);
  d.setHours(h || 0, mi || 0, 0, 0);
  return d;
}

export function monthKey(s: string): string {
  return String(s).slice(0, 7);
}
