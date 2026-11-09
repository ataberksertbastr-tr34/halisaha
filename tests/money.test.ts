/** Kişi başı pay, yuvarlama ve borç hesabı (Kural 1.5, 1.9, 2.1, 2.2, 2.4). */
import { describe, expect, it } from "vitest";
import { estShare, isDue, lateToCover, payersOf, replaceLate, roundShare, shareOf } from "../src/domain/money";
import { lineup, setAtt } from "../src/domain/lineup";
import type { Att, Match, State } from "../src/domain/types";
import { debts, newPayment } from "../src/domain/ledger";
import { allIn, match, player, roster, state } from "./helpers/factory";

describe("yuvarlama (Kural 2.2)", () => {
  it("açıkken 5 ₺'nin katına YUKARI yuvarlar", () => {
    const s = state([], [], { round: true });
    expect(roundShare(s, 3000 / 14)).toBe(215); // 214,28 → 215
    expect(roundShare(s, 200)).toBe(200);
    expect(roundShare(s, 200.01)).toBe(205);
    expect(roundShare(s, 0.5)).toBe(5);
  });
  it("kapalıyken kuruşa yuvarlar", () => {
    const s = state([], [], { round: false });
    expect(roundShare(s, 3000 / 14)).toBe(214.29);
    expect(roundShare(s, 3000 / 7)).toBe(428.57);
  });
  it("yuvarlama fazlası toplam ücreti karşılar (kasaya kalır)", () => {
    const s = state([], [], { round: true });
    for (let n = 1; n <= 22; n++) expect(roundShare(s, 3600 / n) * n).toBeGreaterThanOrEqual(3600);
  });
});

