/**
 * Kişi bazlı hesap defteri.
 *
 * Borçlar maçlardan türetilir (her ödeyen için maçın payı) ve kişiye yazılan
 * ek borçlardan (kişisel harcama 15.4, zarar bedeli 10.5) gelir; ödemeler kayıttır.
 * Dağıtım kuralı:
 *  1) Bir maça ya da ek borca yazılmış ödeme önce onu kapatır.
 *  2) Artan ve maça yazılmamış ödemeler havuza girer; havuz önce vadesi gelmiş
 *     en eski borçlara, sonra yaklaşan maçlara dağıtılır (FIFO).
 *  3) Havuzda kalan para avanstır (bakiye artı).
 * Böylece kısmi ödeme, toplu ödeme, avans ve iade tutarlı biçimde işlenir.
 */
import type { ExtraCharge, Match, Payment, State } from "./types";
import { billOf, isDue } from "./money";
import { getP } from "./lineup";
import { monthKey } from "./dates";
import { uid } from "./text";

const EPS = 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ChargeStatus = "paid" | "partial" | "unpaid";

export interface Charge {
  /** Maç payında maç id; ek borçta etkinlik id'si ya da boş */
  mid: string;
  /** Ek borç (ExtraCharge) id'si; maç payında yok */
  cid?: string;
  /** Ek borcun açıklaması */
  note?: string;
  rule?: string;
  date: string;
  time: string;
  amount: number;
  paid: number;
  due: boolean;
  status: ChargeStatus;
}

export interface Account {
  id: string;
  name: string;
  phone: string;
  /** Misafirse getiren oyuncu */
  host?: string;
  guest: boolean;
  charges: Charge[];
  payments: Payment[];
  /** Toplam alınan ödeme */
  paidTotal: number;
  /** Vadesi gelmiş, ödenmemiş toplam */
  owed: number;
  /** Vadesi gelmiş ödenmemiş maç sayısı */
  owedCount: number;
  /** Dağıtılamayan fazla ödeme (avans) */
  credit: number;
  /** credit − owed (eksi: borçlu) */
  balance: number;
}

interface Who {
  name: string;
  phone: string;
  host?: string;
  guest: boolean;
}

/** Oyuncu ya da herhangi bir maçın misafiri. */
export function whoIs(s: State, id: string): Who | null {
  const p = s.players.find((x) => x.id === id);
  if (p) return { name: p.name, phone: p.phone || "", guest: false };
  for (const m of s.matches) {
    const g = m.guests.find((x) => x.id === id);
    if (g) return { name: g.name, phone: "", host: g.host, guest: true };
  }
  return null;
}

const when = (m: Pick<Match, "date" | "time">) => m.date + " " + m.time;

