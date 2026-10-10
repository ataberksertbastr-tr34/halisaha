/** Cihazlar arası eşitleme: 3 yönlü birleştirme (merge3) ve uzlaştırma. Tüm isimler uydurmadır. */
import { describe, expect, it } from "vitest";
import { merge3, reconcile } from "../src/sync/merge";
import { BackupError, migrate, normalize } from "../src/domain/migrate";
import { ensureUpcoming } from "../src/domain/schedule";
import { lineup, materializeOrder, setAtt } from "../src/domain/lineup";
import { billOf, freezeBill } from "../src/domain/money";
import { accounts, cashAt, markPaid } from "../src/domain/ledger";
import { swapPlayers } from "../src/domain/teams";
import type { Att, Match, Payment, State } from "../src/domain/types";
import { allIn, match, player, roster, state } from "./helpers/factory";
import { seeded } from "./helpers/rng";

const T0 = 1_000, TL = 2_000, TR = 3_000;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Ortak başlangıç: 4 oyuncu, p0 ve p1 "Var" yazılmış bir maç. */
function base(): State {
  const m = allIn(match("m1"), ["p0", "p1"]);
  const s = migrate(state(roster(4), [m]));
  s.updatedAt = T0;
  return s;
}

/** Cihaz kopyası: base'in kopyası, kendi değişiklik zamanıyla. */
function fork(s: State, t: number): State {
  const c = clone(s);
  c.updatedAt = t;
  return c;
}

const pay = (id: string, pid: string, mid = "m1"): Payment => ({ id, pid, amount: 300, at: "2026-10-13", mid });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const m1 = (s: State) => s.matches.find((m) => m.id === "m1")!;
const pl = (s: State, id: string) => s.players.find((p) => p.id === id);

