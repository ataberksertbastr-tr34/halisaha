/** Oyuncu istatistikleri: maç sayısı ve galibiyet/beraberlik/mağlubiyet. */
import type { State } from "./types";
import { lineup } from "./lineup";

export interface PStat {
  p: number;
  w: number;
  d: number;
  l: number;
}

export function computeStats(s: State): Record<string, PStat> {
  const st: Record<string, PStat> = {};
  s.matches.forEach((m) => {
    if (m.status !== "played") return;
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
