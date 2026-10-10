/** Kişi başı pay, yuvarlama ve borç hesabı (Kural 1.5, 1.9, 2.1, 2.2, 2.4). */
import { describe, expect, it } from "vitest";
import { debts, estShare, isDue, payersOf, roundShare, shareOf } from "../src/domain/money";
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
    m1.paid = { p0: true, p1: true };
    m2.paid = { p0: true };
    const s = state(ps, [m1, m2, m3, m4], { round: false });
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
