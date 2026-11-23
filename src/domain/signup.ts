/**
 * WhatsApp'taki dolu davet listesini yapıştırıp katılımı tek seferde işaretleme.
 * Davet mesajı (messages.ts msgInvite) numaralı bir liste üretir; oyuncular adını boş
 * numaraya yazıp mesajı gruba yeniden gönderir. Yazılma sırası kadroyu ve yedeği belirler
 * (Kural 1.3): yeni yazılanlar listedeki sırayla eklenir, uygulamadaki sıra bozulmaz.
 */
import type { Guest, Match, Person, State } from "./types";
import { DAYS, lang, MONTHS, t } from "../i18n";
import { ddmm, weekday } from "./dates";
import { getP, setAtt } from "./lineup";
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

export type Act = "in" | "maybe" | "skip" | "guest" | "player";

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
  /** Neden: zaten aynı yanıt, geç iptal etmiş, engelli, listede iki kez, kayıtlı değil, belirsiz, önceki misafirliğinden borç/ceza */
  note: "" | "already" | "late" | "blocked" | "dup" | "none" | "ambiguous" | "guestPrev";
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

const ACTS = new Set<string>(["in", "maybe", "skip", "guest", "player"]);

/** Önizlemede seçilen iş: "p:<id>" kayıtlı bir kişiyi seçer (listedeki yanıtla yazılır). */
export function choose(r: PlanRow, v: string): PlanRow {
  if (v.startsWith("p:")) return { ...r, id: v.slice(2), act: r.st };
  return ACTS.has(v) ? { ...r, act: v as Act } : r;
}

/**
 * Seçilen işleri liste sırasıyla uygular. Misafir bu maça, yeni oyuncu kadroya eklenir;
 * aynı adlı (pasif) bir oyuncu varsa yenisi açılmaz, o yeniden aktif olur.
 * Döner: işaretlenen kişi sayısı.
 */
export function applyPlan(s: State, m: Match, rows: PlanRow[]): number {
  let n = 0;
  for (const r of rows) {
    if (r.act === "skip") continue;
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
  return n;
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

/** Başlık satırlarından (numaralı liste satırları ve Yedek/Belki hariç) ilk tarih ve ilk gün adı. */
function headerInfo(text: string): { date?: Found; dayIdx?: number; dayRaw?: string } {
  const out: { date?: Found; dayIdx?: number; dayRaw?: string } = {};
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
        continue;
      }
    }
    // "20 Aralık", "20 Aralık 2026"
    const tx = DATE_TXT.exec(line);
    if (tx && MONTH_IDX.has(lower(tx[2]))) {
      const day = Number(tx[1]);
      if (day >= 1 && day <= 31) out.date = { day, month: MONTH_IDX.get(lower(tx[2]))!, year: tx[3] ? Number(tx[3]) : undefined, raw: tx[0] };
    }
  }
  return out;
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