/** Tüm kişilerin hesapları (borcu ya da ödemesi olan herkes). */
export function accounts(s: State, today: string): Map<string, Account> {
  const raw = new Map<string, { charges: Charge[]; payments: Payment[] }>();
  const get = (id: string) => {
    let a = raw.get(id);
    if (!a) raw.set(id, (a = { charges: [], payments: [] }));
    return a;
  };
  for (const m of s.matches) {
    const { payers, share } = billOf(s, m);
    if (!share) continue;
    for (const id of payers) {
      if (!getP(s, m, id)) continue;
      get(id).charges.push({ mid: m.id, date: m.date, time: m.time, amount: share, paid: 0, due: isDue(m, today), status: "unpaid" });
    }
  }
  for (const x of s.charges) {
    const m = x.mid ? s.matches.find((mm) => mm.id === x.mid) : undefined;
    if (m && m.status === "cancelled") continue;
    if (!x.amount) continue;
    const c: Charge = { mid: x.mid || "", cid: x.id, note: x.note, date: m ? m.date : x.at, time: m ? m.time : "00:00", amount: x.amount, paid: 0, due: m ? isDue(m, today) : x.at <= today, status: "unpaid" };
    if (x.rule) c.rule = x.rule;
    get(x.pid).charges.push(c);
  }
  for (const p of s.payments) get(p.pid).payments.push(p);

  const out = new Map<string, Account>();
  for (const [id, a] of raw) {
    const who = whoIs(s, id);
    // Silinmiş kişi: hesap listesinde gösterilmez (ödemeleri kasada sayılmaya devam eder).
    if (!who) continue;
    a.charges.sort((x, y) => when(x).localeCompare(when(y)));
    a.payments.sort((x, y) => x.at.localeCompare(y.at));
    const byMid = new Map(a.charges.filter((c) => !c.cid).map((c) => [c.mid, c]));
    const byCid = new Map(a.charges.filter((c) => c.cid).map((c) => [c.cid, c]));
    let pool = 0;
    for (const p of a.payments) {
      const c = p.cid ? byCid.get(p.cid) : p.mid ? byMid.get(p.mid) : undefined;
      if (c) {
        const take = Math.min(Math.max(0, c.amount - c.paid), p.amount);
        c.paid = r2(c.paid + take);
        pool = r2(pool + p.amount - take);
      } else pool = r2(pool + p.amount);
    }
    // Önce vadesi gelenler (eskiden yeniye), sonra yaklaşan maçlar.
    const order = [...a.charges.filter((c) => c.due), ...a.charges.filter((c) => !c.due)];
    for (const c of order) {
      if (pool <= EPS) break;
      const need = r2(c.amount - c.paid);
      if (need <= EPS) continue;
      const take = Math.min(need, pool);
      c.paid = r2(c.paid + take);
      pool = r2(pool - take);
    }
    let owed = 0, owedCount = 0;
    for (const c of a.charges) {
      c.status = c.paid >= c.amount - EPS ? "paid" : c.paid > EPS ? "partial" : "unpaid";
      if (c.due && c.status !== "paid") {
        owed = r2(owed + c.amount - c.paid);
        owedCount++;
      }
    }
    const credit = Math.max(0, pool);
    out.set(id, {
      id, name: who.name, phone: who.phone, host: who.host, guest: who.guest,
      charges: a.charges, payments: a.payments,
      paidTotal: r2(a.payments.reduce((t, p) => t + p.amount, 0)),
      owed, owedCount, credit, balance: r2(credit - owed),
    });
  }
  return out;
}

export interface Debt {
  id: string;
  name: string;
  total: number;
  n: number;
  phone: string;
  host?: string;
}

/** Biriken borçlar (en çok borçlu başta). */
export function debts(s: State, today: string): Debt[] {
  const list: Debt[] = [];
  for (const a of accounts(s, today).values()) {
    if (a.owed > EPS) list.push({ id: a.id, name: a.name, total: a.owed, n: a.owedCount, phone: a.phone, host: a.host });
  }
  return list.sort((a, b) => b.total - a.total);
}

export function debtMap(s: State, today: string): Record<string, number> {
  const d: Record<string, number> = {};
  debts(s, today).forEach((x) => (d[x.id] = x.total));
  return d;
}

export interface GuestDebt {
  /** Misafirin kimliği */
  id: string;
  name: string;
  amount: number;
}

/**
 * Kural 1.8: misafirin vadesi gelmiş, ödenmemiş payları onu getirenin sorumluluğundadır.
 * Her pay, o maçta misafiri kimin getirdiğine yazılır (maça bağlı olmayan ek borçta misafir
 * kaydındaki getiren). Getireni olmayan ya da silinmiş oyuncunun misafiri sayılmaz.
 * Döner: getiren → misafirlerinin borçları.
 */
export function guestDebts(s: State, today: string, acc: Map<string, Account> = accounts(s, today)): Map<string, GuestDebt[]> {
  const out = new Map<string, GuestDebt[]>();
  for (const a of acc.values()) {
    if (!a.guest) continue;
    for (const c of a.charges) {
      const left = r2(c.amount - c.paid);
      if (!c.due || left <= EPS) continue;
      const m = c.mid ? s.matches.find((x) => x.id === c.mid) : undefined;
      const host = m?.guests.find((g) => g.id === a.id)?.host || a.host;
      if (!host || !s.players.some((p) => p.id === host)) continue;
      let list = out.get(host);
      if (!list) out.set(host, (list = []));
      const x = list.find((d) => d.id === a.id);
      if (x) x.amount = r2(x.amount + left);
      else list.push({ id: a.id, name: a.name, amount: left });
    }
  }
  return out;
}