describe("3 yönlü birleştirme: temel kurallar", () => {
  it("yalnızca yerelde değişiklik → yerel durum", () => {
    const b = base();
    const l = fork(b, TL);
    l.players[0].name = "Yeni Yaşar";
    l.settings.price = 3200;
    const r = fork(b, T0);
    expect(merge3(b, l, r)).toEqual(l);
  });

  it("yalnızca uzakta değişiklik → uzak durum", () => {
    const b = base();
    const l = fork(b, T0);
    const r = fork(b, TR);
    r.players[2].rating = 5;
    r.settings.iban = "TR00 0000 0000 0000 0000 0000 01";
    expect(merge3(b, l, r)).toEqual(r);
  });

  it("iki tarafta farklı oyuncular eklenir → ikisi de kalır (yerel sıra, sonra uzak)", () => {
    const b = base();
    const l = fork(b, TL);
    l.players.push(player("pL", "Yerel Yusuf"));
    const r = fork(b, TR);
    r.players.push(player("pR", "Uzak Ufuk"));
    expect(ids(merge3(b, l, r).players)).toEqual(["p0", "p1", "p2", "p3", "pL", "pR"]);
    expect(ids(merge3(b, r, l).players)).toEqual(["p0", "p1", "p2", "p3", "pR", "pL"]);
  });

  it("aynı oyuncunun farklı alanları iki tarafta düzenlenir → alan bazında birleşir", () => {
    const b = base();
    const l = fork(b, TL);
    l.players[1].name = "Çağrı Işık";
    l.players[1].phone = "0500 000 00 00";
    const r = fork(b, TR);
    r.players[1].rating = 5;
    r.players[1].pos = "GK";
    const p = pl(merge3(b, l, r), "p1")!;
    expect(p).toMatchObject({ name: "Çağrı Işık", phone: "0500 000 00 00", rating: 5, pos: "GK" });
  });

  it("aynı alan iki tarafta farklı → updatedAt'i büyük olan kazanır, eşitse uzak", () => {
    const b = base();
    const l = fork(b, TL);
    l.players[1].name = "Yerel Ad";
    const r = fork(b, TR);
    r.players[1].name = "Uzak Ad";
    let out = merge3(b, l, r);
    expect(pl(out, "p1")!.name).toBe("Uzak Ad");
    expect(out.updatedAt).toBe(TR);
    l.updatedAt = 4_000;
    out = merge3(b, l, r);
    expect(pl(out, "p1")!.name).toBe("Yerel Ad");
    expect(out.updatedAt).toBe(4_000);
    l.updatedAt = TR;
    expect(pl(merge3(b, l, r), "p1")!.name).toBe("Uzak Ad");
  });

  it("silme ↔ dokunulmamış → silinir", () => {
    const b = base();
    const l = fork(b, TL);
    l.players = l.players.filter((p) => p.id !== "p2");
    l.matches = [];
    const r = fork(b, TR);
    r.settings.price = 3100;
    const out = merge3(b, l, r);
    expect(ids(out.players)).toEqual(["p0", "p1", "p3"]);
    expect(out.matches).toEqual([]);
    expect(out.settings.price).toBe(3100);
  });

  it("silme ↔ düzenleme → düzenleme kalır (hangi taraf yeni olursa olsun)", () => {
    const b = base();
    b.payments = [pay("pay1", "p0")];
    for (const [tl, tr] of [[TL, TR], [TR, TL]]) {
      const l = fork(b, tl);
      l.players = l.players.filter((p) => p.id !== "p2");
      l.payments[0].amount = 450;
      const r = fork(b, tr);
      r.players.find((p) => p.id === "p2")!.rating = 1;
      r.payments = [];
      const out = merge3(b, l, r);
      expect(pl(out, "p2")).toMatchObject({ rating: 1, name: "Oyuncu 2" });
      expect(out.payments).toEqual([{ ...pay("pay1", "p0"), amount: 450 }]);
    }
  });

  it("anahtar silme ↔ düzenleme (yanıt): düzenlenen yanıt kalır", () => {
    const b = base();
    const l = fork(b, TR);
    setAtt(m1(l), "p1", "in", false); // aynı duruma basmak yanıtı siler
    const r = fork(b, TL);
    setAtt(m1(r), "p1", "maybe", true);
    const m = m1(merge3(b, l, r));
    expect(m.att.p1).toBe("maybe");
    expect(m.order).toEqual(["p0"]);
  });

  it("katılım (att) anahtar anahtar birleşir", () => {
    const b = base();
    const l = fork(b, TL);
    setAtt(m1(l), "p2", "in", true);
    const r = fork(b, TR);
    setAtt(m1(r), "p3", "maybe", true);
    setAtt(m1(r), "p0", "out", true);
    const m = m1(merge3(b, l, r));
    expect(m.att).toEqual({ p0: "out", p1: "in", p2: "in", p3: "maybe" });
    expect(m.order).toEqual(["p1", "p2"]);
  });

  it("yazılma sırası (order) sıralı küme olarak birleşir", () => {
    const b = base();
    const l = fork(b, TL);
    setAtt(m1(l), "p0", "out", true);
    setAtt(m1(l), "p2", "in", true);
    const r = fork(b, TR);
    setAtt(m1(r), "p3", "in", true);
    expect(m1(merge3(b, l, r)).order).toEqual(["p1", "p2", "p3"]);
    // Çıkıp yeniden yazılan sona geçer; uzakta eklenen onun da arkasına
    const l2 = fork(b, TL);
    setAtt(m1(l2), "p0", "out", true);
    setAtt(m1(l2), "p0", "in", true);
    const r2 = fork(b, TR);
    setAtt(m1(r2), "p2", "in", true);
    const out = merge3(b, l2, r2);
    expect(m1(out).order).toEqual(["p1", "p0", "p2"]);
    expect(lineup(out, m1(out)).playing).toEqual(["p1", "p0", "p2"]);
  });

  it("çatışmada kaybeden 'Var' sıradan çıkar (order ↔ att tutarlı)", () => {
    const b = base();
    const l = fork(b, TL);
    setAtt(m1(l), "p2", "in", true);
    const r = fork(b, TR);
    setAtt(m1(r), "p2", "maybe", true);
    let m = m1(merge3(b, l, r));
    expect(m.att.p2).toBe("maybe");
    expect(m.order).toEqual(["p0", "p1"]);
    l.updatedAt = 5_000;
    m = m1(merge3(b, l, r));
    expect(m.att.p2).toBe("in");
    expect(m.order).toEqual(["p0", "p1", "p2"]);
  });

  it("takımlar bütün değerdir: çatışmada kazananın iki listesi birlikte alınır; kilit takımı izler", () => {
    const b = base();
    allIn(m1(b), ["p2", "p3"]);
    m1(b).teams = { a: ["p0", "p1"], b: ["p2", "p3"] };
    m1(b).locks = { p1: "a" };
    const l = fork(b, TL);
    swapPlayers(m1(l), "p1", "p2"); // p1 B'ye geçer, kilidi de
    const r = fork(b, TR);
    m1(r).teams.b = ["p2"]; // p3 takımdan çıkarıldı
    let m = m1(merge3(b, l, r));
    expect(m.teams).toEqual({ a: ["p0", "p1"], b: ["p2"] });
    expect(m.locks).toEqual({ p1: "a" });
    l.updatedAt = 5_000;
    m = m1(merge3(b, l, r));
    expect(m.teams).toEqual({ a: ["p0", "p2"], b: ["p1", "p3"] });
    expect(m.locks).toEqual({ p1: "b" });
  });

  it("uzlaştırma: aynı oyuncu iki takımda olamaz, sıra tekrarsız ve 'Var' ile tutarlı", () => {
    const m = match("mx", { att: { p0: "in", p1: "in", p2: "out", p3: "in" }, order: ["p1", "p0", "p1", "p2"], teams: { a: ["p0", "p1", "p0"], b: ["p1", "p3"] }, locks: { p1: "b", p3: "a" } });
    reconcile(state(roster(4), [m]));
    expect(m.order).toEqual(["p1", "p0", "p3"]);
    expect(m.teams).toEqual({ a: ["p0", "p1"], b: ["p3"] });
    expect(m.locks).toEqual({ p1: "a", p3: "b" });
  });

  it("iki tarafta eklenen ödemelerin ikisi de kalır", () => {
    const b = base();
    const l = fork(b, TL);
    l.payments.push(pay("payL", "p0"));
    const r = fork(b, TR);
    r.payments.push(pay("payR", "p1"));
    expect(ids(merge3(b, l, r).payments)).toEqual(["payL", "payR"]);
  });

  it("skipped birleşim: eklemeler birleşir, çıkarma uygulanır", () => {
    const b = base();
    b.skipped = ["2026-10-13 21:00", "2026-10-08 21:00"];
    const l = fork(b, TL);
    l.skipped.push("2026-10-15 21:00");
    const r = fork(b, TR);
    r.skipped = ["2026-10-08 21:00", "2026-10-20 21:00"];
    expect(merge3(b, l, r).skipped).toEqual(["2026-10-08 21:00", "2026-10-15 21:00", "2026-10-20 21:00"]);
  });

  it("iç içe listeler (misafir, araç) id'ye göre; düz diziler (yolcular) bütün değer", () => {
    const b = base();
    m1(b).cars = [{ id: "c1", driver: "p0", seats: 4, pax: ["p1"], fuel: 0, toll: 0 }];
    const l = fork(b, TL);
    m1(l).guests.push({ id: "gL", name: "Misafir Mert", rating: 3, pos: "" });
    setAtt(m1(l), "gL", "in", true);
    m1(l).cars[0].seats = 5;
    m1(l).cars[0].pax = ["p1", "gL"];
    const r = fork(b, TR);
    m1(r).guests.push({ id: "gR", name: "Misafir Rıza", rating: 4, pos: "GK", host: "p1" });
    setAtt(m1(r), "gR", "in", true);
    m1(r).cars[0].fuel = 600;
    m1(r).cars[0].pax = ["p1", "p2"];
    const m = m1(merge3(b, l, r));
    expect(ids(m.guests)).toEqual(["gL", "gR"]);
    expect(m.order).toEqual(["p0", "p1", "gL", "gR"]);
    expect(m.cars).toEqual([{ id: "c1", driver: "p0", seats: 5, pax: ["p1", "p2"], fuel: 600, toll: 0 }]);
  });

  it("kalıtılan adlara benzeyen anahtarlar da birleşir (constructor, toString)", () => {
    const b = base();
    const l = fork(b, TL);
    m1(l).agree = { toString: "Yerel" };
    const r = fork(b, TR);
    m1(r).agree = { constructor: "Uzak" };
    expect(m1(merge3(b, l, r)).agree).toEqual({ toString: "Yerel", constructor: "Uzak" });
  });

  it("girdileri değiştirmez; normalize edilmiş sonuç döner", () => {
    const b = base();
    const l = fork(b, TL);
    setAtt(m1(l), "p2", "in", true);
    const r = fork(b, TR);
    r.players.push(player("pR", "Uzak Ufuk"));
    const snap = JSON.stringify([b, l, r]);
    const out = merge3(b, l, r);
    expect(JSON.stringify([b, l, r])).toBe(snap);
    expect(normalize(clone(out))).toEqual(out);
  });

  it("daha yeni bir uygulamanın verisi reddedilir", () => {
    const b = base();
    const r = fork(b, TR);
    r.v = 99;
    expect(() => merge3(b, fork(b, TL), r)).toThrow(BackupError);
  });
});

