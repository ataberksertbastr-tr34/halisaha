/**
 * Banka bildiriminden ödeme (Kural 2.3, 2.4): organizatör bankanın havale/FAST bildirimlerini
 * ya da hesap hareketlerini yapıştırır; her satırdan tutar, tarih ve gönderen çıkarılır, kişiyle
 * eşleştirilir. Önizlemede organizatör onaylar; ödemeler hesap defterine genel ödeme olarak yazılır
 * (en eski borçtan başlayarak kapanır). Metin saklanmaz; yalnızca organizatörün elle eşlediği
 * gönderen adı oyuncuya "banka adı" olarak kaydedilir ki bir dahaki sefere kendiliğinden tutsun.
 */
import type { Payment, State } from "./types";
import { accounts, newPayment } from "./ledger";
import { iso } from "./dates";
import { norm } from "./text";

export interface BankLine {
  /** Satırın kendisi (önizlemede gösterilir) */
  raw: string;
  amount: number;
  /** YYYY-AA-GG (bulunamazsa bugün) */
  date: string;
  /** Büyük harfle yazılmış gönderen adı ("AHMET YILMAZ"); bulunamazsa boş */
  sender: string;
  /** Hesaptan çıkan para (gönderilen, harcama): ödeme sayılmaz */
  out: boolean;
}

export type BankNote = "match" | "alias" | "none" | "ambiguous" | "out" | "dup";

export interface BankRow extends BankLine {
  /** Eşleşen kişi (yoksa boş) */
  pid: string;
  /** Birden çok kişi tuttuysa adaylar */
  cands: string[];
  note: BankNote;
  /** Varsayılan: uygula mı */
  apply: boolean;
}

/** Ödeme kaydının notu; aynı bildirim ikinci kez yapıştırılırsa tanınır. */
export const BANK_NOTE = "Banka";

const CUR = /^\s*(?:TL|TRY|₺)\b|^\s*₺/i;
const CUR_BEFORE = /(?:TL|TRY|₺)\s*$/i;
const AMOUNT = /(?<![\d.,:/])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?![\d.,:/])/g;
const DATE = /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?!\d)/;
const OUT = /\b(giden|gönderdiniz|gonderdiniz|gönderildi:\s*alıcı|ödeme yapıldı|harcama|çekildi|cekildi|sent|outgoing|debit)\b/i;
const BALANCE = /(bakiye|bakiyeniz|balance|limit)\W*$/i;
/** Gönderen adı sayılmayacak büyük harfli kelimeler. */
const STOP = new Set(["FAST", "EFT", "HAVALE", "TL", "TRY", "IBAN", "TR", "AŞ", "A.Ş.", "BANK", "BANKASI", "BANKA", "HESAP", "HESABINIZA", "GELEN", "GIDEN", "GİDEN", "TUTAR", "AÇIKLAMA", "ACIKLAMA", "REF", "NO", "SAAT", "TARIH", "TARİH", "SMS", "ATM", "POS", "KREDI", "KREDİ", "KARTI", "QR"]);
const UPPER = /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ.]*$/;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "1.234,50" → 1234.5 */
function toNum(int: string, dec?: string): number {
  return r2(Number(int.replace(/\./g, "")) + (dec ? Number(dec.padEnd(2, "0")) / 100 : 0));
}

/** Tutar: önce TL/₺ işaretli olan (bakiye hariç), yoksa kuruşlu ilk sayı. */
function amountOf(line: string): number {
  const hits: { v: number; cur: boolean; dec: boolean; bal: boolean }[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const at = m.index || 0;
    const before = line.slice(Math.max(0, at - 20), at);
    const after = line.slice(at + m[0].length, at + m[0].length + 5);
    hits.push({ v: toNum(m[1], m[2]), cur: CUR.test(after) || CUR_BEFORE.test(before), dec: !!m[2], bal: BALANCE.test(before.replace(/[:\s]+$/, "")) });
  }
  const ok = hits.filter((h) => !h.bal && h.v > 0);
  return (ok.find((h) => h.cur) || ok.find((h) => h.dec))?.v || 0;
}

function dateOf(line: string, today: string): string {
  const m = DATE.exec(line);
  if (!m) return today;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
  if (d.getMonth() !== Number(m[2]) - 1) return today;
  const out = iso(d);
  return out > today ? today : out;
}