export interface Liability {
  /** Kendi borcu + misafirlerinin borcu */
  total: number;
  own: number;
  guests: GuestDebt[];
}

/**
 * Borç engeli (Kural 2.4) için sorumlu olunan borç: kişinin kendi borcu ve getirdiği
 * misafirlerin ödenmemiş payları (1.8). Yalnızca borcu olanlar listelenir.
 */
export function liabilities(s: State, today: string): Record<string, Liability> {
  const acc = accounts(s, today);
  const out: Record<string, Liability> = {};
  for (const a of acc.values()) if (a.owed > EPS) out[a.id] = { total: a.owed, own: a.owed, guests: [] };
  for (const [host, list] of guestDebts(s, today, acc)) {
    const x = (out[host] ??= { total: 0, own: 0, guests: [] });
    x.guests = list;
    x.total = r2(x.own + list.reduce((t, g) => t + g.amount, 0));
  }
  return out;
}

/** Kişi → sorumlu olunan toplam borç (kendi + misafirleri). */
export function liabilityMap(s: State, today: string): Record<string, number> {
  const d: Record<string, number> = {};
  for (const [id, x] of Object.entries(liabilities(s, today))) d[id] = x.total;
  return d;
}

/** Bir maçtaki bir kişinin pay durumu. */
export function chargeOf(s: State, m: Match, id: string, today: string, acc?: Map<string, Account>): Charge | null {
  const a = (acc || accounts(s, today)).get(id);
  return a?.charges.find((c) => c.mid === m.id && !c.cid) || null;
}

/** Bir ek borcun durumu. */
export function extraStatus(s: State, x: ExtraCharge, today: string, acc?: Map<string, Account>): Charge | null {
  const a = (acc || accounts(s, today)).get(x.pid);
  return a?.charges.find((c) => c.cid === x.id) || null;
}

export function newPayment(pid: string, amount: number, at: string, mid?: string, note?: string, cid?: string): Payment {
  const p: Payment = { id: uid(), pid, amount: r2(amount), at };
  if (mid) p.mid = mid;
  if (cid) p.cid = cid;
  if (note) p.note = note;
  return p;
}

/**
 * "Ödedi" kaydının kimliği borçtan türetilir (kişi + maç ya da ek borç). İki cihaz aynı
 * borcu ayrı ayrı "ödendi" yaparsa eşitlemede tek kayıt olur; elle girilen ödemeler
 * rastgele kimlik alır ve hiçbir zaman birleşmez.
 */
export const settleId = (pid: string, mid?: string, cid?: string): string => "pd-" + (cid ? "x" + cid : "m" + (mid || "")) + "-" + pid;

/** Borcun kalanını "Ödedi" kaydına yazar (kayıt varsa tutarı artar). */
function addSettle(s: State, pid: string, amount: number, at: string, mid?: string, cid?: string): void {
  const id = settleId(pid, mid, cid);
  const ex = s.payments.find((p) => p.id === id);
  if (ex) {
    ex.amount = r2(ex.amount + amount);
    ex.at = at;
    return;
  }
  const p = newPayment(pid, amount, at, mid, undefined, cid);
  p.id = id;
  s.payments.push(p);
}

/** Kişiye ek borç yazar (kişisel harcama, zarar bedeli). */
export function newExtra(pid: string, amount: number, at: string, note: string, mid?: string, rule?: string): ExtraCharge {
  const x: ExtraCharge = { id: uid(), pid, amount: r2(amount), at, note };
  if (mid) x.mid = mid;
  if (rule) x.rule = rule;
  return x;
}

/** Ek borcu "ödendi" yapar / geri alır. */
export function toggleExtraPaid(s: State, x: ExtraCharge, today: string): "paid" | "unpaid" | null {
  const c = extraStatus(s, x, today);
  if (!c) return null;
  if (c.status === "paid") {
    const before = s.payments.length;
    s.payments = s.payments.filter((p) => !(p.pid === x.pid && p.cid === x.id));
    return s.payments.length !== before ? "unpaid" : null;
  }
  const rest = r2(c.amount - c.paid);
  if (rest > EPS) addSettle(s, x.pid, rest, today, x.mid, x.id);
  return "paid";
}

