/**
 * IndexedDB sarmalayıcısı (bağımlılıksız).
 *  - kv: "state" (uygulama verisi), "meta" (yedek tarihleri vb.)
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

/**
 * Sürüm kaydeder. Son sürüm kilitli değilse ve "coalesceMs" içinde açılmışsa
 * onun üzerine yazar (art arda yapılan değişiklikler tek sürümde birleşir);
 * aksi halde yeni sürüm açar. En fazla "keep" sürüm tutulur.
 */
export async function snapPut(s: Omit<Snapshot, "id" | "start">, opts: { coalesceMs: number; keep: number; forceNew?: boolean }): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("snapshots", "readwrite");
  const store = tx.objectStore("snapshots");
  // Yalnızca anahtarları ve en yeni kaydı oku (tüm sürümleri belleğe almadan).
  const keys = ((await req(store.getAllKeys())) as number[]).sort((a, b) => b - a);
  const latest = keys.length ? ((await req(store.get(keys[0]))) as Snapshot | undefined) : undefined;
  if (!opts.forceNew && !s.locked && latest && !latest.locked && s.at - latest.start < opts.coalesceMs) {
    store.put({ ...latest, ...s, id: latest.id, start: latest.start });
  } else {
    store.add({ ...s, start: s.at });
    keys.unshift(Infinity);
  }
  // Fazla sürümleri sil (en eskiler)
  keys.slice(opts.keep).forEach((k) => {
    if (Number.isFinite(k)) store.delete(k);
  });
  await done(tx);
}

export async function clearAll(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(["kv", "snapshots"], "readwrite");
  tx.objectStore("kv").clear();
  tx.objectStore("snapshots").clear();
  await done(tx);
}
