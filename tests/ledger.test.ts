/** Hesap defteri: kısmi ödeme, FIFO dağıtım, avans, dondurulmuş pay, aylık özet ve kasa. */
import { describe, expect, it } from "vitest";
import { accounts, cashAt, chargeOf, debts, markPaid, monthSummary, newPayment, settleAll, settleId, unmarkPaid } from "../src/domain/ledger";
import { billOf, freezeBill } from "../src/domain/money";
import { allIn, match, roster, state } from "./helpers/factory";

const TODAY = "2026-10-20";

/** 4 kişilik (1+1 format → kontenjan 4), 400 TL'lik, kişi başı 100 TL maçlar. */
function setup() {
  const ps = roster(4);
  const ids = ps.map((p) => p.id);
  const m1 = allIn(match("m1", { date: "2026-10-01", price: 400, format: 1, status: "played" }), ids);
  const m2 = allIn(match("m2", { date: "2026-10-08", price: 400, format: 1, status: "played" }), ids);
  const m3 = allIn(match("m3", { date: "2026-10-27", price: 400, format: 1, status: "open" }), ids);
  const s = state(ps, [m1, m2, m3], { round: false, gkFree: false });
  [m1, m2].forEach((m) => freezeBill(s, m));
  return { s, m1, m2, m3 };
}

describe("hesap defteri", () => {
  it("ödeme yoksa vadesi gelen iki maç borç, yaklaşan maç borç değil", () => {
    const { s } = setup();
    const a = accounts(s, TODAY).get("p0")!;
    expect(a.charges.map((c) => [c.mid, c.amount, c.due])).toEqual([["m1", 100, true], ["m2", 100, true], ["m3", 100, false]]);
    expect(a.owed).toBe(200);
    expect(a.owedCount).toBe(2);
    expect(a.balance).toBe(-200);
  });

  it("kısmi ödeme en eski borca yazılır", () => {
    const { s } = setup();
    s.payments.push(newPayment("p0", 150, "2026-10-10"));
    const a = accounts(s, TODAY).get("p0")!;
    expect(a.charges.map((c) => [c.mid, c.paid, c.status])).toEqual([["m1", 100, "paid"], ["m2", 50, "partial"], ["m3", 0, "unpaid"]]);
    expect(a.owed).toBe(50);
    expect(a.owedCount).toBe(1);
  });

  it("maça yazılmış ödeme önce o maçı kapatır; fazlası havuza gider", () => {
    const { s } = setup();
    s.payments.push(newPayment("p0", 130, "2026-10-10", "m2"));
    const a = accounts(s, TODAY).get("p0")!;
    expect(a.charges.find((c) => c.mid === "m2")!.status).toBe("paid");
    expect(a.charges.find((c) => c.mid === "m1")!.paid).toBe(30);
    expect(a.owed).toBe(70);
  });

  it("fazla ödeme önce yaklaşan maça, sonra avansa kalır", () => {
    const { s } = setup();
    s.payments.push(newPayment("p0", 350, "2026-10-10"));
    const a = accounts(s, TODAY).get("p0")!;
    expect(a.charges.every((c) => c.status === "paid")).toBe(true);
    expect(a.credit).toBe(50);
    expect(a.balance).toBe(50);
    expect(debts(s, TODAY).find((d) => d.id === "p0")).toBeUndefined();
  });

  it("'Ödedi' kalan payı o maça yazar; geri alınınca kaldırılır", () => {
    const { s, m2 } = setup();
    s.payments.push(newPayment("p1", 40, "2026-10-09", "m2"));
    markPaid(s, m2, "p1", TODAY);
    expect(chargeOf(s, m2, "p1", TODAY)!.status).toBe("paid");
    expect(s.payments.filter((p) => p.pid === "p1").map((p) => p.amount)).toEqual([40, 60]);
    expect(unmarkPaid(s, m2, "p1")).toBe(true);
    expect(chargeOf(s, m2, "p1", TODAY)!.status).toBe("unpaid");
  });

  it("'Ödedi' kaydının kimliği borçtan türetilir (iki cihazda basılırsa tek kayıt); pay artarsa aynı kayıt büyür", () => {
    const { s, m2 } = setup();
    markPaid(s, m2, "p1", TODAY);
    expect(s.payments.map((p) => [p.id, p.amount])).toEqual([[settleId("p1", "m2"), 100]]);
    s.payments[0].amount = 60; // eski pay; sonra pay arttı gibi
    markPaid(s, m2, "p1", TODAY);
    expect(s.payments.map((p) => [p.id, p.amount])).toEqual([[settleId("p1", "m2"), 100]]);
    expect(settleAll(s, "p2", TODAY)).toBe(200);
    expect(s.payments.filter((p) => p.pid === "p2").map((p) => p.id).sort()).toEqual([settleId("p2", "m1"), settleId("p2", "m2")].sort());
  });

  it("genel ödemeden karşılanan pay maç üzerinden kaldırılamaz", () => {
    const { s, m1 } = setup();
    s.payments.push(newPayment("p2", 100, "2026-10-02"));
    expect(chargeOf(s, m1, "p2", TODAY)!.status).toBe("paid");
    expect(unmarkPaid(s, m1, "p2")).toBe(false);
  });

  it("'Ödendi say' vadesi gelen tüm ödenmemiş payları kapatır, yaklaşanı bırakır", () => {
    const { s } = setup();
    s.payments.push(newPayment("p3", 30, "2026-10-02"));
    expect(settleAll(s, "p3", TODAY)).toBe(170);
    const a = accounts(s, TODAY).get("p3")!;
    expect(a.owed).toBe(0);
    expect(a.charges.find((c) => c.mid === "m3")!.status).toBe("unpaid");
  });

  it("maç bitince donan pay, ayar değişince değişmez (geçmiş bozulmaz)", () => {
    const { s, m1 } = setup();
    s.settings.round = true;
    s.settings.gkFree = true;
    s.players[0].pos = "GK";
    expect(billOf(s, m1)).toEqual({ payers: ["p0", "p1", "p2", "p3"], share: 100 });
    markPaid(s, m1, "p1", TODAY);
    expect(chargeOf(s, m1, "p1", TODAY)!.status).toBe("paid");
  });

  it("iptal edilen maçın ödemesi avansa döner (Kural 1.9)", () => {
    const { s, m3 } = setup();
    s.payments.push(newPayment("p0", 100, "2026-10-21", "m3"));
    m3.status = "cancelled";
    const a = accounts(s, TODAY).get("p0")!;
    expect(a.charges.map((c) => c.mid)).toEqual(["m1", "m2"]);
    expect(a.owed).toBe(100); // m3 ödemesi m1'i kapattı
  });

  it("avans iadesi (eksi ödeme) avansı sıfırlar, borç doğurmaz", () => {
    const { s } = setup();
    s.payments.push(newPayment("p0", 350, "2026-10-10"));
    s.payments.push(newPayment("p0", -50, "2026-10-11", undefined, "İade"));
    const a = accounts(s, TODAY).get("p0")!;
    expect(a.credit).toBe(0);
    expect(a.owed).toBe(0);
    expect(a.paidTotal).toBe(300);
  });

  it("misafirin hesabı da tutulur, getireni bilinir", () => {
    const m = allIn(match("m", { date: "2026-10-01", price: 300, format: 1, status: "played" }), ["p0", "g1"]);
    m.guests = [{ id: "g1", name: "Misafir Mert", rating: 3, pos: "", host: "p0" }];
    const s = state(roster(1), [m], { round: false });
    const d = debts(s, TODAY).find((x) => x.id === "g1")!;
    expect(d.total).toBe(150);
    expect(d.host).toBe("p0");
    expect(d.name).toBe("Misafir Mert");
  });
});

