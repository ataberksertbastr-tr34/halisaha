/** Takım adları ve yelek renkleri (Kural 3.3: takımlar yelek ya da forma rengiyle ayrılır). */
import { lang, t } from "../i18n";
import type { Side, State } from "./types";
import type { Txt } from "./kinds";
import { L } from "./kinds";

export interface BibColor extends Txt {
  id: string;
  hex: string;
  emoji: string;
}

/** Yelek renkleri: varsayılanlar sarı ve turuncu; Predators renkleri de seçilebilir. */
export const BIB_COLORS: BibColor[] = [
  { id: "yellow", hex: "#E6CF3A", emoji: "🟡", tr: "Sarı", en: "Yellow" },
  { id: "orange", hex: "#EE7A2C", emoji: "🟠", tr: "Turuncu", en: "Orange" },
  { id: "red", hex: "#B3262E", emoji: "🔴", tr: "Bordo", en: "Crimson" },
  { id: "black", hex: "#1C1F26", emoji: "⚫", tr: "Siyah", en: "Black" },
  { id: "gold", hex: "#C9A04B", emoji: "🟨", tr: "Altın", en: "Gold" },
  { id: "white", hex: "#F1EEE4", emoji: "⚪", tr: "Beyaz", en: "White" },
  { id: "blue", hex: "#2F6FD6", emoji: "🔵", tr: "Mavi", en: "Blue" },
  { id: "green", hex: "#2E9D5B", emoji: "🟢", tr: "Yeşil", en: "Green" },
  { id: "purple", hex: "#7A4BC8", emoji: "🟣", tr: "Mor", en: "Purple" },
];

const DEFAULT: Record<Side, string> = { a: "#E6CF3A", b: "#EE7A2C" };

export function teamColor(s: State, side: Side): string {
  const c = (side === "a" ? s.settings.teamA : s.settings.teamB)?.color;
  return c || DEFAULT[side];
}

export function bibOf(hex: string): BibColor | undefined {
  return BIB_COLORS.find((b) => b.hex.toLowerCase() === hex.toLowerCase());
}

export function teamEmoji(s: State, side: Side): string {
  return bibOf(teamColor(s, side))?.emoji || (side === "a" ? "🟡" : "🟠");
}

/** Takım adı: ayarlardaki ad, yoksa renginden ("Sarılar"), o da yoksa varsayılan. */
export function teamName(s: State, side: Side): string {
  const st = side === "a" ? s.settings.teamA : s.settings.teamB;
  if (st?.name?.trim()) return st.name.trim();
  if (st?.color) {
    const b = bibOf(st.color);
    if (b) return plural(L(b));
  }
  return t(side === "a" ? "teamA" : "teamB");
}

/** "Sarı" → "Sarılar", "Siyah" → "Siyahlar" (Türkçe ünlü uyumu); İngilizcede "Yellows". */
export function plural(word: string): string {
  if (lang() === "en") return word + "s";
  const vowels = word.toLocaleLowerCase("tr").match(/[aeıioöuü]/g);
  const last = vowels ? vowels[vowels.length - 1] : "a";
  return word + ("aıou".includes(last) ? "lar" : "ler");
}

/** Arka plan rengine göre okunur yazı rengi. */
export function onColor(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.22 ? "#16181D" : "#FBF7EE";
}