describe("ilk katılım (base yok)", () => {
  const NOW = new Date(2026, 9, 9, 12, 0);

  it("yerelde organizatör verisi yoksa uzak durum olduğu gibi alınır", () => {
    const local = migrate(state());
    local.settings.lang = "en";
    ensureUpcoming(local, NOW); // yanıtsız otomatik maçlar veri sayılmaz
    local.updatedAt = 9_000;
    const remote = base();
    remote.payments = [pay("pay1", "p0")];
    expect(merge3(null, local, remote)).toEqual(remote);
  });

  it("iki tarafta da veri varsa birleşim; çatışmalar uzak lehine", () => {
    const local = migrate(state([player("p0", "Eski Ad", 2), player("pA", "Yerel Ali")], [], { price: 2500, iban: "" }));
    local.settings.templates = { invite: "Yerel davet" };
    local.payments = [pay("payL", "pA", "")];
    local.updatedAt = 9_000; // yerel daha yeni olsa da uzak esas alınır
    const remote = migrate(state([player("p0", "Ortak Oğuz", 4), player("p1", "Uzak Umut")], [], { price: 3400, iban: "TR00 0000 0000 0000 0000 0000 02" }));
    remote.settings.templates = { squad: "Uzak kadro" };
    remote.updatedAt = 1_000;
    const out = merge3(null, local, remote);
    expect(ids(out.players)).toEqual(["p0", "p1", "pA"]);
    expect(pl(out, "p0")).toMatchObject({ name: "Ortak Oğuz", rating: 4 });
    expect(out.settings.price).toBe(3400);
    expect(out.settings.iban).toBe("TR00 0000 0000 0000 0000 0000 02");
    expect(out.settings.templates).toEqual({ squad: "Uzak kadro", invite: "Yerel davet" });
    expect(ids(out.payments)).toEqual(["payL"]);
    expect(out.updatedAt).toBe(9_000);
  });

  it("uzakta henüz veri yoksa (boş depo) yerel ayarlar korunur", () => {
    const local = base();
    local.settings.price = 2800;
    const remote = migrate(state());
    remote.updatedAt = 5_000;
    const out = merge3(null, local, remote);
    expect(out.settings.price).toBe(2800);
    expect(ids(out.players)).toEqual(["p0", "p1", "p2", "p3"]);
  });
});

describe("otomatik maçlar", () => {
  const NOW = new Date(2026, 9, 9, 12, 0);

  it("iki cihazın ayrı ayrı oluşturduğu maçlar aynı kimlikle teke iner, sabit oyuncular birleşir", () => {
    const b = migrate(state([player("p0", "Sabit Sinan", 3, "", { fixed: true }), player("p1", "Oyuncu Bir")]));
    const l = fork(b, TL);
    ensureUpcoming(l, NOW);
    const r = fork(b, TR);
    r.players[1].fixed = true;
    ensureUpcoming(r, NOW);
    const out = merge3(b, l, r);
    expect(ids(out.matches)).toEqual(["a202610132100", "a202610152100", "a202610202100", "a202610222100"]);
    out.matches.forEach((m) => {
      expect(m.att).toEqual({ p0: "in", p1: "in" });
      expect(m.order).toEqual(["p0", "p1"]);
    });
  });

  it("eski (rastgele kimlikli) kopyalar teke iner: yanıtlar taşınır, veri çok olan kalır", () => {
    const b = base();
    const slot = { auto: true, date: "2026-10-15", time: "21:00" };
    const l = fork(b, TL);
    l.matches.push(match("xL", { ...slot, att: { p0: "in", p2: "maybe" }, order: ["p0"] }));
    const r = fork(b, TR);
    r.matches.push(match("xR", { ...slot, att: { p1: "in" }, order: ["p1"], reserved: true }));
    for (const out of [merge3(b, l, r), merge3(b, r, l)]) {
      const autos = out.matches.filter((m) => m.auto);
      expect(autos).toHaveLength(1);
      expect(autos[0].id).toBe("xL");
      expect(autos[0].att).toEqual({ p0: "in", p2: "maybe", p1: "in" });
      expect(autos[0].order).toEqual(["p0", "p1"]);
      expect(autos[0].reserved).toBe(true);
    }
  });

  it("birleşen kopyadaki saha, ücret ve sabit oyuncunun 'Yok'u kaybolmaz", () => {
    const b = migrate(state([player("p0", "Sabit Sinan", 3, "", { fixed: true }), player("p1", "Oyuncu Bir"), player("p2", "Oyuncu İki")]));
    b.updatedAt = T0;
    const slot = { auto: true, date: "2026-10-15", time: "21:00" };
    const l = fork(b, TL);
    l.matches.push(match("xL", { ...slot, price: 3600, fieldId: "f1", att: { p0: "out" } }));
    const r = fork(b, TR);
    r.matches.push(match("xR", { ...slot, att: { p0: "in", p1: "in", p2: "in" }, order: ["p0", "p1", "p2"] }));
    for (const out of [merge3(b, l, r), merge3(b, r, l)]) {
      const autos = out.matches.filter((m) => m.auto);
      expect(autos).toHaveLength(1);
      expect(autos[0]).toMatchObject({ id: "xR", price: 3600, fieldId: "f1" });
      expect(autos[0].att).toEqual({ p0: "out", p1: "in", p2: "in" });
      expect(autos[0].order).toEqual(["p1", "p2"]);
    }
  });

  it("aynı cihazda zaten birlikte duran iki otomatik maç (ör. ikinci saha) birleştirilmez", () => {
    const b = base();
    b.matches.push(match("a202610132100", { auto: true, date: "2026-10-13", fieldId: "f1", price: 3000, att: { p0: "in" }, order: ["p0"] }));
    b.matches.push(match("a202610152100", { auto: true, date: "2026-10-15", fieldId: "f2", price: 2500, note: "İkinci saha", att: { p1: "in" }, order: ["p1"] }));
    // Yerel: salı maçı perşembe 21:00'e taşındı (rememberSkip ile eski zaman atlanır)
    const l = fork(b, TL);
    l.matches[1].date = "2026-10-15";
    l.skipped.push("2026-10-13 21:00");
    // Uzak: ilgisiz bir değişiklik
    const r = fork(b, TR);
    r.players[2].name = "Yeni Ad";
    for (const out of [merge3(b, l, r), merge3(b, r, l)]) {
      expect(ids(out.matches)).toEqual(["m1", "a202610132100", "a202610152100"]);
      expect(out.matches[1]).toMatchObject({ date: "2026-10-15", fieldId: "f1", price: 3000, att: { p0: "in" } });
      expect(out.matches[2]).toMatchObject({ fieldId: "f2", price: 2500, note: "İkinci saha", att: { p1: "in" } });
    }
  });

  it("veri eşitse zamandan türetilen kimlikli maç kalır", () => {
    const b = base();
    const slot = { auto: true, date: "2026-10-15", time: "21:00" };
    const l = fork(b, TL);
    l.matches.push(match("eski123", slot));
    const r = fork(b, TR);
    r.matches.push(match("a202610152100", slot));
    expect(ids(merge3(b, l, r).matches)).toEqual(["m1", "a202610152100"]);
  });

  it("ödeme ya da borç kaydı bağlı kopyalar silinmez (ikisi de kalır)", () => {
    const b = base();
    const slot = { auto: true, date: "2026-10-15", time: "21:00" };
    const l = fork(b, TL);
    l.matches.push(match("xL", { ...slot, att: { p0: "in" }, order: ["p0"] }));
    l.payments.push(pay("payL", "p0", "xL"));
    const r = fork(b, TR);
    r.matches.push(match("xR", { ...slot, att: { p1: "in" }, order: ["p1"] }));
    r.charges.push({ id: "c1", pid: "p1", amount: 150, at: "2026-10-15", note: "Ek top", mid: "xR" });
    const out = merge3(b, l, r);
    expect(ids(out.matches)).toEqual(["m1", "xL", "xR"]);
    // Yalnızca biri bağlıysa diğeri ona katılır (bağlı kayıt bozulmaz)
    r.charges = [];
    const out2 = merge3(b, l, r);
    expect(ids(out2.matches)).toEqual(["m1", "xL"]);
    expect(out2.matches[1].att).toEqual({ p0: "in", p1: "in" });
  });

  it("oynanmış ya da otomatik olmayan maçlar birleştirilmez", () => {
    const b = base();
    const slot = { date: "2026-10-15", time: "21:00" };
    const l = fork(b, TL);
    l.matches.push(match("xL", { ...slot, auto: true, status: "played" }));
    l.matches.push(match("yL", slot));
    const r = fork(b, TR);
    r.matches.push(match("xR", { ...slot, auto: true, status: "played" }));
    r.matches.push(match("yR", slot));
    expect(ids(merge3(b, l, r).matches)).toEqual(["m1", "xL", "yL", "xR", "yR"]);
  });
});

