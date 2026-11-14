/**
 * Katılım günlüğü (Kural 1.3–1.6, 15.3): her etkinlikte kimin ne zaman yazıldığı, çıktığı,
 * yedekten kadroya girdiği. Kayıtlar, bir değişiklikten önceki ve sonraki katılım durumu
 * karşılaştırılarak üretilir; böylece yanıt hangi yoldan değişirse değişsin (tek tek, geçen
 * haftayı kopyala, WhatsApp listesi, misafir, kontenjan değişikliği, 1.6 sıra cezası) günlüğe düşer.
 *
 * Günlüğe yazılmayanlar: etkinlik açılırken kendiliğinden yazılan sabit oyuncular (iki cihaz aynı
 * maçı ayrı ayrı açarsa kayıtlar ikilenmesin), başka cihazdan eşitlenen ve yedekten yüklenen veri
 * (o cihaz kendi kaydını zaten yazmıştır) ve "Geri al" (kayıt da geri alınır).
 */
import { DAYS_SHORT, lang, t } from "../i18n";
import type { LogEntry, LogEv, Match, State } from "./types";
import { getP, isGuest, lineup } from "./lineup";
import { addDays, ddmm, iso } from "./dates";
import { isFootball } from "./kinds";
import { lockAt } from "./roster";
import { uid } from "./text";

/** Günlük kaç gün saklanır (bitmiş ya da iptal edilmiş etkinliğin tarihinden sonra). */
export const LOG_DAYS = 90;

/** Kişinin etkinlikteki yeri: kadroda, yedekte ya da verdiği yanıt. */
export type AttPos = "in" | "wait" | "maybe" | "out" | "late";
export interface AttState {
  st: AttPos;
  /** Kadrodaki ya da yedekteki sırası (1'den) */
  n?: number;
  /** Misafirin adı (çıkarılınca kayıtta kalsın) */
  name?: string;
}
/** Açık etkinliklerin katılım görüntüsü: etkinlik → kişi → durum. */
export type AttSnap = Record<string, Record<string, AttState>>;

/** Etkinlikte yanıtı olan herkesin durumu. */
export function attStates(s: State, m: Match): Record<string, AttState> {
  const out: Record<string, AttState> = {};
  const { playing, wait } = lineup(s, m);
  const put = (id: string, st: AttState) => {
    if (isGuest(s, id)) st.name = getP(s, m, id)?.name || "";
    out[id] = st;
  };
  playing.forEach((id, i) => put(id, { st: "in", n: i + 1 }));
  wait.forEach((id, i) => put(id, { st: "wait", n: i + 1 }));
  for (const id in m.att) {
    const a = m.att[id];
    if (a !== "in" && getP(s, m, id)) put(id, { st: a });
  }
  return out;
}

/** Açık etkinliklerin görüntüsü (bir sonraki değişiklikle karşılaştırmak için). */
export function attSnapshot(s: State): AttSnap {
  const out: AttSnap = {};
  for (const m of s.matches) if (m.status === "open") out[m.id] = attStates(s, m);
  return out;
}

const LEAVE: ReadonlySet<LogEv> = new Set<LogEv>(["maybe", "out", "late", "clear"]);
/** Aynı anda yazılan kayıtların okunma sırası: önce çıkanlar, sonra yer değiştirenler, sonra yazılanlar. */
const rank = (e: LogEntry) => (LEAVE.has(e.ev) ? 0 : e.ev === "up" || e.ev === "down" ? 1 : e.ev === "in" ? 2 : 3);

/**
 * Önceki görüntüye göre değişen katılımları günlüğe yazar; eklenen kayıt sayısını döndürür.
 * Önceki görüntüde olmayan (yeni açılan ya da yeniden açılan) etkinlik için kayıt üretilmez.
 */
export function logChanges(s: State, before: AttSnap, now: number): number {
  let added = 0;
  for (const m of s.matches) {
    if (m.status !== "open") continue;
    const b = before[m.id];
    if (!b) continue;
    const a = attStates(s, m);
    const batch: LogEntry[] = [];
    for (const id of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const x: AttState | undefined = b[id], y: AttState | undefined = a[id];
      if ((x?.st || "") === (y?.st || "")) continue;
      // Silinen oyuncunun yanıtı bir katılım olayı değildir; çıkarılan misafirinki kayda geçer
      if (!y && !x?.name && !getP(s, m, id)) continue;
      const ev: LogEv = !y ? "clear" : y.st === "in" ? (x?.st === "wait" ? "up" : "in") : y.st === "wait" ? (x?.st === "in" ? "down" : "wait") : y.st;
      const e: LogEntry = { id: uid(), at: now, pid: id, ev };
      if (y?.n) e.n = y.n;
      if (LEAVE.has(ev) && (x?.st === "in" || x?.st === "wait")) e.from = x.st;
      const name = y?.name || x?.name;
      if (name) e.name = name;
      batch.push(e);
    }
    if (!batch.length) continue;
    batch.sort((p, q) => rank(p) - rank(q) || (p.n || 0) - (q.n || 0));
    m.log = [...(m.log || []), ...batch];
    added += batch.length;
  }
  return added;
}

