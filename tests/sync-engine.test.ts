/** Eşitleme motoru: sahte bulut (Firestore ön koşul davranışıyla) ve birden çok cihaz. */
import { describe, expect, it } from "vitest";
import { createEngine, sameData, type SyncMeta } from "../src/sync/engine";
import { pack, unpack, type Envelope } from "../src/sync/envelope";
import { ConflictError, NetError, type Remote } from "../src/sync/firestore";
import { hasUserData, merge3 } from "../src/sync/merge";
import { hasData } from "../src/data/backup";
import { SCHEMA_VERSION } from "../src/domain/schema";
import type { State } from "../src/domain/types";
import { match, player, state } from "./helpers/factory";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Firestore benzeri tek belgelik bulut: her yazma yeni token üretir, ön koşul tutmazsa ConflictError. */
class Cloud {
  docs = new Map<string, { env: Envelope; token: string }>();
  writes = 0;
  /** Tam okumalar (veri iner) */
  reads = 0;
  /** Hafif kontroller (yalnızca sürüm belirteci) */
  peeks = 0;
  /** false: hafif kontrolü olmayan bulut (motor her turda tam okur) */
  peekable = true;
  failNext = 0;
  /** read ile write arasında araya girecek başka bir yazma (yarış testi) */
  beforeWrite: (() => Promise<void>) | null = null;
  /** okumadan hemen sonra çalışır (okuma sürerken kullanıcının değişiklik yapması) */
  afterRead: (() => void) | null = null;
  private n = 0;
  remote(uid: string): Remote {
    const r: Remote = {
      peek: async () => {
        this.peeks++;
        if (this.failNext > 0) {
          this.failNext--;
          throw new NetError(503);
        }
        return this.docs.get(uid)?.token ?? null;
      },
      read: async () => {
        this.reads++;
        if (this.failNext > 0) {
          this.failNext--;
          throw new NetError(503);
        }
        const d = this.docs.get(uid);
        const out = d ? clone(d) : null;
        if (this.afterRead) {
          const f = this.afterRead;
          this.afterRead = null;
          f();
        }
        return out;
      },
      write: async (env, ifToken) => {
        if (this.beforeWrite) {
          const f = this.beforeWrite;
          this.beforeWrite = null;
          await f();
        }
        const cur = this.docs.get(uid);
        if (ifToken === null ? !!cur : !cur || cur.token !== ifToken) throw new ConflictError();
        this.writes++;
        const token = "t" + ++this.n;
        this.docs.set(uid, { env: clone(env), token });
        return token;
      },
    };
    if (!this.peekable) delete r.peek;
    return r;
  }
}

let clock = 1_000_000;

class Device {
  s: State;
  ver = 0;
  busy = false;
  online = true;
  signedIn = true;
  uid = "u1";
  locks: string[] = [];
  metas = new Map<string, SyncMeta>();
  engine;
  constructor(public name: string, public cloud: Cloud, initial: State = state()) {
    this.s = clone(initial);
    this.engine = createEngine({
      getState: () => this.s,
      version: () => this.ver,
      apply: (n) => {
        if (this.busy) return false;
        this.s = clone(n);
        return true;
      },
      uid: () => (this.signedIn ? this.uid : null),
      remote: () => (this.signedIn ? this.cloud.remote(this.uid) : null),
      loadMeta: async (uid) => (this.metas.has(uid) ? clone(this.metas.get(uid)!) : null),
      saveMeta: async (m) => void this.metas.set(m.uid, clone(m)),
      lock: async (_s, reason) => void this.locks.push(reason),
      merge: merge3,
      encode: (s, rev) => pack(s, rev, this.name, clock),
      decode: unpack,
      hasData,
      isEmpty: (s) => !hasUserData(s),
      online: () => this.online,
      now: () => clock,
    });
  }
  /** Kullanıcı değişikliği (commit gibi: updatedAt artar, sürüm sayacı artar). */
  edit(fn: (s: State) => void): void {
    fn(this.s);
    this.s.updatedAt = ++clock;
    this.ver++;
  }
  sync(): Promise<void> {
    return this.engine.syncNow();
  }
}

