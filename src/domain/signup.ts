/**
 * WhatsApp'taki dolu davet listesini yapıştırıp katılımı tek seferde işaretleme.
 * Davet mesajı (messages.ts msgInvite) numaralı bir liste üretir; oyuncular adını boş
 * numaraya yazıp mesajı gruba yeniden gönderir. Yazılma sırası kadroyu ve yedeği belirler
 * (Kural 1.3): yeni yazılanlar listedeki sırayla eklenir, uygulamadaki sıra bozulmaz.
 */
import type { Guest, Match, Person, State } from "./types";
import { DAYS, lang, MONTHS, t } from "../i18n";
import { ddmm, parseISO, weekday } from "./dates";
import { getP, lineup, promoted, setAtt } from "./lineup";
import { lateCancel } from "./roster";
import { isFree } from "./money";
import { cleanBulkLine, cleanName, norm, uid } from "./text";
import { joinBlock, type Block } from "./discipline";
import { liabilityMap } from "./ledger";
import { guestHistory, pastGuests } from "./guests";

export interface Entry {
  name: string;
  /** Numaralı satır ve "Yedek" → Var, "Belki" satırı → Belki */
  st: "in" | "maybe";
}

const LABEL = /^[^\p{L}\d]*(yedek|waitlist|belki|maybe)\s*:\s*(.*)$/iu;
/** "1. Ali", "2) Veli", "3- Can"; ayraçtan hemen sonra rakam gelen tarih/saat ("13.10", "21:00") liste satırı değildir. */
const NUMBERED = /^\s*(\d{1,3})\s*[.)\-:](?!\d)\s*(.*)$/u;

/** Ad: emoji ve işaretler atılır; WhatsApp'ta üstü çizili (~Ad~) yazılan çekilmiş sayılır. */
function nameOf(raw: string): string {
  const r = raw.trim();
  if (/^~.*~$/u.test(r)) return "";
  const n = cleanName(cleanBulkLine(r));
  return /\p{L}/u.test(n) ? n : "";
}

/** Yapıştırılan metinden isimler: numara sırasıyla liste, sonra "Yedek", sonra "Belki". Diğer satırlar atlanır. */
export function parseList(text: string): Entry[] {
  const numbered: { n: number; i: number; name: string }[] = [];
  const wait: string[] = [];
  const maybe: string[] = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const lab = LABEL.exec(line);
    if (lab) {
      const to = /^(belki|maybe)$/i.test(lab[1]) ? maybe : wait;
      lab[2].split(/[,;]/).map(nameOf).filter(Boolean).forEach((n) => to.push(n));
      return;
    }
    const num = NUMBERED.exec(line);
    if (num) {
      const name = nameOf(num[2]);
      if (name) numbered.push({ n: Number(num[1]), i, name });
    }
  });
  numbered.sort((a, b) => a.n - b.n || a.i - b.i);
  const out: Entry[] = [];
  const seen = new Set<string>();
  const add = (name: string, st: Entry["st"]) => {
    const k = norm(name);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name, st });
  };
  numbered.forEach((x) => add(x.name, "in"));
  wait.forEach((n) => add(n, "in"));
  maybe.forEach((n) => add(n, "maybe"));
  return out;
}

const tokens = (s: string) => norm(s).replace(/\./g, " ").split(/\s+/).filter(Boolean);

/**
 * Yazılan adı kişilerle eşleştirir: önce tam ad; yoksa kelime kelime baş kısmı tutanlar
 * ("Ali" → "Ali Aslan", "Ali A." → "Ali Aslan"). Türkçe harfler ve büyük/küçük fark etmez.
 */
export function candidates(pool: Person[], name: string): string[] {
  const k = norm(name).replace(/\./g, "").replace(/\s+/g, " ");
  const exact = pool.filter((p) => norm(p.name).replace(/\./g, "").replace(/\s+/g, " ") === k);
  if (exact.length) return exact.map((p) => p.id);
  const t = tokens(name);
  if (!t.length) return [];
  return pool
    .filter((p) => {
      const pt = tokens(p.name);
      return t.length <= pt.length && t.every((x, i) => pt[i].startsWith(x));
    })
    .map((p) => p.id);
}

