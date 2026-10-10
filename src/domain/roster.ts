/** Kadro yardımcıları: geçen haftayı kopyalama, sabit oyuncular, 24 saat kuralı, güvenilirlik. */
import type { Match, State } from "./types";
import { lineup, setAtt } from "./lineup";
import { matchStart, weekday } from "./dates";

const when = (m: Match) => m.date + " " + m.time;

/**
 * "Geçen hafta": bu maçtan önceki, aynı gün ve saatteki en yakın maç;
 * yoksa önceki en yakın maç. İptal edilen ve kimsenin "Var" demediği maçlar atlanır.
 */
export function lastWeekSource(s: State, m: Match): Match | null {
  const prev = s.matches
    .filter((x) => x.id !== m.id && x.status !== "cancelled" && when(x) < when(m) && x.order.some((id) => x.att[id] === "in"))
    .sort((a, b) => when(b).localeCompare(when(a)));
  return prev.find((x) => weekday(x.date) === weekday(m.date) && x.time === m.time) || prev[0] || null;
}

/** Geçen haftadan kopyalanabilecekler: kaynağın oynayan kadrosundaki aktif ve henüz yanıt vermemiş oyuncular. */
export function copyCandidates(s: State, m: Match): string[] {
  const src = lastWeekSource(s, m);
  if (!src) return [];
  const active = new Set(s.players.filter((p) => p.active !== false).map((p) => p.id));
  return lineup(s, src).playing.filter((id) => active.has(id) && !m.att[id]);
}

/** Kaynağın oynayan kadrosunu (misafirler hariç, aktif oyuncular) yanıt vermemiş olanlara "Var" olarak yazar. */
export function copyLastWeek(s: State, m: Match): number {
  const ids = copyCandidates(s, m);
  ids.forEach((id) => setAtt(m, id, "in", true));
  return ids.length;
}

/** Sabit oyuncuları (aktif ve yanıtsız) "Var" yazar. */
export function applyFixed(s: State, m: Match): number {
  let n = 0;
  for (const p of s.players) {
    if (!p.fixed || p.active === false || m.att[p.id]) continue;
    setAtt(m, p.id, "in", true);
    n++;
  }
  return n;
}

/** Kadro kesinleşti mi (Kural 1.4): maça 24 saatten az kaldıysa. */
export function isLocked(m: Match, now: Date): boolean {
  if (m.status !== "open") return false;
  return matchStart(m.date, m.time).getTime() - now.getTime() < 24 * 60 * 60 * 1000;
}

export interface Reliability {
  /** Söz verdiği (oynayan kadroda yer aldığı ya da geç iptal ettiği) maç sayısı */
  commits: number;
  late: number;
  noshow: number;
  /** 0–100 */
  score: number;
}

/**
 * Güvenilirlik puanı: geç iptal 1, habersiz gelmeme 2 ceza puanı.
 * Puan = 100 × (1 − ceza / söz). Yalnızca oynanmış maçlar sayılır.
 */
export function reliability(s: State): Record<string, Reliability> {
  const out: Record<string, Reliability> = {};
  const get = (id: string) => (out[id] = out[id] || { commits: 0, late: 0, noshow: 0, score: 100 });
  for (const m of s.matches) {
    if (m.status !== "played") continue;
    for (const id of lineup(s, m).playing) {
      const r = get(id);
      r.commits++;
      if (m.noshow[id]) r.noshow++;
    }
    for (const id of Object.keys(m.att)) {
      if (m.att[id] !== "late") continue;
      const r = get(id);
      r.commits++;
      r.late++;
    }
  }
  for (const r of Object.values(out)) r.score = Math.max(0, Math.round(100 * (1 - (r.late + 2 * r.noshow) / Math.max(1, r.commits))));
  return out;
}

/** Önceki oynanmış maçta habersiz gelmeyenler (Kural 1.6: bir sonraki maçta yedeğin sonuna). */
export function noShowLastTime(s: State, m: Match): Set<string> {
  const prev = s.matches.filter((x) => x.status === "played" && when(x) < when(m)).sort((a, b) => when(b).localeCompare(when(a)))[0];
  return new Set(prev ? Object.keys(prev.noshow) : []);
}
