/**
 * Kıraathane puan cetveli (Kural 21.1–21.2). Masa oyunlarının puanlaması
 * yöreden yöreye değiştiği için cetvel genel tutulur: masada netleşen usule
 * göre "düşük toplam kazanır" (101) ya da "yüksek toplam kazanır" (batak,
 * king, pişti, puanlı okey) seçilir; başlangıç puanı girilebilir (puanlı
 * okeyde 20 gibi). Eller tek tek yazılır, toplam ve önde olan anında görünür.
 */
import type { Draw, Sheet } from "./types";
import { partners } from "./draw";
import { uid } from "./text";

/** Oyuna göre varsayılan usul (masada değiştirilebilir). */
export const SHEET_PRESET: Record<string, { low: boolean; start: number }> = {
  "101": { low: true, start: 0 },
  okey: { low: false, start: 20 },
  batak: { low: false, start: 0 },
  king: { low: false, start: 0 },
  pisti: { low: false, start: 0 },
};

export const groupKey = (g: string[]): string => g.join("+");

/** Masa için yeni cetvel; eşli oyunda taraflar eşlerdir (karşılıklı oturanlar). */
export function newSheet(t: number, d: Draw): Sheet | null {
  const grp = d.groups[t];
  if (!grp || grp.length < 2) return null;
  const seats = d.pairs && grp.length === 4 ? partners(grp) : grp.map((id) => [id]);
  const pre = SHEET_PRESET[d.game] || { low: false, start: 0 };
  return { id: uid(), t, key: groupKey(grp), game: d.game, low: pre.low, start: pre.start, seats, rows: [], done: false };
}

/** Masanın güncel cetveli (kura değiştiyse yok sayılır). */
export function sheetFor(sheets: Sheet[], d: Draw | undefined, t: number): Sheet | null {
  const grp = d?.groups[t];
  if (!d || !grp) return null;
  return sheets.find((x) => x.t === t && x.key === groupKey(grp) && x.game === d.game) || null;
}

/** Tarafların toplamı (başlangıç puanı dahil). */
export function totals(sh: Sheet): number[] {
  return sh.seats.map((_, i) => Math.round((sh.start + sh.rows.reduce((sum, r) => sum + (Number(r[i]) || 0), 0)) * 100) / 100);
}

/** Önde olan taraf(lar); hiç el yazılmadıysa boş. */
export function leaders(sh: Sheet): number[] {
  if (!sh.rows.length) return [];
  const tot = totals(sh);
  const best = sh.low ? Math.min(...tot) : Math.max(...tot);
  return tot.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
}

/** "12", "-4", "+3", "1,5" → sayı; boş ya da geçersizse 0. */
export function parseScore(v: string): number {
  const s = String(v || "").trim().replace(/\s/g, "").replace(",", ".").replace(/^\+/, "").replace(/^[−–]/, "-");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