export type Act = "in" | "maybe" | "skip" | "guest" | "player" | "out";

export interface PlanRow {
  /** Listede yazılan ad */
  name: string;
  st: Entry["st"];
  /** Eşleşen kişi (yoksa null) */
  id: string | null;
  /** Birden çok eşleşmede adaylar */
  cands: string[];
  /** Önerilen iş (organizatör değiştirebilir) */
  act: Act;
  /**
   * Neden: zaten aynı yanıt, geç iptal etmiş, engelli, listede iki kez, kayıtlı değil, belirsiz,
   * önceki misafirliğinden borç/ceza; "gone": uygulamada Var/Belki ama yapıştırılan listede yok
   */
  note: "" | "already" | "late" | "blocked" | "dup" | "none" | "ambiguous" | "guestPrev" | "gone";
  block?: Block;
  /** Aynı adla gelmiş önceki misafirin ödenmemiş borcu (Kural 1.8) */
  prevDebt?: number;
}

/**
 * Her satır için önerilen iş. Yanıtı aynı olan ve "Var"ı "Belki"ye düşecek olan değişmez;
 * geç iptal etmiş ve yazılması engelli olan (borç 2.4, ceza 9.1/9.3, tür yasağı 17.4)
 * atlanır, organizatör yine de yazabilir (12.1). Kayıtlı olmayan misafir önerilir.
 */
export function planList(s: State, m: Match, entries: Entry[], today: string): PlanRow[] {
  const rows = entryRows(s, m, entries, today);
  return [...rows, ...goneRows(s, m, rows)];
}

/**
 * Listeden düşenler: uygulamada Var ya da Belki olup yapıştırılan listede adı olmayanlar.
 * Organizatör "gelemiyorum" diyeni listeden silip listeyi yeniden atıyor; yeniden yapıştırınca
 * bunlar "Yok yaz" önerisiyle gelir (kesinleştiyse geç iptal, Kural 1.5). Liste kısmiyse (şu an
 * yazılı olanların yarısından azı ya da birden azı listede) kimse önerilmez. Sabit oyuncu varsayılan olarak kalır:
 * uygulama onu kendiliğinden yazmıştır, listede olmayabilir.
 */
function goneRows(s: State, m: Match, rows: PlanRow[]): PlanRow[] {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.id) seen.add(r.id);
    r.cands.forEach((c) => seen.add(c));
  }
  const active = new Set([...s.players.filter((p) => p.active !== false).map((p) => p.id), ...m.guests.map((g) => g.id)]);
  const yes = [...lineup(s, m).playing, ...lineup(s, m).wait, ...Object.keys(m.att).filter((id) => m.att[id] === "maybe")].filter((id, i, a) => active.has(id) && a.indexOf(id) === i);
  // Kısmi liste değil, tam liste olmalı: şu an yazılı olanlardan en az ikisi ve yarısı listede
  const present = yes.filter((id) => seen.has(id)).length;
  if (present < 2 || present * 2 < yes.length) return [];
  return yes.filter((id) => !seen.has(id)).map((id): PlanRow => {
    const fixed = !!s.players.find((p) => p.id === id)?.fixed;
    return { name: getP(s, m, id)?.name || "", st: m.att[id] === "maybe" ? "maybe" : "in", id, cands: [], act: fixed ? "skip" : "out", note: "gone" };
  });
}

