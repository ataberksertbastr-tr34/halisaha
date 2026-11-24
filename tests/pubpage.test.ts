/**
 * Oyuncu durum sayfası: yayınlanan veri yalnızca kadro ve sıradır (kişisel veri yok), yaklaşan
 * etkinliklerle sınırlıdır, takımlar yalnızca paylaşıldıysa görünür. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { newPubId, pubSnapshot, validPubId } from "../src/domain/pubpage";
import { ensureUpcoming } from "../src/domain/schedule";
import { teamsSig } from "../src/domain/todo";
import { migrate } from "../src/domain/migrate";
import { merge3 } from "../src/sync/merge";
import { setLang } from "../src/i18n";
import type { State } from "../src/domain/types";
import { allIn, match, player, state } from "./helpers/factory";

setLang("tr");
const TODAY = "2026-10-11";
const NOW = new Date(2026, 9, 11, 12, 0);

/** 2+1 format (kontenjan 6): yedi kişi "Var", biri misafir; biri Belki. */
function setup(): State {
  const ps = [
    player("a", "Ali Deneme", 5, "GK", { phone: "0555 000 00 01", bank: ["ALİ DENEME"] }), player("b", "Berk Deneme", 1), player("c", "Cem Deneme"),
    player("d", "Deniz Deneme"), player("e", "Ege Deneme"), player("f", "Fatih Deneme"), player("h", "Hakan Deneme"),
  ];
  const m = match("m1", { date: "2026-10-15", time: "21:00", format: 2, guests: [{ id: "g1", name: "Misafir Mert", rating: 3, pos: "", host: "b" }] });
  allIn(m, ["a", "b", "c", "d", "e", "g1", "f"]);
  m.att.h = "maybe";
  const s = state(ps, [m], { iban: "TR11 2222", ibanName: "Organizatör Deneme" });
  s.fields.push({ id: "f1", name: "Deneme Halı Saha", address: "Gizli Sokak 5", link: "https://maps.app.goo.gl/deneme", phone: "0212 000 00 00", price: 3000, lat: null, lng: null });
  m.fieldId = "f1";
  return s;
}

describe("yayınlanan veri", () => {
  it("kadro sırasıyla, yedek sırasıyla, misafir işaretli; kesinleşme anı ve kuralı", () => {
    const s = setup();
    const p = pubSnapshot(s, NOW, TODAY);
    expect(p.v).toBe(1);
    expect(p.lang).toBe("tr");
    expect(p.events).toHaveLength(1);
    const e = p.events[0];
    expect(e).toMatchObject({ icon: "⚽", title: "Halı saha maçı", date: "2026-10-15", time: "21:00", venue: "Deneme Halı Saha", map: "https://maps.app.goo.gl/deneme", cap: 6, lockRule: "1.4", maybe: 1 });
    expect(e.playing).toEqual([{ n: "Ali Deneme" }, { n: "Berk Deneme" }, { n: "Cem Deneme" }, { n: "Deniz Deneme" }, { n: "Ege Deneme" }, { n: "Misafir Mert", g: 1 }]);
    expect(e.wait).toEqual([{ n: "Fatih Deneme" }]);
    expect(e.lockAt).toBe(new Date(2026, 9, 14, 21, 0).getTime());
    expect(e.teams).toBeUndefined();
  });

  it("telefon, IBAN, seviye, mevki, adres, banka adı, borç ve getiren yazılmaz", () => {
    const s = setup();
    const json = JSON.stringify(pubSnapshot(s, NOW, TODAY));
    for (const secret of ["0555", "TR11", "Organizatör Deneme", "Gizli Sokak", "0212", "ALİ DENEME", "GK", "rating", "host", "phone", "\"b\"", "3000"]) expect(json).not.toContain(secret);
  });

  it("takımlar yalnızca paylaşıldıysa ve paylaşıldığı gibi duruyorsa", () => {
    const s = setup();
    const m = s.matches[0];
    m.teams = { a: ["a", "b", "c"], b: ["d", "e", "g1"] };
    expect(pubSnapshot(s, NOW, TODAY).events[0].teams).toBeUndefined();
    m.sent.teams = 1;
    m.sent.teamsSig = teamsSig(m);
    const t = pubSnapshot(s, NOW, TODAY).events[0].teams!;
    expect([t.a.name, t.b.name, t.a.color, t.b.color]).toEqual(["Sarılar", "Turuncular", "#E6CF3A", "#EE7A2C"]);
    expect(t.b.ids).toEqual([{ n: "Deniz Deneme" }, { n: "Ege Deneme" }, { n: "Misafir Mert", g: 1 }]);
    // Paylaşıldıktan sonra takas: eski hâli yayınlanmaz, yenisi de paylaşılmadan görünmez
    m.teams = { a: ["a", "b", "d"], b: ["c", "e", "g1"] };
    expect(pubSnapshot(s, NOW, TODAY).events[0].teams).toBeUndefined();
  });

  it("yalnızca açık ve yaklaşan ilk üç etkinlik (14 gün); maç saatinden 3 saat sonrasına kadar görünür", () => {
    const s = setup();
    const mk = (id: string, date: string, extra = {}) => s.matches.push(match(id, { date, time: "21:00", ...extra }));
    mk("old", "2026-10-08");
    mk("cancel", "2026-10-13", { status: "cancelled" });
    mk("played", "2026-10-12", { status: "played" });
    mk("ev", "2026-10-17", { kind: "paintball", title: "Şile Paintball", cap: 12, time: "11:00" });
    mk("m2", "2026-10-20");
    mk("m3", "2026-10-22");
    mk("far", "2026-10-26");
    expect(pubSnapshot(s, NOW, TODAY).events.map((e) => e.date)).toEqual(["2026-10-15", "2026-10-17", "2026-10-20"]);
    const ev = pubSnapshot(s, NOW, TODAY).events[1];
    expect([ev.icon, ev.title, ev.lockRule, ev.cap]).toEqual(["🎯", "Şile Paintball", "15.3", 12]);
    // Maç günü 23:30'da hâlâ görünür, ertesi sabah görünmez
    expect(pubSnapshot(s, new Date(2026, 9, 15, 23, 30), "2026-10-15").events[0].date).toBe("2026-10-15");
    expect(pubSnapshot(s, new Date(2026, 9, 16, 9, 0), "2026-10-16").events[0].date).toBe("2026-10-17");
  });
});

