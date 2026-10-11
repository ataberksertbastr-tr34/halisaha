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
 *  - İki cihazın ayrı ayrı oluşturduğu otomatik maç, oluşturulduğu hâline göre birleşir.
 * Birleştirmeden sonra uzlaştırma (reconcile) ve normalize() değişmezleri garanti eder.
 */
import { blankMatch, defaultSettings, SCHEMA_VERSION } from "../domain/schema";
import { BackupError, normalize } from "../domain/migrate";
import { autoMatch, idSlot, slotId, slotKey } from "../domain/schedule";
import { penalized } from "../domain/lineup";
import { freezeBill } from "../domain/money";
import type { Match, State } from "../domain/types";

type Obj = Record<string, unknown>;
type Who = "local" | "remote";

/** Birleştirmenin (değiştirilmemiş) girdileri: uzlaştırma bunlara bakarak karar verir. */
export interface Inputs {
  base: State | null;
  local: State;
  remote: State;
}

interface Ctx {
  /** Çatışmada kazanan taraf */
  win: Who;
  /** Sonuç sırasında önce gelen taraf (normalde yerel; ilk katılımda uzak) */
  first: Who;
  io: Inputs;
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
const arrStr = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);
const uniq = (a: string[]) => [...new Set(a)];
/** Kayıt listesindeki kimlikler / kimliğe göre kayıtlar (bozuk girdiye dayanıklı). */
const idsOf = (a: unknown): Set<string> => new Set(Array.isArray(a) ? a.filter(isObj).map((x) => String(x.id)) : []);
const mapOf = (a: unknown): Map<string, Obj> => new Map(Array.isArray(a) ? a.filter(isObj).map((x): [string, Obj] => [String(x.id), x]) : []);

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
    const lx = lm.get(id), rx = rm.get(id);
    let bx = bm.get(id);
    // Tabanda olmayan, iki cihazın da oluşturduğu otomatik maç: oluşturulduğu hâli taban sayılır
    if (bx === undefined && lx !== undefined && rx !== undefined && path === "matches") bx = autoBase(id, lx, rx, ctx.io);
    const v = merge(bx, lx, rx, path + ".*", ctx);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/**
 * Sıranın base'e göre değişmemiş baş kısmından sonraki elemanlar: sona taşınanlar
 * (çıkıp yeniden "Var" diyen, maç bitince 1.6 cezasıyla sona alınan) ve eklenenler.
 * Uygulama sırayı yalnızca sona ekleyerek ve çıkararak değiştirir; bu yüzden
 * dokunulmamış elemanlar her zaman base sırasıyla en başta durur.
 */
function tail(b: unknown[], x: unknown[]): unknown[] {
  const at = new Map(b.map((v, i) => [v, i]));
  let last = -1, j = 0;
  for (; j < x.length; j++) {
    const i = at.get(x[j]);
    if (i === undefined || i <= last) break;
    last = i;
  }
  return x.slice(j);
}

/**
 * Sıralı küme: iki tarafın eklemeleri birleşir; bir tarafın çıkardığı, diğer taraf
 * base'de olmayan bir eleman olarak yeniden eklemediyse çıkar. Sonuç: iki tarafın da
 * yerini değiştirmediği elemanlar base sırasıyla, ardından birinci tarafın sona
 * taşıdıkları ve eklemeleri, sonra diğerininkiler. Böylece yalnızca bir cihazda
 * yapılan "sona geçme" (Kural 1.3, 1.6) diğer cihazın eklemesiyle kaybolmaz.
 */
