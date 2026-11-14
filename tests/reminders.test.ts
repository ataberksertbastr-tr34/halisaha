/**
 * Organizatör hatırlatmaları: haftalık maç günlerinden telefonun takvimine eklenen tekrarlı
 * hatırlatmalar (.ics ve Google Takvim), ilgili ayarlar ve iş listesindeki davet uyarısı.
 */
import { describe, expect, it } from "vitest";
import { icsLocal, orgReminders, remGoogleUrl, remindersICS, remUid } from "../src/domain/reminders";
import { migrate } from "../src/domain/migrate";
import { merge3 } from "../src/sync/merge";
import { matchSteps } from "../src/domain/todo";
import { setLang } from "../src/i18n";
import type { State } from "../src/domain/types";
import { match, roster, state } from "./helpers/factory";

setLang("tr");

/** Yerel saatle an: Pazar 11.10.2026 12:00 */
const NOW = new Date(2026, 9, 11, 12, 0);
const fmt = (d: Date) => icsLocal(d);

describe("hatırlatma zamanları", () => {
  it("her maç günü için beş hatırlatma: davet, saha, kesinleşme, sonuç, ödeme", () => {
    const s = state();
    const list = orgReminders(s, NOW);
    expect(list.map((r) => r.kind + "@" + r.slot.d)).toEqual(["invite@2", "field@2", "lock@2", "result@2", "pay@2", "invite@4", "field@4", "lock@4", "result@4", "pay@4"]);
    // Salı 13.10 21:00 maçı: davet 3 gün önce 12:00 (geçti → bir hafta sonrası), saha 2 gün önce 12:00 (şu an → bir hafta sonrası),
    // kesinleşme 24 saat + 2 saat önce, sonuç maç bitiminden 30 dk sonra, ödeme ertesi gün 12:00
    expect(list.slice(0, 5).map((r) => fmt(r.start))).toEqual(["20261017T120000", "20261018T120000", "20261012T190000", "20261013T223000", "20261014T120000"]);
    // Perşembe 15.10 21:00 maçı
    expect(list.slice(5).map((r) => fmt(r.start))).toEqual(["20261012T120000", "20261013T120000", "20261014T190000", "20261015T223000", "20261016T120000"]);
    // Hepsi gelecekte
    expect(list.every((r) => r.start.getTime() > NOW.getTime())).toBe(true);
  });

  it("başlık ve açıklama maç gününü, kesinleşme saatini ve uygulama adresini taşır", () => {
    const list = orgReminders(state(), NOW, "https://ornek.test/halisaha/");
    expect(list.slice(0, 5).map((r) => r.title)).toEqual([
      "Davet gönder: Salı 21:00 maçı", "Sahayı ara, rezerve et: Salı 21:00 maçı", "Kadro kesinleşiyor (21:00): Salı 21:00 maçı", "Sonucu gir: Salı 21:00 maçı", "Ödemeleri kapat: Salı 21:00 maçı",
    ]);
    expect(list[2].description).toBe("Kadro maçtan 24 saat önce kesinleşir (Kural 1.4). Eksik varsa yedekleri ve grubu uyar; kesinleşince kadroyu paylaş.\nhttps://ornek.test/halisaha/");
    setLang("en");
    expect(orgReminders(state(), NOW)[0].title).toBe("Send invite: Tuesday 21:00 match");
    setLang("tr");
  });

  it("ayarlar: davet günü, hatırlatma saati, saha hatırlatması; boş ve yinelenen maç günleri", () => {
    const s = state([], [], { slots: [{ d: 6, t: "19:30" }, { d: "", t: "21:00" }, { d: 6, t: "19:30" }], inviteDays: 5, remindAt: "09:15", reserveDays: 0 });
    const list = orgReminders(s, NOW);
    expect(list).toHaveLength(5);
    // Cumartesi 17.10 19:30: davet 5 gün önce 09:15, saha (hatırlatma kapalı → 2 gün önce) 09:15, kesinleşme Cuma 17:30
    expect(list.map((r) => fmt(r.start))).toEqual(["20261012T091500", "20261015T091500", "20261016T173000", "20261017T210000", "20261018T091500"]);
    expect(list[2].title).toBe("Kadro kesinleşiyor (19:30): Cumartesi 19:30 maçı");
    expect(orgReminders(state([], [], { slots: [{ d: "", t: "21:00" }] }), NOW)).toEqual([]);
  });
});

