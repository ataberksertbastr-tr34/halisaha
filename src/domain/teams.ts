/**
 * Takım kurma (Kural 3.1, 3.2).
 *
 * Amaç fonksiyonu (küçük olan iyi):
 *   2 × |güç farkı| + mevki dengesizliği + kaleci dengesizliği
 *   + eşleşme kuralı ihlali (ağır) + geçen maçın takımlarını tekrar (isteğe bağlı)
 * Kısıtlar: kilitli oyuncu kendi takımında kalır; "aynı takımda olsun"
 * grupları birlikte yerleşir. Rastgele açgözlü kurulum + takas iyileştirmesi
 * birçok kez denenir; en iyi skorlulardan biri seçilir (her basışta farklı ama dengeli).
 */
import type { Match, PairRule, Person, Pos, Side, State } from "./types";
import { getP, lineup } from "./lineup";
import { strengthFn } from "./elo";

export type Rng = () => number;

export function shuffle<T>(a: T[], rng: Rng = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function strengthOf(p: Person | null | undefined): number {
  return (p && p.rating) || 3;
}

/** Takımın toplam gücü (performans açıksa harmanlanmış güç). */
export function teamSum(s: State, m: Match, ids: string[]): number {
  const str = strengthFn(s, m);
  return Math.round(ids.reduce((sum, id) => sum + str(id), 0) * 10) / 10;
}

const when = (m: Match) => m.date + " " + m.time;

/** Bu maçtan önceki, takımları kurulmuş en son oynanmış maç. */
export function previousTeams(s: State, m: Match): { a: string[]; b: string[] } | null {
  const prev = s.matches
    .filter((x) => x.id !== m.id && x.status === "played" && x.teams.a.length && x.teams.b.length && when(x) < when(m))
    .sort((a, b) => when(b).localeCompare(when(a)))[0];
  return prev ? prev.teams : null;
}

/** Geçen maçta takım arkadaşı olan çiftlerin bu kurulumda yine birlikte olma oranı (0–1). */
export function repeatRatio(prev: { a: string[]; b: string[] }, A: string[], B: string[]): number {
  const side = new Map<string, Side>();
  prev.a.forEach((id) => side.set(id, "a"));
  prev.b.forEach((id) => side.set(id, "b"));
  let same = 0, total = 0;
  for (const team of [A, B]) {
    const ids = team.filter((id) => side.has(id));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        total++;
        if (side.get(ids[i]) === side.get(ids[j])) same++;
      }
  }
  return total ? same / total : 0;
}

interface Cand {
  id: string;
  r: number;
  pos: Pos;
  lock?: Side;
}

export interface TeamResult {
  a: string[];
  b: string[];
  cost: number;
  /** İhlal edilen eşleşme kuralları */
  broken: PairRule[];
}

/** Kurala uyan, oynayan kadrodaki eşleşmeler. */
export function activeRules(s: State, ids: string[]): PairRule[] {
  const set = new Set(ids);
  return s.pairRules.filter((r) => set.has(r.a) && set.has(r.b));
}

export function brokenRules(rules: PairRule[], A: string[]): PairRule[] {
  const inA = new Set(A);
  return rules.filter((r) => (inA.has(r.a) === inA.has(r.b)) !== r.together);
}