describe("iki cihazın ayrı ayrı oluşturduğu otomatik maç (tabanda yok)", () => {
  const NOW = new Date(2026, 9, 9, 12, 0);
  const S13 = "a202610132100", S15 = "a202610152100", S20 = "a202610202100", S22 = "a202610222100";
  /** 5 oyuncu, p0 sabit; son eşitleme yeni maç günleri pencereye girmeden önce (henüz maç yok). */
  function stale(): State {
    const ps = roster(5);
    ps[0].fixed = true;
    const s = migrate(state(ps));
    s.updatedAt = T0;
    return s;
  }
  const at = (s: State, id: string) => s.matches.find((m) => m.id === id);

  /** Telefon maçları oluşturur ve düzenler: rezervasyon, not, ücret, sabit oyuncu "Yok", takımlar, iptal, taşıma. */
  function phoneEdits(b: State): State {
    const phone = fork(b, TL);
    ensureUpcoming(phone, NOW);
    const m = at(phone, S13)!;
    setAtt(m, "p0", "out", true);
    setAtt(m, "p1", "in", true);
    setAtt(m, "p2", "in", true);
    m.reserved = true;
    m.note = "Kramponsuz gelin";
    m.price = 3600;
    m.teams = { a: ["p1"], b: ["p2"] };
    at(phone, S15)!.status = "cancelled";
    phone.skipped.push("2026-10-20 21:00"); // rememberSkip: taşınan maçın eski zamanı
    at(phone, S20)!.date = "2026-10-21";
    return phone;
  }

  function expectPhoneEdits(out: State): void {
    const m = at(out, S13)!;
    expect(m).toMatchObject({ reserved: true, note: "Kramponsuz gelin", price: 3600, status: "open", teams: { a: ["p1"], b: ["p2"] } });
    expect(m.att).toEqual({ p0: "out", p1: "in", p2: "in" });
    expect(lineup(out, m).playing).toEqual(["p1", "p2"]);
    expect(at(out, S15)!.status).toBe("cancelled");
    expect(at(out, S20)!.date).toBe("2026-10-21");
    expect(out.matches.filter((x) => x.date === "2026-10-20")).toEqual([]);
    expect(at(out, S22)!.att).toEqual({ p0: "in" });
    expect(ensureUpcoming(clone(out), NOW)).toEqual([]);
  }

  it("eşitlemeden önce aynı maçları oluşturan (daha yeni) cihazın dokunulmamış kopyası düzenlemeleri ezmez", () => {
    const b = stale();
    const phone = phoneEdits(b);
    const pc = fork(b, TR); // açılışta autoSchedule: aynı kimlikler, varsayılan değerler
    ensureUpcoming(pc, NOW);
    expectPhoneEdits(merge3(b, pc, phone));
    expectPhoneEdits(merge3(b, phone, pc));
  });

  it("iki cihazda da düzenlenen alan gerçek çatışmadır: yeni olan kazanır, diğer alanlar korunur", () => {
    const b = stale();
    const phone = phoneEdits(b);
    const pc = fork(b, TR);
    ensureUpcoming(pc, NOW);
    at(pc, S13)!.note = "Forma getir";
    at(pc, S22)!.reserved = true;
    for (const out of [merge3(b, pc, phone), merge3(b, phone, pc)]) {
      expect(at(out, S13)).toMatchObject({ note: "Forma getir", reserved: true, price: 3600 });
      expect(at(out, S22)!.reserved).toBe(true);
    }
  });

  it("ilk katılımda da (taban yok) yalnızca bir cihazda yapılan düzenleme kalır", () => {
    const b = stale();
    const phone = phoneEdits(b);
    const pc = fork(b, TR);
    ensureUpcoming(pc, NOW);
    expectPhoneEdits(merge3(null, phone, pc));
    expectPhoneEdits(merge3(null, pc, phone));
  });

  it("bir cihazda silinen otomatik maç, diğerinin dokunulmamış kopyasıyla geri gelmez (sabit oyunculara borç yazılmaz)", () => {
    const b = stale();
    b.players[1].fixed = true;
    const phone = fork(b, TL);
    ensureUpcoming(phone, NOW);
    phone.skipped.push("2026-10-13 21:00"); // rememberSkip
    phone.matches = phone.matches.filter((m) => m.id !== S13);
    const pc = fork(b, TR);
    ensureUpcoming(pc, NOW);
    for (const out of [merge3(b, pc, phone), merge3(b, phone, pc)]) {
      expect(at(out, S13)).toBeUndefined();
      expect(ids(out.matches)).toEqual(expect.arrayContaining([S15, S20, S22]));
      const acc = accounts(out, "2026-10-14");
      expect(acc.get("p0")?.owed ?? 0).toBe(0);
      expect(acc.get("p1")?.owed ?? 0).toBe(0);
      expect(ensureUpcoming(clone(out), NOW)).toEqual([]);
    }
    // Diğer cihazda düzenlendiyse silme ↔ düzenleme: düzenleme kalır
    setAtt(at(pc, S13)!, "p3", "in", true);
    expect(at(merge3(b, pc, phone), S13)!.att).toEqual({ p0: "in", p1: "in", p3: "in" });
    expect(at(merge3(b, phone, pc), S13)!.att).toEqual({ p0: "in", p1: "in", p3: "in" });
  });
});

/** Maçı bitirir (handlers.finish ile aynı sıra). */
function finish(s: State, m: Match): void {
  materializeOrder(s, m);
  m.status = "played";
  freezeBill(s, m);
}