/** "Ödedi": maçın kalan payını o maça yazılmış ödeme olarak ekler. */
export function markPaid(s: State, m: Match, id: string, today: string): void {
  const c = chargeOf(s, m, id, today);
  if (!c) return;
  const rest = r2(c.amount - c.paid);
  if (rest > EPS) addSettle(s, id, rest, today, m.id);
}

/**
 * "Ödedi" işaretini kaldırır: o maça yazılmış ödemeleri siler.
 * Pay genel bir ödemeden karşılanıyorsa false döner (defterden düzenlenmeli).
 */
export function unmarkPaid(s: State, m: Match, id: string): boolean {
  const before = s.payments.length;
  s.payments = s.payments.filter((p) => !(p.pid === id && p.mid === m.id && !p.cid));
  return s.payments.length !== before;
}

/** "Ödendi say": vadesi gelmiş tüm ödenmemiş payları ilgili maçlara yazar. */
export function settleAll(s: State, id: string, today: string): number {
  const a = accounts(s, today).get(id);
  if (!a) return 0;
  let total = 0;
  for (const c of a.charges) {
    if (!c.due) continue;
    const rest = r2(c.amount - c.paid);
    if (rest > EPS) {
      addSettle(s, id, rest, today, c.mid || undefined, c.cid);
      total = r2(total + rest);
    }
  }
  return total;
}

/* ---------- aylık özet ve kasa ---------- */

export interface MonthSummary {
  month: string;
  played: number;
  cancelled: number;
  /** Sahaya/tesise ödenen (oynanan maç ve etkinliklerin ücreti) */
  fieldCost: number;
  /** Kişilere yazılan ek borçlar (kişisel harcama, zarar): organizatör adına tesise ödenir */
  extras: number;
  /** Oyunculara yansıtılan toplam pay */
  billed: number;
  /** Bu ay alınan ödemeler */
  collected: number;
  /** Bu ayın giderleri (top, yelek, su…) */
  expenses: number;
  /** Ay sonu kasa (birikimli) */
  cash: number;
}

/** Ek borcun tarihi: bağlı etkinliğin tarihi, yoksa yazıldığı gün. İptal etkinliğin eki sayılmaz (null). */
function extraDate(s: State, x: ExtraCharge): string | null {
  if (!x.mid) return x.at;
  const m = s.matches.find((mm) => mm.id === x.mid);
  if (m && m.status === "cancelled") return null;
  return m ? m.date : x.at;
}

/**
 * Kasa = alınan ödemeler − oynanan maç/etkinliklerin ücreti − ek borçlar
 * (organizatör tesise öder, kişiden tahsil eder) − giderler.
 */
export function cashAt(s: State, untilMonth?: string): number {
  const inM = (d: string) => !untilMonth || monthKey(d) <= untilMonth;
  const inflow = s.payments.filter((p) => inM(p.at)).reduce((t, p) => t + p.amount, 0);
  const field = s.matches.filter((m) => m.status === "played" && inM(m.date)).reduce((t, m) => t + (Number(m.price) || 0), 0);
  const extras = s.charges.reduce((t, x) => {
    const d = extraDate(s, x);
    return d && inM(d) ? t + x.amount : t;
  }, 0);
  const exp = s.expenses.filter((e) => inM(e.at)).reduce((t, e) => t + e.amount, 0);
  return r2(inflow - field - extras - exp);
}

export function monthSummary(s: State, month: string): MonthSummary {
  const ms = s.matches.filter((m) => monthKey(m.date) === month);
  const played = ms.filter((m) => m.status === "played");
  return {
    month,
    played: played.length,
    cancelled: ms.filter((m) => m.status === "cancelled").length,
    fieldCost: r2(played.reduce((t, m) => t + (Number(m.price) || 0), 0)),
    extras: r2(s.charges.reduce((t, x) => {
      const d = extraDate(s, x);
      return d && monthKey(d) === month ? t + x.amount : t;
    }, 0)),
    billed: r2(played.reduce((t, m) => {
      const b = billOf(s, m);
      return t + b.share * b.payers.length;
    }, 0)),
    collected: r2(s.payments.filter((p) => monthKey(p.at) === month).reduce((t, p) => t + p.amount, 0)),
    expenses: r2(s.expenses.filter((e) => monthKey(e.at) === month).reduce((t, e) => t + e.amount, 0)),
    cash: cashAt(s, month),
  };
}

