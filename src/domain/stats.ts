/** Oyuncu istatistikleri: halı saha maçları (G/B/M, gol) ve diğer etkinlikler (katılım, oyun galibiyeti). */
import { winnerOf } from "./scoring";
import type { Kind, Match, State } from "./types";
import { lineup } from "./lineup";
import { isFootball } from "./kinds";

export interface PStat {
  p: number;
  w: number;
  d: number;
  l: number;
}

export function computeStats(s: State): Record<string, PStat> {
  const st: Record<string, PStat> = {};
  s.matches.forEach((m) => {
    if (m.status !== "played" || !isFootball(m)) return;
    lineup(s, m).playing.forEach((id) => {
      st[id] = st[id] || { p: 0, w: 0, d: 0, l: 0 };
      st[id].p++;
    });
    if (!m.score || !(m.teams.a.length || m.teams.b.length)) return;
    const r = m.score.a > m.score.b ? "a" : m.score.a < m.score.b ? "b" : "d";
    (["a", "b"] as const).forEach((side) =>
      m.teams[side].forEach((id) => {
        const x = st[id];
        if (!x) return;
        if (r === "d") x.d++;
        else if (r === side) x.w++;
        else x.l++;
      }),
    );
  });
  return st;
}

export interface SeasonRow {
  id: string;
  name: string;
  played: number;
  w: number;
  d: number;
  l: number;
  goals: number;
  mvp: number;
  /** Galibiyet 3, beraberlik 1 */
  pts: number;
  /** Katılım oranı (0–1): oyuncunun sezondaki ilk maçından sonraki maçlara göre */
  rate: number;
  /** Oranın paydası (o tarihten sonra oynanan maç sayısı) */
  possible: number;
}

const when = (m: Match) => m.date + " " + m.time;

/** Verideki sezonlar (yıl), yeniden eskiye. */
export function seasons(s: State): string[] {
  return [...new Set(s.matches.filter((m) => m.status === "played" && m.date).map((m) => m.date.slice(0, 4)))].sort().reverse();
}

const inSeason = (m: Match, season: string) => !season || m.date.startsWith(season);

/** Sezon tablosu (season: "2026" ya da "" = tüm zamanlar). Yalnızca kayıtlı oyuncular. */
export function seasonTable(s: State, season = ""): SeasonRow[] {
  const ms = s.matches.filter((m) => m.status === "played" && isFootball(m) && inSeason(m, season)).sort((a, b) => when(a).localeCompare(when(b)));
  const rows = new Map<string, SeasonRow>();
  const first = new Map<string, number>();
  const players = new Map(s.players.map((p) => [p.id, p]));
  ms.forEach((m, idx) => {
    const r = m.score ? (m.score.a > m.score.b ? "a" : m.score.a < m.score.b ? "b" : "d") : null;
    const hasTeams = m.teams.a.length > 0 || m.teams.b.length > 0;
    for (const id of lineup(s, m).playing) {
      const p = players.get(id);
      if (!p) continue;
      let row = rows.get(id);
      if (!row) rows.set(id, (row = { id, name: p.name, played: 0, w: 0, d: 0, l: 0, goals: 0, mvp: 0, pts: 0, rate: 0, possible: 0 }));
      if (!first.has(id)) first.set(id, idx);
      row.played++;
      row.goals += m.goals[id] || 0;
      if (m.mvp === id) row.mvp++;
      if (r && hasTeams) {
        const side = m.teams.a.includes(id) ? "a" : m.teams.b.includes(id) ? "b" : null;
        if (side) {
          if (r === "d") row.d++;
          else if (r === side) row.w++;
          else row.l++;
        }
      }
    }
  });
  for (const row of rows.values()) {
    row.pts = row.w * 3 + row.d;
    row.possible = ms.length - (first.get(row.id) ?? 0);
    row.rate = row.possible ? row.played / row.possible : 0;
  }
  return [...rows.values()].sort((a, b) => b.pts - a.pts || b.w - a.w || b.goals - a.goals || b.played - a.played || a.name.localeCompare(b.name, "tr"));
}

