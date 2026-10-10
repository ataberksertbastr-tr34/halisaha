/**
 * Disiplin (Bölüm 9, Ek tablosu) ve ek borçlar (Kural 15.4, 10.5). İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { addInfraction, joinBlock, removeInfraction, statusOf, suggest } from "../src/domain/discipline";
import { accounts, cashAt, debtMap, extraStatus, newExtra, toggleExtraPaid } from "../src/domain/ledger";
import { lineup } from "../src/domain/lineup";
import { allIn, match, roster, state } from "./helpers/factory";

const TODAY = "2026-10-10";

function setup() {
  const players = roster(6);
  const past = allIn(match("m0", { date: "2026-10-06", status: "played", price: 600 }), ["p0", "p1", "p2"]);
  const next = allIn(match("m1", { date: "2026-10-13", price: 600 }), ["p0", "p1", "p2"]);
  const later = allIn(match("m2", { date: "2026-10-15", price: 600 }), ["p0", "p1"]);
  const air = allIn(match("e1", { kind: "airsoft", cap: 16, date: "2026-10-17", price: 0 }), ["p0", "p3"]);
  const s = state(players, [past, next, later, air], { round: false });
  return { s, past, next, later, air };
}

describe("Kural 9.3 kademesi", () => {
  it("1. uyarı → 2. bir maç ceza → 3. davet edilmez", () => {
    const { s, next } = setup();
    expect(suggest(s, "p0", "swear")).toEqual({ sanction: "warn", step: 1, rule: "9.2" });
    addInfraction(s, { pid: "p0", type: "swear", at: TODAY, sanction: "warn", step: 1, rule: "9.2", mid: "m0" }, TODAY);
    expect(statusOf(s, "p0").warnings).toBe(1);
    const s2 = suggest(s, "p0", "tackle");
    expect(s2).toEqual({ sanction: "bench", step: 2, rule: "7.1" });
    addInfraction(s, { pid: "p0", type: "tackle", at: TODAY, sanction: "bench", step: 2, rule: "7.1", mid: "m0" }, TODAY);
    // ceza: sıradaki ilk açık halı saha maçında kadrodan çıkar
    expect(next.att.p0).toBe("out");
    expect(statusOf(s, "p0").bench).toEqual(["m1"]);
    expect(joinBlock(s, next, "p0", 0)).toEqual({ why: "bench", rule: "9.3" });
    expect(suggest(s, "p0", "late")).toEqual({ sanction: "ban", step: 3, rule: "1.7" });
  });
  it("3. kademe ve ihraç: açık etkinliklerdeki yanıtlar silinir, yazılması engellenir", () => {
    const { s, later, air } = setup();
    for (let i = 1; i <= 3; i++) addInfraction(s, { pid: "p0", type: "other", at: TODAY, sanction: i === 1 ? "warn" : i === 2 ? "bench" : "ban", step: i, rule: "9.3" }, TODAY);
    const st = statusOf(s, "p0");
    expect(st.banned).toBe(true);
    expect(later.att.p0).toBeUndefined();
    expect(air.att.p0).toBeUndefined();
    expect(joinBlock(s, later, "p0", 0)?.why).toBe("ban");
    addInfraction(s, { pid: "p1", type: "fight", at: TODAY, sanction: "expel", rule: "9.1", mid: "m1" }, TODAY);
    expect(statusOf(s, "p1").expelled).toBe(true);
    expect(joinBlock(s, later, "p1", 0)?.why).toBe("expel");
  });
  it("tekrarında 9.3: ilk sefer yalnız oyundan çıkarır, ikincisi kademeye girer", () => {
    const { s } = setup();
    expect(suggest(s, "p3", "hidehit")).toEqual({ sanction: "dropGame", rule: "17.6" });
    addInfraction(s, { pid: "p3", type: "hidehit", at: TODAY, sanction: "dropGame", rule: "17.6", mid: "e1" }, TODAY);
    expect(suggest(s, "p3", "hidehit")).toEqual({ sanction: "dropGame", step: 1, rule: "17.6" });
  });
  it("maske kuralı türe göre 16.2 / 17.2; oyundan alınan payını öder", () => {
    const { s, air } = setup();
    expect(suggest(s, "p3", "mask", air).rule).toBe("17.2");
    expect(suggest(s, "p3", "mask", match("x", { kind: "paintball" })).rule).toBe("16.2");
    addInfraction(s, { pid: "p3", type: "mask", at: TODAY, sanction: "dropDay", rule: "17.2", mid: "e1" }, TODAY);
    expect(air.removed.p3).toBe("17.2");
    expect(lineup(s, air).playing).toContain("p3");
  });
  it("replika (17.4): yalnız airsoft etkinliklerinden men", () => {
    const { s, air, later } = setup();
    addInfraction(s, { pid: "p0", type: "replica", at: TODAY, sanction: "kindBan", rule: "17.4" }, TODAY);
    expect(statusOf(s, "p0").kinds).toEqual(["airsoft"]);
    expect(air.att.p0).toBeUndefined();
    expect(later.att.p0).toBe("in");
    expect(joinBlock(s, air, "p0", 0)?.why).toBe("kind");
    expect(joinBlock(s, later, "p0", 0)).toBeNull();
  });
  it("affetmek (kaydı silmek) durumu ve yan etkileri geri alır", () => {
    const { s, air } = setup();
    const r = addInfraction(s, { pid: "p3", type: "alcohol", at: TODAY, sanction: "remove", rule: "15.7", mid: "e1" }, TODAY);
    expect(air.removed.p3).toBe("15.7");
    removeInfraction(s, r.id);
    expect(air.removed.p3).toBeUndefined();
    expect(statusOf(s, "p3").records).toHaveLength(0);
  });
});

describe("borç engeli (Kural 2.4)", () => {
  it("ayar açıkken borçlu yazılamaz (organizatör yine de ekleyebilir)", () => {
    const { s, later } = setup();
    expect(debtMap(s, TODAY).p2).toBe(200);
    expect(joinBlock(s, later, "p2", 200)).toEqual({ why: "debt", rule: "2.4" });
    s.settings.debtBlock = false;
    expect(joinBlock(s, later, "p2", 200)).toBeNull();
  });
});

describe("ek borçlar: zarar bedeli ve kişisel harcama", () => {
  it("zarar bedeli kişiye borç yazar; affedilince silinir", () => {
    const { s } = setup();
    const r = addInfraction(s, { pid: "p1", type: "damage", at: TODAY, sanction: "damage", rule: "10.5", mid: "m0", amount: 450, note: "Kale filesi" }, TODAY);
    expect(s.charges).toHaveLength(1);
    const acc = accounts(s, TODAY).get("p1")!;
    const c = acc.charges.find((x) => x.cid === r.cid)!;
    expect(c).toMatchObject({ amount: 450, note: "Kale filesi", rule: "10.5", due: true, status: "unpaid" });
    expect(acc.owed).toBe(200 + 450);
    removeInfraction(s, r.id);
    expect(s.charges).toHaveLength(0);
    expect(accounts(s, TODAY).get("p1")!.owed).toBe(200);
  });
  it("ödendi işareti yalnız o ek borcu kapatır; maç payı etkilenmez", () => {
    const { s } = setup();
    const x = newExtra("p0", 150, "2026-10-06", "Boya topu", "m0", "15.4");
    s.charges.push(x);
    expect(toggleExtraPaid(s, x, TODAY)).toBe("paid");
    expect(extraStatus(s, x, TODAY)!.status).toBe("paid");
    const acc = accounts(s, TODAY).get("p0")!;
    expect(acc.charges.find((c) => c.mid === "m0" && !c.cid)!.status).toBe("unpaid");
    expect(acc.owed).toBe(200);
    expect(toggleExtraPaid(s, x, TODAY)).toBe("unpaid");
    expect(accounts(s, TODAY).get("p0")!.owed).toBe(350);
  });
  it("kasa: ek borç tesise ödenir, tahsil edilince denkleşir; iptal etkinliğin eki sayılmaz", () => {
    const { s, air } = setup();
    const before = cashAt(s);
    const x = newExtra("p3", 300, TODAY, "Mermi", "e1");
    s.charges.push(x);
    expect(cashAt(s)).toBe(before - 300);
    toggleExtraPaid(s, x, TODAY);
    expect(cashAt(s)).toBe(before);
    air.status = "cancelled";
    expect(cashAt(s)).toBe(before + 300);
  });
});
