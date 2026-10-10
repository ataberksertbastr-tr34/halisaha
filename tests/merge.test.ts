/** Cihazlar arası eşitleme: 3 yönlü birleştirme (merge3) ve uzlaştırma. Tüm isimler uydurmadır. */
import { describe, expect, it } from "vitest";
import { merge3, reconcile } from "../src/sync/merge";
import { BackupError, migrate, normalize } from "../src/domain/migrate";
import { ensureUpcoming, slotId } from "../src/domain/schedule";
import { lineup, setAtt } from "../src/domain/lineup";
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
    r.matches.push(match(slotId("2026-10-15", "21:00"), { ...slot }));
    const out = merge3(b, l, r);
    const autos = out.matches.filter((m) => m.auto);
    expect(autos).toHaveLength(1);
    expect(autos[0].id).toBe("xL");
    expect(autos[0].att).toEqual({ p0: "in", p2: "maybe", p1: "in" });
    expect(autos[0].order).toEqual(["p0", "p1"]);
    expect(autos[0].reserved).toBe(true);
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
    if (m && who) setAtt(m, who, pick(r, ATTS)!, r() < 0.7);
  },
  (s, r) => {
    const m = pick(r, s.matches);
    if (m) for (const p of s.players.slice(0, int(r, 1, 4))) setAtt(m, p.id, pick(r, ATTS)!, true);
  },
  (s, r, id) => {
    const m = pick(r, s.matches);
    if (!m) return;
    m.guests.push({ id: "g" + id, name: "Misafir " + id, rating: int(r, 1, 5), pos: "" });
    setAtt(m, "g" + id, "in", true);
  },
  (s, r) => {
    // Misafiri çıkar (handlers.rmGuest ile aynı)
    const m = pick(r, s.matches.filter((x) => x.guests.length));
    const g = m && pick(r, m.guests);
    if (!m || !g) return;
    m.guests = m.guests.filter((x) => x !== g);
    delete m.att[g.id];
    m.order = m.order.filter((x) => x !== g.id);
    s.payments = s.payments.filter((p) => p.pid !== g.id);
  },
  (s, r, id) => {
    const p = pick(r, s.players), m = pick(r, s.matches);
    if (p) s.payments.push({ id: "pay" + id, pid: p.id, amount: int(r, 1, 9) * 100, at: pick(r, DATES)!, ...(m && r() < 0.7 ? { mid: m.id } : {}) });
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

interface Flat { leaves: Map<string, string>; entities: Set<string> }
function flatten(s: State): Flat {
  const leaves = new Map<string, string>(), entities = new Set<string>();
  const walk = (x: unknown, key: string, schema: string): void => {
    if (schema === "updatedAt" || schema === "v" || x === undefined) return;
    if (UNITS.has(schema)) return void leaves.set(key, stable(x));
    if (Array.isArray(x)) {
      if (SETS.has(schema)) return x.forEach((v) => leaves.set(key + "/#" + String(v), "1"));
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
  return { leaves, entities };
}

/** Tek tarafta yapılıp sonuçta kaybolan düzenlemeleri (ve kural dışı çatışma çözümlerini) listeler. */
function problems(b: State, l: State, r: State, out: State): string[] {
  const B = flatten(b), Lf = flatten(l), Rf = flatten(r), M = flatten(out);
  const errs: string[] = [];
  const changed = (f: Flat, k: string) => f.leaves.get(k) !== B.leaves.get(k);
  const keys = new Set([...B.leaves.keys(), ...Lf.leaves.keys(), ...Rf.leaves.keys()]);
  // Bir tarafın sildiği, diğerinin düzenlediği kayıt: düzenleyenin hali aynen kalmalı
  const kept: string[] = [];
  for (const [X, Y] of [[Lf, Rf], [Rf, Lf]]) {
    for (const e of B.entities) {
      if (X.entities.has(e) || !Y.entities.has(e)) continue;
      const under = [...keys].filter((k) => k.startsWith(e + "/"));
      if (!under.some((k) => changed(Y, k))) continue;
      kept.push(e);
      for (const k of under) if (M.leaves.get(k) !== Y.leaves.get(k)) errs.push("silinen ama düzenlenen kayıt kayboldu: " + k);
    }
  }
  const lWins = l.updatedAt > r.updatedAt;
  for (const k of keys) {
    if (kept.some((e) => k.startsWith(e + "/"))) continue;
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
    let cases = 0;
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
        expect(invariants(out), where).toEqual([]);
        expect(out.updatedAt, where).toBe(Math.max(tl, tr));
        // Sonuç üzerinde yeniden birleştirme hiçbir şeyi değiştirmez
        expect(merge3(out, out, out), where).toEqual(out);
        cases++;
      }
    }
    expect(cases).toBe(1200);
  });
});