describe("yazılma sırası: bir cihazda sona geçen kişi", () => {
  it("uzakta çıkıp yeniden yazılan, yerelde biri eklense de sona geçer; kim oynar cihaza göre değişmez", () => {
    const b = migrate(state(roster(5), [allIn(match("m1", { kind: "other", cap: 3 }), ["p0", "p1", "p2", "p3"])]));
    b.updatedAt = T0;
    const pc = fork(b, TR);
    setAtt(m1(pc), "p0", "out", true);
    setAtt(m1(pc), "p0", "in", true);
    const phone = fork(b, TL);
    setAtt(m1(phone), "p4", "in", true);
    const a = merge3(b, phone, pc), c = merge3(b, pc, phone);
    expect(m1(a).order).toEqual(["p1", "p2", "p3", "p4", "p0"]);
    expect(m1(c).order).toEqual(["p1", "p2", "p3", "p0", "p4"]);
    for (const out of [a, c]) expect(lineup(out, m1(out)).playing).toEqual(["p1", "p2", "p3"]);
  });

  it("halı saha: kadroya giren yedek, diğer cihazdaki yeni kayıtla yedeğe düşmez", () => {
    const ids17 = Array.from({ length: 17 }, (_, i) => "p" + i);
    const b = migrate(state(roster(18), [allIn(match("m1"), ids17)]));
    b.updatedAt = T0;
    const r = fork(b, TR);
    setAtt(m1(r), "p0", "out", true);
    setAtt(m1(r), "p0", "in", true);
    const l = fork(b, TL);
    setAtt(m1(l), "p17", "in", true);
    for (const out of [merge3(b, l, r), merge3(b, r, l)]) {
      const { playing, wait } = lineup(out, m1(out));
      expect(playing).toEqual(ids17.slice(1));
      expect([...wait].sort()).toEqual(["p0", "p17"]);
    }
  });

  it("maç bitince kalıcılaşan 1.6 sırası diğer cihazın eklemesiyle bozulmaz; ödeme listesi kadroyla tutarlı", () => {
    const prev = match("m0", { date: "2026-10-06", status: "played", noshow: { p0: true } });
    const b = migrate(state(roster(6), [prev, allIn(match("m1", { format: 1 }), ["p0", "p1", "p2", "p3", "p4"])]));
    b.updatedAt = T0;
    expect(lineup(b, m1(b)).playing).toEqual(["p1", "p2", "p3", "p4"]);
    const A = fork(b, TL);
    finish(A, m1(A));
    const B = fork(b, TR);
    setAtt(m1(B), "p5", "in", true);
    for (const out of [merge3(b, A, B), merge3(b, B, A)]) {
      const m = m1(out);
      expect(m.status).toBe("played");
      expect(m.order).toEqual(["p1", "p2", "p3", "p4", "p5", "p0"]);
      expect(lineup(out, m).playing).toEqual(["p1", "p2", "p3", "p4"]);
      expect(m.bill).toEqual({ payers: ["p1", "p2", "p3", "p4"], share: 750 });
    }
  });
});

describe("donmuş ödeme listesi (maç bir cihazda bitirildi)", () => {
  it("diğer cihazda katılım değiştiyse liste birleşik veriden yeniden hesaplanır", () => {
    const b = migrate(state(roster(5), [allIn(match("m1", { date: "2026-10-06", price: 400 }), ["p0", "p1", "p2", "p3"])], { gkFree: false, round: false }));
    b.updatedAt = T0;
    const A = fork(b, TL);
    finish(A, m1(A));
    expect(m1(A).bill).toEqual({ payers: ["p0", "p1", "p2", "p3"], share: 100 });
    const B = fork(b, TR);
    setAtt(m1(B), "p3", "out", true);
    setAtt(m1(B), "p4", "in", true);
    for (const out of [merge3(b, A, B), merge3(b, B, A)]) {
      expect(m1(out).bill).toEqual({ payers: ["p0", "p1", "p2", "p4"], share: 100 });
      const acc = accounts(out, "2026-10-14");
      expect(acc.get("p3")?.owed ?? 0).toBe(0);
      expect(acc.get("p4")!.owed).toBe(100);
    }
  });

  it("diğer cihazdaki muafiyet ve geç iptal (geç iptal öder) listeye yansır", () => {
    const b = migrate(state(roster(6), [allIn(match("m1", { date: "2026-10-06", price: 3000 }), ["p0", "p1", "p2", "p3", "p4"])]));
    b.updatedAt = T0;
    const phone = fork(b, TL);
    finish(phone, m1(phone));
    expect(m1(phone).bill!.share).toBe(600);
    const pc = fork(b, TR);
    m1(pc).exempt.p3 = true;
    setAtt(m1(pc), "p5", "late", true);
    for (const out of [merge3(b, phone, pc), merge3(b, pc, phone)]) {
      expect(m1(out).bill).toEqual({ payers: ["p0", "p1", "p2", "p4", "p5"], share: 600 });
      expect(billOf(out, m1(out)).payers).not.toContain("p3");
    }
  });

  it("diğer cihaz maçın girdilerine dokunmadıysa liste aynen kalır (ayar ya da oyuncu değişse bile)", () => {
    const b = migrate(state(roster(5), [allIn(match("m1", { date: "2026-10-06", price: 400 }), ["p0", "p1", "p2", "p3"])], { round: false }));
    b.updatedAt = T0;
    const A = fork(b, TL);
    finish(A, m1(A));
    const B = fork(b, TR);
    B.players[0].pos = "GK"; // kaleci ücretsiz: yeniden hesaplansa p0 listeden çıkardı
    B.settings.price = 3600;
    for (const out of [merge3(b, A, B), merge3(b, B, A)]) expect(m1(out).bill).toEqual({ payers: ["p0", "p1", "p2", "p3"], share: 100 });
  });
});

describe("'Ödedi' iki cihazda", () => {
  const four = () => {
    const b = migrate(state(roster(4), [allIn(match("m1", { date: "2026-10-06", price: 1200 }), ["p0", "p1", "p2", "p3"])]));
    b.updatedAt = T0;
    return b;
  };

  it("aynı borç için iki cihazda basılan 'Ödedi' tek ödeme olur; elle girilen ödemeler ikisi de kalır", () => {
    const b = four();
    const phone = fork(b, TL);
    markPaid(phone, m1(phone), "p0", "2026-10-06");
    phone.payments.push({ id: "elle-1", pid: "p1", amount: 300, at: "2026-10-06" });
    const pc = fork(b, TR);
    markPaid(pc, m1(pc), "p0", "2026-10-07");
    pc.payments.push({ id: "elle-2", pid: "p1", amount: 300, at: "2026-10-07" });
    const first = [phone.payments[0].id, pc.payments[0].id].sort()[0];
    for (const out of [merge3(b, phone, pc), merge3(b, pc, phone)]) {
      expect(out.payments.filter((p) => p.pid === "p0").map((p) => p.id)).toEqual([first]);
      expect(accounts(out, "2026-10-14").get("p0")).toMatchObject({ paidTotal: 300, credit: 0, owed: 0 });
      expect(out.payments.filter((p) => p.pid === "p1")).toHaveLength(2);
    }
  });

  it("'Hepsi ödedi' iki cihazda: herkese tek ödeme, kasa doğru", () => {
    const b = four();
    const allPaid = (s: State, today: string) => billOf(s, m1(s)).payers.forEach((id) => markPaid(s, m1(s), id, today));
    const phone = fork(b, TL);
    allPaid(phone, "2026-10-06");
    const pc = fork(b, TR);
    allPaid(pc, "2026-10-07");
    for (const out of [merge3(b, phone, pc), merge3(b, pc, phone)]) {
      expect(out.payments).toHaveLength(4);
      expect(cashAt(out)).toBe(1200);
      for (const a of accounts(out, "2026-10-14").values()) expect(a).toMatchObject({ paidTotal: 300, credit: 0, owed: 0 });
    }
  });
});