function entryRows(s: State, m: Match, entries: Entry[], today: string): PlanRow[] {
  const pool: Person[] = [...s.players.filter((p) => p.active !== false), ...m.guests];
  // Borç: kendi borcu ve getirdiği misafirlerin ödenmemiş payı (Kural 2.4, 1.8)
  const debts = liabilityMap(s, today);
  const used = new Set<string>();
  return entries.map((e) => {
    const cands = candidates(pool, e.name);
    const row: PlanRow = { name: e.name, st: e.st, id: cands.length === 1 ? cands[0] : null, cands: cands.length > 1 ? cands : [], act: e.st, note: "" };
    if (!row.id) {
      if (row.cands.length) return { ...row, act: "skip", note: "ambiguous" };
      // Kural 1.8: aynı adla daha önce gelmiş misafirin borcu ya da cezası varsa varsayılan olarak atlanır (12.1)
      const hist = guestHistory(s, m, e.name, today);
      if (hist) {
        const out: PlanRow = { ...row, act: "skip", note: "guestPrev" };
        if (hist.block) out.block = hist.block;
        if (hist.debt) out.prevDebt = hist.debt;
        return out;
      }
      return { ...row, act: "guest", note: "none" };
    }
    if (used.has(row.id)) return { ...row, act: "skip", note: "dup" };
    used.add(row.id);
    const cur = m.att[row.id];
    if (cur === e.st || (cur === "in" && e.st === "maybe")) return { ...row, act: "skip", note: "already" };
    if (cur === "late") return { ...row, act: "skip", note: "late" };
    if (cur !== "in" && cur !== "maybe") {
      const block = joinBlock(s, m, row.id, debts[row.id] || 0);
      if (block) return { ...row, act: "skip", note: "blocked", block };
    }
    return row;
  });
}

const ACTS = new Set<string>(["in", "maybe", "skip", "guest", "player", "out"]);

/** Önizlemede seçilen iş: "p:<id>" kayıtlı bir kişiyi seçer (listedeki yanıtla yazılır). */
export function choose(r: PlanRow, v: string): PlanRow {
  if (v.startsWith("p:")) return { ...r, id: v.slice(2), act: r.st };
  return ACTS.has(v) ? { ...r, act: v as Act } : r;
}

/** Uygulamanın sonucu: işaretlenen kişi sayısı, geç iptal edenler ve yerlerine kadroya girenler. */
export interface PlanResult {
  n: number;
  late: string[];
  /** late[i]'nin yerine giren (sırayla; yoksa eksik) */
  covered: string[];
}

/**
 * Seçilen işleri liste sırasıyla uygular. Misafir bu maça, yeni oyuncu kadroya eklenir;
 * aynı adlı (pasif) bir oyuncu varsa yenisi açılmaz, o yeniden aktif olur.
 * Döner: işaretlenen kişi sayısı.
 */
export function applyPlan(s: State, m: Match, rows: PlanRow[], now: Date = new Date()): number {
  return applyPlanReport(s, m, rows, now).n;
}

/**
 * applyPlan ve listeden düşenler: "Yok" yazılır; kadro kesinleştiyse ve oynuyorsa geç iptal
 * (Kural 1.4–1.5). Yerine biri kadroya girdiyse (yedekten ya da listeye yeni yazılan) payı o
 * öder ve geç iptal eden muaf olur; ✕ ile tek tek çıkarmakla aynı sonuç.
 */
