/**
 * Misafir (joker) oyuncular, Kural 1.8: misafir organizatöre haber verilerek getirilir;
 * getiren onun davranışından ve ödemesinden sorumludur.
 *
 * Misafir her maçta ayrı bir kayıttır (kimliği o maça aittir). Aynı kişi yeniden
 * getirildiğinde önceki gelişleri adıyla bulunur: öneri listesi, getiren/seviye/mevki
 * ve eklemeden önce sorulan ödenmemiş borç ya da disiplin engeli buradan gelir.
 */
import type { Match, Pos, State } from "./types";
import { norm } from "./text";
import { joinBlock, type Block } from "./discipline";
import { debtMap } from "./ledger";

export interface PastGuest {
  name: string;
  /** Bu adla gelmiş tüm misafir kayıtları (en yeni başta) */
  ids: string[];
  /** En son gelişindeki getiren, seviye ve mevki */
  host?: string;
  rating: number;
  pos: Pos | "";
  /** En son geldiği maçın tarihi */
  last: string;
}

/** Daha önce getirilmiş misafirler, aynı ad (Türkçe harf ve büyük/küçük fark etmez) tek satır, en yeni başta. */
export function pastGuests(s: State, exceptMid?: string): PastGuest[] {
  const by = new Map<string, PastGuest>();
  const ms = s.matches.filter((m) => m.id !== exceptMid).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  for (const m of ms) {
    for (const g of m.guests) {
      const k = norm(g.name);
      if (!k) continue;
      const x = by.get(k);
      if (x) {
        if (!x.ids.includes(g.id)) x.ids.push(g.id);
        continue;
      }
      const p: PastGuest = { name: g.name, ids: [g.id], rating: g.rating || 3, pos: g.pos || "", last: m.date };
      if (g.host) p.host = g.host;
      by.set(k, p);
    }
  }
  return [...by.values()];
}

export interface GuestHistory {
  past: PastGuest;
  /** Önceki gelişlerinden ödenmemiş toplam */
  debt: number;
  /** Önceki kayıtlarından disiplin engeli (9.1 ihraç, 9.3 davet edilmeme ya da bir maç ceza, 17.4 tür yasağı) */
  block: Block | null;
}

/**
 * Aynı adla daha önce gelmiş misafirin kaydı; ödenmemiş borcu ya da disiplin engeli yoksa null.
 * Ad aynı olan farklı biri olabilir: sonuç bir sorudur, son söz organizatörün (Kural 12.1).
 */
export function guestHistory(s: State, m: Match, name: string, today: string): GuestHistory | null {
  const k = norm(name);
  const past = k ? pastGuests(s, m.id).find((p) => norm(p.name) === k) : undefined;
  if (!past) return null;
  const debts = debtMap(s, today);
  // Borç, borç engeli açıksa sorulur (Kural 2.4; Ayarlar'dan kapatılabilir)
  const debt = s.settings.debtBlock ? Math.round(past.ids.reduce((t, id) => t + (debts[id] || 0), 0) * 100) / 100 : 0;
  let block: Block | null = null;
  for (const id of past.ids) {
    block = joinBlock(s, m, id, 0);
    if (block) break;
  }
  return debt > 0.004 || block ? { past, debt, block } : null;
}
