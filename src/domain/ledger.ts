/**
 * Kişi bazlı hesap defteri.
 *
 * Borçlar maçlardan türetilir (her ödeyen için maçın payı), ödemeler kayıttır.
 * Dağıtım kuralı:
 *  1) Bir maça yazılmış ödeme önce o maçın payını kapatır.
 *  2) Artan ve maça yazılmamış ödemeler havuza girer; havuz önce vadesi gelmiş
 *     en eski borçlara, sonra yaklaşan maçlara dağıtılır (FIFO).
 *  3) Havuzda kalan para avanstır (bakiye artı).
 * Böylece kısmi ödeme, toplu ödeme, avans ve iade tutarlı biçimde işlenir.
 */
import type { Match, Payment, State } from "./types";
import { billOf, isDue } from "./money";
import { getP } from "./lineup";
import { monthKey } from "./dates";
import { uid } from "./text";

const EPS = 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ChargeStatus = "paid" | "partial" | "unpaid";

export interface Charge {
  mid: string;
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
  for (const p of s.payments) get(p.pid).payments.push(p);

  const out = new Map<string, Account>();
  for (const [id, a] of raw) {
    const who = whoIs(s, id);
    a.charges.sort((x, y) => when(x).localeCompare(when(y)));
    a.payments.sort((x, y) => x.at.localeCompare(y.at));
    const byMid = new Map(a.charges.map((c) => [c.mid, c]));
    let pool = 0;
    for (const p of a.payments) {
      const c = p.mid ? byMid.get(p.mid) : undefined;
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
      id, name: who?.name ?? "?", phone: who?.phone ?? "", host: who?.host, guest: !!who?.guest,
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

/** Bir maçtaki bir kişinin pay durumu. */
export function chargeOf(s: State, m: Match, id: string, today: string, acc?: Map<string, Account>): Charge | null {
  const a = (acc || accounts(s, today)).get(id);
  return a?.charges.find((c) => c.mid === m.id) || null;
}

export function newPayment(pid: string, amount: number, at: string, mid?: string, note?: string): Payment {
  const p: Payment = { id: uid(), pid, amount: r2(amount), at };
  if (mid) p.mid = mid;
  if (note) p.note = note;
  return p;
}

/** "Ödedi": maçın kalan payını o maça yazılmış ödeme olarak ekler. */
export function markPaid(s: State, m: Match, id: string, today: string): void {
  const c = chargeOf(s, m, id, today);
  if (!c) return;
  const rest = r2(c.amount - c.paid);
  if (rest > EPS) s.payments.push(newPayment(id, rest, today, m.id));
}

/**
 * "Ödedi" işaretini kaldırır: o maça yazılmış ödemeleri siler.
 * Pay genel bir ödemeden karşılanıyorsa false döner (defterden düzenlenmeli).
 */
export function unmarkPaid(s: State, m: Match, id: string): boolean {
  const before = s.payments.length;
  s.payments = s.payments.filter((p) => !(p.pid === id && p.mid === m.id));
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
      s.payments.push(newPayment(id, rest, today, c.mid));
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
  /** Sahaya ödenen (oynanan maçların saha ücreti) */
  fieldCost: number;
  /** Oyunculara yansıtılan toplam pay */
  billed: number;
  /** Bu ay alınan ödemeler */
  collected: number;
  /** Bu ayın giderleri (top, yelek, su…) */
  expenses: number;
  /** Ay sonu kasa (birikimli) */
  cash: number;
}

/** Kasa = alınan ödemeler − oynanan maçların saha ücreti − giderler. */
export function cashAt(s: State, untilMonth?: string): number {
  const inM = (d: string) => !untilMonth || monthKey(d) <= untilMonth;
  const inflow = s.payments.filter((p) => inM(p.at)).reduce((t, p) => t + p.amount, 0);
  const field = s.matches.filter((m) => m.status === "played" && inM(m.date)).reduce((t, m) => t + (Number(m.price) || 0), 0);
  const exp = s.expenses.filter((e) => inM(e.at)).reduce((t, e) => t + e.amount, 0);
  return r2(inflow - field - exp);
}

export function monthSummary(s: State, month: string): MonthSummary {
  const ms = s.matches.filter((m) => monthKey(m.date) === month);
  const played = ms.filter((m) => m.status === "played");
  return {
    month,
    played: played.length,
    cancelled: ms.filter((m) => m.status === "cancelled").length,
    fieldCost: r2(played.reduce((t, m) => t + (Number(m.price) || 0), 0)),
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
  return [...set].filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse();
}
