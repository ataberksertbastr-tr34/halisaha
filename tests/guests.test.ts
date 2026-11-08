/**
 * Kural 1.8: misafiri getiren, onun ödemesinden ve davranışından sorumludur.
 * Misafir borcunun getirenin borç engeline sayılması (2.4), hatırlatma metinleri,
 * önceki misafirlerin bulunması ve WhatsApp listesinde aynı adlı misafir. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { guestDebts, liabilities, liabilityMap, markPaid, newPayment } from "../src/domain/ledger";
import { freezeBill } from "../src/domain/money";
import { blockedFor, copyLastWeek } from "../src/domain/roster";
import { guestHistory, pastGuests } from "../src/domain/guests";
import { addInfraction } from "../src/domain/discipline";
import { applyPlan, parseList, planList } from "../src/domain/signup";
import { debtReminderText, guestPayText } from "../src/domain/messages";
import { setLang } from "../src/i18n";
import type { Guest } from "../src/domain/types";
import { allIn, match, player, state } from "./helpers/factory";

const TODAY = "2026-10-20";
const guest = (id: string, name: string, host?: string, extra: Partial<Guest> = {}): Guest => ({ id, name, rating: 3, pos: "", ...(host ? { host } : {}), ...extra });

/** a ve b oyuncu; m1'de a'nın misafiri Mert, m2'de b'nin misafiri Mert (ayrı kayıt). Kişi başı 100 ₺. */
function setup() {
  const ps = [player("a", "Ali Deneme"), player("b", "Berk Deneme"), player("c", "Cem Deneme")];
  const m1 = match("m1", { date: "2026-10-06", price: 400, format: 1, status: "played", guests: [guest("g1", "Misafir Mert", "a")] });
  const m2 = match("m2", { date: "2026-10-13", price: 400, format: 1, status: "played", guests: [guest("g2", "misafir mert", "b", { rating: 4, pos: "MID" })] });
  allIn(m1, ["a", "b", "c", "g1"]);
  allIn(m2, ["a", "b", "c", "g2"]);
  const next = match("m3", { date: "2026-10-22", price: 400, format: 1 });
  const s = state(ps, [m1, m2, next], { round: false, gkFree: false });
  [m1, m2].forEach((m) => freezeBill(s, m));
  // Oyuncular kendi paylarını ödedi; yalnız misafirler ödemedi
  for (const m of [m1, m2]) for (const id of ["a", "b", "c"]) markPaid(s, m, id, m.date);
  return { s, m1, m2, next };
}

describe("misafir borcu getirene (Kural 1.8, 2.4)", () => {
  it("her pay o maçta misafiri getirene yazılır; ödenen ve vadesi gelmeyen sayılmaz", () => {
    const { s } = setup();
    const gd = guestDebts(s, TODAY);
    expect(gd.get("a")).toEqual([{ id: "g1", name: "Misafir Mert", amount: 100 }]);
    expect(gd.get("b")).toEqual([{ id: "g2", name: "misafir mert", amount: 100 }]);
    expect(gd.has("c")).toBe(false);
    s.payments.push(newPayment("g1", 60, "2026-10-07"));
    expect(guestDebts(s, TODAY).get("a")).toEqual([{ id: "g1", name: "Misafir Mert", amount: 40 }]);
    // Yaklaşan maçın payı henüz vadesi gelmediği için sayılmaz
    const next = s.matches[2];
    next.guests.push(guest("g3", "Konuk Kaan", "c"));
    allIn(next, ["g3"]);
    expect(guestDebts(s, TODAY).has("c")).toBe(false);
  });
  it("sorumlu olunan borç: kendi borcu + misafirlerinin; getireni silinmiş ya da olmayan misafir kimseye yazılmaz", () => {
    const { s, m1 } = setup();
    s.payments = s.payments.filter((p) => !(p.pid === "a" && p.mid === "m1"));
    expect(liabilities(s, TODAY).a).toEqual({ total: 200, own: 100, guests: [{ id: "g1", name: "Misafir Mert", amount: 100 }] });
    expect(liabilityMap(s, TODAY)).toMatchObject({ a: 200, b: 100, g1: 100, g2: 100 });
    delete m1.guests[0].host;
    expect(liabilityMap(s, TODAY).a).toBe(100);
    m1.guests[0].host = "silinmis";
    expect(liabilityMap(s, TODAY).a).toBe(100);
  });
  it("misafirinin payı ödenmemiş oyuncu toplu yazmada atlanır (Kural 2.4, 1.8)", () => {
    const { s, m1, next } = setup();
    // Ali'nin misafiri ödedi, Berk'inki ödemedi
    markPaid(s, m1, "g1", TODAY);
    const r = copyLastWeek(s, next, blockedFor(s, TODAY));
    expect(r.blocked).toEqual(["b"]);
    expect(next.order).toEqual(["a", "c"]);
  });
});

