/**
 * Borç dökümü (Kural 2.4, 1.8): kalem kalem pay, ödenen, kalan; getirdiği misafirin payı;
 * son ödemeler. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { liabilities, markPaid, newExtra, newPayment, statement } from "../src/domain/ledger";
import { freezeBill } from "../src/domain/money";
import { personalPayText, statementText } from "../src/domain/messages";
import { DEFAULT_TEMPLATES, EVENT_TEMPLATES, PLACEHOLDERS, TEMPLATE_KEYS } from "../src/domain/templates";
import { setLang } from "../src/i18n";
import type { State } from "../src/domain/types";
import { allIn, match, player, state } from "./helpers/factory";

const TODAY = "2026-10-20";

/**
 * Ali üç etkinliğe katıldı (kişi başı 100 ₺, 100 ₺, paintball 200 ₺), m1'de misafiri Mert'i getirdi.
 * Yaklaşan m4'e de yazılı (vadesi gelmedi).
 */
function setup(): State {
  const ps = [player("a", "Ali Deneme", 3, "", { phone: "0555 000 00 01" }), player("b", "Berk Deneme"), player("c", "Cem Deneme")];
  const m1 = match("m1", { date: "2026-10-06", price: 400, format: 1, status: "played", guests: [{ id: "g1", name: "Misafir Mert", rating: 3, pos: "", host: "a" }] });
  const m2 = match("m2", { date: "2026-10-13", price: 300, format: 1, status: "played" });
  const ev = match("ev", { kind: "paintball", title: "Şile Paintball", cap: 12, date: "2026-10-17", time: "11:00", price: 600, status: "played" });
  const m4 = match("m4", { date: "2026-10-22", price: 300, format: 1 });
  allIn(m1, ["a", "b", "c", "g1"]);
  allIn(m2, ["a", "b", "c"]);
  allIn(ev, ["a", "b", "c"]);
  allIn(m4, ["a", "b", "c"]);
  const s = state(ps, [m1, m2, ev, m4], { round: false, gkFree: false, iban: "TR11", ibanName: "Deneme" });
  [m1, m2, ev].forEach((m) => freezeBill(s, m));
  return s;
}

describe("borç dökümü", () => {
  it("vadesi gelmiş her kalem tarih sırasıyla; getirdiği misafirin payı da listede (Kural 1.8)", () => {
    const s = setup();
    const st = statement(s, "a", TODAY)!;
    expect(st.to).toEqual({ id: "a", name: "Ali Deneme", phone: "0555 000 00 01" });
    expect(st.lines.map((l) => [l.mid, l.amount, l.paid, l.guest ?? null])).toEqual([
      ["m1", 100, 0, null], ["m1", 100, 0, "Misafir Mert"], ["m2", 100, 0, null], ["ev", 200, 0, null],
    ]);
    expect(st.total).toBe(500);
    expect(st.total).toBe(liabilities(s, TODAY).a.total);
    expect(st.payments).toEqual([]);
  });

  it("ödenen kalem düşer, kısmi ödeme kalanıyla görünür; ek borç kuralıyla; son üç ödeme yeniden eskiye", () => {
    const s = setup();
    markPaid(s, s.matches[0], "a", "2026-10-07");
    s.payments.push(newPayment("a", 40, "2026-10-14", "m2"));
    s.payments.push(newPayment("a", 10, "2026-10-15"));
    s.payments.push(newPayment("a", 5, "2026-10-16"));
    s.charges.push(newExtra("a", 80, "2026-10-17", "Ek boya", "ev", "15.4"));
    const st = statement(s, "a", TODAY)!;
    // Genel ödemeler (10 + 5) en eski açık kaleme, m2'ye gider: 40 + 15 = 55
    expect(st.lines.map((l) => [l.mid, l.cid ? "ek" : "pay", l.amount, l.paid, l.guest ?? null])).toEqual([
      ["m1", "pay", 100, 0, "Misafir Mert"], ["m2", "pay", 100, 55, null], ["ev", "pay", 200, 0, null], ["ev", "ek", 80, 0, null],
    ]);
    expect(st.total).toBe(425);
    expect(st.payments.map((p) => [p.at, p.amount])).toEqual([["2026-10-16", 5], ["2026-10-15", 10], ["2026-10-14", 40]]);
    expect(st.lines[3]).toMatchObject({ note: "Ek boya", rule: "15.4" });
  });

  it("misafirin dökümü getirenine yazılır; getireni yoksa misafire; borcu olmayan için döküm yok", () => {
    const s = setup();
    const g = statement(s, "g1", TODAY)!;
    expect(g.to).toEqual({ id: "a", name: "Ali Deneme", phone: "0555 000 00 01" });
    expect(g.lines.map((l) => [l.mid, l.guest])).toEqual([["m1", "Misafir Mert"]]);
    expect(g.total).toBe(100);
    delete s.matches[0].guests[0].host;
    expect(statement(s, "g1", TODAY)!.to).toEqual({ id: "g1", name: "Misafir Mert", phone: "" });
    // Getireni kalmayınca Ali'nin dökümünden de çıkar
    expect(statement(s, "a", TODAY)!.lines.some((l) => l.guest)).toBe(false);
    ["m1", "m2", "ev"].forEach((id) => markPaid(s, s.matches.find((m) => m.id === id)!, "b", TODAY));
    expect(statement(s, "b", TODAY)).toBeNull();
    expect(statement(s, "yok", TODAY)).toBeNull();
  });

  it("iade (eksi ödeme) son ödemelerde sayılmaz", () => {
    const s = setup();
    s.payments.push(newPayment("a", 500, "2026-10-01"), newPayment("a", -450, "2026-10-02"));
    expect(statement(s, "a", TODAY)!.payments.map((p) => p.amount)).toEqual([500]);
  });
});