/** Kişinin bu etkinlikteki son kaydı. */
export function lastEntry(m: Match, pid: string): LogEntry | null {
  for (let i = (m.log || []).length - 1; i >= 0; i--) if (m.log[i].pid === pid) return m.log[i];
  return null;
}

/**
 * Oyuncunun haber verdiği anı son kaydına yazar (organizatör yanıtı sonradan işlediyse).
 * Kayıt anıyla aynı dakikaysa ayrıca tutulmaz.
 */
export function setSaid(m: Match, pid: string, said: number): LogEntry | null {
  const e = lastEntry(m, pid);
  if (!e) return null;
  if (Math.abs(said - e.at) < 60_000) delete e.said;
  else e.said = said;
  return e;
}

/** Son kaydın türünü değiştirir (ör. geç iptal sayılmadı → "Yok"). */
export function relabelLast(m: Match, pid: string, ev: LogEv): LogEntry | null {
  const e = lastEntry(m, pid);
  if (e) e.ev = ev;
  return e;
}

/** Bitmiş ya da iptal edilmiş, LOG_DAYS günden eski etkinliklerin günlüğünü boşaltır; değişen var mı. */
export function pruneLogs(s: State, today: string, days = LOG_DAYS): boolean {
  const cut = addDays(today, -days);
  let changed = false;
  for (const m of s.matches) {
    if (m.status !== "open" && m.date < cut && m.log && m.log.length) {
      m.log = [];
      changed = true;
    }
  }
  return changed;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "Sal 13.10 20:31" */
export function stamp(ms: number): string {
  const d = new Date(ms);
  const day = iso(d);
  return DAYS_SHORT[lang()][d.getDay()] + " " + ddmm(day) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
}

/** Kaydın açıklaması: "kadroya yazıldı (3.)", "Yok dedi · kadrodan çıktı" … */
export function logText(e: LogEntry): string {
  const n = e.n || "";
  const base =
    e.ev === "in" ? t("logIn", { n }) : e.ev === "wait" ? t("logWait", { n }) : e.ev === "up" ? t("logUp", { n }) : e.ev === "down" ? t("logDown", { n })
    : e.ev === "maybe" ? t("logMaybe") : e.ev === "out" ? t("logOut") : e.ev === "late" ? t("logLate") : t("logClear");
  return base + (e.from ? " · " + t(e.from === "in" ? "logFromIn" : "logFromWait") : "");
}

export interface LogLine {
  /** Kayıt (kesinleşme satırında null) */
  e: LogEntry | null;
  when: string;
  who: string;
  text: string;
  /** "haber: Sal 20:05" */
  said: string;
}

/** Kesinleşme kuralı: halı saha 1.4, etkinlik 15.3. */
const lockRule = (m: Match) => (isFootball(m) ? "1.4" : "15.3");

/**
 * Günlük satırları, eskiden yeniye. Kesinleşme anı geçtiyse o ana bir ayraç satırı girer
 * (öncesi serbest, sonrası geç iptal sayılır: Kural 1.4–1.5, 15.3).
 */
export function logLines(s: State, m: Match, now: number): LogLine[] {
  const entries = (m.log || []).map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i).map((x) => x.e);
  const lock = lockAt(m)?.getTime() ?? null;
  const out: LogLine[] = [];
  let marked = lock == null || lock > now;
  const mark = () => {
    if (marked || lock == null) return;
    marked = true;
    out.push({ e: null, when: stamp(lock), who: "", text: t("logLockLine", { r: lockRule(m) }), said: "" });
  };
  for (const e of entries) {
    if (lock != null && e.at >= lock) mark();
    out.push({ e, when: stamp(e.at), who: getP(s, m, e.pid)?.name || e.name || t("logGone"), text: logText(e), said: e.said ? t("logSaid", { d: stamp(e.said) }) : "" });
  }
  if (entries.length) mark();
  return out;
}

/** Paylaşılacak metin (eskiden yeniye). */
export function logShareText(s: State, m: Match, title: string, now: number): string {
  const lines = logLines(s, m, now).map((l) => (l.e ? l.when + " · " + l.who + " " + l.text + (l.said ? " (" + l.said + ")" : "") : "— " + l.text + ": " + l.when + " —"));
  return "📋 " + title + "\n" + lines.join("\n");
}
