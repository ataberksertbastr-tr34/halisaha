/**
 * Kura ve masa sırası.
 *  - Kıraathane (Kural 21.1): masalar ve eşler kurayla belirlenir. Eşli
 *    oyunlarda karşılıklı oturanlar eştir: [0, 2] ve [1, 3].
 *  - Ayak tenisi (Kural 19.1): tekli/çiftli/üçlü takımlar; güç dengeli kura.
 *  - Masa tenisi (Kural 20.6, 20.7): çiftler kurası; kazanan kalır, en fazla
 *    N maç üst üste, sonra sıranın sonuna.
 */
import type { Draw, Match, Queue, State } from "./types";
import { active, getP } from "./lineup";
import { shuffle, type Rng } from "./teams";

export interface TableGame {
  id: string;
  name: string;
  size: number;
  /** Eşli oynanabilir mi */
  pairs: boolean;
}

/** Kıraathane oyunları (Kural 21.1). */
export const TABLE_GAMES: TableGame[] = [
  { id: "okey", name: "Okey", size: 4, pairs: false },
  { id: "101", name: "101", size: 4, pairs: true },
  { id: "batak", name: "Batak", size: 4, pairs: true },
  { id: "king", name: "King", size: 4, pairs: false },
  { id: "pisti", name: "Pişti", size: 4, pairs: true },
  { id: "tavla", name: "Tavla", size: 2, pairs: false },
];

export const tableGame = (id: string): TableGame | undefined => TABLE_GAMES.find((g) => g.id === id);

/** Gruplara rastgele böler; artanlar son (eksik) grupta kalır. */
export function randomGroups(ids: string[], size: number, rng: Rng = Math.random): string[][] {
  const pool = shuffle(ids.slice(), rng);
  const out: string[][] = [];
  for (let i = 0; i < pool.length; i += size) out.push(pool.slice(i, i + size));
  return out;
}

/**
 * Güç dengeli takımlar (yılan sıralaması): en güçlüden başlayarak 1→n, n→1
 * dağıtılır. Tam takım kurulamayan artanlar ayrı grupta (yedek) kalır.
 */
export function balancedGroups(ids: string[], size: number, strength: (id: string) => number, rng: Rng = Math.random): { groups: string[][]; rest: string[] } {
  const n = Math.floor(ids.length / Math.max(1, size));
  if (n < 1) return { groups: [], rest: ids.slice() };
  const sorted = ids.map((id) => ({ id, k: strength(id) + rng() * 0.9 })).sort((a, b) => b.k - a.k).map((x) => x.id);
  const take = sorted.slice(0, n * size);
  const rest = sorted.slice(n * size);
  const groups: string[][] = Array.from({ length: n }, () => []);
  take.forEach((id, i) => {
    const round = Math.floor(i / n);
    const pos = i % n;
    groups[round % 2 === 0 ? pos : n - 1 - pos].push(id);
  });
  return { groups: groups.map((g) => shuffle(g, rng)), rest };
}

/** Kıraathane masa kurası. */
export function drawTables(s: State, m: Match, gameId: string, pairs: boolean, rng: Rng = Math.random): Draw {
  const g = tableGame(gameId) || TABLE_GAMES[0];
  const ids = active(s, m);
  return { game: g.id, size: g.size, pairs: pairs && g.pairs && g.size === 4, groups: randomGroups(ids, g.size, rng) };
}

/** Ayak tenisi / masa tenisi çiftleri: seviyeye göre dengeli takımlar. */
export function drawTeams(s: State, m: Match, size: number, rng: Rng = Math.random): Draw {
  const ids = active(s, m);
  const { groups, rest } = balancedGroups(ids, size, (id) => getP(s, m, id)?.rating || 3, rng);
  return { game: "teams", size, pairs: false, groups: rest.length ? [...groups, rest] : groups };
}

/** Eşli masada eş grupları: [[0,2],[1,3]]. */
export function partners(group: string[]): [string[], string[]] {
  return [[group[0], group[2]].filter(Boolean), [group[1], group[3]].filter(Boolean)];
}

/** Grup tam mı (artanlar/yedek değil mi). */
export const fullGroup = (d: Draw, g: string[]): boolean => g.length === d.size;

/* ---------- masa sırası (Kural 20.7) ---------- */

/** Sırayı başlatır: ilk iki kişi masaya, kalanlar sıraya. */
export function startQueue(ids: string[], rng: Rng = Math.random): Queue {
  const order = shuffle(ids.slice(), rng);
  return { table: order.slice(0, 2), order: order.slice(2), streak: 0 };
}

/** Güncel katılımcılarla senkronlar (ayrılan çıkar, yeni gelen sıranın sonuna). */
export function syncQueue(q: Queue, ids: string[]): Queue {
  const set = new Set(ids);
  const table = q.table.filter((id) => set.has(id));
  const order = q.order.filter((id) => set.has(id) && !table.includes(id));
  for (const id of ids) if (!table.includes(id) && !order.includes(id)) order.push(id);
  while (table.length < 2 && order.length) table.push(order.shift()!);
  return { table, order, streak: table.length === q.table.length && table[0] === q.table[0] ? q.streak : 0 };
}

/**
 * Masadaki maçın sonucu. table[0] her zaman şampiyondur (streak > 0 iken).
 * Kazanan kalır; max > 0 ve üst üste max maç kazandıysa o da sıranın sonuna gider.
 */
export function queueResult(q: Queue, winner: string, max: number): Queue {
  const [x, y] = q.table;
  if (!x || !y || (winner !== x && winner !== y)) return q;
  const loser = winner === x ? y : x;
  const streak = winner === x && q.streak > 0 ? q.streak + 1 : 1;
  const order = [...q.order, loser];
  if (max > 0 && streak >= max) {
    order.push(winner);
    const table = order.splice(0, 2);
    return { table, order, streak: 0 };
  }
  const next = order.shift();
  return { table: next ? [winner, next] : [winner], order, streak };
}
