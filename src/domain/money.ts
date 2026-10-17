/** Saha/tesis ücreti paylaşımı ve borçlar (Kural 1.5, 1.9, 2.1, 2.2, 2.4, 15.4, 15.7). */
import type { Match, State } from "./types";
import { capOf, getP, isGK, lineup, promoted } from "./lineup";
import { isFootball } from "./kinds";

/** Kaleciler ücretsizse (Kural 2.1) halı saha maçında kaleci ödemez. */
export function isFree(s: State, m: Match, id: string): boolean {
  return !!(s.settings.gkFree && isFootball(m) && isGK(getP(s, m, id)));
}

/**
 * Ödeyenler: oynayan kadro (oyundan alınanlar dahil, Kural 15.7) + geç iptal
 * edenler; kaleciler (ayara göre) ve muaflar hariç. İptal maçta kimse ödemez.
 */
export function payersOf(s: State, m: Match): string[] {
  if (m.status === "cancelled") return [];
  const { playing } = lineup(s, m);
  const late = Object.keys(m.att).filter((id) => m.att[id] === "late" && getP(s, m, id));
  return playing.concat(late).filter((id) => !isFree(s, m, id) && !m.exempt[id]);
}

/**
 * Kural 1.5, 15.3: bir kişinin yanıtı değişince (id; before: önceki oynayan kadro) geç
 * iptal muafiyetini günceller.
 *  - Geç iptal edenin yerine yedekten biri kadroya girdiyse payı yerine gelen öder: geç
 *    iptal eden muaf tutulur (organizatör Ödemeler'den geri alabilir). Yerine giren ücret
 *    ödemiyorsa (kaleci, Kural 2.1) pay karşılanmaz, geç iptal eden öder.
 *  - Muafiyet, kişi oynayan kadroya yeniden girince kalkar (geç iptalden dönüp boş yere
 *    giren ya da yedekten kadroya giren payını öder). Yedekte bekleyen ya da yeniden geç
 *    iptal eden, yerine giren hâlâ oynadığı için muaf kalır.
 * Döner: geç iptal edenin yerine giren ve payı onun ödeyip ödemediği (yoksa null).
 */
export function replaceLate(s: State, m: Match, id: string, before: string[]): { by: string; pays: boolean } | null {
  const entered = promoted(before, lineup(s, m).playing);
  for (const x of entered) delete m.exempt[x];
  const up = entered.filter((x) => x !== id);
  if (m.att[id] !== "late" || !up.length) return null;
  const by = up[0];
  const pays = !isFree(s, m, by);
  if (pays && !isFree(s, m, id)) m.exempt[id] = true;
  return { by, pays };
}

/**
 * Kural 1.5: boş yere kendisi yazılan ya da eklenen (joiner; yedekten girmeyen) bir geç
 * iptalcinin yerine mi geldi? Hâlâ ödeyen tek bir geç iptalci varsa onu döner; organizatöre
 * sorulur (12.1). Birden çoksa kimin yerine gelindiği bilinemez (null; "Muaf tut" ipucu kalır).
 */
export function lateToCover(s: State, m: Match, joiner: string, before: string[]): string | null {
  if (before.includes(joiner) || !lineup(s, m).playing.includes(joiner) || isFree(s, m, joiner) || m.exempt[joiner]) return null;
  const payers = payersOf(s, m);
  const late = Object.keys(m.att).filter((x) => m.att[x] === "late" && payers.includes(x));
  return late.length === 1 ? late[0] : null;
}

/** Kural 2.2: yuvarlama açıksa 5 ₺'nin katına yukarı yuvarlanır, değilse kuruşa yuvarlanır. */
export function roundShare(s: State, raw: number): number {
  return s.settings.round ? Math.ceil(raw / 5) * 5 : Math.round(raw * 100) / 100;
}

export function shareOf(s: State, m: Match): number {
  const n = payersOf(s, m).length;
  return n ? roundShare(s, (Number(m.price) || 0) / n) : 0;
}

/**
 * Tahmini pay. Halı saha: henüz kimse yokken kontenjana (kaleciler hariç) bölünür.
 * Etkinlik: kontenjan doluysa kesin pay; değilse kontenjana bölünür (en iyi durum),
 * kontenjan yoksa yazılanlara.
 */
export function estShare(s: State, m: Match): number {
  const n = payersOf(s, m).length;
  if (isFootball(m)) {
    if (n) return shareOf(s, m);
    const c = (m.format || s.settings.format) * 2 + 2 - (s.settings.gkFree ? 2 : 0);
    return roundShare(s, (Number(m.price) || 0) / Math.max(1, c));
  }
  const cap = capOf(s, m);
  return roundShare(s, (Number(m.price) || 0) / Math.max(1, cap || n));
}

/** Ödemesi gelmiş maç: oynanmış ya da tarihi bugün/geçmiş olan açık maç. */
export function isDue(m: Match, today: string): boolean {
  return m.status === "played" || (m.status === "open" && m.date <= today);
}

/**
 * Maçın ödeme listesi ve kişi başı payı. Oynanmış maçta, maç bitirildiği anda
 * dondurulan değer kullanılır; böylece sonradan ayar (yuvarlama, kaleci ücretsiz)
 * değişse de geçmiş hesaplar bozulmaz.
 */
export function billOf(s: State, m: Match): { payers: string[]; share: number } {
  if (m.status === "cancelled") return { payers: [], share: 0 };
  if (m.status === "played" && m.bill) return m.bill;
  return { payers: payersOf(s, m), share: shareOf(s, m) };
}

/** Maç bitince ödeme listesini dondurur. */
export function freezeBill(s: State, m: Match): void {
  m.bill = { payers: payersOf(s, m), share: shareOf(s, m) };
}