/** En uzun büyük harfli kelime dizisi (en az iki kelime): banka bildirimlerinde gönderen adı. */
export function senderOf(line: string): string {
  let best: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length >= 2 && cur.length > best.length) best = cur;
    cur = [];
  };
  for (const raw of line.split(/\s+/)) {
    // "YILMAZ'DAN" → "YILMAZ" (ek kesilir, dizi orada biter)
    const [w, suffix] = raw.replace(/[,;:()"]/g, "").split(/['’]/);
    if (w && UPPER.test(w) && w.replace(/\./g, "").length >= 2 && !STOP.has(w)) {
      cur.push(w);
      if (suffix !== undefined) flush();
    } else flush();
  }
  flush();
  return best.join(" ");
}

/** Yapıştırılan metin: tutarı olan her satır bir hareket. */
export function parseBank(text: string, today: string): BankLine[] {
  const out: BankLine[] = [];
  for (const raw0 of String(text || "").split(/\r?\n/)) {
    const raw = raw0.trim();
    if (!raw) continue;
    const amount = amountOf(raw);
    if (!amount) continue;
    out.push({ raw, amount, date: dateOf(raw, today), sender: senderOf(raw), out: OUT.test(raw) });
  }
  return out;
}

/** Karşılaştırma için kelimeler: Türkçe harfler sadeleşir, ekler ayrılır ("yılmaz'dan" → yilmaz, dan). */
const words = (s: string): Set<string> => new Set(norm(s).split(/[^a-z0-9]+/).filter(Boolean));
const tokens = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

interface Cand {
  id: string;
  name: string;
  aliases: string[];
}

/** Eşleştirilebilecek kişiler: oyuncular ve hesabı olan misafirler. */
function candidates(s: State, today: string): Cand[] {
  const out: Cand[] = s.players.map((p) => ({ id: p.id, name: p.name, aliases: p.bank || [] }));
  for (const a of accounts(s, today).values()) if (a.guest) out.push({ id: a.id, name: a.name, aliases: [] });
  return out;
}

/**
 * Satırı kişiyle eşleştirir: kişinin adının (ya da kaydedilmiş banka adının) bütün kelimeleri
 * satırda geçiyorsa tutar. En çok kelimesi tutan kazanır; eşitlikte belirsizdir.
 */
function matchOf(line: BankLine, cands: Cand[]): { pid: string; cands: string[]; via: "match" | "alias" | "" } {
  const w = words(line.raw);
  let best = 0;
  let hits: { id: string; via: "match" | "alias" }[] = [];
  for (const c of cands) {
    const opts: [string[], "match" | "alias"][] = [[tokens(c.name), "match"], ...c.aliases.map((a): [string[], "alias"] => [tokens(a), "alias"])];
    for (const [tk, via] of opts) {
      if (!tk.length || !tk.every((x) => w.has(x))) continue;
      const score = tk.length + (via === "alias" ? 0.5 : 0);
      if (score > best) {
        best = score;
        hits = [{ id: c.id, via }];
      } else if (score === best && !hits.some((h) => h.id === c.id)) hits.push({ id: c.id, via });
    }
  }
  if (hits.length === 1) return { pid: hits[0].id, cands: [], via: hits[0].via };
  return { pid: "", cands: hits.map((h) => h.id), via: "" };
}

/** Aynı bildirim daha önce işlendi mi (aynı kişi, gün, tutar ve banka notu). */
function isDup(payments: Payment[], pid: string, date: string, amount: number): boolean {
  return payments.some((p) => p.pid === pid && p.at === date && Math.abs(p.amount - amount) < 0.005 && (p.note || "").startsWith(BANK_NOTE));
}

/** Önizleme satırları: kişi, açıklama ve varsayılan seçim. */
export function planBank(s: State, lines: BankLine[], today: string): BankRow[] {
  const cands = candidates(s, today);
  const seen: Payment[] = [];
  return lines.map((l) => {
    const m = matchOf(l, cands);
    let note: BankNote = l.out ? "out" : m.pid ? m.via || "match" : m.cands.length ? "ambiguous" : "none";
    if (!l.out && m.pid && (isDup(s.payments, m.pid, l.date, l.amount) || isDup(seen, m.pid, l.date, l.amount))) note = "dup";
    if (m.pid) seen.push({ id: "", pid: m.pid, amount: l.amount, at: l.date, note: BANK_NOTE });
    return { ...l, pid: m.pid, cands: m.cands, note, apply: !!m.pid && note !== "out" && note !== "dup" };
  });
}

export interface BankChoice {
  row: BankRow;
  /** Seçilen kişi (boş: atla) */
  pid: string;
}

/**
 * Onaylanan satırları hesap defterine genel ödeme olarak yazar (en eski borçtan kapanır).
 * Organizatörün elle seçtiği kişiye gönderen adı "banka adı" olarak eklenir. Yazılan ödeme sayısı.
 */
export function applyBank(s: State, choices: BankChoice[]): number {
  let n = 0;
  for (const { row, pid } of choices) {
    if (!pid || row.out || !(row.amount > 0)) continue;
    s.payments.push(newPayment(pid, row.amount, row.date, undefined, BANK_NOTE + (row.sender ? ": " + row.sender : "")));
    n++;
    const p = s.players.find((x) => x.id === pid);
    if (p && row.sender && pid !== row.pid) {
      const k = norm(row.sender);
      const has = (p.bank || []).some((a) => norm(a) === k);
      if (!has) p.bank = [...(p.bank || []), row.sender];
    }
  }
  return n;
}