describe("silinen oyuncu", () => {
  it("hesap listesinden çıkar, ödemesi kasada kalır", () => {
    const { s } = setup();
    s.payments.push(newPayment("p0", 100, "2026-10-10"));
    s.players = s.players.filter((p) => p.id !== "p0");
    expect(accounts(s, TODAY).has("p0")).toBe(false);
    expect(debts(s, TODAY).some((d) => d.id === "p0")).toBe(false);
    expect(cashAt(s)).toBe(100 - 800);
  });
});

describe("aylık özet ve kasa", () => {
  it("tahsilat, saha ücreti, gider ve kasa", () => {
    const { s } = setup();
    s.payments.push(newPayment("p0", 200, "2026-10-10"), newPayment("p1", 100, "2026-10-10"), newPayment("p2", 100, "2026-11-02"));
    s.expenses.push({ id: "e1", at: "2026-10-15", amount: 250, cat: "ball", note: "Yeni top" });
    const oct = monthSummary(s, "2026-10");
    expect(oct.played).toBe(2);
    expect(oct.fieldCost).toBe(800);
    expect(oct.billed).toBe(800);
    expect(oct.collected).toBe(300);
    expect(oct.expenses).toBe(250);
    expect(oct.cash).toBe(300 - 800 - 250);
    expect(cashAt(s)).toBe(400 - 800 - 250);
  });

  it("yuvarlama fazlası kasada birikir (Kural 2.2)", () => {
    const ps = roster(3);
    const m = allIn(match("m", { date: "2026-10-01", price: 1000, format: 1, status: "played" }), ps.map((p) => p.id));
    const s = state(ps, [m], { round: true, gkFree: false });
    freezeBill(s, m);
    expect(billOf(s, m).share).toBe(335);
    ps.forEach((p) => markPaid(s, m, p.id, "2026-10-01"));
    expect(cashAt(s)).toBe(5);
  });
});