export interface PlayerCard {
  row: SeasonRow | null;
  /** Son oynadığı maçlar (yeniden eskiye) */
  recent: { m: Match; side: "a" | "b" | null; result: "w" | "d" | "l" | null; goals: number; mvp: boolean; noshow: boolean }[];
}

export function playerCard(s: State, id: string, season = ""): PlayerCard {
  const row = seasonTable(s, season).find((r) => r.id === id) || null;
  const recent = s.matches
    .filter((m) => m.status === "played" && inSeason(m, season) && lineup(s, m).playing.includes(id))
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, 10)
    .map((m) => {
      const side = m.teams.a.includes(id) ? ("a" as const) : m.teams.b.includes(id) ? ("b" as const) : null;
      let result: "w" | "d" | "l" | null = null;
      if (m.score && side) result = m.score.a === m.score.b ? "d" : (m.score.a > m.score.b) === (side === "a") ? "w" : "l";
      else if (!side) {
        // Etkinlik: o gün kazandığı/kaybettiği oyunların dengesi
        const g = gameRecord(m, id);
        if (g.w || g.l) result = g.w > g.l ? "w" : g.w < g.l ? "l" : "d";
      }
      return { m, side, result, goals: m.goals[id] || 0, mvp: m.mvp === id, noshow: !!m.noshow[id] };
    });
  return { row, recent };
}

/* ---------- etkinlikler ---------- */

/** Bir etkinlikte oyuncunun oyun galibiyet/mağlubiyetleri (set/masa/raunt oyunları). */
export function gameRecord(m: Match, id: string): { w: number; l: number; g: number } {
  let w = 0, l = 0, g = 0;
  for (const x of m.games || []) {
    const win = winnerOf(x);
    if (!win || win === "d") continue;
    const side = x.a.includes(id) ? "a" : x.b.includes(id) ? "b" : null;
    if (!side) continue;
    g++;
    if (side === win) w++;
    else l++;
  }
  // Takım etkinliği (paintball, airsoft, voleybol): skor varsa takım sonucu
  if (!g && m.score && (m.teams.a.includes(id) || m.teams.b.includes(id)) && !isFootball(m)) {
    const side = m.teams.a.includes(id) ? "a" : "b";
    if (m.score.a !== m.score.b) {
      g = 1;
      if ((m.score.a > m.score.b) === (side === "a")) w = 1;
      else l = 1;
    }
  }
  return { w, l, g };
}

export interface EventRow {
  id: string;
  name: string;
  /** Katıldığı etkinlik sayısı (halı saha hariç) */
  events: number;
  /** Türlere göre katılım */
  byKind: Partial<Record<Kind, number>>;
  /** Kazandığı / oynadığı oyun */
  wins: number;
  games: number;
}

/** Etkinlik tablosu (halı saha dışı), sezona göre. */
export function eventTable(s: State, season = ""): EventRow[] {
  const rows = new Map<string, EventRow>();
  const players = new Map(s.players.map((p) => [p.id, p]));
  for (const m of s.matches) {
    if (m.status !== "played" || isFootball(m) || !inSeason(m, season)) continue;
    for (const id of lineup(s, m).playing) {
      const p = players.get(id);
      if (!p) continue;
      let row = rows.get(id);
      if (!row) rows.set(id, (row = { id, name: p.name, events: 0, byKind: {}, wins: 0, games: 0 }));
      row.events++;
      row.byKind[m.kind] = (row.byKind[m.kind] || 0) + 1;
      const g = gameRecord(m, id);
      row.wins += g.w;
      row.games += g.g;
    }
  }
  return [...rows.values()].sort((a, b) => b.events - a.events || b.wins - a.wins || a.name.localeCompare(b.name, "tr"));
}
