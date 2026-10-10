/** Testlerde uydurma veri üretimi. */
import { defaults } from "../../src/domain/schema";
import type { Match, Player, Pos, State } from "../../src/domain/types";

export function player(id: string, name: string, rating = 3, pos: Pos = "", extra: Partial<Player> = {}): Player {
  return { id, name, rating, pos, phone: "", active: true, fixed: false, ...extra };
}

export function match(id: string, extra: Partial<Match> = {}): Match {
  return {
    id, kind: "football", title: "", cap: 0, lockH: 24, date: "2026-10-13", time: "21:00", fieldId: "", price: 3000, format: 7, status: "open",
    att: {}, order: [], guests: [], exempt: {}, teams: { a: [], b: [] }, score: null,
    locks: {}, goals: {}, mvp: "", noshow: {}, reserved: false,
    removed: {}, checks: {}, agree: {}, note: "", cars: [], games: [], injured: {}, sheets: [], ...extra,
  };
}

export function state(players: Player[] = [], matches: Match[] = [], settings: Partial<State["settings"]> = {}): State {
  const s = defaults();
  s.players = players;
  s.matches = matches;
  Object.assign(s.settings, settings);
  return s;
}

/** n oyuncu: id p0..pn-1, isimler uydurma. */
export function roster(n: number, opts: { ratings?: number[]; pos?: Pos[] } = {}): Player[] {
  return Array.from({ length: n }, (_, i) => player("p" + i, "Oyuncu " + i, opts.ratings?.[i] ?? 3, opts.pos?.[i] ?? ""));
}

/** Herkesi sırayla "Var" yazar. */
export function allIn(m: Match, ids: string[]): Match {
  ids.forEach((id) => {
    m.att[id] = "in";
    if (!m.order.includes(id)) m.order.push(id);
  });
  return m;
}
