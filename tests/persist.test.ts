/** IndexedDB kalıcılığı, otomatik yerel sürümler (son 10) ve kilitli sürümler. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { readFileSync } from "node:fs";
import { SCHEMA_VERSION } from "../src/domain/schema";
import { player, state } from "./helpers/factory";

type Persist = typeof import("../src/data/persist");
type DB = typeof import("../src/data/db");

let P: Persist;
let D: DB;

/** Bellekte localStorage (node ortamında yok). */
const mem = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

beforeEach(async () => {
  vi.useRealTimers();
  globalThis.indexedDB = new IDBFactory();
  mem.clear();
  globalThis.localStorage = fakeStorage;
  vi.resetModules();
  D = await import("../src/data/db");
  P = await import("../src/data/persist");
});

/** Modülleri sıfırlayıp uygulamayı yeniden açar (yeni sekme / ertesi gün). */
async function reopen(): Promise<void> {
  await D.closeDB();
  vi.resetModules();
  D = await import("../src/data/db");
  P = await import("../src/data/persist");
  P.RETRY_MS.splice(0, P.RETRY_MS.length, 1, 1, 1);
}

/** İlk "fails" açılışı hata veren IndexedDB (iPhone'daki "Connection to Indexed Database server lost" gibi). */
function flaky(real: IDBFactory, fails: number): IDBFactory {
  let n = fails;
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "open") {
        return (name: string, version?: number) => {
          if (n-- > 0) {
            const r: { error: DOMException; onerror?: () => void } = { error: new DOMException("Connection to Indexed Database server lost", "UnknownError") };
            setTimeout(() => r.onerror?.());
            return r as unknown as IDBOpenDBRequest;
          }
          return version === undefined ? target.open(name) : target.open(name, version);
        };
      }
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

describe("IndexedDB kalıcılığı", () => {
  it("ilk açılışta boş durum, kaydedilen veri yeniden açılışta geri gelir", async () => {
    const s0 = await P.loadState();
    expect(s0.players).toEqual([]);
    expect(P.storageMode()).toBe("idb");
    const s = state([player("a", "Ayşe Örnek")]);
    await P.saveState(s);
    await D.closeDB();
    vi.resetModules();
    const P2: Persist = await import("../src/data/persist");
    const back = await P2.loadState();
    expect(back.players.map((p) => p.name)).toEqual(["Ayşe Örnek"]);
  });

  it("eski şemadaki kayıt açılışta taşınır ve öncesi kilitli sürüm olarak saklanır", async () => {
    const v1 = JSON.parse(readFileSync(new URL("./fixtures/backup-v1.json", import.meta.url), "utf8"));
    await D.kvSet("state", v1);
    const s = await P.loadState();
    expect(s.v).toBe(SCHEMA_VERSION);
    expect(s.players).toHaveLength(10);
    expect(((await D.kvGet("state")) as { v: number }).v).toBe(SCHEMA_VERSION);
    const snaps = await P.listSnapshots();
    expect(snaps[0].locked).toBe(true);
    expect(snaps[0].reason).toBe("pre-migration");
    expect(JSON.parse(snaps[0].data).v).toBe(1);
  });

  it("art arda değişiklikler aynı sürümde birleşir, en son durum yazılır", async () => {
    await P.loadState();
    const s = state();
    for (let i = 0; i < 5; i++) {
      s.players.push(player("p" + i, "Oyuncu " + i));
      P.saveState(JSON.parse(JSON.stringify(s)));
    }
    await P.flush();
    const snaps = await P.listSnapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].players).toBe(5);
    expect(((await D.kvGet("state")) as { players: unknown[] }).players).toHaveLength(5);
  });

  it("en fazla 10 sürüm tutulur, en eskiler silinir", async () => {
    await P.loadState();
    const t0 = Date.now();
    const spy = vi.spyOn(Date, "now");
    for (let i = 0; i < 14; i++) {
      spy.mockReturnValue(t0 + i * (P.COALESCE_MS + 1000));
      const s = state(Array.from({ length: i + 1 }, (_, k) => player("p" + k, "O" + k)));
      await P.saveState(s);
    }
    spy.mockRestore();
    const snaps = await P.listSnapshots();
    expect(snaps).toHaveLength(P.KEEP_SNAPSHOTS);
    expect(snaps.map((x) => x.players)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  });

  it("riskli işlem öncesi kilitli sürüm, sonraki kayıttan önce ve ayrı yazılır", async () => {
    await P.loadState();
    const before = state([player("a", "Silinecek"), player("b", "Kalan")]);
    await P.saveState(before);
    const after = state([player("b", "Kalan")]);
    P.lockedSnapshot(before, "before-delete");
    P.saveState(after);
    await P.flush();
    const snaps = await P.listSnapshots();
    expect(snaps.map((x) => [x.players, !!x.locked, x.reason ?? ""])).toEqual([
      [1, false, ""],
      [2, true, "before-delete"],
      [2, false, ""],
    ]);
    const restored = await P.readSnapshot(snaps[1].id!);
    expect(restored!.players.map((p) => p.name)).toEqual(["Silinecek", "Kalan"]);
  });

  it("meta (son yedek tarihi) kalıcıdır", async () => {
    await P.loadState();
    await P.updateMeta({ lastExportAt: 12345 });
    vi.resetModules();
    const P2: Persist = await import("../src/data/persist");
    await P2.loadState();
    expect(P2.getMeta().lastExportAt).toBe(12345);
  });
});