describe("döküm mesajı", () => {
  it("varsayılan şablon: kalemler, toplam, son ödemeler, IBAN", () => {
    setLang("tr");
    const s = setup();
    s.payments.push(newPayment("a", 40, "2026-10-14", "m2"));
    s.charges.push(newExtra("a", 80, "2026-10-17", "Ek boya", "ev", "15.4"));
    expect(statementText(s, "a", TODAY)).toBe([
      "Selam Ali Deneme, 20.10.2026 itibarıyla hesap dökümün:",
      "",
      "• Sal 06.10 maç payı: 100 ₺ – ödenmedi",
      "• Misafirin Misafir Mert, Sal 06.10 maç payı: 100 ₺ – ödenmedi (Kural 1.8)",
      "• Sal 13.10 maç payı: 100 ₺ – 40 ₺ ödendi, kalan 60 ₺",
      "• Cmt 17.10 Şile Paintball payı: 200 ₺ – ödenmedi",
      "• Ek boya (Cmt 17.10): 80 ₺ – ödenmedi (Kural 15.4)",
      "",
      "Toplam borç: 540 ₺",
      "",
      "Son ödemelerin: 14.10 40 ₺",
      "",
      "IBAN: TR11 (Deneme)",
      "",
      "Teşekkürler!",
    ].join("\n"));
  });

  it("ödeme ve IBAN yoksa o satırlar düşer; İngilizce ve organizatörün kendi şablonu", () => {
    const s = setup();
    s.settings.iban = "";
    setLang("tr");
    expect(statementText(s, "c", TODAY).split("\n").slice(-3)).toEqual(["Toplam borç: 400 ₺", "", "Teşekkürler!"]);
    setLang("en");
    expect(statementText(s, "c", TODAY)).toBe("Hi Cem Deneme, here is your account as of 20.10.2026:\n\n• Tue 06.10 match share: 100 ₺ – unpaid\n• Tue 13.10 match share: 100 ₺ – unpaid\n• Sat 17.10 Şile Paintball share: 200 ₺ – unpaid\n\nTotal due: 400 ₺\n\nThanks!");
    setLang("tr");
    s.settings.templates.statement = "{ad} | {toplam} | {dokum}";
    expect(statementText(s, "g1", TODAY)).toBe("Ali Deneme | 100 ₺ | • Misafirin Misafir Mert, Sal 06.10 maç payı: 100 ₺ – ödenmedi (Kural 1.8)");
    expect(statementText(s, "yok", TODAY)).toBe("");
  });

  it("yeni şablon her dilde ve etkinlik şablonlarında tanımlı; mevcut kısa hatırlatma değişmedi", () => {
    expect(TEMPLATE_KEYS).toContain("statement");
    for (const l of ["tr", "en"] as const) {
      expect(DEFAULT_TEMPLATES[l].statement).toBe(EVENT_TEMPLATES[l].statement);
      for (const ph of PLACEHOLDERS.statement) expect(DEFAULT_TEMPLATES[l].statement).toContain("{" + ph + "}");
    }
    setLang("tr");
    expect(personalPayText(setup(), "Deniz", 215)).toBe("Selam Deniz, organizasyonlardan kalan borcun 215 ₺.\nIBAN: TR11 (Deneme)\nTeşekkürler!");
  });
});
