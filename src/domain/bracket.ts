/**
 * Turnuva (eleme) tablosu — Kural 20.1: "Maçı 3 oyunda 2, turnuvalarda 5
 * oyunda 3 oyun alan kazanır." Masa tenisinde tekler ve çiftler, ayak
 * tenisinde kura takımları için.
 *
 *  - Katılımcılar kurayla yerleşir (Kural 21.1'deki kura anlayışı); sayı 2'nin
 *    kuvveti değilse ilk turda "bay" geçenler olur ve baylar tabloya dengeli
 *    dağıtılır (iki bay asla karşılaşmaz).
 *  - Saklanan yalnızca ilk tur yuvaları ve maç kararlarıdır. Sonraki turlar her
 *    seferinde kararlardan türetilir; böylece bir oyun silinirse ya da sonucu
 *    değişirse tablo kendiliğinden düzelir.
 *  - Karar ya skor tabelasındaki oyundan (gid) ya da elle verilen kazanandan
 *    gelir. Kararın anahtarı tarafların imzasıdır: eşleşme değişirse eski
 *    karar geçersiz sayılır.
 */
import type { Bracket, Game, Side } from "./types";
import { winnerOf } from "./scoring";
import { shuffle, type Rng } from "./teams";

export interface BMatch {
  r: number;
  i: number;
  a: string[] | null;
  b: string[] | null;
  win: Side | null;
  /** Skor tabelasındaki oyun */
  gid?: string;
  /** İlk turda rakipsiz (bay) */
  bye: boolean;
}

const sig = (x: string[] | null): string => (x ? x.join("+") : "");
export const pairKey = (a: string[] | null, b: string[] | null): string => sig(a) + "|" + sig(b);
export const pickId = (r: number, i: number): string => r + "-" + i;

/** n katılımcı için tablo büyüklüğü (2'nin kuvveti, en az 2). */
export function bracketSize(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/** Kurayla yeni tablo. En az iki taraf gerekir. */
export function makeBracket(sides: string[][], rng: Rng = Math.random): Bracket {
  const list = sides.filter((s) => s.length).map((s) => [...s]);
  if (list.length < 2) return { seeds: [], picks: {} };
  const size = bracketSize(list.length);
  const matches = size / 2;
  const byes = size - list.length;
  const order = shuffle(list, rng);
  // Bay geçecek ilk tur maçları tabloya eşit aralıkla dağılır
  const byeAt = new Set<number>();
  for (let k = 0; k < byes; k++) byeAt.add(Math.floor((k * matches) / byes));
  const seeds: (string[] | null)[] = [];
  let p = 0;
  for (let mi = 0; mi < matches; mi++) {
    if (byeAt.has(mi)) seeds.push(order[p++], null);
    else seeds.push(order[p++], order[p++]);
  }
  return { seeds, picks: {} };
}

/** Tablonun güncel hali: turlar ve maçlar, kararlar oyunlardan okunarak. */
export function resolveBracket(br: Bracket, games: Game[]): BMatch[][] {
  const rounds: BMatch[][] = [];
  let slots = br.seeds.slice();
  let r = 0;
  while (slots.length >= 2) {
    const ms: BMatch[] = [];
    const next: (string[] | null)[] = [];
    for (let i = 0; i < slots.length / 2; i++) {
      const a = slots[2 * i], b = slots[2 * i + 1];
      const bm: BMatch = { r, i, a, b, win: null, bye: false };
      if (r === 0 && !!a !== !!b) {
        bm.bye = true;
        bm.win = a ? "a" : "b";
      } else if (a && b) {
        const pk = br.picks[pickId(r, i)];
        if (pk && pk.key === pairKey(a, b)) {
          if (pk.gid) {
            const g = games.find((x) => x.id === pk.gid);
            if (g) {
              bm.gid = g.id;
              const w = winnerOf(g);
              if (w === "a" || w === "b") bm.win = w;
            }
          }
          if (!bm.win && pk.win) bm.win = pk.win;
        }
      }
      ms.push(bm);
      next.push(bm.win ? (bm.win === "a" ? a : b) : null);
    }
    rounds.push(ms);
    slots = next;
    r++;
  }
  return rounds;
}

/** Şampiyon (final oynandıysa). */
export function champion(rounds: BMatch[][]): string[] | null {
  const fin = rounds[rounds.length - 1]?.[0];
  if (!fin || !fin.win) return null;
  return fin.win === "a" ? fin.a : fin.b;
}

/** Sırada oynanacak maçlar: iki tarafı da belli, sonucu yok. */
export function playable(rounds: BMatch[][]): BMatch[] {
  return rounds.flat().filter((m) => m.a && m.b && !m.win);
}

/** Tur adı anahtarı: final, yarı final, çeyrek final, son 16, ya da N. tur. */
export function roundKey(total: number, r: number): { k: "final" | "semi" | "quarter" | "last16" | "roundN"; n: number } {
  const left = total - r;
  if (left === 1) return { k: "final", n: r + 1 };
  if (left === 2) return { k: "semi", n: r + 1 };
  if (left === 3) return { k: "quarter", n: r + 1 };
  if (left === 4) return { k: "last16", n: r + 1 };
  return { k: "roundN", n: r + 1 };
}

/** Elle kazanan verir (ya da kaldırır: win null). Oyun bağlantısı korunur. */
export function setPick(br: Bracket, bm: Pick<BMatch, "r" | "i" | "a" | "b">, patch: { gid?: string; win?: Side | null }): void {
  const id = pickId(bm.r, bm.i);
  const key = pairKey(bm.a, bm.b);
  const prev = br.picks[id] && br.picks[id].key === key ? br.picks[id] : { key };
  const out: Bracket["picks"][string] = { key };
  const gid = patch.gid !== undefined ? patch.gid : prev.gid;
  if (gid) out.gid = gid;
  const win = patch.win !== undefined ? patch.win : prev.win;
  if (win) out.win = win;
  br.picks[id] = out;
}

/** Katılımcı sayısı (bay hariç). */
export const entrants = (br: Bracket): number => br.seeds.filter(Boolean).length;