export function applyPlanReport(s: State, m: Match, rows: PlanRow[], now: Date = new Date()): PlanResult {
  const before = lineup(s, m).playing;
  const late: string[] = [];
  let n = 0;
  for (const r of rows) {
    if (r.act === "skip") continue;
    if (r.act === "out") {
      if (!r.id || !getP(s, m, r.id) || (m.att[r.id] !== "in" && m.att[r.id] !== "maybe")) continue;
      const st = lateCancel(m, "out", before.includes(r.id), now) ? "late" : "out";
      setAtt(m, r.id, st, true);
      if (st === "late") late.push(r.id);
      n++;
      continue;
    }
    let id = r.id;
    if (r.act === "guest") {
      // Daha önce gelmiş misafirin getireni, seviyesi ve mevkii korunur (Kural 1.8)
      const past = pastGuests(s, m.id).find((x) => norm(x.name) === norm(r.name));
      const g: Guest = { id: "g" + uid(), name: r.name, rating: past?.rating || 3, pos: past?.pos || "" };
      if (past?.host && s.players.some((p) => p.id === past.host)) g.host = past.host;
      m.guests.push(g);
      id = g.id;
    } else if (r.act === "player") {
      const same = s.players.find((p) => norm(p.name) === norm(r.name));
      if (same) {
        same.active = true;
        id = same.id;
      } else {
        id = uid();
        s.players.push({ id, name: r.name, rating: 3, pos: "", phone: "", active: true, fixed: false });
      }
    }
    if (!id || !getP(s, m, id)) continue;
    const st = r.act === "in" || r.act === "maybe" ? r.act : r.st;
    if (m.att[id] === st) continue;
    setAtt(m, id, st, true);
    n++;
  }
  // Kural 1.5: kadroya yeni girenlerin muafiyeti kalkar; geç iptal edenin yerine giren varsa geç iptal eden muaf olur
  const entered = promoted(before, lineup(s, m).playing).filter((x) => !late.includes(x));
  for (const x of entered) delete m.exempt[x];
  const covered: string[] = [];
  late.forEach((id, i) => {
    const by = entered[i];
    if (!by) return;
    covered.push(by);
    if (!isFree(s, m, by) && !isFree(s, m, id)) m.exempt[id] = true;
  });
  return { n, late, covered };
}

/* ---------- Listedeki tarih ve gün (yanlış etkinliğe yapıştırmayı önlemek için) ---------- */

const lower = (x: string) => x.toLocaleLowerCase("tr");
const DAY_IDX = new Map<string, number>([...DAYS.tr, ...DAYS.en].map((d, i) => [lower(d), i % 7]));
const MONTH_IDX = new Map<string, number>([...MONTHS.tr, ...MONTHS.en].map((mo, i) => [lower(mo), (i % 12) + 1]));
const DATE_NUM = /(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?!\d)/u;
const DATE_TXT = /(?<!\d)(\d{1,2})\s+(\p{L}+)(?:\s+(\d{4}))?/u;
const p2 = (n: number) => String(n).padStart(2, "0");

interface Found {
  day: number;
  month: number;
  year?: number;
  /** Listede yazılan haliyle */
  raw: string;
}

/** Saat: "22:00", "22.00" (tarihten sonra aynı satırda; "22.00-23.00" aralığında ilki). */
const TIME = /(?<![\d./])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d]|[./]\d)/u;

interface Header {
  date?: Found;
  dayIdx?: number;
  dayRaw?: string;
  /** Tarihin yazıldığı satırdaki ilk saat ("HH:MM") */
  time?: string;
}

/** Başlık satırlarından (numaralı liste satırları ve Yedek/Belki hariç) ilk tarih, ilk gün adı ve tarihle aynı satırdaki saat. */
function headerInfo(text: string): Header {
  const out: Header = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    if (NUMBERED.test(line) || LABEL.test(line)) continue;
    const words = line.split(/[^\p{L}]+/u).filter(Boolean);
    const dw = words.find((w) => DAY_IDX.has(lower(w)));
    if (dw && out.dayIdx === undefined) {
      out.dayIdx = DAY_IDX.get(lower(dw));
      out.dayRaw = dw;
    }
    if (out.date) continue;
    // "20.12.2026", "20/12"; yıl ya da gün adı yoksa "13.10" saat olabilir, tarih sayılmaz
    const n = DATE_NUM.exec(line);
    if (n && (n[3] || dw)) {
      const day = Number(n[1]), month = Number(n[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        out.date = { day, month, year: n[3] ? (n[3].length === 2 ? 2000 + Number(n[3]) : Number(n[3])) : undefined, raw: n[0] };
        out.time = timeIn(line.replace(n[0], " "));
        continue;
      }
    }
    // "20 Aralık", "20 Aralık 2026"
    const tx = DATE_TXT.exec(line);
    if (tx && MONTH_IDX.has(lower(tx[2]))) {
      const day = Number(tx[1]);
      if (day >= 1 && day <= 31) {
        out.date = { day, month: MONTH_IDX.get(lower(tx[2]))!, year: tx[3] ? Number(tx[3]) : undefined, raw: tx[0] };
        out.time = timeIn(line.replace(tx[0], " "));
      }
    }
  }
  return out;
}

