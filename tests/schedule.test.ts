/** Maç planlama, rezervasyon hatırlatması ve takvim (.ics). */
import { describe, expect, it } from "vitest";
import { applyDefaults, autoMatch, ensureUpcoming, idSlot, makeMatch, matchDefaults, needsReservation, nextSlot, pristineAuto, pruneSchedule, rememberSkip, reschedule, slotId, unfinished, upcomingSlots } from "../src/domain/schedule";
import { buildICS, eventOf, googleCalendarUrl, icsEscape, icsFold } from "../src/domain/calendar";
import { allIn, match, player, state } from "./helpers/factory";
import { addInfraction } from "../src/domain/discipline";

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
    rememberSkip(s, made[0], NOW);
    s.matches = s.matches.filter((m) => m !== made[0]);
    made[1].status = "cancelled";
    rememberSkip(s, made[2], NOW);
    made[2].date = "2026-10-21";
    expect(ensureUpcoming(s, NOW)).toEqual([]);
    expect(s.matches.map((m) => m.date).sort()).toEqual(["2026-10-15", "2026-10-21", "2026-10-22"]);
    // Pencere ilerleyince yeni gün eklenir
    expect(ensureUpcoming(s, NOW, 5).map((m) => m.date)).toEqual(["2026-10-27"]);
  });
  it("atlanan zamanlar listesi büyümez: 60 günden eskiler atılır", () => {
    const s = state();
    s.skipped = ["2026-08-01 21:00", "2026-08-11 21:00", "2026-09-29 21:00"];
    const [first] = ensureUpcoming(s, NOW);
    rememberSkip(s, first, NOW);
    expect(s.skipped).toEqual(["2026-08-11 21:00", "2026-09-29 21:00", "2026-10-13 21:00"]);
  });
  it("cezalı ya da gruptan çıkarılmış sabit oyuncu otomatik maça yazılmaz; borca bakılmaz (Kural 2.4 yazılırken sorulur)", () => {
    const fixed = (id: string, name: string) => player(id, name, 3, "", { fixed: true });
    const s = state([fixed("a", "Sabit Selim"), fixed("b", "Sabit Borçlu"), fixed("c", "Sabit Cezalı")], [], { debtBlock: true });
    const unpaid = allIn(match("old", { date: "2026-10-06", status: "played", price: 500 }), ["b"]);
    unpaid.bill = { payers: ["b"], share: 500 };
    s.matches.push(unpaid);
    addInfraction(s, { pid: "c", type: "other", at: "2026-10-01", sanction: "ban", step: 3, rule: "9.3" }, "2026-10-01");
    const made = ensureUpcoming(s, NOW);
    expect(made).toHaveLength(4);
    for (const m of made) expect(m.order).toEqual(["a", "b"]);
    // Eşitlemenin "oluşturulduğu gibi" hâli (engelsiz) her sürümde aynı kalır
    expect(autoMatch(s, "2026-10-13", "21:00", "a202610132100").order).toEqual(["a", "b", "c"]);
  });
  it("maç başlayınca açılan yeni maça, o günün payını henüz ödememiş sabit oyuncular da yazılır", () => {
    const s = state([player("a", "Sabit Selim", 3, "", { fixed: true }), player("b", "Sabit Sinan", 3, "", { fixed: true })], [], { debtBlock: true });
    ensureUpcoming(s, NOW);
    // 13 Ekim 21:30: maç başladı, paylar henüz alınmadı; pencere bir sonraki maç gününe kayar
    const made = ensureUpcoming(s, new Date(2026, 9, 13, 21, 30));
    expect(made.map((m) => [m.date, m.order])).toEqual([["2026-10-27", ["a", "b"]]]);
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

describe("maç günü değişince plan", () => {
  // Salı/Perşembe 21:00 ile oluşmuş plan; organizatör Cuma 22:00'ye geçiyor
  const setup = () => {
    const s = state([player("a", "Sabit Selim", 3, "", { fixed: true }), player("b", "Bora Deneme")]);
    ensureUpcoming(s, NOW); // 13, 15, 20, 22 Ekim 21:00
    s.settings.slots = [{ d: 5, t: "22:00" }, { d: "", t: "21:00" }];
    return s;
  };
  const byDate = (s: ReturnType<typeof state>, d: string) => s.matches.find((m) => m.date === d)!;

  it("eski günlerdeki el sürülmemiş maçlar kalkar, yeni güne maç planlanır; sabit oyuncunun 'Var'ı dokunulmuşluk sayılmaz", () => {
    const s = setup();
    expect(pristineAuto(s, byDate(s, "2026-10-13"))).toBe(true);
    const { made, removed } = reschedule(s, NOW);
    expect(removed.map((m) => m.date)).toEqual(["2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22"]);
    expect(made.map((m) => m.date + " " + m.time)).toEqual(["2026-10-09 22:00", "2026-10-16 22:00", "2026-10-23 22:00", "2026-10-30 22:00"]);
    expect(s.matches.map((m) => m.date)).toEqual(["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
    // Tekrar çalışınca hiçbir şey değişmez
    expect(reschedule(s, NOW)).toEqual({ made: [], removed: [], changed: false });
  });

  it("içine yazılan, rezerve edilen, mesajı gönderilen, notu olan, misafirli, taşınan ya da kaydı bağlı maç kalır", () => {
    const s = setup();
    const keep = (d: string) => byDate(s, d);
    keep("2026-10-13").att.b = "in";
    keep("2026-10-13").order.push("b");
    keep("2026-10-15").reserved = true;
    keep("2026-10-20").sent = { invite: 1 };
    const moved = keep("2026-10-22");
    moved.date = "2026-10-21";
    const extra = autoMatch(s, "2026-10-27", "21:00", slotId("2026-10-27", "21:00"));
    extra.guests.push({ id: "g1", name: "Misafir Mert", rating: 3, pos: "", host: "a" });
    const paid = autoMatch(s, "2026-10-29", "21:00", slotId("2026-10-29", "21:00"));
    const noted = autoMatch(s, "2026-11-03", "21:00", slotId("2026-11-03", "21:00"));
    noted.note = "Krampon şart";
    s.matches.push(extra, paid, noted);
    s.payments.push({ id: "pay1", pid: "a", amount: 100, at: "2026-10-01", mid: paid.id });
    expect(pruneSchedule(s)).toEqual([]);
    expect(s.matches).toHaveLength(7);
  });

  it("elle açılan, oynanan ya da iptal edilen maça ve etkinliklere dokunulmaz", () => {
    const s = state([], [match("elle", { date: "2026-10-13" }), match(slotId("2026-10-15", "21:00"), { date: "2026-10-15", auto: true, status: "played" }),
      match(slotId("2026-10-20", "21:00"), { date: "2026-10-20", auto: true, status: "cancelled" }),
      match(slotId("2026-10-22", "21:00"), { date: "2026-10-22", auto: true, kind: "paintball" })], { slots: [{ d: 5, t: "22:00" }] });
    expect(pruneSchedule(s)).toEqual([]);
  });

  it("otomatik planlama kapatılınca el sürülmemiş otomatik maçlar kalkar; içine yazılan kalır", () => {
    const s = state([player("a", "Sabit Selim", 3, "", { fixed: true }), player("b", "Bora Deneme")]);
    ensureUpcoming(s, NOW);
    byDate(s, "2026-10-15").att.b = "in";
    s.settings.autoSchedule = false;
    const { made, removed } = reschedule(s, NOW);
    expect([made.length, removed.map((m) => m.date)]).toEqual([0, ["2026-10-13", "2026-10-20", "2026-10-22"]]);
    expect(s.matches.map((m) => m.date)).toEqual(["2026-10-15"]);
  });

  it("ayar başka yerde değiştiyse el sürülmemiş maçlar açılışta güncel format, saha ve ücreti alır; kesinleşmiş ve dokunulmuş maç kalır", () => {
    const s = state([player("b", "Bora Deneme")], [], { format: 7, price: 3000 });
    ensureUpcoming(s, NOW); // 13, 15, 20, 22 Ekim (7+1, 3000)
    s.fields.push({ id: "f1", name: "Deneme Halı Saha", address: "", link: "", phone: "", price: 4480, lat: null, lng: null });
    s.settings.defaultFieldId = "f1";
    s.settings.format = 6;
    byDate(s, "2026-10-20").att.b = "in";
    // 12 Ekim 22:00: 13 Ekim maçı kesinleşti
    const r = reschedule(s, new Date(2026, 9, 12, 22, 0));
    expect(r.changed).toBe(true);
    expect(s.matches.map((m) => m.date + " " + m.format + " " + m.fieldId + " " + m.price)).toEqual([
      "2026-10-13 7  3000", "2026-10-15 6 f1 4480", "2026-10-20 7  3000", "2026-10-22 6 f1 4480",
    ]);
  });

  it("maç günleri boşaltılırsa el sürülmemiş otomatik maçlar kalkar, yenisi oluşturulmaz", () => {
    const s = setup();
    s.settings.slots = [{ d: "", t: "21:00" }, { d: "", t: "21:00" }];
    const { made, removed } = reschedule(s, NOW);
    expect([made.length, removed.length, s.matches.length]).toEqual([0, 4, 0]);
  });
});

describe("ayar değişince yaklaşan maçlar", () => {
  const field = { id: "f1", name: "Deneme Halı Saha", address: "", link: "", phone: "", price: 4480, lat: null, lng: null };

  it("format ve ücret: kesinleşmemiş açık maçlar yeni değeri alır; maça özel değer, kesinleşmiş ve bitmiş maç kalır (Kural 1.4)", () => {
    const s = state([], [], { format: 7, price: 3000 });
    ensureUpcoming(s, NOW); // 13, 15, 20, 22 Ekim
    const [m13, m15, m20] = s.matches;
    m15.price = 3500; // organizatör bu maçın ücretini elle girdi
    s.matches.push(match("eski", { date: "2026-10-06", status: "played", format: 7, price: 3000 }));
    const before = matchDefaults(s);
    s.settings.format = 6;
    s.settings.price = 4480;
    // 12 Ekim 22:00: 13 Ekim maçının kadrosu kesinleşti
    const n = applyDefaults(s, before, new Date(2026, 9, 12, 22, 0));
    expect(n).toBe(3);
    expect([m13.format, m13.price]).toEqual([7, 3000]);
    expect([m15.format, m15.price]).toEqual([6, 3500]);
    expect([m20.format, m20.price]).toEqual([6, 4480]);
    expect(s.matches.find((m) => m.id === "eski")).toMatchObject({ format: 7, price: 3000 });
  });

  it("varsayılan saha seçilince sahası boş maçlar o sahayı ve ücretini alır; başka sahalı maç kalır", () => {
    const s = state([], [], { price: 3000 });
    ensureUpcoming(s, NOW);
    const other = { ...field, id: "f2", name: "Öbür Saha", price: 2500 };
    s.fields.push(field, other);
    s.matches[1].fieldId = "f2";
    s.matches[1].price = 2500;
    const before = matchDefaults(s);
    s.settings.defaultFieldId = "f1";
    expect(applyDefaults(s, before, NOW)).toBe(3);
    expect(s.matches.map((m) => m.fieldId + " " + m.price)).toEqual(["f1 4480", "f2 2500", "f1 4480", "f1 4480"]);
  });

  it("etkinliklere dokunulmaz; değişiklik yoksa 0", () => {
    const s = state([], [match("pb", { kind: "paintball", date: "2026-10-17", format: 7, price: 3000 })], { format: 7, price: 3000 });
    const before = matchDefaults(s);
    expect(applyDefaults(s, before, NOW)).toBe(0);
    s.settings.format = 6;
    expect(applyDefaults(s, before, NOW)).toBe(0);
    expect(s.matches[0].format).toBe(7);
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

describe("sonucu girilmemiş maç", () => {
  it("halı saha başlangıçtan 3, etkinlik 6 saat sonra; oynanan ve iptal edilen sayılmaz; en eskisi önce", () => {
    const a = match("a", { date: "2026-10-09", time: "09:00" });
    const b = match("b", { date: "2026-10-09", time: "09:01" });
    const c = match("c", { date: "2026-10-08", time: "21:00", status: "played" });
    const d = match("d", { date: "2026-10-07", time: "21:00", status: "cancelled" });
    const e = match("e", { date: "2026-10-09", time: "07:00", kind: "paintball" });
    const f = match("f", { date: "2026-10-09", time: "05:59", kind: "paintball" });
    const g = match("g", { date: "2026-10-06", time: "21:00" });
    const s = state([], [a, b, c, d, e, f, g]);
    expect(unfinished(s, NOW).map((m) => m.id)).toEqual(["g", "f", "a"]);
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