describe("ilk katılım: ayarlar", () => {
  it("yalnızca bir cihazda değiştirilen ayar korunur (uzaktaki IBAN ve ücret, yereldeki hatırlatma günü)", () => {
    const remote = migrate(state([], [], { iban: "TR00 0000 0000 0000 0000 0000 04", ibanName: "Organizatör Osman", price: 3600 }));
    remote.updatedAt = 5_000;
    const local = migrate(state(roster(3), [], { reserveDays: 3 }));
    local.updatedAt = 1_000;
    const out = merge3(null, local, remote);
    expect(out.settings).toMatchObject({ iban: "TR00 0000 0000 0000 0000 0000 04", ibanName: "Organizatör Osman", price: 3600, reserveDays: 3 });
    expect(ids(out.players)).toEqual(["p0", "p1", "p2"]);
    // İki cihazda farklı değiştirilen ayar: uzak kazanır
    local.settings.price = 2500;
    expect(merge3(null, local, remote).settings.price).toBe(3600);
  });
});

describe("cebirsel özellikler", () => {
  function edited(): { b: State; x: State } {
    const b = base();
    const x = fork(b, TL);
    x.players.push(player("pX", "Yeni Yiğit"));
    setAtt(m1(x), "pX", "in", true);
    setAtt(m1(x), "p0", "out", true);
    x.payments.push(pay("payX", "p1"));
    x.skipped.push("2026-10-20 21:00");
    m1(x).teams = { a: ["p1"], b: ["pX"] };
    return { b, x };
  }

  it("idempotent: merge3(b, x, x) = x; merge3(x, x, x) = x; merge3(null, x, x) = x", () => {
    const { b, x } = edited();
    expect(merge3(b, x, x)).toEqual(x);
    expect(merge3(x, x, x)).toEqual(x);
    expect(merge3(null, x, x)).toEqual(x);
    const once = merge3(b, x, fork(b, TR));
    expect(merge3(once, once, once)).toEqual(once);
  });

  it("çatışmasız değişikliklerde taraflar yer değiştirse de sonuç aynı", () => {
    const b = base();
    b.payments = [pay("pay1", "p0")];
    const l = fork(b, TL);
    l.settings.price = 3300;
    l.players[0].name = "Değişen Deniz";
    setAtt(m1(l), "p2", "maybe", true);
    l.skipped.push("2026-10-20 21:00");
    const r = fork(b, TR);
    r.settings.iban = "TR00 0000 0000 0000 0000 0000 03";
    r.players[1].rating = 5;
    r.payments[0].amount = 500;
    setAtt(m1(r), "p0", "out", true);
    expect(merge3(b, l, r)).toEqual(merge3(b, r, l));
    // İki tarafta ekleme: içerik aynı, yalnızca liste sırası farklı olabilir
    l.players.push(player("pL", "Yerel Levent"));
    r.players.push(player("pR", "Uzak Rüzgar"));
    const sortP = (s: State) => ({ ...s, players: [...s.players].sort((a, c) => a.id.localeCompare(c.id)) });
    expect(sortP(merge3(b, l, r))).toEqual(sortP(merge3(b, r, l)));
  });
});

/* ---------- Rastgele özellik testi ---------- */