describe("önceki misafirler", () => {
  it("aynı ad (Türkçe harf, büyük/küçük) tek satır, en yeni geliş başta; seçili maç hariç", () => {
    const { s, m2 } = setup();
    const list = pastGuests(s);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ name: "misafir mert", ids: ["g2", "g1"], host: "b", rating: 4, pos: "MID", last: "2026-10-13" });
    expect(pastGuests(s, m2.id)[0]).toMatchObject({ name: "Misafir Mert", ids: ["g1"], host: "a" });
  });
  it("yeniden getirilirken önceki gelişlerinin ödenmemiş borcu ve disiplin engeli bulunur", () => {
    const { s, next } = setup();
    expect(guestHistory(s, next, "MİSAFİR MERT", TODAY)).toMatchObject({ debt: 200, block: null });
    expect(guestHistory(s, next, "Başka Biri", TODAY)).toBeNull();
    // Borç engeli kapalıysa borç sorulmaz
    s.settings.debtBlock = false;
    expect(guestHistory(s, next, "Misafir Mert", TODAY)).toBeNull();
    // Kavgadan ihraç edilen misafir (Kural 9.1) her durumda sorulur
    addInfraction(s, { pid: "g1", type: "fight", at: "2026-10-06", sanction: "expel", rule: "9.1", mid: "m1" }, "2026-10-06");
    expect(guestHistory(s, next, "Misafir Mert", TODAY)).toMatchObject({ debt: 0, block: { why: "expel", rule: "9.1" } });
  });
  it("borcu kapanmış, cezasız misafir sorulmaz", () => {
    const { s, m1, m2, next } = setup();
    markPaid(s, m1, "g1", TODAY);
    markPaid(s, m2, "g2", TODAY);
    expect(guestHistory(s, next, "Misafir Mert", TODAY)).toBeNull();
  });
});

describe("WhatsApp listesinde misafir", () => {
  it("kayıtlı olmayan ad önceki borçlu misafirse varsayılan olarak atlanır; misafir seçilirse getireni, seviyesi ve mevkii korunur", () => {
    const { s, next } = setup();
    const rows = planList(s, next, parseList("1. Cem Deneme\n2. Misafir Mert\n3. Yeni Yüz"), TODAY);
    expect(rows.map((r) => [r.name, r.act, r.note])).toEqual([["Cem Deneme", "in", ""], ["Misafir Mert", "skip", "guestPrev"], ["Yeni Yüz", "guest", "none"]]);
    expect(rows[1].prevDebt).toBe(200);
    rows[1] = { ...rows[1], act: "guest" };
    expect(applyPlan(s, next, rows)).toBe(3);
    const mert = next.guests.find((g) => g.name === "Misafir Mert")!;
    expect(mert).toMatchObject({ host: "b", rating: 4, pos: "MID" });
    expect(["g1", "g2"]).not.toContain(mert.id);
    expect(next.guests.find((g) => g.name === "Yeni Yüz")).toMatchObject({ rating: 3, pos: "" });
    expect(next.guests.find((g) => g.name === "Yeni Yüz")!.host).toBeUndefined();
  });
  it("misafirinin payı ödenmemiş oyuncu listede engelli görünür", () => {
    const { s, next } = setup();
    const rows = planList(s, next, parseList("1. Berk Deneme"), TODAY);
    expect(rows[0]).toMatchObject({ act: "skip", note: "blocked", block: { why: "debt", rule: "2.4" } });
  });
});

describe("getirene hatırlatma", () => {
  it("misafirin adıyla; organizatörün kendi şablonu kullanılır", () => {
    setLang("tr");
    const s = state([], [], { iban: "TR11" });
    expect(guestPayText(s, "Ali", "Mert", 300)).toBe("Selam Ali, getirdiğin misafir Mert için 300 ₺ ödeme bekleniyor (Kural 1.8).\nIBAN: TR11\nTeşekkürler!");
    s.settings.iban = "";
    setLang("en");
    expect(guestPayText(s, "Ali", "Mert", 300)).toBe("Hi Ali, 300 ₺ is still due for your guest Mert (Rule 1.8).\nThanks!");
    setLang("tr");
    s.settings.templates.guestPay = "{ad}/{misafir}/{tutar}";
    expect(guestPayText(s, "Ali", "Mert", 300)).toBe("Ali/Mert/300 ₺");
  });
  it("kendi borcu, yalnız misafir borcu ve ikisi birden", () => {
    setLang("tr");
    const s = state();
    const g = [{ id: "g1", name: "Mert", amount: 100 }, { id: "g2", name: "Can", amount: 50 }];
    expect(debtReminderText(s, "Ali", { total: 80, own: 80, guests: [] })).toBe("Selam Ali, organizasyonlardan kalan borcun 80 ₺.\nTeşekkürler!");
    expect(debtReminderText(s, "Ali", { total: 150, own: 0, guests: g })).toBe("Selam Ali, getirdiğin misafir Mert, Can için 150 ₺ ödeme bekleniyor (Kural 1.8).\nTeşekkürler!");
    expect(debtReminderText(s, "Ali", { total: 230, own: 80, guests: g })).toBe("Selam Ali, organizasyonlardan kalan borcun 230 ₺.\nTeşekkürler!");
  });
});
