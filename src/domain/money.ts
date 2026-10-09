/** Saha ücreti paylaşımı ve borçlar (Kural 1.5, 1.9, 2.1, 2.2, 2.4). */
import type { Match, State } from "./types";
import { getP, isGK, lineup } from "./lineup";

/** Kaleciler ücretsizse (Kural 2.1) kaleci ödemez. */
export function isFree(s: State, m: Match, id: string): boolean {
  return !!(s.settings.gkFree && isGK(getP(s, m, id)));
}

/** Ödeyenler: oynayan kadro + geç iptal edenler; kaleciler (ayara göre) ve muaflar hariç. İptal maçta kimse ödemez. */
export function payersOf(s: State, m: Match): string[] {
  if (m.status === "cancelled") return [];
  const { playing } = lineup(s, m);
  const late = Object.keys(m.att).filter((id) => m.att[id] === "late" && getP(s, m, id));
  return playing.concat(late).filter((id) => !isFree(s, m, id) && !m.exempt[id]);
}

/** Kural 2.2: yuvarlama açıksa 5 ₺'nin katına yukarı yuvarlanır, değilse kuruşa yuvarlanır. */
export function roundShare(s: State, raw: number): number {
  return s.settings.round ? Math.ceil(raw / 5) * 5 : Math.round(raw * 100) / 100;
}

export function shareOf(s: State, m: Match): number {
  const n = payersOf(s, m).length;
  return n ? roundShare(s, (Number(m.price) || 0) / n) : 0;
}

/** Henüz kimse yokken tahmini pay: kontenjana (kaleciler hariç) bölünür. */
export function estShare(s: State, m: Match): number {
  const n = payersOf(s, m).length;
  if (n) return shareOf(s, m);
  const c = (m.format || s.settings.format) * 2 + 2 - (s.settings.gkFree ? 2 : 0);
  return roundShare(s, (Number(m.price) || 0) / Math.max(1, c));
}

/** Ödemesi gelmiş maç: oynanmış ya da tarihi bugün/geçmiş olan açık maç. */
export function isDue(m: Match, today: string): boolean {
  return m.status === "played" || (m.status === "open" && m.date <= today);
}

export interface Debt {
  id: string;
  name: string;
  total: number;
  n: number;
  phone: string;
}

export function debts(s: State, today: string): Debt[] {
  const map: Record<string, Debt> = {};
  s.matches.forEach((m) => {
    if (m.status === "cancelled" || !isDue(m, today)) return;
    const sh = shareOf(s, m);
    payersOf(s, m).forEach((id) => {
      if (m.paid[id]) return;
      const p = getP(s, m, id);
      if (!p) return;
      map[id] = map[id] || { id, name: p.name, total: 0, n: 0, phone: (p as { phone?: string }).phone || "" };
      map[id].total += sh;
      map[id].n++;
    });
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function debtMap(s: State, today: string): Record<string, number> {
  const d: Record<string, number> = {};
  debts(s, today).forEach((x) => (d[x.id] = x.total));
  return d;
}