describe("açılışta depolama hatası", () => {
  const withStamp = (name: string, at: number) => ({ ...state([player("a", name)]), updatedAt: at });

  it("geçici hata yeniden denenir; veri asıl depodan gelir, uyarı yok", async () => {
    await P.loadState();
    await P.saveState(withStamp("Kalıcı Kerem", 100));
    const real = globalThis.indexedDB;
    await reopen();
    globalThis.indexedDB = flaky(real, 2);
    const s = await P.loadState();
    expect(s.players.map((p) => p.name)).toEqual(["Kalıcı Kerem"]);
    expect(P.storageMode()).toBe("idb");
    expect(P.loadIssue()).toBe("");
  });

  it("hiç açılmazsa acil kopyaya yazılır ve uyarılır; sonraki açılışta daha yeni acil kopya geri yüklenir, önceki hâl kilitli sürüm olur", async () => {
    await P.loadState();
    await P.saveState(withStamp("Eski Ekrem", 100));
    const real = globalThis.indexedDB;
    await reopen();
    globalThis.indexedDB = flaky(real, 99);
    await P.loadState();
    expect(P.storageMode()).toBe("local");
    expect(P.loadIssue()).toBe("local");
    await P.saveState(withStamp("Yeni Yusuf", 200));
    expect(JSON.parse(mem.get(P.FALLBACK_KEY)!).players[0].name).toBe("Yeni Yusuf");
    await reopen();
    globalThis.indexedDB = real;
    // Asıl depoya dokunulmadı
    expect(((await D.kvGet("state")) as { players: { name: string }[] }).players[0].name).toBe("Eski Ekrem");
    await D.closeDB();
    const s = await P.loadState();
    expect(s.players.map((p) => p.name)).toEqual(["Yeni Yusuf"]);
    expect(P.loadIssue()).toBe("recovered");
    expect(((await D.kvGet("state")) as { players: { name: string }[] }).players[0].name).toBe("Yeni Yusuf");
    expect(mem.has(P.FALLBACK_KEY)).toBe(false);
    const snaps = await P.listSnapshots();
    expect(snaps[0]).toMatchObject({ locked: true, reason: "before-recovery" });
    expect(JSON.parse(snaps[0].data).players[0].name).toBe("Eski Ekrem");
  });

  it("asıl depodakinden eski acil kopya yok sayılır ve silinir", async () => {
    await P.loadState();
    await P.saveState(withStamp("Güncel Gül", 300));
    mem.set(P.FALLBACK_KEY, JSON.stringify(withStamp("Bayat Bora", 200)));
    await reopen();
    const s = await P.loadState();
    expect(s.players[0].name).toBe("Güncel Gül");
    expect(P.loadIssue()).toBe("");
    expect(mem.has(P.FALLBACK_KEY)).toBe(false);
  });

  it("asıl depo boşsa acil kopya ile eski uygulamanın verisinden yenisi alınır", async () => {
    mem.set(P.LEGACY_KEY, JSON.stringify(withStamp("Eski Uygulama", 100)));
    mem.set(P.FALLBACK_KEY, JSON.stringify(withStamp("Acil Ayşe", 200)));
    const s = await P.loadState();
    expect(s.players[0].name).toBe("Acil Ayşe");
    expect(P.loadIssue()).toBe("recovered");
    expect(mem.has(P.LEGACY_KEY)).toBe(true);
  });

  it("IndexedDB hiç yoksa yeniden denemeden yedek alana geçer (en yeni kopya)", async () => {
    mem.set(P.LEGACY_KEY, JSON.stringify(withStamp("Eski Uygulama", 300)));
    mem.set(P.FALLBACK_KEY, JSON.stringify(withStamp("Acil Ayşe", 200)));
    await reopen();
    // @ts-expect-error: gizli modda olduğu gibi IndexedDB yok
    globalThis.indexedDB = undefined;
    P.RETRY_MS.splice(0, P.RETRY_MS.length, 60_000);
    const s = await P.loadState();
    expect(s.players[0].name).toBe("Eski Uygulama");
    expect(P.storageMode()).toBe("local");
  });

  it("veri daha yeni bir sürümle kaydedilmişse hiçbir şey yazılmaz (önce güncelle)", async () => {
    const future = { ...withStamp("Gelecek Gani", 500), v: SCHEMA_VERSION + 1 };
    await D.kvSet("state", future);
    await reopen();
    const s = await P.loadState();
    expect(s.players).toEqual([]);
    expect(P.loadIssue()).toBe("future");
    expect(P.storageMode()).toBe("blocked");
    await P.saveState(withStamp("Ezen Ezgi", 600));
    expect(((await D.kvGet("state")) as { v: number }).v).toBe(SCHEMA_VERSION + 1);
    expect(mem.size).toBe(0);
  });

  it("uygulama başka pencerede güncellenip yeni şemayla kaydettiyse bu pencere onun üzerine yazmaz", async () => {
    await P.loadState();
    const hit = vi.fn();
    P.onStorageBlocked(hit);
    await D.kvSet("state", { ...withStamp("Yeni Sürüm", 500), v: SCHEMA_VERSION + 1 });
    await P.saveState(withStamp("Eski Pencere", 600));
    expect(((await D.kvGet("state")) as { v: number }).v).toBe(SCHEMA_VERSION + 1);
    expect(hit).toHaveBeenCalledOnce();
    expect(P.loadIssue()).toBe("future");
    await P.saveState(withStamp("Eski Pencere", 700));
    expect(hit).toHaveBeenCalledOnce();
  });
});
