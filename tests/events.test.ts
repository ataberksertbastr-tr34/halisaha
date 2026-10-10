/**
 * Predators etkinlikleri: şema v3→v4, etkinlik oluşturma, kesinleşme, kadro
 * cezası (1.6), ön anlaşmalar ve mesajlar. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { migrate } from "../src/domain/migrate";
import { SCHEMA_VERSION } from "../src/domain/schema";
import { capOf, lineup, materializeOrder, penalized, active } from "../src/domain/lineup";
import { isLocked, lockAt, lockHours } from "../src/domain/roster";
import { makeEvent, nextSaturday } from "../src/domain/schedule";
import { agreeValue, checkProgress, KIND_DEFS, kindOf, pendingAgreements } from "../src/domain/kinds";
import { msgBrief, msgCancel, msgCars, msgInvite, msgPay, msgSquad, msgTeams } from "../src/domain/messages";
import { estShare, billOf } from "../src/domain/money";
import { KINDS } from "../src/domain/types";
import { setLang } from "../src/i18n";
import { allIn, match, player, roster, state } from "./helpers/factory";

setLang("tr");

describe("şema v3 → v4", () => {
  const v3 = {
    v: 3,
    settings: { lang: "tr", format: 7, price: 3000 },
    players: [{ id: "p1", name: "Deniz Deneme", rating: 4, pos: "MID", phone: "", active: true, fixed: false }],
    matches: [{ id: "m1", date: "2026-09-01", time: "21:00", price: 3000, format: 7, status: "played", att: { p1: "in" }, order: ["p1"], guests: [], exempt: {}, teams: { a: ["p1"], b: [] }, score: { a: 3, b: 2 }, locks: {}, goals: {}, mvp: "", noshow: {}, reserved: true }],
    payments: [{ id: "x", pid: "p1", amount: 500, at: "2026-09-01", mid: "m1" }],
    expenses: [],
    fields: [],
    pairRules: [],
  };
  const s = migrate(v3);
  it("güncel sürüme taşınır, eski maçlar halı saha olur", () => {
    expect(s.v).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(4);
    const m = s.matches[0];
    expect(m.kind).toBe("football");
    expect(m.lockH).toBe(24);
    expect(m.cap).toBe(0);
    expect(m.title).toBe("");
    expect(m.removed).toEqual({});
    expect(m.checks).toEqual({});
    expect(m.agree).toEqual({});
    expect(m.cars).toEqual([]);
    expect(m.games).toEqual([]);
    expect(m.score).toEqual({ a: 3, b: 2 });
    expect(m.reserved).toBe(true);
  });
  it("yeni listeler ve ayarlar varsayılanla gelir, eski veri korunur", () => {
    expect(s.charges).toEqual([]);
    expect(s.discipline).toEqual([]);
    expect(s.settings.debtBlock).toBe(true);
    expect(s.settings.noShowPenalty).toBe(true);
    expect(s.settings.teamA).toEqual({ name: "", color: "" });
    expect(s.payments).toHaveLength(1);
    expect(s.players[0].name).toBe("Deniz Deneme");
  });
  it("bozuk etkinlik alanları temizlenir, geçerliler korunur", () => {
    const bad = migrate({
      ...v3, v: 4,
      matches: [{ ...v3.matches[0], kind: "uçak", cap: -3, lockH: "x", agree: { dur: "60", bad: 5 }, cars: [{ id: "c", driver: "p1", seats: 5, pax: ["p2", 3], fuel: "100", toll: 0 }, "x"], games: [{ id: "g", type: "sets", label: "1", a: ["p1"], b: ["p2"], cfg: { to: 25, last: 15, bestOf: 3, by2: true, serve: "rally" }, pts: ["a", "b2", "zz", "a9"], first: "a", done: false, at: "2026-09-01" }, { id: "g2", type: "uçuş" }] }],
      charges: [{ id: "c1", pid: "p1", amount: 120, at: "2026-09-01", note: "boya" }, { id: "", amount: "x" }],
      discipline: [{ id: "d1", pid: "p1", at: "2026-09-01", type: "swear", rule: "9.2", sanction: "warn", step: 9, note: "" }, { id: "d2", sanction: "kurşuna diz" }],
    });
    const m = bad.matches[0];
    expect(m.kind).toBe("football");
    expect(m.cap).toBe(0);
    expect(m.lockH).toBe(24);
    expect(m.agree).toEqual({ dur: "60", bad: "5" });
    expect(m.cars).toHaveLength(1);
    expect(m.cars[0].pax[0]).toBe("p2");
    expect(m.cars[0].fuel).toBe(100);
    expect(m.games).toHaveLength(2);
    expect(m.games[0].pts).toEqual(["a", "b2", "a9"]);
    expect(m.games[1].type).toBe("result");
    expect(bad.charges).toHaveLength(1);
    expect(bad.discipline).toHaveLength(1);
    expect(bad.discipline[0].step).toBe(3);
  });
});

describe("etkinlik oluşturma (Kural 15.2)", () => {
  it("her tür için varsayılan kontenjan, kesinleşme ve sıradaki cumartesi", () => {
    const s = state(roster(4));
    for (const k of KINDS) {
      if (k === "football") continue;
      const m = makeEvent(s, k, "2026-10-10");
      expect(m.kind).toBe(k);
      expect(m.date).toBe("2026-10-17");
      expect(m.cap).toBe(KIND_DEFS[k].cap);
      expect(m.lockH).toBe(KIND_DEFS[k].lockH);
      expect(m.time).toBe(KIND_DEFS[k].time);
    }
    expect(nextSaturday("2026-10-16")).toBe("2026-10-17");
  });
  it("aynı türün son etkinliğinden saat, kontenjan, ücret ve anlaşmaları alır", () => {
    const prev = match("e0", { kind: "paintball", date: "2026-09-05", time: "10:30", cap: 14, lockH: 72, price: 8400, agree: { range: "venue" }, status: "played" });
    const s = state(roster(4), [prev]);
    const m = makeEvent(s, "paintball", "2026-10-10");
    expect(m.time).toBe("10:30");
    expect(m.cap).toBe(14);
    expect(m.lockH).toBe(72);
    expect(m.price).toBe(8400);
    expect(m.agree.range).toBe("venue");
  });
  it("halı saha seçilirse normal maç kurulur", () => {
    const s = state(roster(4), [], { slots: [{ d: 2, t: "21:00" }, { d: 4, t: "21:00" }] });
    const m = makeEvent(s, "football", "2026-10-10");
    expect(m.kind).toBe("football");
    expect(m.date).toBe("2026-10-13");
  });
});

describe("kontenjan ve kesinleşme", () => {
  it("halı sahada format, etkinlikte kontenjan; 0 sınırsız, yedek yok", () => {
    const s = state(roster(20));
    const fb = allIn(match("m"), s.players.map((p) => p.id));
    expect(capOf(s, fb)).toBe(16);
    expect(lineup(s, fb).wait).toHaveLength(4);
    const ev = allIn(match("e", { kind: "kiraathane", cap: 0 }), s.players.map((p) => p.id));
    expect(capOf(s, ev)).toBe(0);
    expect(lineup(s, ev).playing).toHaveLength(20);
    expect(lineup(s, ev).wait).toEqual([]);
    const pb = allIn(match("p", { kind: "paintball", cap: 12 }), s.players.map((p) => p.id));
    expect(lineup(s, pb).playing).toHaveLength(12);
    expect(lineup(s, pb).wait).toHaveLength(8);
  });
  it("kesinleşme: halı saha 24 saat, etkinlikte kendi süresi (Kural 15.3)", () => {
    const fb = match("m", { date: "2026-10-13", time: "21:00", lockH: 72 });
    expect(lockHours(fb)).toBe(24);
    const ev = match("e", { kind: "paintball", date: "2026-10-17", time: "11:00", lockH: 48 });
    expect(lockAt(ev)!.getTime()).toBe(new Date(2026, 9, 15, 11, 0).getTime());
    expect(isLocked(ev, new Date(2026, 9, 15, 10, 59))).toBe(false);
    expect(isLocked(ev, new Date(2026, 9, 15, 11, 0))).toBe(true);
    const free = match("k", { kind: "kiraathane", lockH: 0 });
    expect(lockAt(free)).toBeNull();
    expect(isLocked(free, new Date(2030, 0, 1))).toBe(false);
  });
  it("etkinlikte kişi başı tahmin kontenjana göre; kaleciler yalnız halı sahada ücretsiz", () => {
    const s = state([player("k", "Kaleci Kemal", 3, "GK"), ...roster(5)], [], { gkFree: true, round: false });
    const ev = allIn(match("e", { kind: "paintball", cap: 10, price: 5000 }), ["k", "p0", "p1"]);
    expect(estShare(s, ev)).toBe(500);
    expect(billOf(s, ev).payers).toContain("k");
    const fb = allIn(match("m", { price: 3000 }), ["k", "p0", "p1"]);
    expect(billOf(s, fb).payers).not.toContain("k");
  });
});

describe("Kural 1.6: habersiz gelmeyen sonraki maçta sıranın sonuna", () => {
  const players = roster(18);
  const prev = allIn(match("m0", { date: "2026-10-06", status: "played" }), ["p0", "p1"]);
  prev.noshow = { p0: true };
  it("açık maçta kadronun sonuna düşer, yedeğe kayabilir", () => {
    const s = state(players, [prev]);
    const m = allIn(match("m1", { date: "2026-10-13" }), players.map((p) => p.id));
    expect([...penalized(s, m)]).toEqual(["p0"]);
    const { playing, wait } = lineup(s, m);
    expect(playing).not.toContain("p0");
    expect(wait[wait.length - 1]).toBe("p0");
  });
  it("ayardan kapatılabilir; diğer etkinlikleri etkilemez", () => {
    const s = state(players, [prev], { noShowPenalty: false });
    const m = allIn(match("m1", { date: "2026-10-13" }), players.map((p) => p.id));
    expect(penalized(s, m).size).toBe(0);
    const s2 = state(players, [prev]);
    const ev = allIn(match("e1", { kind: "paintball", cap: 12, date: "2026-10-17" }), players.map((p) => p.id));
    expect(penalized(s2, ev).size).toBe(0);
  });
  it("maç bitince sıra kalıcı olur (geçmiş değişmez)", () => {
    const s = state(players, [prev]);
    const m = allIn(match("m1", { date: "2026-10-13" }), players.map((p) => p.id));
    materializeOrder(s, m);
    m.status = "played";
    expect(m.order[m.order.length - 1]).toBe("p0");
    expect(penalized(s, m).size).toBe(0);
    expect(lineup(s, m).playing).not.toContain("p0");
  });
});

describe("oyundan alınanlar (15.7, 16.2, 17.2)", () => {
  it("aktif listeden düşer ama kadroda (ödeme için) kalır", () => {
    const s = state(roster(6));
    const m = allIn(match("e", { kind: "paintball", cap: 12 }), ["p0", "p1", "p2"]);
    m.removed = { p1: "15.7" };
    expect(active(s, m)).toEqual(["p0", "p2"]);
    expect(lineup(s, m).playing).toContain("p1");
    expect(billOf(s, m).payers).toContain("p1");
  });
});

describe("hazırlık listesi ve ön anlaşmalar", () => {
  it("rezervasyon dahil ilerleme; anlaşılmamış konular bekler", () => {
    const m = match("e", { kind: "airsoft" });
    const total = KIND_DEFS.airsoft.checks.length + 1;
    expect(checkProgress(m)).toEqual({ done: 0, total });
    m.reserved = true;
    m.checks[KIND_DEFS.airsoft.checks[0].key] = true;
    expect(checkProgress(m).done).toBe(2);
    const pend = pendingAgreements(m).map((a) => a.key);
    expect(pend).toContain("replica");
    m.agree.replica = "sniper";
    expect(pendingAgreements(m).map((a) => a.key)).not.toContain("replica");
  });
  it("varsayılan anlaşma değeri yönetmelikten gelir", () => {
    const m = match("v", { kind: "volleyball" });
    expect(agreeValue(m, "fmt")).toBeTruthy();
    expect(kindOf(m).score).toBe("sets");
    expect(kindOf(match("k", { kind: "kiraathane" })).teams).toBe("tables");
  });
});

describe("mesajlar", () => {
  const players = [player("a", "Ali Deneme"), player("b", "Berk Deneme"), player("c", "Cem Deneme"), player("d", "Doğa Deneme")];
  const field = { id: "f1", name: "Orman Paintball Parkı", address: "Kemerburgaz", link: "", phone: "", price: 0, lat: null, lng: null };
  const mk = (extra = {}) => {
    const s = state(players, [], { iban: "TR00 0000", ibanName: "Org" });
    s.fields.push(field);
    const m = allIn(match("e", { kind: "paintball", title: "Sezon açılışı", cap: 12, lockH: 48, date: "2026-10-17", time: "11:00", fieldId: "f1", price: 6000, ...extra }), ["a", "b", "c"]);
    s.matches.push(m);
    return { s, m };
  };
  it("davet: tür ikonu, başlık, kontenjan, kesinleşme cümlesi (15.3)", () => {
    const { s, m } = mk();
    const txt = msgInvite(s, m);
    expect(txt.split("\n")[0]).toBe("🎯 Sezon açılışı · Cumartesi 17.10 – 11:00");
    expect(txt).toContain("📍 Orman Paintball Parkı, Kemerburgaz");
    expect(txt).toContain("👥 3/12");
    expect(txt).toContain("1. Ali Deneme");
    expect(txt).toMatch(/^12\.$/m);
    expect(txt).toContain("Katılım 48 saat önce (Per 15.10 11:00) kesinleşir");
    expect(txt).toContain("(Kural 15.3)");
  });
  it("sınırsız etkinlikte boş satır bırakır, kesinleşme yoksa cümle düşer", () => {
    const { s, m } = mk({ kind: "kiraathane", cap: 0, lockH: 0, title: "" });
    const txt = msgInvite(s, m);
    expect(txt.split("\n")[0]).toMatch(/^🎲 Kıraathane/);
    expect(txt).toContain("👥 3 kişi");
    expect(txt).toMatch(/^4\.$/m);
    expect(txt).not.toContain("kesinleşir");
  });
  it("brifing: türün kuralları madde numarasıyla, ön anlaşmalar ve not", () => {
    const { s, m } = mk({ note: "09:30'da otoparkta buluşuyoruz" });
    const txt = msgBrief(s, m);
    expect(txt).toContain("📋 Kurallar");
    expect(txt).toMatch(/\(16\.2\)/);
    expect(txt).toContain("🤝 Ön anlaşmalar");
    expect(txt).toContain("📝 09:30'da otoparkta buluşuyoruz");
  });
  it("kadro, takımlar, ödeme ve iptal etkinliğe göre", () => {
    const { s, m } = mk();
    m.teams = { a: ["a", "b"], b: ["c"] };
    expect(msgSquad(s, m)).toMatch(/^✅ Katılım kesinleşti – Sezon açılışı/);
    const teams = msgTeams(s, m);
    expect(teams).toContain("🟡 Sarılar\n• Ali Deneme\n• Berk Deneme");
    expect(teams).toContain("İyi eğlenceler!");
    expect(teams).not.toContain("tatlı");
    expect(msgPay(s, m, "2026-10-18")).toMatch(/^💸 Sezon açılışı ücreti – Cumartesi 17\.10/);
    expect(msgCancel(s, m)).toMatch(/^❌ İPTAL – Sezon açılışı · Cumartesi 17\.10 11:00/);
  });
  it("takım adı ve yelek rengi ayarlardan gelir", () => {
    const { s, m } = mk();
    s.settings.teamA = { name: "", color: "#B3262E" };
    s.settings.teamB = { name: "Altın Kartallar", color: "#C9A04B" };
    m.teams = { a: ["a"], b: ["b"] };
    const teams = msgTeams(s, m);
    expect(teams).toContain("🔴 Bordolar\n• Ali Deneme");
    expect(teams).toContain("🟨 Altın Kartallar\n• Berk Deneme");
  });
  it("araç paylaşımı: kişi başı masraf (15.8)", () => {
    const { s, m } = mk();
    m.cars = [{ id: "c1", driver: "a", seats: 5, pax: ["b"], fuel: 600, toll: 150 }];
    const txt = msgCars(s, m);
    expect(txt).toContain("🚙 Araç 1 – Ali Deneme (sürücü)");
    expect(txt).toContain("Berk Deneme");
    expect(txt).toContain("Masraf 750 ₺ ÷ 2 kişi = 375 ₺");
    expect(txt).toContain("🙋 Araçsız: Cem Deneme");
  });
});