type Rnd = () => number;
const pick = <T>(rnd: Rnd, xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);
const int = (rnd: Rnd, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const DATES = ["2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22", "2026-10-27"];
const ATTS: Att[] = ["in", "maybe", "out", "late"];

/** Her cihaz kopyasında sırasına dokunulan kişiler ("maç|kişi"): sıra denetimi için. */
const touchedBy = new WeakMap<State, Set<string>>();
function touch(s: State, m: Match, id: string): void {
  let t = touchedBy.get(s);
  if (!t) touchedBy.set(s, (t = new Set()));
  t.add(m.id + "|" + id);
}
/** setAtt + dokunma kaydı. */
function att(s: State, m: Match, id: string, st: Att, force: boolean): void {
  touch(s, m, id);
  setAtt(m, id, st, force);
}

/** Uygulamadaki işlemlere benzeyen rastgele düzenlemeler (tag: cihaz, n: sıra → benzersiz kimlik). */
const OPS: ((s: State, rnd: Rnd, id: string) => void)[] = [
  (s, _r, id) => s.players.push(player("p" + id, "Oyuncu " + id, 3)),
  (s, r, id) => { const p = pick(r, s.players); if (p) p.name = "Ad " + id; },
  (s, r) => { const p = pick(r, s.players); if (p) p.rating = int(r, 1, 5); },
  (s, r) => { const p = pick(r, s.players); if (p) { if (r() < 0.5) p.active = !p.active; else p.fixed = !p.fixed; } },
  (s, r) => { const p = pick(r, s.players); if (p) s.players = s.players.filter((x) => x !== p); },
  (s, r) => {
    const m = pick(r, s.matches);
    const who = m && pick(r, [...s.players.map((p) => p.id), ...m.guests.map((g) => g.id)]);
    if (m && who) att(s, m, who, pick(r, ATTS)!, r() < 0.7);
  },
  (s, r) => {
    const m = pick(r, s.matches);
    if (m) for (const p of s.players.slice(0, int(r, 1, 4))) att(s, m, p.id, pick(r, ATTS)!, true);
  },
  (s, r) => {
    // Çıkıp yeniden yazılan: sıranın sonuna geçer (Kural 1.3)
    const m = pick(r, s.matches);
    const who = m && pick(r, m.order);
    if (!m || !who) return;
    att(s, m, who, "out", true);
    att(s, m, who, "in", true);
  },
  (s, r, id) => {
    const m = pick(r, s.matches);
    if (!m) return;
    m.guests.push({ id: "g" + id, name: "Misafir " + id, rating: int(r, 1, 5), pos: "" });
    att(s, m, "g" + id, "in", true);
  },
  (s, r) => {
    // Misafiri çıkar (handlers.rmGuest ile aynı)
    const m = pick(r, s.matches.filter((x) => x.guests.length));
    const g = m && pick(r, m.guests);
    if (!m || !g) return;
    m.guests = m.guests.filter((x) => x !== g);
    delete m.att[g.id];
    m.order = m.order.filter((x) => x !== g.id);
    touch(s, m, g.id);
    s.payments = s.payments.filter((p) => p.pid !== g.id);
  },
  (s, r, id) => {
    const p = pick(r, s.players), m = pick(r, s.matches);
    if (p) s.payments.push({ id: "pay" + id, pid: p.id, amount: int(r, 1, 9) * 100, at: pick(r, DATES)!, ...(m && r() < 0.7 ? { mid: m.id } : {}) });
  },
  (s, r, id) => {
    // "Ödedi": maça bağlı, notsuz, pay kadar; iki cihazda aynı borç için basılabilir
    const p = pick(r, s.players), m = pick(r, s.matches);
    if (p && m) s.payments.push({ id: "pay" + id, pid: p.id, amount: 500, at: pick(r, DATES)!, mid: m.id });
  },
  (s, r) => { const p = pick(r, s.payments); if (p) p.amount = int(r, 1, 9) * 50; },
  (s, r) => { const p = pick(r, s.payments); if (p) s.payments = s.payments.filter((x) => x !== p); },
  (s, r, id) => {
    const k = int(r, 0, 4);
    if (k === 0) s.settings.price = int(r, 20, 40) * 100;
    else if (k === 1) s.settings.format = pick(r, [5, 6, 7, 8])!;
    else if (k === 2) s.settings.lang = s.settings.lang === "tr" ? "en" : "tr";
    else if (k === 3) s.settings.templates[pick(r, ["invite", "squad", "pay"] as const)!] = "Şablon " + id;
    else s.settings.slots = [{ d: int(r, 0, 6), t: "21:00" }];
  },
  (s, r, id) => s.matches.push(match("m" + id, { date: pick(r, DATES)!, price: int(r, 20, 40) * 100 })),
  (s, r) => { const m = pick(r, s.matches); if (m) s.matches = s.matches.filter((x) => x !== m); },
  (s, r, id) => {
    const m = pick(r, s.matches);
    if (!m) return;
    const k = int(r, 0, 3);
    if (k === 0) m.note = "Not " + id;
    else if (k === 1) m.price = int(r, 20, 40) * 100;
    else if (k === 2) m.reserved = !m.reserved;
    else m.status = pick(r, ["open", "played", "cancelled"] as const)!;
  },
  (s, r) => {
    // Takım kur: oynayanlar rastgele iki takıma (bütün değer)
    const m = pick(r, s.matches);
    if (!m) return;
    const play = lineup(s, m).playing;
    const a: string[] = [], b: string[] = [];
    play.forEach((x) => (r() < 0.5 ? a : b).push(x));
    m.teams = { a, b };
  },
  (s, r) => {
    const m = pick(r, s.matches), p = pick(r, s.players);
    if (m && p) m.goals[p.id] = int(r, 1, 3);
  },
  (s, r) => {
    if (r() < 0.6) s.skipped.push("2026-11-" + String(int(r, 10, 28)) + " 21:00");
    else { const k = pick(r, s.skipped); s.skipped = s.skipped.filter((x) => x !== k); }
  },
  (s, r, id) => {
    if (r() < 0.6) s.expenses.push({ id: "e" + id, at: pick(r, DATES)!, amount: int(r, 1, 9) * 50, cat: pick(r, ["ball", "bib", "water", "other"] as const)!, note: "" });
    else { const e = pick(r, s.expenses); s.expenses = s.expenses.filter((x) => x !== e); }
  },
  (s, r, id) => {
    const a = pick(r, s.players), b = pick(r, s.players);
    if (a && b && a !== b && r() < 0.6) s.pairRules.push({ id: "r" + id, a: a.id, b: b.id, together: r() < 0.5 });
    else { const x = pick(r, s.pairRules); s.pairRules = s.pairRules.filter((y) => y !== x); }
  },
  (s, r, id) => {
    const p = pick(r, s.players);
    if (p && r() < 0.6) s.charges.push({ id: "c" + id, pid: p.id, amount: int(r, 1, 5) * 100, at: pick(r, DATES)!, note: "Ek " + id });
    else { const c = pick(r, s.charges); s.charges = s.charges.filter((x) => x !== c); }
  },
];

function randomBase(rnd: Rnd): State {
  const ps = roster(6);
  const ms = [match("m1", { date: "2026-10-13" }), match("m2", { date: "2026-10-15" }), match("m3", { date: "2026-10-08", status: "played" })];
  const s = state(ps, ms);
  for (const m of ms) for (const p of ps) if (rnd() < 0.6) setAtt(m, p.id, pick(rnd, ATTS)!, true);
  s.payments = [pay("pay-a", "p0"), pay("pay-b", "p1", "m3")];
  s.expenses = [{ id: "e-a", at: "2026-10-01", amount: 200, cat: "ball", note: "Top" }];
  s.pairRules = [{ id: "r-a", a: "p0", b: "p1", together: true }];
  s.charges = [{ id: "c-a", pid: "p2", amount: 100, at: "2026-10-08", note: "Yelek" }];
  s.skipped = ["2026-11-03 21:00", "2026-11-05 21:00"];
  const m3 = ms[2];
  const play = lineup(s, m3).playing;
  m3.teams = { a: play.filter((_, i) => i % 2 === 0), b: play.filter((_, i) => i % 2 === 1) };
  const out = migrate(s);
  out.updatedAt = T0;
  return out;
}

function edit(b: State, rnd: Rnd, tag: string, t: number): State {
  const s = fork(b, t);
  const n = int(rnd, 0, 12);
  for (let i = 0; i < n; i++) pick(rnd, OPS)!(s, rnd, tag + i);
  return s;
}

/* Düzleştirme: her yaprak değer bir yol; kayıtlar id ile, sıralı kümeler üye olarak, bütün değerler JSON. */
const ENTITY = new Set(["players", "matches", "payments", "expenses", "pairRules", "fields", "charges", "discipline", "matches.*.guests", "matches.*.cars", "matches.*.games"]);
const SETS = new Set(["skipped", "matches.*.order"]);
const UNITS = new Set(["matches.*.teams", "matches.*.bill", "matches.*.draw", "matches.*.queue", "matches.*.clock"]);
const stable = (x: unknown): string =>
  JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

/** seqs: sıralı kümelerin sırası (yalnızca "kayıt düzenlendi mi" sorusu için; sıra değişikliği de düzenlemedir). */
interface Flat { leaves: Map<string, string>; entities: Set<string>; seqs: Map<string, string> }
function flatten(s: State): Flat {
  const leaves = new Map<string, string>(), entities = new Set<string>(), seqs = new Map<string, string>();
  const walk = (x: unknown, key: string, schema: string): void => {
    if (schema === "updatedAt" || schema === "v" || x === undefined) return;
    if (UNITS.has(schema)) return void leaves.set(key, stable(x));
    if (Array.isArray(x)) {
      if (SETS.has(schema)) {
        seqs.set(key, JSON.stringify(x));
        return x.forEach((v) => leaves.set(key + "/#" + String(v), "1"));
      }
      if (ENTITY.has(schema)) {
        return x.forEach((el: { id: string }) => {
          entities.add(key + "/" + el.id);
          walk(el, key + "/" + el.id, schema + ".*");
        });
      }
      return void leaves.set(key, stable(x));
    }
    if (x && typeof x === "object") {
      for (const [k, v] of Object.entries(x)) walk(v, key ? key + "/" + k : k, schema ? schema + "." + k : k);
      return;
    }
    leaves.set(key, JSON.stringify(x));
  };
  walk(s, "", "");
  return { leaves, entities, seqs };
}

/**
 * İki cihazda ayrı ayrı basılan "Ödedi"nin teke inen kopyaları ("payments/<id>"):
 * base'den sonra yalnızca bir tarafta eklenmiş, notsuz, maça/ek borca bağlı ve
 * sonuçta diğer taraftan aynı kişi + maç + ek borç + tutarlı bir ikizi kalmış olanlar.
 */
function collapsed(b: State, l: State, r: State, out: State): Set<string> {
  const idset = (s: State) => new Set(s.payments.map((p) => p.id));
  const B = idset(b), Li = idset(l), Ri = idset(r), O = idset(out);
  const sig = (p: Payment) => [p.pid, p.mid || "", p.cid || "", p.amount].join("|");
  const fresh = (s: State, other: Set<string>) => s.payments.filter((p) => !B.has(p.id) && !other.has(p.id) && !p.note && (p.mid || p.cid));
  const lo = fresh(l, Ri), ro = fresh(r, Li);
  const gone = new Set<string>();
  for (const [mine, theirs] of [[lo, ro], [ro, lo]]) {
    for (const p of mine) if (!O.has(p.id) && theirs.some((q) => sig(q) === sig(p) && O.has(q.id))) gone.add("payments/" + p.id);
  }
  return gone;
}

/** Tek tarafta yapılıp sonuçta kaybolan düzenlemeleri (ve kural dışı çatışma çözümlerini) listeler. */
function problems(b: State, l: State, r: State, out: State): string[] {
  const B = flatten(b), Lf = flatten(l), Rf = flatten(r), M = flatten(out);
  const errs: string[] = [];
  const twins = collapsed(b, l, r, out);
  const changed = (f: Flat, k: string) => f.leaves.get(k) !== B.leaves.get(k);
  const keys = new Set([...B.leaves.keys(), ...Lf.leaves.keys(), ...Rf.leaves.keys()]);
  // Bir tarafın sildiği, diğerinin düzenlediği kayıt: düzenleyenin hali aynen kalmalı
  const kept: string[] = [];
  for (const [X, Y] of [[Lf, Rf], [Rf, Lf]]) {
    for (const e of B.entities) {
      if (X.entities.has(e) || !Y.entities.has(e)) continue;
      const under = [...keys].filter((k) => k.startsWith(e + "/"));
      const reordered = [...Y.seqs.keys()].some((k) => k.startsWith(e + "/") && Y.seqs.get(k) !== B.seqs.get(k));
      if (!reordered && !under.some((k) => changed(Y, k))) continue;
      kept.push(e);
      for (const k of under) if (M.leaves.get(k) !== Y.leaves.get(k)) errs.push("silinen ama düzenlenen kayıt kayboldu: " + k);
    }
  }
  const lWins = l.updatedAt > r.updatedAt;
  for (const k of keys) {
    if (kept.some((e) => k.startsWith(e + "/")) || [...twins].some((e) => k.startsWith(e + "/"))) continue;
    const lc = changed(Lf, k), rc = changed(Rf, k);
    if (!lc && !rc) continue;
    const ord = /^matches\/([^/]+)\/order\/#(.+)$/.exec(k);
    // Yanıtı iki tarafta da değişen kişinin sıradaki yeri, kazanan yanıta göre belirlenir
    if (ord) {
      const ak = "matches/" + ord[1] + "/att/" + ord[2];
      if (changed(Lf, ak) && changed(Rf, ak)) continue;
    }
    const lv = Lf.leaves.get(k), rv = Rf.leaves.get(k);
    let want: string | undefined;
    if (lc && !rc) want = lv;
    else if (rc && !lc) want = rv;
    else if (lv === rv) want = lv;
    else if (lv === undefined) want = rv;
    else if (rv === undefined) want = lv;
    else want = lWins ? lv : rv;
    if (M.leaves.get(k) !== want) errs.push(k + ": beklenen " + want + ", gelen " + M.leaves.get(k));
  }
  return errs;
}

/**
 * Sıra konumları: base'deki iki kişiden hiçbirine dokunulmadıysa base sırası, yalnızca
 * bir cihaz dokunduysa (çıkıp yeniden yazılma, sona geçme) o cihazdaki göreli sıra
 * korunmalı. Döndürür: [hatalar, tek taraflı denetlenen çift sayısı].
 */
function orderProblems(b: State, l: State, r: State, out: State): [string[], number] {
  const errs: string[] = [];
  let oneSided = 0;
  const tl = touchedBy.get(l) || new Set<string>(), tr = touchedBy.get(r) || new Set<string>();
  const pos = (xs: string[]) => new Map(xs.map((x, i) => [x, i]));
  for (const bm of b.matches) {
    const lm = l.matches.find((m) => m.id === bm.id), rm = r.matches.find((m) => m.id === bm.id), om = out.matches.find((m) => m.id === bm.id);
    if (!lm || !rm || !om) continue;
    const Bp = pos(bm.order), Lp = pos(lm.order), Rp = pos(rm.order), Op = pos(om.order);
    const common = bm.order.filter((x) => Lp.has(x) && Rp.has(x) && Op.has(x));
    for (let i = 0; i < common.length; i++) {
      for (let j = i + 1; j < common.length; j++) {
        const e = common[i], f = common[j];
        const by = (t: Set<string>) => t.has(bm.id + "|" + e) || t.has(bm.id + "|" + f);
        const byL = by(tl), byR = by(tr);
        if (byL && byR) continue;
        const src = byL ? Lp : byR ? Rp : Bp;
        if (byL || byR) oneSided++;
        if (src.get(e)! < src.get(f)! !== Op.get(e)! < Op.get(f)!) errs.push(bm.id + ": " + e + "/" + f + " sırası " + (byL ? "yerel" : byR ? "uzak" : "base") + " ile uyuşmuyor");
      }
    }
  }
  return [errs, oneSided];
}

function invariants(s: State): string[] {
  const errs: string[] = [];
  for (const m of s.matches as Match[]) {
    if (new Set(m.order).size !== m.order.length) errs.push(m.id + ": sırada tekrar");
    if (m.order.some((id) => m.att[id] !== "in")) errs.push(m.id + ": sırada 'Var' olmayan");
    if (Object.keys(m.att).some((id) => m.att[id] === "in" && !m.order.includes(id))) errs.push(m.id + ": sırada olmayan 'Var'");
    if (m.teams.a.some((id) => m.teams.b.includes(id))) errs.push(m.id + ": iki takımda birden");
  }
  if (new Set(s.matches.map((m) => m.id)).size !== s.matches.length) errs.push("tekrarlanan maç kimliği");
  return errs;
}

describe("rastgele özellik testi (tohumlu)", () => {
  it("tek tarafta yapılan hiçbir düzenleme kaybolmaz; sonuç normalize'dan geçer ve değişmezler korunur", () => {
    let cases = 0, oneSided = 0, twins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = seeded(seed);
      const b = randomBase(rnd);
      for (let i = 0; i < 20; i++) {
        const tl = int(rnd, 1_001, 1_010), tr = int(rnd, 1_001, 1_010);
        const l = edit(b, rnd, "L" + i + "_", tl);
        const r = edit(b, rnd, "R" + i + "_", tr);
        const snap = JSON.stringify([b, l, r]);
        const out = merge3(b, l, r);
        const where = "tohum " + seed + ", deneme " + i;
        expect(JSON.stringify([b, l, r]), where).toBe(snap);
        expect(() => normalize(clone(out)), where).not.toThrow();
        expect(normalize(clone(out)), where).toEqual(out);
        expect(problems(b, l, r, out), where).toEqual([]);
        const [orderErrs, n] = orderProblems(b, l, r, out);
        expect(orderErrs, where).toEqual([]);
        oneSided += n;
        twins += collapsed(b, l, r, out).size;
        expect(invariants(out), where).toEqual([]);
        expect(out.updatedAt, where).toBe(Math.max(tl, tr));
        // Sonuç üzerinde yeniden birleştirme hiçbir şeyi değiştirmez
        expect(merge3(out, out, out), where).toEqual(out);
        cases++;
      }
    }
    expect(cases).toBe(1200);
    // Denetimler gerçekten çalıştı: tek taraflı sıra değişikliği ve teke inen "Ödedi" görüldü
    expect(oneSided).toBeGreaterThan(0);
    expect(twins).toBeGreaterThan(0);
  });
});