describe("otomatik açılmış maçlar", () => {
  it("organizatörün el sürmediği otomatik maç görünmez; içine yazılan ya da daveti gönderilen görünür", () => {
    // Salı ve Perşembe 21:00: 13, 15, 20, 22 Ekim kendiliğinden açılır
    const s = state([player("a", "Ali Deneme"), player("s", "Sabit Selim", 3, "", { fixed: true })]);
    ensureUpcoming(s, NOW);
    const at = (d: string) => s.matches.find((m) => m.date === d)!;
    expect(pubSnapshot(s, NOW, TODAY).events).toEqual([]);
    at("2026-10-15").att.a = "in";
    at("2026-10-15").order.push("a");
    at("2026-10-20").sent = { invite: NOW.getTime() };
    expect(pubSnapshot(s, NOW, TODAY).events.map((e) => e.date)).toEqual(["2026-10-15", "2026-10-20"]);
    // Elle açılan maç boş olsa da görünür
    s.matches.push(match("elle", { date: "2026-10-17", time: "11:00" }));
    expect(pubSnapshot(s, NOW, TODAY).events.map((e) => e.date)).toEqual(["2026-10-15", "2026-10-17", "2026-10-20"]);
  });
});

describe("sayfa kimliği ve ayarı", () => {
  it("rastgele, 24 karakter, karışabilecek harfler yok; biçim denetimi", () => {
    const id = newPubId();
    expect(id).toMatch(/^[a-z2-9]{24}$/);
    expect(id).not.toMatch(/[lo01]/);
    expect(newPubId()).not.toBe(id);
    expect(validPubId(id)).toBe(true);
    for (const bad of ["", "kisa", "BUYUKHARFLERLEOLMAZ12345", "nokta.ile/olmaz-12345678", "a".repeat(41)]) expect(validPubId(bad)).toBe(false);
  });

  it("eski veride kapalı; bozuk kimlik kapatır; eşitlemede iki cihazdan biri açtıysa açık kalır", () => {
    expect(migrate({ v: 5, settings: {}, players: [], matches: [] }).settings.pubId).toBe("");
    expect(migrate({ v: 6, settings: { pubId: "../baska-yol" }, players: [], matches: [] }).settings.pubId).toBe("");
    const b = migrate(setup());
    b.updatedAt = 1000;
    const l = { ...(JSON.parse(JSON.stringify(b)) as State), updatedAt: 2000 }, r = { ...(JSON.parse(JSON.stringify(b)) as State), updatedAt: 3000 };
    const id = newPubId();
    l.settings.pubId = id;
    r.players[0].rating = 4;
    const out = merge3(b, l, r);
    expect([out.settings.pubId, out.players[0].rating]).toEqual([id, 4]);
  });
});