function mergeSet(b: unknown[], l: unknown[], r: unknown[], ctx: Ctx): unknown[] {
  const B = new Set(b), L = new Set(l), R = new Set(r);
  const keep = (x: unknown) => (L.has(x) && R.has(x)) || (!B.has(x) && (L.has(x) || R.has(x)));
  const tl = tail(b, l), tr = tail(b, r);
  const moved = new Set([...tl, ...tr]);
  const [tp, tq] = ctx.first === "local" ? [tl, tr] : [tr, tl];
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  for (const x of [...b.filter((x) => !moved.has(x)), ...tp, ...tq]) {
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

/* ---------- Otomatik maçlar ---------- */

/** autoMatch'in bozuk girdiye dayanıklı hâli (hata olursa undefined). */
function created(s: State, date: string, time: string, id: string): Obj | undefined {
  try {
    return autoMatch(s, date, time, id) as unknown as Obj;
  } catch {
    return undefined;
  }
}

/**
 * Tabanda olmayan ama iki cihazda da bulunan, zamandan türetilmiş kimlikli otomatik
 * maç için sentetik taban. Her kopya, KENDİ cihazının o an oluşturacağı hâliyle
 * (created(io.local) / created(io.remote)) karşılaştırılır: kopyada o hâlden farklı olan
 * alan bir düzenlemedir. Böylece diğer cihazda sonradan değişen ayar (sabit oyuncu,
 * varsayılan saha, ücret) bir düzenleme sanılıp gerçek düzenlemeyi (rezervasyon, not,
 * iptal, sabit oyuncunun "Yok"u, taşıma) ezmez. Taban, genel kuralın şunu vereceği
 * biçimde kurulur:
 *  - yalnızca bir kopya değiştirdiyse o kopyanın değeri,
 *  - ikisi de değiştirdiyse çatışma (yeni olan kazanır),
 *  - ikisi de dokunmadıysa (ama değerler ayarlar yüzünden farklıysa) maça başka bir
 *    yerinden dokunulmuş kopyanınki (ör. rezerve edilen eski saha), yoksa uzaktaki.
 */
function autoBase(id: string, l: unknown, r: unknown, io: Inputs): Obj | undefined {
  if (!isObj(l) || !isObj(r) || l.auto !== true || r.auto !== true) return undefined;
  const slot = idSlot(id);
  if (!slot) return undefined;
  const pl = created(io.local, slot.date, slot.time, id), pr = created(io.remote, slot.date, slot.time, id);
  if (!pl || !pr) return undefined;
  const touched = (x: Obj, p: Obj) => [...new Set([...Object.keys(x), ...Object.keys(p)])].some((k) => k !== "id" && !deepEqual(own(x, k), own(p, k)));
  const preferL = touched(l, pl) && !touched(r, pr);
  const pick = (lv: unknown, rv: unknown, plv: unknown, prv: unknown): unknown => {
    const cl = !deepEqual(lv, plv), cr = !deepEqual(rv, prv);
    if (cl && cr) return plv; // çatışma
    if (cl) return rv; // yalnızca yerel değiştirdi → yerel kazanır
    if (cr) return lv; // yalnızca uzak değiştirdi → uzak kazanır
    return preferL ? rv : lv;
  };
  const out: Obj = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(pl), ...Object.keys(pr)])) {
    if (k === "att" || k === "order") continue;
    const v = pick(own(l, k), own(r, k), own(pl, k), own(pr, k));
    if (v !== undefined) out[k] = v;
  }
  const la: Obj = isObj(l.att) ? l.att : {}, ra: Obj = isObj(r.att) ? r.att : {};
  const pla: Obj = isObj(pl.att) ? pl.att : {}, pra: Obj = isObj(pr.att) ? pr.att : {};
  const att: Obj = {};
  for (const k of new Set([...Object.keys(la), ...Object.keys(ra), ...Object.keys(pla), ...Object.keys(pra)])) {
    if (k === "__proto__") continue;
    const v = pick(own(la, k), own(ra, k), own(pla, k), own(pra, k));
    if (v !== undefined) att[k] = v;
  }
  out.att = att;
  out.order = uniq([...arrStr(l.order), ...arrStr(r.order)]).filter((x) => own(att, x) === "in");
  return out;
}

