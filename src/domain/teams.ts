/** Takım kurma: güç + mevki dengesi, kaleciler ayrı takımlara (Kural 3.1, 3.2). */
import type { Match, Person, Pos, State } from "./types";
import { getP, lineup } from "./lineup";

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

export function teamSum(s: State, m: Match, ids: string[]): number {
  return ids.reduce((sum, id) => sum + strengthOf(getP(s, m, id)), 0);
}

interface Cand {
  id: string;
  r: number;
  pos: Pos;
}

/**
 * Rastgele açgözlü kurulumları dener (600 tur), en iyi skorlu kurulumlardan birini seçer.
 * Skor = 2 × |güç farkı| + mevki dengesizliği. Her basışta farklı ama dengeli takımlar çıkar.
 */
export function generateTeams(s: State, m: Match, rng: Rng = Math.random): void {
  const ids = lineup(s, m).playing;
  const ps: Cand[] = ids.map((id) => {
    const p = getP(s, m, id);
    return { id, r: strengthOf(p), pos: (p && p.pos) || "" };
  });
  const gks = ps.filter((p) => p.pos === "GK");
  const fld = ps.filter((p) => p.pos !== "GK");
  const sizeA = Math.ceil(ps.length / 2);
  const sizeB = ps.length - sizeA;
  let best: { A: string[]; B: string[] }[] = [];
  let bestScore = Infinity;
  for (let it = 0; it < 600; it++) {
    const A: string[] = [], B: string[] = [];
    let sa = 0, sb = 0;
    const ca: Record<string, number> = {}, cb: Record<string, number> = {};
    const put = (p: Cand, toA: boolean) => {
      if (toA) { A.push(p.id); sa += p.r; ca[p.pos] = (ca[p.pos] || 0) + 1; }
      else { B.push(p.id); sb += p.r; cb[p.pos] = (cb[p.pos] || 0) + 1; }
    };
    shuffle(gks.slice(), rng).forEach((p, j) => put(p, j % 2 === 0 ? A.length < sizeA : B.length >= sizeB));
    const order = fld.map((p) => ({ p, k: p.r + rng() * 1.2 })).sort((x, y) => y.k - x.k).map((o) => o.p);
    order.forEach((p) => {
      if (A.length >= sizeA) return put(p, false);
      if (B.length >= sizeB) return put(p, true);
      const pa = ca[p.pos] || 0, pb = cb[p.pos] || 0;
      if (p.pos && pa !== pb && rng() < 0.6) return put(p, pa < pb);
      put(p, sa === sb ? rng() < 0.5 : sa < sb);
    });
    let pen = 0;
    ["DEF", "MID", "FWD"].forEach((k) => (pen += Math.abs((ca[k] || 0) - (cb[k] || 0))));
    const score = Math.abs(sa - sb) * 2 + pen;
    if (score < bestScore - 1e-9) { bestScore = score; best = [{ A, B }]; }
    else if (Math.abs(score - bestScore) < 1e-9 && best.length < 40) best.push({ A, B });
  }
  const pick = best[Math.floor(rng() * best.length)] || { A: [], B: [] };
  m.teams = { a: pick.A, b: pick.B };
  m.manualTeams = false;
}