describe("ödeyenler ve kişi başı pay", () => {
  const gk = player("gk", "Kaleci", 3, "GK");
  const ps = [gk, ...roster(13)];

  it("kaleciler ücretsizse paya dahil edilmez (Kural 2.1)", () => {
    const m = allIn(match("m", { price: 3000, format: 6 }), ps.map((p) => p.id));
    const s = state(ps, [m], { gkFree: true, round: true });
    expect(payersOf(s, m)).not.toContain("gk");
    expect(payersOf(s, m)).toHaveLength(13);
    expect(shareOf(s, m)).toBe(235); // 3000/13 = 230,77 → 235
    s.settings.gkFree = false;
    expect(payersOf(s, m)).toHaveLength(14);
    expect(shareOf(s, m)).toBe(215);
  });

  it("geç iptal eden payını öder (Kural 1.5), yedekteki ödemez", () => {
    const many = roster(18);
    const m = allIn(match("m", { price: 3200, format: 7 }), many.slice(0, 17).map((p) => p.id)); // kontenjan 16
    m.att.p17 = "late";
    const s = state(many, [m], { round: false });
    const payers = payersOf(s, m);
    expect(payers).toContain("p17"); // geç iptal
    expect(payers).not.toContain("p16"); // yedek
    expect(payers).toHaveLength(17);
    expect(shareOf(s, m)).toBe(188.24);
  });

  describe("geç iptal edenin yerine gelen (Kural 1.5)", () => {
    // Kontenjan 16 (7+1 × 2); p3 kadro kesinleştikten sonra çekilir.
    const setup = (n: number, ps = roster(20)) => {
      const m = allIn(match("m", { price: 3200, format: 7 }), ps.slice(0, n).map((p) => p.id));
      const s = state(ps, [m], { round: false });
      const before = lineup(s, m).playing;
      setAtt(m, "p3", "late", true);
      return { s, m, before };
    };

    it("yedekten biri girerse payı o öder, geç iptal eden muaf olur; pay 16 kişiye bölünür", () => {
      const { s, m, before } = setup(18); // p16 kadroya girer, p17 yedekte kalır
      expect(replaceLate(s, m, "p3", before)).toEqual({ by: "p16", pays: true });
      expect(m.exempt.p3).toBe(true);
      expect(payersOf(s, m)).not.toContain("p3");
      expect(payersOf(s, m)).not.toContain("p17");
      expect(payersOf(s, m)).toHaveLength(16);
      expect(shareOf(s, m)).toBe(200);
    });

    it("yerine kimse gelmezse geç iptal eden payını öder", () => {
      const { s, m, before } = setup(16);
      expect(replaceLate(s, m, "p3", before)).toBeNull();
      expect(m.exempt.p3).toBeUndefined();
      expect(payersOf(s, m)).toContain("p3");
      expect(payersOf(s, m)).toHaveLength(16);
    });

    it("yerine ücretsiz kaleci girerse pay karşılanmaz, geç iptal eden öder (Kural 2.1)", () => {
      const ps = roster(20);
      ps[16] = player("p16", "Kaleci Yedek", 3, "GK");
      const { s, m, before } = setup(17, ps);
      expect(replaceLate(s, m, "p3", before)).toEqual({ by: "p16", pays: false });
      expect(m.exempt.p3).toBeUndefined();
      expect(payersOf(s, m)).toContain("p3");
      expect(payersOf(s, m)).not.toContain("p16");
    });

    /** handlers.ts att ile aynı sıra: önceki kadro, yanıt değişir, muafiyet güncellenir. */
    const tap = (s: State, m: Match, id: string, st: Att) => {
      const before = lineup(s, m).playing;
      setAtt(m, id, st, false);
      return replaceLate(s, m, id, before);
    };

    it("geç iptal eden dönüp yedekte beklerse ya da yeniden geç iptal ederse muaf kalır (yerine giren hâlâ oynuyor)", () => {
      const { s, m, before } = setup(18);
      replaceLate(s, m, "p3", before);
      expect(tap(s, m, "p3", "in")).toBeNull(); // sıranın sonuna: yedek
      expect(lineup(s, m).wait).toContain("p3");
      expect(m.exempt.p3).toBe(true);
      tap(s, m, "p3", "late");
      expect(m.exempt.p3).toBe(true);
      tap(s, m, "p3", "late"); // aynı düğmeye bir daha: yanıt silinir
      tap(s, m, "p3", "late");
      expect(m.exempt.p3).toBe(true);
      expect(payersOf(s, m)).toHaveLength(16);
      expect(payersOf(s, m)).not.toContain("p3");
    });

    it("muafiyet, kişi yeniden oynayan kadroya girince kalkar: dönüp boş yere giren ya da yedekten giren öder", () => {
      const { s, m, before } = setup(17); // p16 kadroya girer, yedek yok
      replaceLate(s, m, "p3", before);
      tap(s, m, "p3", "in"); // yedekte bekler, muaf
      expect(m.exempt.p3).toBe(true);
      // p5 geç iptal eder: yedekteki p3 kadroya girer, muafiyeti kalkar; p5 muaf olur
      expect(tap(s, m, "p5", "late")).toEqual({ by: "p3", pays: true });
      expect(m.exempt.p3).toBeUndefined();
      expect(m.exempt.p5).toBe(true);
      expect(payersOf(s, m)).toContain("p3");
      // Kadroda boş yer varken dönen doğrudan oynar ve öder
      const t2 = setup(16);
      t2.m.exempt.p3 = true; // organizatör elle muaf tutmuştu
      tap(t2.s, t2.m, "p3", "in");
      expect(lineup(t2.s, t2.m).playing).toContain("p3");
      expect(t2.m.exempt.p3).toBeUndefined();
    });

    it("arada Yok/Belki dense de kadroya yeniden giren geç iptalcinin muafiyeti kalkar", () => {
      for (const mid of ["out", "maybe"] as Att[]) {
        const { s, m, before } = setup(17);
        replaceLate(s, m, "p3", before); // p16 girdi, p3 muaf
        tap(s, m, "p3", mid);
        expect(m.exempt.p3).toBe(true);
        tap(s, m, "p5", "late"); // yedek yok: p5 öder, yer boşalır
        tap(s, m, "p3", "in"); // p3 boş yere girer
        expect(lineup(s, m).playing).toContain("p3");
        expect(m.exempt.p3).toBeUndefined();
        expect(payersOf(s, m)).toEqual(expect.arrayContaining(["p3", "p5"]));
      }
    });

    it("boş yere yazılan tek bir geç iptalcinin yerine mi geldi diye sorulur; belirsizse sorulmaz", () => {
      const { s, m, before } = setup(16); // yedek yok
      expect(replaceLate(s, m, "p3", before)).toBeNull(); // p3 öder
      let b = lineup(s, m).playing;
      setAtt(m, "p18", "in", true);
      expect(lateToCover(s, m, "p18", b)).toBe("p3");
      // Kadro doluyken yazılan yedeğe düşer: sorulmaz
      b = lineup(s, m).playing;
      setAtt(m, "p19", "in", true);
      expect(lateToCover(s, m, "p19", b)).toBeNull();
      // İki geç iptalci varsa kimin yerine gelindiği bilinemez
      const t2 = setup(16);
      setAtt(t2.m, "p4", "late", true);
      b = lineup(t2.s, t2.m).playing;
      setAtt(t2.m, "p18", "in", true);
      expect(lateToCover(t2.s, t2.m, "p18", b)).toBeNull();
      // Ücretsiz kaleci payı karşılamaz
      const ps = roster(20);
      ps[18] = player("p18", "Kaleci Yeni", 3, "GK");
      const t3 = setup(16, ps);
      b = lineup(t3.s, t3.m).playing;
      setAtt(t3.m, "p18", "in", true);
      expect(lateToCover(t3.s, t3.m, "p18", b)).toBeNull();
    });

    it("geç iptal etmeyen (Yok) için bir şey yapmaz; kontenjansız etkinlikte kimse yerine girmez", () => {
      const { s, m, before } = setup(18);
      setAtt(m, "p3", "out", true);
      expect(replaceLate(s, m, "p3", before)).toBeNull();
      const ev = allIn(match("e", { kind: "paintball", cap: 0, price: 900 }), ["p0", "p1", "p2"]);
      const s2 = state(roster(3), [ev]);
      const b2 = lineup(s2, ev).playing;
      setAtt(ev, "p1", "late", true);
      expect(replaceLate(s2, ev, "p1", b2)).toBeNull();
      expect(payersOf(s2, ev)).toContain("p1");
    });
  });

  it("muaf tutulan ödemez; yerine gelen öder", () => {
    const many = roster(5);
    const m = allIn(match("m", { price: 1000, format: 1 }), ["p0", "p1", "p2", "p3"]);
    m.att.p4 = "late";
    m.exempt.p4 = true;
    const s = state(many, [m], { round: false });
    expect(payersOf(s, m)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(shareOf(s, m)).toBe(250);
  });

  it("'Belki' ve 'Yok' ödemez", () => {
    const many = roster(4);
    const m = allIn(match("m", { price: 1000 }), ["p0", "p1"]);
    m.att.p2 = "maybe";
    m.att.p3 = "out";
    const s = state(many, [m], { round: false });
    expect(payersOf(s, m)).toEqual(["p0", "p1"]);
  });

  it("iptal edilen maçta kimse ödemez (Kural 1.9)", () => {
    const m = allIn(match("m", { status: "cancelled" }), ["p0", "p1"]);
    const s = state(roster(2), [m]);
    expect(payersOf(s, m)).toEqual([]);
    expect(shareOf(s, m)).toBe(0);
  });

  it("kimse yokken tahmini pay kontenjana (kaleciler hariç) bölünür", () => {
    const m = match("m", { price: 3000, format: 7 });
    const s = state([], [m], { gkFree: true, round: true });
    expect(estShare(s, m)).toBe(215); // 3000 / 14
    s.settings.gkFree = false;
    expect(estShare(s, m)).toBe(190); // 3000 / 16 = 187,5
  });

  it("ücreti olmayan maçta pay 0", () => {
    const m = allIn(match("m", { price: 0 }), ["p0"]);
    expect(shareOf(state(roster(1), [m]), m)).toBe(0);
  });
});

describe("borç hesabı", () => {
  it("oynanmış ya da tarihi gelmiş maçlardaki ödenmemiş paylar toplanır", () => {
    const ps = roster(4);
    const m1 = allIn(match("m1", { date: "2026-10-01", price: 400, format: 1, status: "played" }), ["p0", "p1", "p2", "p3"]);
    const m2 = allIn(match("m2", { date: "2026-10-05", price: 400, format: 1, status: "open" }), ["p0", "p1", "p2", "p3"]);
    const m3 = allIn(match("m3", { date: "2026-10-20", price: 400, format: 1, status: "open" }), ["p0", "p1", "p2", "p3"]);
    const m4 = allIn(match("m4", { date: "2026-10-02", price: 400, format: 1, status: "cancelled" }), ["p0"]);
    const s = state(ps, [m1, m2, m3, m4], { round: false });
    s.payments = [newPayment("p0", 100, "2026-10-01", "m1"), newPayment("p1", 100, "2026-10-01", "m1"), newPayment("p0", 100, "2026-10-05", "m2")];
    const d = debts(s, "2026-10-09");
    expect(d.map((x) => [x.id, x.total, x.n])).toEqual([
      ["p2", 200, 2],
      ["p3", 200, 2],
      ["p1", 100, 1],
    ]);
    expect(isDue(m3, "2026-10-09")).toBe(false);
    expect(isDue(m2, "2026-10-05")).toBe(true);
  });

  it("misafirin borcu da takip edilir", () => {
    const m = allIn(match("m", { price: 300, format: 1, status: "played" }), ["p0", "g1"]);
    m.guests = [{ id: "g1", name: "Misafir", rating: 3, pos: "" }];
    const s = state(roster(1), [m], { round: false });
    expect(debts(s, "2026-01-01").find((x) => x.id === "g1")!.total).toBe(150);
  });
});
