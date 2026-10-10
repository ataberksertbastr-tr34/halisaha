/** Maç planlama, rezervasyon hatırlatması ve takvim (.ics). */
import { describe, expect, it } from "vitest";
import { autoMatch, ensureUpcoming, idSlot, makeMatch, needsReservation, nextSlot, rememberSkip, slotId, upcomingSlots } from "../src/domain/schedule";
import { buildICS, eventOf, googleCalendarUrl, icsEscape, icsFold } from "../src/domain/calendar";
import { match, player, state } from "./helpers/factory";

// Cuma 9 Ekim 2026, 12:00 (yerel)
const NOW = new Date(2026, 9, 9, 12, 0);

describe("haftalık maç günleri", () => {
  it("sıradaki maç günü (eski davranış)", () => {
    const s = state(); // Salı ve Perşembe 21:00
    expect(nextSlot(s, "2026-10-09")).toEqual({ date: "2026-10-13", time: "21:00" });
    expect(nextSlot(s, "2026-10-13")).toEqual({ date: "2026-10-15", time: "21:00" });
  });
  it("yeni maç son maçtan sonraki ilk güne", () => {
    const s = state([], [match("a", { date: "2026-10-15" })]);
    expect(makeMatch(s, "2026-10-09").date).toBe("2026-10-20");
  });
  it("ileriye 4 maç zamanı; bugünün saati geçmişse bugün sayılmaz", () => {
    const s = state([], [], { slots: [{ d: 5, t: "11:00" }, { d: 5, t: "20:00" }, { d: 2, t: "21:00" }] });
    expect(upcomingSlots(s, NOW)).toEqual([
      { date: "2026-10-09", time: "20:00" },
      { date: "2026-10-13", time: "21:00" },
      { date: "2026-10-16", time: "11:00" },
      { date: "2026-10-16", time: "20:00" },
    ]);
  });
});

describe("otomatik planlama", () => {
  it("eksik maçları oluşturur, sabit oyuncuları 'Var' yazar, var olanı tekrar oluşturmaz", () => {
    const s = state([player("a", "Sabit Selim", 3, "", { fixed: true })], [match("x", { date: "2026-10-13", time: "21:00" })]);
    const made = ensureUpcoming(s, NOW);
    expect(made.map((m) => m.date)).toEqual(["2026-10-15", "2026-10-20", "2026-10-22"]);
    expect(made.every((m) => m.auto && m.att.a === "in")).toBe(true);
    expect(ensureUpcoming(s, NOW)).toEqual([]);
    expect(s.matches).toHaveLength(4);
  });
  it("silinen ya da taşınan otomatik maç geri gelmez; iptal edilen maç yerinde kalır", () => {
    const s = state();
    const made = ensureUpcoming(s, NOW);
    rememberSkip(s, made[0]);
    s.matches = s.matches.filter((m) => m !== made[0]);
    made[1].status = "cancelled";
    rememberSkip(s, made[2]);
    made[2].date = "2026-10-21";
    expect(ensureUpcoming(s, NOW)).toEqual([]);
    expect(s.matches.map((m) => m.date).sort()).toEqual(["2026-10-15", "2026-10-21", "2026-10-22"]);
    // Pencere ilerleyince yeni gün eklenir
    expect(ensureUpcoming(s, NOW, 5).map((m) => m.date)).toEqual(["2026-10-27"]);
  });
  it("otomatik maçın kimliği zamanından türetilir; eski maçların kimliği değişmez", () => {
    const s = state([], [match("x", { date: "2026-10-13", time: "21:00" })]);
    const made = ensureUpcoming(s, NOW);
    expect(made.map((m) => m.id)).toEqual(["a202610152100", "a202610202100", "a202610222100"]);
    expect(s.matches[0].id).toBe("x");
    expect(slotId("2026-10-15", "21:00")).toBe("a202610152100");
  });
  it("iki cihaz aynı maçı ayrı ayrı oluşturursa kimlikler aynıdır", () => {
    const phone = state([player("a", "Sabit Selim", 3, "", { fixed: true })]);
    const pc = state();
    expect(ensureUpcoming(phone, NOW).map((m) => m.id)).toEqual(ensureUpcoming(pc, NOW).map((m) => m.id));
  });
  it("türetilen kimlik başka bir maçta kullanılıyorsa rastgele kimlik verilir", () => {
    // Organizatör 15 Ekim maçını 20:00'ye almış (kimlik aynı kalır); 21:00 yeniden oluşturulursa çakışmamalı
    const moved = match("a202610152100", { date: "2026-10-15", time: "20:00", auto: true });
    const s = state([], [moved]);
    const made = ensureUpcoming(s, NOW);
    const again = made.find((m) => m.date === "2026-10-15" && m.time === "21:00")!;
    expect(again.id).not.toBe("a202610152100");
    expect(new Set(s.matches.map((m) => m.id)).size).toBe(s.matches.length);
    expect(made.filter((m) => m !== again).map((m) => m.id)).toEqual(["a202610132100", "a202610202100", "a202610222100"]);
  });
  it("kimlikten zaman geri okunur; zamandan türetilmemiş kimlik null", () => {
    expect(idSlot(slotId("2026-10-15", "21:00"))).toEqual({ date: "2026-10-15", time: "21:00" });
    expect(idSlot("a202601050930")).toEqual({ date: "2026-01-05", time: "09:30" });
    expect(idSlot("m1")).toBeNull();
    expect(idSlot("a2026101521")).toBeNull();
    expect(idSlot("xa202610152100")).toBeNull();
  });
  it("autoMatch: otomatik planlamanın oluşturacağı maçın aynısı; durumu değiştirmez", () => {
    const s = state([player("a", "Sabit Selim", 3, "", { fixed: true }), player("b", "Pasif Polat", 3, "", { fixed: true, active: false })], [], { price: 3200 });
    const snap = JSON.stringify(s);
    const m = autoMatch(s, "2026-10-13", "21:00", "a202610132100");
    expect(JSON.stringify(s)).toBe(snap);
    expect(m).toMatchObject({ id: "a202610132100", auto: true, price: 3200, status: "open", att: { a: "in" }, order: ["a"] });
    expect(ensureUpcoming(s, NOW)[0]).toEqual(m);
    expect(autoMatch(s, "2026-10-13", "21:00").id).not.toBe("a202610132100");
  });
  it("ayar kapalıysa hiçbir şey oluşturmaz", () => {
    const s = state([], [], { autoSchedule: false });
    expect(ensureUpcoming(s, NOW)).toEqual([]);
  });
});

