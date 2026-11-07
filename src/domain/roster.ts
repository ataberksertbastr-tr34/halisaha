/** Kadro yardımcıları: geçen haftayı kopyalama, sabit oyuncular, 24 saat kuralı, güvenilirlik. */
import type { Match, State } from "./types";
import { lineup, setAtt } from "./lineup";
import { matchStart, weekday } from "./dates";
import { isFootball } from "./kinds";
import { joinBlock } from "./discipline";
import { debtMap } from "./ledger";

const when = (m: Match) => m.date + " " + m.time;

/**
 * "Geçen hafta": bu maçtan önceki, aynı gün ve saatteki en yakın maç;
 * yoksa önceki en yakın maç. İptal edilen ve kimsenin "Var" demediği maçlar atlanır.
 */
export function lastWeekSource(s: State, m: Match): Match | null {
  const kind = m.kind || "football";
  const prev = s.matches
    .filter((x) => x.id !== m.id && (x.kind || "football") === kind && x.status !== "cancelled" && when(x) < when(m) && x.order.some((id) => x.att[id] === "in"))
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

/** Toplu yazmada atlanacak kişi: (maç, kişi) → engelli mi. */
export type Skip = (m: Match, id: string) => boolean;

/** Toplu yazmanın sonucu: yazılan sayısı ve engel yüzünden atlananlar. */
export interface Added {
  n: number;
  blocked: string[];
}

/**
 * Yazılması engelli olanlar (Kural 2.4 borç, 9.1 ihraç, 9.3 uzaklaştırma/ceza, 17.4 tür yasağı).
 * Organizatörün başlattığı toplu yazmada (yeni maç, geçen haftayı kopyala) atlanır ve ona
 * söylenir; tek tek yazarken sorulur, istediğini yine de ekler (Kural 12.1).
 */
export function blockedFor(s: State, today: string): Skip {
  let debts: Record<string, number> | null = null;
  return (m, id) => !!joinBlock(s, m, id, (debts ??= debtMap(s, today))[id] || 0);
}

/**
 * Yalnızca disiplin engelleri (9.1, 9.3, 17.4): borca ve saate bağlı değil. Otomatik planlama
 * bunu kullanır; maçlar haftalar önce açılır, borç yazılma anında sorulur (Kural 2.4).
 */
export function sanctioned(s: State): Skip {
  return (m, id) => !!joinBlock(s, m, id, 0);
}

function addAll(m: Match, ids: string[], skip?: Skip): Added {
  const out: Added = { n: 0, blocked: [] };
  for (const id of ids) {
    if (skip?.(m, id)) out.blocked.push(id);
    else {
      setAtt(m, id, "in", true);
      out.n++;
    }
  }
  return out;
}

/** Kaynağın oynayan kadrosunu (misafirler hariç, aktif oyuncular) yanıt vermemiş olanlara "Var" olarak yazar; engelliler atlanır. */
export function copyLastWeek(s: State, m: Match, skip?: Skip): Added {
  return addAll(m, copyCandidates(s, m), skip);
}

/** Sabit oyuncuları (aktif ve yanıtsız) "Var" yazar; engelliler atlanır. Yalnızca halı saha maçlarında. */
export function applyFixed(s: State, m: Match, skip?: Skip): Added {
  if (!isFootball(m)) return { n: 0, blocked: [] };
  return addAll(m, s.players.filter((p) => p.fixed && p.active !== false && !m.att[p.id]).map((p) => p.id), skip);
}

/** Kesinleşme süresi (saat): halı saha 24 (Kural 1.4), etkinlik duyuruda belirtilen (Kural 15.3; 0 = yok). */
export function lockHours(m: Match): number {
  if (isFootball(m)) return 24;
  return m.lockH == null ? 24 : Math.max(0, m.lockH);
}

/** Kesinleşme anı (yoksa null). */
export function lockAt(m: Match): Date | null {
  const h = lockHours(m);
  if (!h) return null;
  return new Date(matchStart(m.date, m.time).getTime() - h * 60 * 60 * 1000);
}

/** Kadro kesinleşti mi (Kural 1.4, 15.3). */
export function isLocked(m: Match, now: Date): boolean {
  if (m.status !== "open") return false;
  const at = lockAt(m);
  return !!at && now.getTime() >= at.getTime();
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

/** Önceki oynanmış (aynı türdeki) etkinlikte habersiz gelmeyenler (Kural 1.6). */
export function noShowLastTime(s: State, m: Match): Set<string> {
  const kind = m.kind || "football";
  const prev = s.matches.filter((x) => x.status === "played" && (x.kind || "football") === kind && when(x) < when(m)).sort((a, b) => when(b).localeCompare(when(a)))[0];
  return new Set(prev ? Object.keys(prev.noshow) : []);
}