function base(): State {
  const s = state([player("p1", "Ali Deneme"), player("p2", "Veli Örnek"), player("p3", "Can Sahte")], [match("m1", { date: "2026-10-20" })]);
  s.updatedAt = ++clock;
  return s;
}

describe("eşitleme motoru", () => {
  it("ilk cihaz buluta yazar, boş ikinci cihaz veriyi alır", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    expect(cloud.writes).toBe(1);
    expect(phone.engine.status().state).toBe("idle");
    const pc = new Device("pc", cloud);
    await pc.sync();
    expect(pc.s.players.map((p) => p.name)).toEqual(["Ali Deneme", "Veli Örnek", "Can Sahte"]);
    expect(pc.locks).toEqual([]); // boş cihazda kilitli sürüm gerekmez
    expect(cloud.writes).toBe(1); // birleşim buluttakiyle aynı: tekrar yazılmaz
  });

  it("boş cihaz önce giriş yaparsa buluta boş belge yazmaz; dolu cihazın ayarları korunur", async () => {
    const cloud = new Cloud();
    const pc = new Device("pc", cloud);
    await pc.sync();
    expect(cloud.writes).toBe(0);
    expect(pc.engine.status().state).toBe("idle");
    const full = base();
    full.settings.iban = "TR00 0000 0000 0000 0000 0000 01";
    full.settings.price = 3500;
    const phone = new Device("phone", cloud, full);
    await phone.sync();
    await pc.sync();
    expect(pc.s.settings.iban).toBe("TR00 0000 0000 0000 0000 0000 01");
    expect(pc.s.settings.price).toBe(3500);
    expect(phone.s.settings.price).toBe(3500);
  });

  it("bir cihazdaki değişiklik diğerine geçer", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    phone.edit((s) => s.players.push(player("p4", "Yeni Oyuncu")));
    await phone.sync();
    await pc.sync();
    expect(pc.s.players.some((p) => p.id === "p4")).toBe(true);
  });

  it("çevrimdışı farklı değişiklikler birleşir, ikisi de kaybolmaz", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    phone.online = pc.online = false;
    phone.edit((s) => {
      s.matches[0].att.p1 = "in";
      s.matches[0].order.push("p1");
    });
    pc.edit((s) => {
      s.matches[0].att.p2 = "in";
      s.matches[0].order.push("p2");
      s.players[2].phone = "0555 000 00 99";
    });
    await phone.sync();
    expect(phone.engine.status().state).toBe("offline");
    phone.online = pc.online = true;
    await phone.sync();
    await pc.sync();
    await phone.sync();
    for (const d of [phone, pc]) {
      expect(d.s.matches[0].att).toEqual({ p1: "in", p2: "in" });
      expect([...d.s.matches[0].order].sort()).toEqual(["p1", "p2"]);
      expect(d.s.players[2].phone).toBe("0555 000 00 99");
    }
    expect(sameData(phone.s, pc.s)).toBe(true);
  });

  it("yazma sırasında başka cihaz araya girerse yeniden okuyup birleştirir", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    pc.edit((s) => s.players.push(player("p5", "PC Oyuncusu")));
    phone.edit((s) => s.players.push(player("p6", "Telefon Oyuncusu")));
    cloud.beforeWrite = () => pc.sync();
    await phone.sync();
    await pc.sync();
    for (const d of [phone, pc]) expect(d.s.players.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p5", "p6"]);
  });

  it("uygulama meşgulse (açık pencere) bekler, sonra uygular", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    phone.edit((s) => (s.players[0].rating = 5));
    await phone.sync();
    pc.busy = true;
    await pc.sync();
    expect(pc.s.players[0].rating).toBe(3);
    expect(pc.engine.status().pending).toBe(true);
    pc.busy = false;
    await pc.sync();
    expect(pc.s.players[0].rating).toBe(5);
    pc.engine.stop();
  });

  it("eşitleme sürerken yapılan değişiklik kaybolmaz", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    phone.edit((s) => (s.players[0].name = "Ali Değişti"));
    await phone.sync();
    // pc buluttan okurken kullanıcı bir oyuncu daha ekler
    cloud.afterRead = () => pc.edit((s) => s.players.push(player("p7", "Araya Giren")));
    await pc.sync();
    expect(pc.s.players[0].name).toBe("Ali Değişti");
    expect(pc.s.players.some((p) => p.id === "p7")).toBe(true);
    await pc.sync();
    await phone.sync();
    expect(phone.s.players.some((p) => p.id === "p7")).toBe(true);
  });

  it("buluta yazma sürerken yapılan değişiklik tabana girmez, sonraki turda gönderilir", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    phone.edit((s) => s.players.push(player("p8", "İlk Değişiklik")));
    // Yazma sürerken (ağ beklenirken) aynı nesne yerinde değişir
    cloud.beforeWrite = async () => phone.edit((s) => s.players.push(player("p9", "Araya Giren Değişiklik")));
    await phone.sync();
    const ids = async () => (await unpack(cloud.docs.get("u1")!.env)).players.map((p) => p.id);
    expect(await ids()).toContain("p8");
    expect(phone.metas.get("u1")!.base!.players.some((p) => p.id === "p9")).toBe(false);
    expect(phone.engine.status().pending).toBe(true);
    await phone.sync();
    expect(await ids()).toContain("p9");
    // Diğer cihaz ikisini de alır, telefondan da silinmez
    const pc = new Device("pc", cloud);
    await pc.sync();
    expect(pc.s.players.map((p) => p.id)).toEqual(expect.arrayContaining(["p8", "p9"]));
    await phone.sync();
    expect(phone.s.players.map((p) => p.id)).toEqual(expect.arrayContaining(["p8", "p9"]));
  });

  it("bir cihaz sıfırlanırsa buluttaki ve diğer cihazdaki veriler silinmez, veri o cihaza geri gelir", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    phone.edit(() => undefined);
    phone.s = state();
    phone.ver++;
    await phone.sync();
    expect(phone.s.players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    await pc.sync();
    expect(pc.s.players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("ilk birleştirme öncesi kilitli yerel sürüm, meşgulken tekrar denense de bir kez alınır", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const other = state([player("x1", "Başka Oyuncu")]);
    other.updatedAt = ++clock;
    const pc = new Device("pc", cloud, other);
    pc.busy = true;
    await pc.sync();
    await pc.sync();
    pc.busy = false;
    await pc.sync();
    expect(pc.locks).toEqual(["before-sync"]);
    expect(pc.s.players.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "x1"]);
    pc.engine.stop();
  });

  it("iki cihaz da eşitlendikten sonra boşuna yazmaz (ping-pong yok)", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud, base());
    await pc.sync();
    await phone.sync();
    await pc.sync();
    const w = cloud.writes;
    for (let i = 0; i < 3; i++) {
      await phone.sync();
      await pc.sync();
    }
    expect(cloud.writes).toBe(w);
    // Sadece updatedAt değişen (içeriksiz) kayıt da yazma doğurmaz
    phone.edit(() => undefined);
    await phone.sync();
    expect(cloud.writes).toBe(w);
  });

  it("hiçbir yerde değişiklik yokken kontrol yalnızca sürüm belirtecine bakar, veri indirmez", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    const reads = cloud.reads;
    const peeks = cloud.peeks;
    const writes = cloud.writes;
    clock += 30_000;
    for (let i = 0; i < 3; i++) {
      await phone.sync();
      await pc.sync();
    }
    expect(cloud.reads).toBe(reads);
    expect(cloud.peeks).toBe(peeks + 6);
    expect(cloud.writes).toBe(writes);
    // "Son eşitleme" yine güncellenir: bulutla aynı olduğu doğrulandı
    expect(pc.engine.status()).toMatchObject({ state: "idle", pending: false, lastSyncAt: clock });
    // Gönderilecek değişiklik varken hafif kontrol atlanır, belge tam okunup yazılır
    phone.edit((s) => s.players.push(player("p4", "Yeni Oyuncu")));
    await phone.sync();
    expect(cloud.peeks).toBe(peeks + 6);
    expect(cloud.reads).toBe(reads + 1);
    expect(cloud.writes).toBe(writes + 1);
    // Bulut değişti: hafif kontrol farkı görür, belge tam okunur ve birleştirilir
    await pc.sync();
    expect(cloud.peeks).toBe(peeks + 7);
    expect(cloud.reads).toBe(reads + 2);
    expect(pc.s.players.some((p) => p.id === "p4")).toBe(true);
    expect(cloud.writes).toBe(writes + 1);
    // Sonraki kontroller yine hafif
    await pc.sync();
    await phone.sync();
    expect(cloud.reads).toBe(reads + 2);
    expect(cloud.peeks).toBe(peeks + 9);
  });

  it("hafif kontrol ağ hatası verirse her zamanki gibi sonra tekrar denenir", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    cloud.failNext = 1;
    await phone.sync();
    expect(phone.engine.status()).toMatchObject({ state: "error", error: "net" });
    await phone.sync();
    expect(phone.engine.status()).toMatchObject({ state: "idle", pending: false });
    phone.engine.stop();
  });

  it("hafif kontrolü olmayan bulutla da aynı çalışır (her turda tam okur)", async () => {
    const cloud = new Cloud();
    cloud.peekable = false;
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const pc = new Device("pc", cloud);
    await pc.sync();
    const reads = cloud.reads;
    await pc.sync();
    expect(cloud.reads).toBe(reads + 1);
    phone.edit((s) => s.players.push(player("p4", "Yeni Oyuncu")));
    await phone.sync();
    await pc.sync();
    expect(pc.s.players.some((p) => p.id === "p4")).toBe(true);
    expect(cloud.peeks).toBe(0);
  });

  it("iki cihazda da veri varken ilk bağlanmada önce kilitli yerel sürüm alınır, veriler birleşir", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const other = state([player("x1", "Başka Oyuncu")]);
    other.updatedAt = ++clock;
    const pc = new Device("pc", cloud, other);
    await pc.sync();
    expect(pc.locks).toEqual(["before-sync"]);
    expect(pc.s.players.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "x1"]);
    await phone.sync();
    expect(phone.s.players.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "x1"]);
  });

  it("buluttaki veri daha yeni bir uygulamadan geldiyse güncelleme ister, dokunmaz", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    const doc = cloud.docs.get("u1")!;
    doc.env.schema = SCHEMA_VERSION + 1;
    const pc = new Device("pc", cloud, base());
    const before = clone(pc.s);
    await pc.sync();
    expect(pc.engine.status().state).toBe("needsUpdate");
    expect(pc.s).toEqual(before);
  });

  it("ağ hatasında bekleyen değişiklik korunur, sonra gönderilir", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    await phone.sync();
    phone.edit((s) => (s.settings.price = 4200));
    cloud.failNext = 1;
    await phone.sync();
    expect(phone.engine.status()).toMatchObject({ state: "error", error: "net", pending: true });
    await phone.sync();
    expect(phone.engine.status()).toMatchObject({ state: "idle", pending: false });
    const pc = new Device("pc", cloud);
    await pc.sync();
    expect(pc.s.settings.price).toBe(4200);
    phone.engine.stop();
  });

  it("oturum kapalıyken buluta hiç dokunmaz", async () => {
    const cloud = new Cloud();
    const phone = new Device("phone", cloud, base());
    phone.signedIn = false;
    await phone.sync();
    expect(cloud.reads + cloud.peeks + cloud.writes).toBe(0);
    expect(phone.engine.status().state).toBe("signedOut");
  });

  it("başka hesaba geçince taban sıfırlanır (o hesabın verisiyle birleşir)", async () => {
    const cloud = new Cloud();
    const a = new Device("a", cloud, base());
    await a.sync();
    a.uid = "u2";
    await a.engine.userChanged();
    expect(cloud.docs.has("u2")).toBe(true);
    expect(a.metas.get("u2")!.base).not.toBeNull();
    expect(a.metas.get("u1")!.token).toBe(cloud.docs.get("u1")!.token);
  });
});