/** Takımları hesaplar (durumu değiştirmez). */
export function computeTeams(s: State, m: Match, rng: Rng = Math.random): TeamResult {
  const ids = lineup(s, m).playing;
  const str = strengthFn(s, m);
  const ps: Cand[] = ids.map((id) => {
    const p = getP(s, m, id);
    const lock = m.locks[id];
    return { id, r: str(id), pos: (p && p.pos) || "", ...(lock ? { lock } : {}) };
  });
  const byId = new Map(ps.map((p) => [p.id, p]));
  const n = ps.length;
  const sizeA = Math.ceil(n / 2);
  const sizeB = n - sizeA;
  const rules = activeRules(s, ids);
  const prev = s.settings.avoidRepeat ? previousTeams(s, m) : null;

  // "Aynı takımda olsun" kurallarıyla gruplar (birleşim-bul)
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  rules.filter((r) => r.together).forEach((r) => parent.set(find(r.a), find(r.b)));
  const groupMap = new Map<string, Cand[]>();
  ps.forEach((p) => {
    const root = find(p.id);
    groupMap.set(root, [...(groupMap.get(root) || []), p]);
  });
  const groups = [...groupMap.values()];

  const cost = (A: string[], B: string[]): number => {
    const sum = (x: string[]) => x.reduce((t, id) => t + byId.get(id)!.r, 0);
    const cnt = (x: string[], k: string) => x.filter((id) => byId.get(id)!.pos === k).length;
    let c = Math.abs(sum(A) - sum(B)) * 2;
    for (const k of ["DEF", "MID", "FWD"]) c += Math.abs(cnt(A, k) - cnt(B, k));
    const gk = Math.abs(cnt(A, "GK") - cnt(B, "GK"));
    if (gk > 1) c += 3 * (gk - 1);
    c += 20 * brokenRules(rules, A).length;
    c += 50 * Math.max(0, Math.abs(A.length - B.length) - 1);
    c += 50 * ps.filter((p) => p.lock && (p.lock === "a") !== A.includes(p.id)).length;
    if (prev) c += Math.max(0, repeatRatio(prev, A, B) - 0.6) * 10;
    return c;
  };

  let best: { A: string[]; B: string[] }[] = [];
  let bestCost = Infinity;
  for (let it = 0; it < 300; it++) {
    const A: string[] = [], B: string[] = [];
    let sa = 0, sb = 0;
    const ca: Record<string, number> = {}, cb: Record<string, number> = {};
    const put = (g: Cand[], toA: boolean) =>
      g.forEach((p) => {
        if (toA) { A.push(p.id); sa += p.r; ca[p.pos] = (ca[p.pos] || 0) + 1; }
        else { B.push(p.id); sb += p.r; cb[p.pos] = (cb[p.pos] || 0) + 1; }
      });
    const lockOf = (g: Cand[]) => g.find((p) => p.lock)?.lock;
    const hasGK = (g: Cand[]) => g.some((p) => p.pos === "GK");
    const gsum = (g: Cand[]) => g.reduce((t, p) => t + p.r, 0);
    const ordered = [
      ...shuffle(groups.filter((g) => lockOf(g)), rng),
      ...shuffle(groups.filter((g) => !lockOf(g) && hasGK(g)), rng),
      ...groups.filter((g) => !lockOf(g) && !hasGK(g)).map((g) => ({ g, k: gsum(g) / g.length + g.length + rng() * 1.2 })).sort((x, y) => y.k - x.k).map((o) => o.g),
    ];
    for (const g of ordered) {
      const roomA = sizeA - A.length, roomB = sizeB - B.length;
      const lock = lockOf(g);
      let toA: boolean;
      if (lock && (lock === "a" ? roomA : roomB) >= g.length) toA = lock === "a";
      else if (g.length > roomA) toA = false;
      else if (g.length > roomB) toA = true;
      else if (hasGK(g) && (ca.GK || 0) !== (cb.GK || 0)) toA = (ca.GK || 0) < (cb.GK || 0);
      else {
        const pos = g.length === 1 ? g[0].pos : "";
        const pa = ca[pos] || 0, pb = cb[pos] || 0;
        if (pos && pa !== pb && rng() < 0.6) toA = pa < pb;
        else toA = Math.abs(sa - sb) < 1e-9 ? rng() < 0.5 : sa < sb;
      }
      put(g, toA);
    }
    // Takas iyileştirmesi: kilitsiz ve grupsuz oyuncuları karşılıklı değiştir
    const free = (id: string) => !byId.get(id)!.lock && groupMap.get(find(id))!.length === 1;
    let cur = cost(A, B);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 0; i < A.length; i++) {
        if (!free(A[i])) continue;
        for (let j = 0; j < B.length; j++) {
          if (!free(B[j])) continue;
          [A[i], B[j]] = [B[j], A[i]];
          const c = cost(A, B);
          if (c < cur - 1e-9) {
            cur = c;
            improved = true;
          } else [A[i], B[j]] = [B[j], A[i]];
        }
      }
      if (!improved) break;
    }
    if (cur < bestCost - 1e-9) {
      bestCost = cur;
      best = [{ A: A.slice(), B: B.slice() }];
    } else if (Math.abs(cur - bestCost) < 1e-9 && best.length < 40) best.push({ A: A.slice(), B: B.slice() });
  }
  const pick = best[Math.floor(rng() * best.length)] || { A: [], B: [] };
  return { a: pick.A, b: pick.B, cost: bestCost, broken: brokenRules(rules, pick.A) };
}

/** Takımları kurar ve maça yazar. */
export function generateTeams(s: State, m: Match, rng: Rng = Math.random): TeamResult {
  const r = computeTeams(s, m, rng);
  m.teams = { a: r.a, b: r.b };
  m.manualTeams = false;
  return r;
}

/** İki oyuncunun takımlarını takas eder (sahada sürükle-bırak). */
export function swapPlayers(m: Match, x: string, y: string): boolean {
  const ax = m.teams.a.indexOf(x), bx = m.teams.b.indexOf(x);
  const ay = m.teams.a.indexOf(y), by = m.teams.b.indexOf(y);
  if (ax >= 0 && by >= 0) {
    m.teams.a[ax] = y;
    m.teams.b[by] = x;
  } else if (bx >= 0 && ay >= 0) {
    m.teams.b[bx] = y;
    m.teams.a[ay] = x;
  } else return false;
  // Kilitli oyuncu takas edilirse kilidi yeni takımına taşınır
  if (m.locks[x]) m.locks[x] = m.teams.a.includes(x) ? "a" : "b";
  if (m.locks[y]) m.locks[y] = m.teams.a.includes(y) ? "a" : "b";
  return true;
}
