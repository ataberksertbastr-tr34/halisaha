/**
 * Cihazlar arası eşitleme için 3 yönlü birleştirme (ağ kodu yok, saf fonksiyon).
 *
 * Her cihaz "base" olarak iki tarafın en son anlaştığı durumu saklar. Çevrimdışıyken
 * iki cihazda yapılan değişiklikler base'e göre karşılaştırılır ve hiçbir düzenleme
 * kaybolmadan birleştirilir:
 *  - Yalnızca bir taraf değiştirdiyse o taraf alınır; iki taraf farklı değiştirdiyse çatışmadır.
 *  - Nesneler anahtar anahtar, kimlikli (id) kayıt listeleri kayıt kayıt birleşir.
 *  - Silme ↔ düzenleme çatışmasında düzenleme kalır (hiçbir düzenleme kaybolmaz).
 *  - match.order ve skipped sıralı küme; diğer düz diziler bütün değerdir.
 *  - Diğer çatışmalarda updatedAt'i büyük olan taraf kazanır (eşitse uzak).
 * Birleştirmeden sonra uzlaştırma (reconcile) ve normalize() değişmezleri garanti eder.
 */
import { SCHEMA_VERSION } from "../domain/schema";
import { BackupError, normalize } from "../domain/migrate";
import { slotId } from "../domain/schedule";
import type { Match, State } from "../domain/types";

type Obj = Record<string, unknown>;
type Who = "local" | "remote";

interface Ctx {
  /** Çatışmada kazanan taraf */
  win: Who;
  /** Sonuç sırasında önce gelen taraf (normalde yerel; ilk katılımda uzak) */
  first: Who;
}

/** Sıralı küme olarak birleşen diziler ("*" = liste elemanı). queue.order bütün değerdir. */
const SET_PATHS = new Set(["skipped", "matches.*.order"]);

/**
 * Çatışmada bütün olarak alınan nesneler: alanları birbirine bağlı anlık görüntüler
 * (iki takım listesi, donmuş ödeme listesi, kura, masa sırası, maç saati).
 * Yarısı bir cihazdan yarısı diğerinden gelirse tutarsız olurlar.
 */
const UNIT_PATHS = new Set(["matches.*.teams", "matches.*.bill", "matches.*.draw", "matches.*.queue", "matches.*.clock"]);

const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const isPrim = (x: unknown) => x === null || (typeof x !== "object" && typeof x !== "function");
const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** Yalnızca nesnenin kendi anahtarı ("constructor" gibi kalıtılan adlar değer sayılmaz). */
const own = (o: Obj | undefined, k: string): unknown => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

/** JSON derin eşitliği; değeri undefined olan anahtar yok sayılır. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ao = a as Obj, bo = b as Obj;
  const ka = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const kb = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => deepEqual(ao[k], own(bo, k)));
}

/** Her elemanı benzersiz, boş olmayan metin "id"li nesne mi (boş dizi de sayılır). */
function isEntityList(a: unknown[]): boolean {
  const seen = new Set<string>();
  for (const x of a) {
    if (!isObj(x) || typeof x.id !== "string" || !x.id || seen.has(x.id)) return false;
    seen.add(x.id);
  }
  return true;
}

const byId = (a: unknown[]) => new Map(a.map((x) => [(x as Obj).id as string, x]));
const sub = (path: string, key: string) => (path ? path + "." + key : key);

/** Genel 3 yönlü birleştirme. undefined = anahtar/eleman yok. */
function merge(b: unknown, l: unknown, r: unknown, path: string, ctx: Ctx): unknown {
  if (deepEqual(l, r)) return l;
  if (deepEqual(b, l)) return r;
  if (deepEqual(b, r)) return l;
  // Silme ↔ düzenleme: düzenleme kalır
  if (l === undefined) return r;
  if (r === undefined) return l;
  const winner = ctx.win === "local" ? l : r;
  if (UNIT_PATHS.has(path)) return winner;
  if (isObj(l) && isObj(r)) return mergeObj(isObj(b) ? b : undefined, l, r, path, ctx);
  if (Array.isArray(l) && Array.isArray(r)) {
    const ba = Array.isArray(b) ? b : [];
    if (isEntityList(l) && isEntityList(r) && isEntityList(ba)) return mergeList(ba, l, r, path, ctx);
    if (SET_PATHS.has(path) && l.every(isPrim) && r.every(isPrim) && ba.every(isPrim)) return mergeSet(ba, l, r, ctx);
  }
  // Düz dizi, temel değer ya da tip uyuşmazlığı: kazanan tarafın değeri
  return winner;
}