/** Oluşturulurken ayara/kadroya göre dolan alanlar (dokunulmamışlık ayrıca denetlenir). */
const CREATED = new Set(["id", "date", "time", "auto", "fieldId", "price", "format", "agree", "att", "order"]);

/**
 * Oluşturulduktan sonra el sürülmemiş otomatik maç mı: boş maçtan farkı yalnızca
 * oluşturma alanları (saha, ücret, format, ön anlaşmalar refs'teki bir durumun
 * üreteceği gibi) ve sabit oyuncuların "Var" yanıtları.
 */
function untouchedAuto(m: Match, refs: State[]): boolean {
  const o = m as unknown as Obj;
  const blank = blankMatch("football", m.date, m.time) as unknown as Obj;
  for (const k of new Set([...Object.keys(blank), ...Object.keys(o)])) {
    if (!CREATED.has(k) && !deepEqual(own(o, k), own(blank, k))) return false;
  }
  const gens = refs.map((s) => created(s, m.date, m.time, m.id)).filter((g): g is Obj => !!g);
  for (const k of ["fieldId", "price", "format", "agree"]) if (!gens.some((g) => deepEqual(own(g, k), own(o, k)))) return false;
  const fixed = new Set<string>();
  for (const s of refs) for (const p of Array.isArray(s.players) ? s.players : []) if (isObj(p) && p.fixed && p.active !== false) fixed.add(String(p.id));
  const att: Obj = isObj(m.att) ? m.att : {};
  return Object.keys(att).every((id) => att[id] === "in" && fixed.has(id));
}

/* ---------- Uzlaştırma (reconcile) ---------- */

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

/**
 * Bir cihazın sildiği otomatik maçı diğer cihazın dokunulmamış kopyası geri
 * getirmesin (sabit oyunculara sessizce borç yazılmasın): tabanda yok, yalnızca bir
 * tarafta var, silen taraf zamanı "atlanan"lara yazmış, maç hiç taşınmamış, kayıt
 * bağlı değil ve oluşturulduğu gibi duruyorsa düşer. Düzenlenmiş kopya kalır.
 */
function dropResurrected(s: State, io: Inputs): void {
  const inB = idsOf(io.base?.matches), inL = idsOf(io.local.matches), inR = idsOf(io.remote.matches);
  const skipped = new Set(arrStr(s.skipped));
  const refd = referencedMatches(s);
  s.matches = s.matches.filter((m) => {
    if (!isObj(m) || m.auto !== true || m.status !== "open" || inB.has(m.id) || inL.has(m.id) === inR.has(m.id)) return true;
    const key = slotKey(m.date, m.time);
    const [from, other] = inL.has(m.id) ? [io.local, io.remote] : [io.remote, io.local];
    if (m.id !== slotId(m.date, m.time) || !skipped.has(key) || !arrStr(other.skipped).includes(key) || refd.has(m.id)) return true;
    return !untouchedAuto(m, io.base ? [io.base, from] : [from]);
  });
}

const RECORDS = ["att", "exempt", "locks", "goals", "noshow", "removed", "checks", "agree"] as const;
const LISTS = ["guests", "cars", "games"] as const;
/** Tek değerli maç alanları: kalan maçta oluşturma varsayılanı duruyorsa kopyadaki düzenleme alınır. */
const SCALARS = ["price", "fieldId", "field", "cap", "lockH", "format", "mvp", "score", "manualTeams", "draw", "queue", "clock"] as const;

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

/**
 * Kopyadaki bilgileri kalan maça taşır. Çakışmada kalan maçın değeri korunur; ancak
 * kalan maçta yalnızca oluşturma varsayılanı (def: otomatik planlamanın üreteceği
 * maç) duruyorsa kopyadaki düzenleme alınır (saha, ücret, sabit oyuncunun "Yok"u …).
 */
