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

beforeEach(async () => {
  vi.useRealTimers();
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  D = await import("../src/data/db");
  P = await import("../src/data/persist");
});

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