describe("takvim dosyası ve Google Takvim", () => {
  it(".ics: yerel saat, haftalık tekrar, başlangıçta bildirim, sabit kimlik, CRLF", () => {
    const list = orgReminders(state(), NOW, "https://ornek.test/halisaha/");
    const ics = remindersICS(list, new Date(Date.UTC(2026, 9, 11, 9, 0)));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(10);
    expect(ics).toContain("UID:hatirlatma-invite-2-2100@halisaha\r\nDTSTAMP:20261011T090000Z\r\nDTSTART:20261017T120000\r\nDTEND:20261017T121500\r\nRRULE:FREQ=WEEKLY;BYDAY=SA\r\nSUMMARY:Davet gönder: Salı 21:00 maçı");
    expect(ics).toContain("UID:hatirlatma-lock-4-2100@halisaha\r\nDTSTAMP:20261011T090000Z\r\nDTSTART:20261014T190000\r\nDTEND:20261014T191500\r\nRRULE:FREQ=WEEKLY;BYDAY=WE");
    expect(ics.match(/BEGIN:VALARM\r\nTRIGGER:PT0M\r\nACTION:DISPLAY/g)).toHaveLength(10);
    // Saat dilimi yazılmaz: kayıt telefonun yerel saatinde kalır
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
    // 75 baytı aşan satır yok (katlanmış)
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(remUid(list[0])).toBe("hatirlatma-invite-2-2100@halisaha");
  });

  it("Google Takvim bağlantısı haftalık tekrarı ve saat dilimini taşır", () => {
    const r = orgReminders(state(), NOW)[0];
    const u = new URL(remGoogleUrl(r, "Europe/Istanbul"));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      action: "TEMPLATE", text: "Davet gönder: Salı 21:00 maçı", dates: "20261017T120000/20261017T121500",
      details: "Predators · Organizatör → Etkinlik → Davet mesajı.", recur: "RRULE:FREQ=WEEKLY;BYDAY=SA", ctz: "Europe/Istanbul",
    });
    expect(new URL(remGoogleUrl(r)).searchParams.has("ctz")).toBe(false);
  });
});

describe("hatırlatma ayarları", () => {
  it("eski veride varsayılanlar gelir; bozuk değerler düzeltilir", () => {
    const s = migrate({ v: 5, settings: { lang: "tr" }, players: [], matches: [] });
    expect([s.settings.inviteDays, s.settings.remindAt]).toEqual([3, "12:00"]);
    const fix = (inviteDays: unknown, remindAt: unknown) => {
      const x = migrate({ v: 6, settings: { lang: "tr", inviteDays, remindAt }, players: [], matches: [] });
      return [x.settings.inviteDays, x.settings.remindAt];
    };
    expect(fix(5, "09:15")).toEqual([5, "09:15"]);
    expect(fix(0, "25:00")).toEqual([3, "12:00"]);
    expect(fix(40, "9:5")).toEqual([6, "12:00"]);
    expect(fix("x", null)).toEqual([3, "12:00"]);
  });

  it("iki cihazda ayrı ayrı değiştirilen hatırlatma ayarları birlikte korunur", () => {
    const b: State = migrate(state(roster(2), [match("m1")]));
    b.updatedAt = 1000;
    const fork = (t: number): State => ({ ...(JSON.parse(JSON.stringify(b)) as State), updatedAt: t });
    const l = fork(2000), r = fork(3000);
    l.settings.inviteDays = 5;
    r.settings.remindAt = "18:30";
    const out = merge3(b, l, r);
    expect([out.settings.inviteDays, out.settings.remindAt]).toEqual([5, "18:30"]);
  });

  it("iş listesi: davet günü ve saati gelince davet adımı uyarıya döner", () => {
    const m = match("m1", { format: 4, date: "2026-10-15", time: "21:00" });
    const s = state(roster(4), [m]);
    const invite = (now: Date) => matchSteps(s, m, now, "2026-10-12").find((x) => x.key === "invite")!.state;
    // Perşembe 15.10 maçı, davet 3 gün önce 12:00 → Pazartesi 12.10 12:00
    expect(invite(new Date(2026, 9, 12, 11, 59))).toBe("todo");
    expect(invite(new Date(2026, 9, 12, 12, 0))).toBe("warn");
    s.settings.inviteDays = 1;
    s.settings.remindAt = "18:00";
    expect(invite(new Date(2026, 9, 14, 17, 0))).toBe("todo");
    expect(invite(new Date(2026, 9, 14, 18, 0))).toBe("warn");
    m.sent.invite = 1;
    expect(invite(new Date(2026, 9, 14, 18, 0))).toBe("done");
  });
});