describe("saha rezervasyonu hatırlatması", () => {
  it("ayarlanan gün sayısı içinde, rezerve edilmemiş açık maçlar", () => {
    const a = match("a", { date: "2026-10-10", time: "21:00" });
    const b = match("b", { date: "2026-10-11", time: "21:00", reserved: true });
    const c = match("c", { date: "2026-10-13", time: "21:00" });
    const d = match("d", { date: "2026-10-08", time: "21:00" });
    const s = state([], [a, b, c, d], { reserveDays: 2 });
    expect(needsReservation(s, NOW).map((m) => m.id)).toEqual(["a"]);
    s.settings.reserveDays = 0;
    expect(needsReservation(s, NOW)).toEqual([]);
  });
});

describe("takvim", () => {
  it(".ics: UTC zaman, 60 dk, alarm, kaçış ve CRLF", () => {
    const m = match("m1", { date: "2026-10-13", time: "21:00", format: 7 });
    const s = state([], [m]);
    s.fields = [{ id: "f", name: "Çamlık, Spor; Tesisi", address: "Örnek Mah.", link: "", phone: "", price: 0, lat: null, lng: null }];
    m.fieldId = "f";
    const e = eventOf(s, m, "Halı saha");
    expect(e.end.getTime() - e.start.getTime()).toBe(60 * 60 * 1000);
    const ics = buildICS([e], new Date(Date.UTC(2026, 9, 1)));
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(ics).toContain("UID:m1@halisaha");
    expect(ics).toContain("DTSTAMP:20261001T000000Z");
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toContain("SUMMARY:Halı saha – Çamlık\\, Spor\\; Tesisi");
    expect(ics).toContain("TRIGGER:-PT120M");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it("uzun satırlar UTF-8 karakter bölünmeden katlanır", () => {
    const long = "DESCRIPTION:" + "ğüşiöç".repeat(30);
    const folded = icsFold(long);
    expect(folded.split("\r\n ").join("")).toBe(long);
    folded.split("\r\n").forEach((l) => expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75));
  });
  it("kaçış kuralları ve Google Takvim bağlantısı", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const m = match("m", { date: "2026-10-13", time: "21:00" });
    const url = googleCalendarUrl(eventOf(state([], [m]), m, "Halı saha"));
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Hal/);
    expect(url).toMatch(/dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
  });
});
