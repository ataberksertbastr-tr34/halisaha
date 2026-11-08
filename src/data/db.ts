/**
 * IndexedDB sarmalayıcısı (bağımlılıksız).
 *  - kv: "state" (uygulama verisi), "meta" (yedek tarihleri vb.), "snapIndex" (sürümlerin
 *    küçük dizini: hangisinin silineceğine sürümlerin verisini okumadan karar verilir)
 *  - snapshots: otomatik yerel yedek sürümleri
 */
export const DB_NAME = "halisaha";
const DB_VERSION = 1;

export interface Snapshot {
  id?: number;
  /** Bu sürüme son yazılan değişikliğin zamanı */
  at: number;
  /** Sürümün ilk oluşturulduğu an */
  start: number;
  /** JSON metni (eski şemalar da saklanabilir; geri yüklerken migrate edilir) */
  data: string;
  players: number;
  matches: number;
  /** Önemli işlem öncesi alınan kilitli sürüm; üzerine yazılmaz */
  locked?: boolean;
  reason?: string;
}

let dbp: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error("abort"));
  });
}

export function openDB(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise<IDBDatabase>((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("IndexedDB yok"));
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close();
      res(db);
    };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("IndexedDB engellendi"));
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

/** Testler için: bağlantıyı kapatıp sıfırlar. */
export async function closeDB(): Promise<void> {
  if (!dbp) return;
  const db = await dbp.catch(() => null);
  db?.close();
  dbp = null;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return req(db.transaction("kv").objectStore("kv").get(key)) as Promise<T | undefined>;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").put(value, key);
  await done(tx);
}

/** En yeni sürüm başta olacak şekilde tüm yerel sürümler. */
export async function snapList(): Promise<Snapshot[]> {
  const db = await openDB();
  const all = (await req(db.transaction("snapshots").objectStore("snapshots").getAll())) as Snapshot[];
  return all.sort((a, b) => (b.id || 0) - (a.id || 0));
}

export async function snapGet(id: number): Promise<Snapshot | undefined> {
  const db = await openDB();
  return req(db.transaction("snapshots").objectStore("snapshots").get(id)) as Promise<Snapshot | undefined>;
}

/** Sürümün dizindeki özeti (verisi olmadan). */
export interface SnapMeta {
  id: number;
  at: number;
  start: number;
  locked?: boolean;
}

export interface Retention {
  /** Her durumda tutulan en yeni sürüm sayısı */
  keep: number;
  /** Son bu kadar günün her günü için o günün en son sürümü */
  days: number;
  /** Kilitli sürümler (silme, yedek yükleme, taşıma, eşitleme öncesi) bu kadar gün … */
  lockedDays: number;
  /** … en çok bu kadar tutulur */
  lockedMax: number;
}

export const RETENTION: Retention = { keep: 10, days: 14, lockedDays: 30, lockedMax: 20 };
const DAY = 24 * 60 * 60 * 1000;

/**
 * Silinecek sürümler. Tutulanlar: en yeni "keep" sürüm; son "days" günün her günü için o
 * günün en son sürümü; son "lockedDays" gündeki kilitli sürümlerin en yeni "lockedMax" tanesi.
 * Böylece yoğun bir saatte 10 sürüm dolsa da dünkü ve geçen haftaki hâl, bir hafta önceki
 * "yedek yükleme öncesi" hâli kalır.
 */
export function pruneSnapshots(list: SnapMeta[], now: number, r: Retention = RETENTION): number[] {
  const byNew = list.slice().sort((a, b) => b.id - a.id);
  const keep = new Set(byNew.slice(0, r.keep).map((x) => x.id));
  const days = new Set<string>();
  for (const x of byNew.slice().sort((a, b) => b.at - a.at)) {
    if (now - x.at >= r.days * DAY) continue;
    const d = new Date(x.at).toDateString();
    if (days.has(d)) continue;
    days.add(d);
    keep.add(x.id);
  }
  byNew.filter((x) => x.locked && now - x.at < r.lockedDays * DAY).slice(0, r.lockedMax).forEach((x) => keep.add(x.id));
  return byNew.filter((x) => !keep.has(x.id)).map((x) => x.id);
}

const INDEX_KEY = "snapIndex";
const metaOf = (x: Snapshot): SnapMeta => ({ id: x.id!, at: x.at, start: x.start ?? x.at, ...(x.locked ? { locked: true } : {}) });

/**
 * Sürüm kaydeder. Son sürüm kilitli değilse ve "coalesceMs" içinde açılmışsa
 * onun üzerine yazar (art arda yapılan değişiklikler tek sürümde birleşir);
 * aksi halde yeni sürüm açar. Fazlalar katmanlı olarak silinir (pruneSnapshots).
 */
export async function snapPut(s: Omit<Snapshot, "id" | "start">, opts: { coalesceMs: number; forceNew?: boolean; retention?: Retention }): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(["snapshots", "kv"], "readwrite");
  const store = tx.objectStore("snapshots");
  const kv = tx.objectStore("kv");
  // Sürümlerin verisini okumadan: anahtarlar ve küçük dizin. Dizinde olmayan (eski sürümün
  // eklediği ya da dizinden önceki) kayıtlar bir kez okunup dizine eklenir.
  const keys = (await req(store.getAllKeys())) as number[];
  const have = new Set(keys);
  let index = (((await req(kv.get(INDEX_KEY))) as SnapMeta[] | undefined) || []).filter((x) => have.has(x.id));
  const known = new Set(index.map((x) => x.id));
  for (const k of keys) {
    if (known.has(k)) continue;
    const x = (await req(store.get(k))) as Snapshot | undefined;
    if (x) index.push(metaOf({ ...x, id: k }));
  }
  index.sort((a, b) => b.id - a.id);
  const latest = index[0];
  const cur = !opts.forceNew && !s.locked && latest && !latest.locked && s.at - latest.start < opts.coalesceMs ? ((await req(store.get(latest.id))) as Snapshot | undefined) : undefined;
  if (cur) {
    store.put({ ...cur, ...s, id: latest.id, start: latest.start });
    latest.at = s.at;
  } else {
    const id = (await req(store.add({ ...s, start: s.at }))) as number;
    index.unshift(metaOf({ ...s, id, start: s.at }));
  }
  const drop = new Set(pruneSnapshots(index, s.at, opts.retention));
  drop.forEach((id) => store.delete(id));
  index = index.filter((x) => !drop.has(x.id));
  kv.put(index, INDEX_KEY);
  await done(tx);
}

export async function clearAll(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(["kv", "snapshots"], "readwrite");
  tx.objectStore("kv").clear();
  tx.objectStore("snapshots").clear();
  await done(tx);
}
