/** Kadro, kontenjan ve yedek listesi (Kural 1.2, 1.3). */
import type { Att, Match, Person, State } from "./types";

/** Oyuncu ya da o maçın misafiri. */
export function getP(s: State, m: Match | null | undefined, id: string): Person | null {
  return s.players.find((p) => p.id === id) || (m && m.guests.find((g) => g.id === id)) || null;
}

export function isGuest(s: State, id: string): boolean {
  return !s.players.some((p) => p.id === id);
}

export const isGK = (p: Person | null | undefined): boolean => !!(p && p.pos === "GK");

/** Kontenjan: (format + kaleci) × 2 takım. 7+1 → 16 kişi. */
export function capOf(s: State, m: Match): number {
  return ((m.format || s.settings.format) + 1) * 2;
}

/** Yazılma sırasına göre ilk "kontenjan" kadar kişi oynar, gerisi yedektir. "Belki" sayılmaz. */
export function lineup(s: State, m: Match): { playing: string[]; wait: string[] } {
  const ins = m.order.filter((id) => m.att[id] === "in" && getP(s, m, id));
  const c = capOf(s, m);
  return { playing: ins.slice(0, c), wait: ins.slice(c) };
}

/**
 * Katılımı ayarlar. force=false iken aynı duruma tekrar basmak yanıtı siler.
 * "Var" diyen sıranın sonuna eklenir; başka bir yanıta geçen sıradan çıkar.
 */
export function setAtt(m: Match, id: string, st: Att, force: boolean): void {
  if (!force && m.att[id] === st) delete m.att[id];
  else m.att[id] = st;
  if (m.att[id] === "in") {
    if (!m.order.includes(id)) m.order.push(id);
  } else m.order = m.order.filter((x) => x !== id);
}

/** Yedekten kadroya girenleri bulur (önceki ve sonraki kadro karşılaştırması). */
export function promoted(before: string[], after: string[]): string[] {
  const b = new Set(before);
  return after.filter((id) => !b.has(id));
}

/** Takım listelerini güncel kadroyla senkronlar; takımı olmayanları döndürür. */
export function cleanTeams(s: State, m: Match): string[] {
  const playing = lineup(s, m).playing;
  const set = new Set(playing);
  m.teams.a = m.teams.a.filter((id) => set.has(id));
  m.teams.b = m.teams.b.filter((id) => set.has(id));
  const placed = new Set(m.teams.a.concat(m.teams.b));
  return playing.filter((id) => !placed.has(id));
}

export function getMatch(s: State, id: string | null | undefined): Match | null {
  return (id && s.matches.find((m) => m.id === id)) || null;
}

const byWhen = (a: Match, b: Match) => (a.date + a.time).localeCompare(b.date + b.time);

export function openMatches(s: State): Match[] {
  return s.matches.filter((x) => x.status === "open").sort(byWhen);
}

/** Seçili açık maç; yoksa bugünden sonraki ilk açık maç; o da yoksa en son açık maç. */
export function currentMatch(s: State, selectedId: string | null, today: string): Match | null {
  const m = getMatch(s, selectedId);
  if (m && m.status === "open") return m;
  const open = openMatches(s);
  return open.find((x) => x.date >= today) || open[open.length - 1] || null;
}