/** Nesne: anahtarların birleşimi, her anahtar ayrı birleşir. */
function mergeObj(b: Obj | undefined, l: Obj, r: Obj, path: string, ctx: Ctx): Obj {
  const [p, q] = ctx.first === "local" ? [l, r] : [r, l];
  const keys = new Set([...Object.keys(p), ...Object.keys(q)]);
  keys.delete("__proto__");
  const out: Obj = {};
  for (const k of keys) {
    const v = merge(own(b, k), own(l, k), own(r, k), sub(path, k), ctx);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Kimlikli kayıt listesi: id'ye göre; önce birinci tarafın sırası, sonra yalnızca diğerinde olanlar. */
function mergeList(b: unknown[], l: unknown[], r: unknown[], path: string, ctx: Ctx): unknown[] {
  const bm = byId(b), lm = byId(l), rm = byId(r);
  const [p, q] = ctx.first === "local" ? [l, r] : [r, l];
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const x of [...p, ...q]) {
    const id = (x as Obj).id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const v = merge(bm.get(id), lm.get(id), rm.get(id), path + ".*", ctx);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/**
 * Sıralı küme: iki tarafın eklemeleri birleşir; bir tarafın çıkardığı, diğer taraf
 * base'de olmayan bir eleman olarak yeniden eklemediyse çıkar. Birinci tarafın sırası
 * korunur, diğerinin eklemeleri sona.
 */
function mergeSet(b: unknown[], l: unknown[], r: unknown[], ctx: Ctx): unknown[] {
  const B = new Set(b), L = new Set(l), R = new Set(r);
  const keep = (x: unknown) => (L.has(x) && R.has(x)) || (!B.has(x) && (L.has(x) || R.has(x)));
  const [p, q] = ctx.first === "local" ? [l, r] : [r, l];
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  for (const x of [...p, ...q]) {
    if (seen.has(x) || !keep(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/** Cihazda organizatörün girdiği veri var mı (oyuncu, yanıt, ödeme, gider, ek borç, disiplin, saha). */
export function hasUserData(s: State): boolean {
  const len = (x: unknown) => (Array.isArray(x) ? x.length : 0);
  if (len(s.players) || len(s.payments) || len(s.expenses) || len(s.charges) || len(s.discipline) || len(s.fields)) return true;
  return Array.isArray(s.matches) && s.matches.some((m) => isObj(m) && isObj(m.att) && Object.keys(m.att).length > 0);
}

/* ---------- Uzlaştırma (reconcile) ---------- */

const arrStr = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);
const uniq = (a: string[]) => [...new Set(a)];

/**
 * Maç içi değişmezler (setAtt ile aynı anlam):
 *  - order = "Var" diyenlerin yazılma sırası: tekrar yok; "Var" olmayan sıradan çıkar
 *    (lineup() onları zaten saymaz; tekrar "Var" derse sonuna yazılır); sırada olmayan
 *    "Var" sona eklenir (yanıt silinmez).
 *  - Bir oyuncu iki takımda birden olamaz: A'daysa B'den çıkar.
 *  - Kilit oyuncunun bulunduğu takımı izler (sahada takas ile aynı kural).
 */
function fixMatch(m: Match): void {
  const att: Obj = isObj(m.att) ? m.att : {};
  const order = uniq(arrStr(m.order)).filter((id) => att[id] === "in");
  const inOrder = new Set(order);
  for (const id of Object.keys(att)) if (att[id] === "in" && !inOrder.has(id)) order.push(id);
  m.order = order;
  if (isObj(m.teams)) {
    const a = uniq(arrStr(m.teams.a));
    const inA = new Set(a);
    const b = uniq(arrStr(m.teams.b)).filter((id) => !inA.has(id));
    m.teams = { ...m.teams, a, b };
    if (isObj(m.locks)) {
      const inB = new Set(b);
      for (const id of Object.keys(m.locks)) {
        if (inA.has(id)) m.locks[id] = "a";
        else if (inB.has(id)) m.locks[id] = "b";
      }
    }
  }
}

/** Ödeme, ek borç ya da disiplin kaydının bağlı olduğu maçlar. */
function referencedMatches(s: State): Set<string> {
  const out = new Set<string>();
  const add = (x: unknown) => {
    if (x) out.add(String(x));
  };
  for (const p of Array.isArray(s.payments) ? s.payments : []) add(isObj(p) && p.mid);
  for (const c of Array.isArray(s.charges) ? s.charges : []) add(isObj(c) && c.mid);
  for (const r of Array.isArray(s.discipline) ? s.discipline : []) {
    if (!isObj(r)) continue;
    add(r.mid);
    add(r.target);
  }
  return out;
}

const RECORDS = ["att", "exempt", "locks", "goals", "noshow", "removed", "checks", "agree"] as const;
const LISTS = ["guests", "cars", "games"] as const;

/** Maçtaki veri miktarı (hangi kopyanın kalacağını seçmek için). */
function dataScore(m: Match): number {
  const o = m as unknown as Obj;
  let n = 0;
  for (const k of RECORDS) if (isObj(o[k])) n += Object.keys(o[k] as Obj).length;
  for (const k of LISTS) if (Array.isArray(o[k])) n += (o[k] as unknown[]).length;
  if (isObj(m.teams)) n += arrStr(m.teams.a).length + arrStr(m.teams.b).length;
  if (m.reserved) n++;
  if (m.note) n++;
  if (m.title) n++;
  return n;
}

/** Kopyadaki bilgileri kalan maça taşır; çakışmada kalan maçın değeri korunur. */
function absorb(keep: Match, drop: Match): void {
  const k = keep as unknown as Obj, d = drop as unknown as Obj;
  for (const key of RECORDS) {
    if (!isObj(d[key])) continue;
    const dst: Obj = isObj(k[key]) ? (k[key] as Obj) : (k[key] = {});
    for (const [id, v] of Object.entries(d[key] as Obj)) if (own(dst, id) === undefined && id !== "__proto__") dst[id] = v;
  }
  for (const key of LISTS) {
    if (!Array.isArray(d[key])) continue;
    const dst = Array.isArray(k[key]) ? (k[key] as Obj[]) : (k[key] = []) as Obj[];
    const have = new Set(dst.map((x) => isObj(x) && x.id));
    for (const x of d[key] as Obj[]) if (isObj(x) && !have.has(x.id)) dst.push(x);
  }
  // Sıra: kalan maçın sırası, ardından kopyada yazılanlar (fixMatch "Var" olmayanları atar)
  keep.order = uniq([...arrStr(keep.order), ...arrStr(drop.order)]);
  if (drop.reserved) keep.reserved = true;
  if (!keep.note && drop.note) keep.note = drop.note;
  if (!keep.title && drop.title) keep.title = drop.title;
  const empty = (m: Match) => !isObj(m.teams) || (!arrStr(m.teams.a).length && !arrStr(m.teams.b).length);
  if (empty(keep) && !empty(drop)) keep.teams = drop.teams;
}

/**
 * Otomatik planlamanın iki cihazda ayrı ayrı oluşturduğu aynı maçı (auto, açık, aynı
 * tür + tarih + saat) teke indirir. Kalan: ödeme/borç/disiplin kaydı bağlı olan, sonra
 * verisi çok olan, sonra zamandan türetilmiş kimlikli, sonra küçük kimlikli (her cihazda
 * aynı sonuç). Kendisine kayıt bağlı kopya silinmez (ikisi de kalır).
 */
function dedupeAuto(s: State): void {
  const groups = new Map<string, Match[]>();
  for (const m of s.matches) {
    if (!isObj(m) || m.auto !== true || m.status !== "open") continue;
    const key = (m.kind || "football") + "|" + m.date + "|" + m.time;
    const g = groups.get(key);
    if (g) g.push(m);
    else groups.set(key, [m]);
  }
  const refd = referencedMatches(s);
  const drop = new Set<Match>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const rank = (m: Match) => [refd.has(m.id) ? 0 : 1, -dataScore(m), m.id === slotId(m.date, m.time) ? 0 : 1] as const;
    const ranked = [...g].sort((x, y) => {
      const a = rank(x), b = rank(y);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    });
    const keep = ranked[0];
    for (const d of ranked.slice(1)) {
      if (refd.has(d.id)) continue;
      absorb(keep, d);
      drop.add(d);
    }
  }
  if (drop.size) s.matches = s.matches.filter((m) => !drop.has(m));
}

/** Birleştirme sonrası değişmezleri sağlar (yerinde). */
export function reconcile(s: State): State {
  if (!Array.isArray(s.matches)) return s;
  dedupeAuto(s);
  for (const m of s.matches) if (isObj(m)) fixMatch(m);
  return s;
}

/**
 * 3 yönlü birleştirme. base: iki tarafın en son anlaştığı durum (ilk katılımda null).
 * Girdileri değiştirmez. Daha yeni bir uygulamanın verisi reddedilir (BackupError "future").
 *
 * base null (cihaz ilk kez katılıyor): yerelde organizatör verisi yoksa uzak durum
 * olduğu gibi alınır; varsa iki taraf "her şeyi eklemiş" sayılır: listeler id'ye göre
 * birleşir, çatışmalar (ayarlar, aynı kimlikli kayıtlar) uzak lehine çözülür. Uzakta
 * henüz organizatör verisi yoksa (ilk cihaz boş depoya bağlanıyor) yerel taraf esas alınır.
 */
export function merge3(base: State | null, local: State, remote: State): State {
  if (num(local.v) > SCHEMA_VERSION || num(remote.v) > SCHEMA_VERSION) throw new BackupError("future");
  const L = clone(local), R = clone(remote);
  if (!base && !hasUserData(L)) return normalize(R);
  const ctx: Ctx = base
    ? { win: num(L.updatedAt) > num(R.updatedAt) ? "local" : "remote", first: "local" }
    : hasUserData(R)
      ? { win: "remote", first: "remote" }
      : { win: "local", first: "local" };
  const out = merge(base || undefined, L, R, "", ctx) as State;
  out.updatedAt = Math.max(num(L.updatedAt), num(R.updatedAt));
  out.v = Math.max(num(L.v), num(R.v));
  return normalize(reconcile(out));
}
