import { tr, type MsgKey } from "./tr";
import { en } from "./en";

export type Lang = "tr" | "en";
export type { MsgKey };

const DICT: Record<Lang, Record<MsgKey, string>> = { tr, en };

export const DAYS: Record<Lang, string[]> = {
  tr: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

export const MONTHS: Record<Lang, string[]> = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

let current: Lang = "tr";

export function setLang(l: string | undefined): void {
  current = l === "en" ? "en" : "tr";
}
export function lang(): Lang {
  return current;
}

/** Çeviri; {değişken} yer tutucularını doldurur. Eksik anahtar Türkçeye, o da yoksa anahtara düşer. */
export function t(k: MsgKey, vars?: Record<string, string | number>): string {
  let s: string = DICT[current][k] ?? tr[k] ?? k;
  if (vars) for (const v in vars) s = s.split("{" + v + "}").join(String(vars[v]));
  return s;
}

/** Para birimi: her zaman Türk lirası, tr-TR biçimi (eski uygulamayla aynı). */
const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
export function money(n: number): string {
  return nf.format(Math.round(n * 100) / 100) + " ₺";
}

export function allKeys(l: Lang): string[] {
  return Object.keys(DICT[l]);
}