/** Verideki tüm aylar (yeniden eskiye). */
export function months(s: State, today: string): string[] {
  const set = new Set<string>([monthKey(today)]);
  s.matches.forEach((m) => m.date && set.add(monthKey(m.date)));
  s.payments.forEach((p) => set.add(monthKey(p.at)));
  s.expenses.forEach((e) => set.add(monthKey(e.at)));
  s.charges.forEach((x) => set.add(monthKey(x.at)));
  return [...set].filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse();
}

/* ---------- ödeme düzeni (Kural 2.4) ---------- */

export interface PayRecord {
  mid: string;
  /** Maçın tarihi */
  date: string;
  /** Payın tamamen ödendiği gün; hâlâ ödenmediyse null */
  paidAt: string | null;
  /** Maç gününden "grace" günden sonra ödendi ya da hâlâ ödenmedi */
  late: boolean;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);

/**
 * Kural 2.4 "Ödemeyi sürekli geciktiren oyuncu organizasyona davet edilmez": kişinin son
 * "days" gündeki oynanmış maç paylarının ne zaman tamamen ödendiği. Ödemeler tarih sırasıyla
 * hesap defterindeki gibi dağıtılır (maça yazılan önce o maça, kalanı en eski borca). Kayıt
 * günüyle ödeme günü arasındaki farkı (ödemeyi ertesi gün işaretleme) "grace" gün karşılar.
 */
export function payHistory(s: State, pid: string, today: string, days = 90, grace = 2): PayRecord[] {
  type Due = { mid: string; date: string; left: number; paidAt: string | null; played: boolean };
  // Hesap defterindeki gibi tüm paylar (henüz oynanmamış maçınki de): maça yazılan ödeme o maça sayılır
  const dues: Due[] = [];
  for (const m of s.matches) {
    const { payers, share } = billOf(s, m);
    if (share > 0 && payers.includes(pid)) dues.push({ mid: m.id, date: m.date, left: share, paidAt: null, played: m.status === "played" });
  }
  dues.sort((a, b) => a.date.localeCompare(b.date) || a.mid.localeCompare(b.mid));
  const extra = new Map(s.charges.filter((c) => c.pid === pid).map((c) => [c.id, c.amount]));
  const pays = s.payments.filter((p) => p.pid === pid).slice().sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  let pool = 0;
  const pay = (d: Due, amt: number, at: string): number => {
    const take = Math.min(d.left, amt);
    d.left = r2(d.left - take);
    if (d.left <= EPS && !d.paidAt) d.paidAt = at;
    return r2(amt - take);
  };
  for (const p of pays) {
    let amt = p.amount;
    if (p.cid && extra.has(p.cid)) {
      // Ek borca (zarar bedeli, kişisel harcama) yazılan ödeme önce onu kapatır
      const need = extra.get(p.cid)!;
      const take = Math.min(need, amt);
      extra.set(p.cid, r2(need - take));
      amt = r2(amt - take);
    } else if (p.mid) {
      const d = dues.find((x) => x.mid === p.mid);
      if (d) amt = pay(d, amt, p.at);
    }
    pool = r2(pool + amt);
    // Havuz: önce o güne kadar oynanmış en eski borçlar, sonra sonrakiler (avans)
    for (const d of [...dues.filter((x) => x.date <= p.at), ...dues.filter((x) => x.date > p.at)]) {
      if (pool <= EPS) break;
      if (d.left > EPS) pool = pay(d, pool, p.at < d.date ? d.date : p.at);
    }
  }
  return dues
    .filter((d) => d.played && dayDiff(today, d.date) <= days)
    .map((d) => ({ mid: d.mid, date: d.date, paidAt: d.paidAt, late: d.paidAt ? dayDiff(d.paidAt, d.date) > grace : dayDiff(today, d.date) > grace }));
}
