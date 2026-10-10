/**
 * Performans puanı (Elo benzeri).
 *
 * Her oyuncu organizatörün verdiği seviyeyle başlar (seviye 3 = 1000 puan,
 * her seviye ±100). Skoru girilmiş ve takımları belli her maçtan sonra
 * kazanan takımın oyuncuları puan kazanır, kaybedenler kaybeder; beklenmedik
 * sonuç ve farklı skor daha çok etkiler. Geçmişten her seferinde yeniden
 * hesaplanır (maç düzeltilirse puan da düzelir).
 *
 * Takım kurarken kullanılan güç = seviye ile performansın harmanı:
 * oynanan maç arttıkça performansın ağırlığı artar (10 maçta %50'ye kadar).
 */
import type { Match, State } from "./types";
import { getP } from "./lineup";

export const BASE = 1000;
export const PER_LEVEL = 100;
export const K = 24;

export interface Perf {
  elo: number;
  games: number;
  /** 1–5 ölçeğinde performans */
  perf: number;
}

const toElo = (rating: number) => BASE + (rating - 3) * PER_LEVEL;
const toLevel = (elo: number) => Math.max(1, Math.min(5, 3 + (elo - BASE) / PER_LEVEL));
const when = (m: Match) => m.date + " " + m.time;

/** Gol farkı çarpanı (Dünya Futbolu Elo yöntemi). */
export function goalFactor(diff: number): number {
  const d = Math.abs(diff);
  return d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8;
}

export function perfRatings(s: State): Record<string, Perf> {
  const elo: Record<string, number> = {};
  const games: Record<string, number> = {};
  s.players.forEach((p) => (elo[p.id] = toElo(p.rating || 3)));
  const played = s.matches
    .filter((m) => m.status === "played" && m.score && m.teams.a.length && m.teams.b.length)
    .sort((a, b) => when(a).localeCompare(when(b)));
  for (const m of played) {
    // Misafirler yalnızca o maç için verilen seviyeyle hesaba katılır
    const val = (id: string) => (id in elo ? elo[id] : toElo(getP(s, m, id)?.rating || 3));
    const avg = (ids: string[]) => ids.reduce((t, id) => t + val(id), 0) / ids.length;
    const ra = avg(m.teams.a), rb = avg(m.teams.b);
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const sa = m.score!.a > m.score!.b ? 1 : m.score!.a < m.score!.b ? 0 : 0.5;
    const delta = K * goalFactor(m.score!.a - m.score!.b) * (sa - ea);
    m.teams.a.forEach((id) => {
      if (!(id in elo)) return;
      elo[id] += delta;
      games[id] = (games[id] || 0) + 1;
    });
    m.teams.b.forEach((id) => {
      if (!(id in elo)) return;
      elo[id] -= delta;
      games[id] = (games[id] || 0) + 1;
    });
  }
  const out: Record<string, Perf> = {};
  for (const id in elo) out[id] = { elo: Math.round(elo[id]), games: games[id] || 0, perf: Math.round(toLevel(elo[id]) * 10) / 10 };
  return out;
}

/** Performansın güçteki ağırlığı: maç başına %5, en fazla %50. */
export const perfWeight = (games: number) => Math.min(0.5, games * 0.05);

/** Takım kurmada kullanılan güç fonksiyonu. Performans kapalıysa sadece seviye. */
export function strengthFn(s: State, m: Match): (id: string) => number {
  const perfs = s.settings.perf ? perfRatings(s) : {};
  return (id) => {
    const r = getP(s, m, id)?.rating || 3;
    const p = perfs[id];
    if (!p) return r;
    const w = perfWeight(p.games);
    return Math.round((r * (1 - w) + p.perf * w) * 100) / 100;
  };
}