function absorb(keep: Match, drop: Match, defKeep: Obj, defDrop: Obj): void {
  const k = keep as unknown as Obj, d = drop as unknown as Obj;
  for (const key of RECORDS) {
    if (!isObj(d[key])) continue;
    const dst: Obj = isObj(k[key]) ? (k[key] as Obj) : (k[key] = {});
    const dk: Obj = isObj(defKeep[key]) ? (defKeep[key] as Obj) : {};
    const dd: Obj = isObj(defDrop[key]) ? (defDrop[key] as Obj) : {};
    for (const [id, v] of Object.entries(d[key] as Obj)) {
      if (id === "__proto__") continue;
      const cur = own(dst, id);
      if (cur === undefined || (deepEqual(cur, own(dk, id)) && !deepEqual(v, own(dd, id)))) dst[id] = v;
    }
  }
  for (const key of LISTS) {
    if (!Array.isArray(d[key])) continue;
    const dst = Array.isArray(k[key]) ? (k[key] as Obj[]) : (k[key] = []) as Obj[];
    const have = new Set(dst.map((x) => isObj(x) && x.id));
    for (const x of d[key] as Obj[]) if (isObj(x) && !have.has(x.id)) dst.push(x);
  }
  // Kopyanın alanı, yalnızca KENDİ cihazının varsayılanından farklıysa düzenlemedir.
  for (const key of SCALARS) {
    const dv = own(d, key);
    if (dv !== undefined && deepEqual(own(k, key), own(defKeep, key)) && !deepEqual(dv, own(defDrop, key))) k[key] = dv;
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
 * Otomatik planlamanın iki cihazda ayrı ayrı (eski sürümde rastgele kimlikle)
 * oluşturduğu aynı maçı (auto, açık, aynı tür + tarih + saat) teke indirir. Kalan:
 * ödeme/borç/disiplin kaydı bağlı olan, sonra verisi çok olan, sonra zamandan türetilmiş
 * kimlikli, sonra küçük kimlikli (her cihazda aynı sonuç). Kendisine kayıt bağlı kopya
 * silinmez (ikisi de kalır). Aynı cihazda zaten birlikte duran kopyalara dokunulmaz:
 * organizatör bir maçı bilerek diğerinin saatine taşımıştır (ör. ikinci saha).
 */
function dedupeAuto(s: State, io?: Inputs): void {
  const groups = new Map<string, Match[]>();
  for (const m of s.matches) {
    if (!isObj(m) || m.auto !== true || m.status !== "open") continue;
    const key = (m.kind || "football") + "|" + m.date + "|" + m.time;
    const g = groups.get(key);
    if (g) g.push(m);
    else groups.set(key, [m]);
  }
  const sides = io ? [idsOf(io.local.matches), idsOf(io.remote.matches)] : [];
  const refd = referencedMatches(s);
  const drop = new Set<Match>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    if (sides.some((ids) => g.filter((m) => ids.has(m.id)).length > 1)) continue;
    const rank = (m: Match) => [refd.has(m.id) ? 0 : 1, -dataScore(m), m.id === slotId(m.date, m.time) ? 0 : 1] as const;
    const ranked = [...g].sort((x, y) => {
      const a = rank(x), b = rank(y);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    });
    const keep = ranked[0];
    // Her kopyanın varsayılanı, geldiği cihazın ayarlarıyla (bilinmiyorsa birleşik durumla) üretilir.
    const origin = (m: Match): State => (io && sides[0].has(m.id) ? io.local : io && sides[1].has(m.id) ? io.remote : s);
    const defOf = (m: Match): Obj => created(origin(m), m.date, m.time, m.id) || {};
    const defKeep = defOf(keep);
    for (const d of ranked.slice(1)) {
      if (refd.has(d.id)) continue;
      absorb(keep, d, defKeep, defOf(d));
      drop.add(d);
    }
  }
  if (drop.size) s.matches = s.matches.filter((m) => !drop.has(m));
}

/** Ödeme listesini ve payı belirleyen maç alanları. */
const billInputs = (m: Obj) => [m.att, m.order, m.exempt, m.guests, m.price, m.format, m.cap, m.kind];

/**
 * Bir cihazda bitirilen (ödeme listesi dondurulan) maçın girdileri (katılım, sıra,
 * muafiyet, misafir, ücret) diğer cihazda değiştiyse liste birleşik veriden yeniden
 * dondurulur: tek cihazda "önce düzenle, sonra bitir" ile aynı sonuç (yanlış kişiye
 * borç yazılmaz). Maç bu turda bitirildiyse Kural 1.6 sırası da yeniden kalıcı yapılır.
 */
function refreezeBills(s: State, io: Inputs): void {
  const bm = mapOf(io.base?.matches), lm = mapOf(io.local.matches), rm = mapOf(io.remote.matches);
  for (const m of s.matches) {
    if (!isObj(m) || m.status !== "played" || !isObj(m.bill)) continue;
    const o = m as unknown as Obj;
    const b = bm.get(m.id);
    const srcs = [lm.get(m.id), rm.get(m.id)].filter((x): x is Obj => !!x && deepEqual(x.bill, m.bill) && !deepEqual(x.bill, b?.bill));
    if (!srcs.length || srcs.some((x) => deepEqual(billInputs(x), billInputs(o)))) continue;
    if (!b || b.status !== "played") {
      const pen = penalized(s, { ...m, status: "open" });
      if (pen.size) m.order = [...m.order.filter((id) => !pen.has(id)), ...m.order.filter((id) => pen.has(id))];
    }
    freezeBill(s, m);
  }
}

/**
 * Birleştirme sonrası değişmezleri sağlar (yerinde). io (birleştirmenin girdileri)
 * verilirse silinen otomatik maçın geri gelmesi ve donmuş ödeme listesi de düzeltilir.
 */
export function reconcile(s: State, io?: Inputs): State {
  if (!Array.isArray(s.matches)) return s;
  if (io) dropResurrected(s, io);
  dedupeAuto(s, io);
  for (const m of s.matches) if (isObj(m)) fixMatch(m);
  // İki cihazda basılan "Ödedi" ayrıca ele alınmaz: kaydın kimliği borçtan türetildiği
  // için (ledger.settleId) ikisi aynı kayıttır ve kimlikle birleşir.
  if (io) refreezeBills(s, io);
  return s;
}

/**
 * 3 yönlü birleştirme. base: iki tarafın en son anlaştığı durum (ilk katılımda null).
 * Girdileri değiştirmez. Daha yeni bir uygulamanın verisi reddedilir (BackupError "future").
 *
 * base null (cihaz ilk kez katılıyor): yerelde organizatör verisi yoksa uzak durum
 * olduğu gibi alınır; varsa iki taraf "her şeyi eklemiş" sayılır: listeler id'ye göre
 * birleşir, çatışmalar (aynı kimlikli kayıtlar) uzak lehine çözülür. Ayarların tabanı
 * varsayılan ayarlardır: yalnızca bir cihazda değiştirilen ayar (IBAN, ücret …) korunur,
 * iki cihazda farklı değiştirilen ayarda uzak kazanır.
 */
export function merge3(base: State | null, local: State, remote: State): State {
  if (num(local.v) > SCHEMA_VERSION || num(remote.v) > SCHEMA_VERSION) throw new BackupError("future");
  const L = clone(local), R = clone(remote);
  if (!base && !hasUserData(L)) return normalize(R);
  const io: Inputs = { base, local, remote };
  const ctx: Ctx = base
    ? { win: num(L.updatedAt) > num(R.updatedAt) ? "local" : "remote", first: "local", io }
    : { win: "remote", first: "remote", io };
  const b: unknown = base || { settings: defaultSettings() };
  const out = merge(b, L, R, "", ctx) as State;
  out.updatedAt = Math.max(num(L.updatedAt), num(R.updatedAt));
  out.v = Math.max(num(L.v), num(R.v));
  return normalize(reconcile(out, io));
}