function timeIn(line: string): string | undefined {
  const x = TIME.exec(line);
  return x ? p2(Number(x[1])) + ":" + x[2] : undefined;
}

/**
 * Listenin tarihi (ve varsa saati) ISO olarak. Yıl yazılmamışsa bugüne en yakın yıl
 * ("05.01" Aralık'ta yapıştırılınca gelecek yılın Ocak'ı). Gün adı tarihe uymuyorsa
 * ("20.12.2026 Cuma" aslında Pazar) hangisinin doğru olduğu bilinemez: null (uyarı ayrıca çıkar).
 */
export function listWhen(text: string, today: string): { date: string; time: string } | null {
  const { date, dayIdx, time } = headerInfo(text);
  if (!date) return null;
  const ty = Number(today.slice(0, 4));
  const isoOf = (y: number) => y + "-" + p2(date.month) + "-" + p2(date.day);
  const real = (y: number) => {
    const d = parseISO(isoOf(y));
    return d.getMonth() + 1 === date.month && d.getDate() === date.day;
  };
  const away = (y: number) => Math.abs(parseISO(isoOf(y)).getTime() - parseISO(today).getTime());
  const years = date.year !== undefined ? [date.year] : [ty - 1, ty, ty + 1].filter(real).sort((a, b) => away(a) - away(b));
  const y = years.find(real);
  if (y === undefined) return null;
  const iso = isoOf(y);
  if (dayIdx !== undefined && weekday(iso) !== dayIdx) return null;
  return { date: iso, time: time || "" };
}

/**
 * Listenin ait olduğu açık etkinlik: listedeki tarihte; önce aynı saat, sonra seçili etkinlikle
 * aynı tür. O tarihte açık etkinlik yoksa null (organizatöre yeni maç açması önerilir).
 */
export function listTarget(s: State, cur: Match, when: { date: string; time: string }): Match | null {
  const kind = (m: Match) => m.kind || "football";
  const same = s.matches.filter((m) => m.status === "open" && m.date === when.date);
  const score = (m: Match) => (when.time && m.time === when.time ? 0 : 2) + (kind(m) === kind(cur) ? 0 : 1);
  return same.sort((a, b) => score(a) - score(b) || a.time.localeCompare(b.time))[0] || null;
}

/**
 * Yapıştırılan listedeki tarih ve gün seçili etkinlikle tutuyor mu. Uyarılar döner (boşsa sorun
 * yok): listede başka bir tarih yazıyorsa, yazılan gün o tarihe denk gelmiyorsa ("20.12.2026
 * Cuma" aslında Pazar) ya da yalnızca gün yazıyor ve etkinliğin günü değilse. Engellemez.
 */
export function listDateIssues(text: string, m: Match): string[] {
  const { date, dayIdx, dayRaw } = headerInfo(text);
  const [my, mm, md] = m.date.split("-").map(Number);
  if (!my || !mm || !md) return [];
  const mWd = weekday(m.date);
  const event = dayNameOf(mWd) + " " + ddmm(m.date);
  const out: string[] = [];
  if (date) {
    const year = date.year ?? my;
    if (date.day !== md || date.month !== mm || (date.year !== undefined && date.year !== my)) {
      out.push(t("pasteWrongDate", { l: date.raw, e: event }));
    }
    if (dayIdx !== undefined) {
      const iso = year + "-" + p2(date.month) + "-" + p2(date.day);
      const actual = weekday(iso);
      if (!Number.isNaN(actual) && actual !== dayIdx) out.push(t("pasteWrongDay", { l: date.raw + " " + dayRaw, a: dayNameOf(actual) }));
    }
  } else if (dayIdx !== undefined && dayIdx !== mWd) {
    out.push(t("pasteWrongDayOnly", { s: dayRaw || "", e: event }));
  }
  return out;
}

const dayNameOf = (i: number): string => DAYS[lang()][i];
