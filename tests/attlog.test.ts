/**
 * Katılım günlüğü (Kural 1.3–1.6): kim ne zaman yazıldı, çıktı, yedekten girdi; geç iptalde
 * haber saati; 90 günlük saklama; şema v5 → v6. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { attSnapshot, lastEntry, logChanges, logLines, logShareText, logText, pruneLogs, relabelLast, setSaid, stamp } from "../src/domain/attlog";
import { setAtt } from "../src/domain/lineup";
import { migrate } from "../src/domain/migrate";
import { lockAt } from "../src/domain/roster";
import { SCHEMA_VERSION } from "../src/domain/schema";
import { setLang } from "../src/i18n";
import type { LogEntry, Match, State } from "../src/domain/types";
import { allIn, match, player, roster, state } from "./helpers/factory";

const T = Date.parse("2026-10-12T18:00:00+03:00");
const MIN = 60_000;

/** 4+1 format: kontenjan 10. p0..p11 kayıtlı. */
function setup(): { s: State; m: Match } {
  const m = match("m1", { format: 4, date: "2026-10-13", time: "21:00" });
  return { s: state(roster(12), [m]), m };
}

/** Değişikliği uygular ve günlüğe yazar (uygulamadaki commit ile aynı sıra). */
function step(s: State, at: number, fn: () => void): number {
  const before = attSnapshot(s);
  fn();
  return logChanges(s, before, at);
}

const brief = (m: Match) => m.log.map((e) => [e.pid, e.ev, e.n ?? null, e.from ?? null]);

describe("günlük kayıtları", () => {
  it("yazılan kadroya ya da yedeğe sırasıyla düşer", () => {
    const { s, m } = setup();
    step(s, T, () => allIn(m, ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]));
    expect(brief(m)).toEqual(Array.from({ length: 10 }, (_, i) => ["p" + i, "in", i + 1, null]));
    step(s, T + MIN, () => setAtt(m, "p10", "in", true));
    step(s, T + 2 * MIN, () => setAtt(m, "p11", "in", true));
    expect(brief(m).slice(10)).toEqual([["p10", "wait", 1, null], ["p11", "wait", 2, null]]);
    expect(m.log[10].at).toBe(T + MIN);
  });

  it("kadrodan çıkan ve yerine yedekten giren aynı anda, çıkan önce yazılır", () => {
    const { s, m } = setup();
    allIn(m, ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
    const n = step(s, T, () => setAtt(m, "p3", "out", true));
    expect(n).toBe(2);
    expect(brief(m)).toEqual([["p3", "out", null, "in"], ["p10", "up", 10, null]]);
    // Sırası kayan diğer oyuncular için kayıt üretilmez
    expect(m.log.some((e) => e.pid === "p4")).toBe(false);
  });

  it("Belki, geç iptal, yanıtı silme ve yedekten çıkma", () => {
    const { s, m } = setup();
    allIn(m, ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
    step(s, T, () => setAtt(m, "p11", "maybe", true));
    step(s, T + 1, () => setAtt(m, "p10", "out", true));
    step(s, T + 2, () => setAtt(m, "p0", "late", true));
    step(s, T + 3, () => setAtt(m, "p11", "maybe", false));
    expect(brief(m)).toEqual([["p11", "maybe", null, null], ["p10", "out", null, "wait"], ["p0", "late", null, "in"], ["p11", "clear", null, null]]);
  });

  it("kontenjan küçülünce kadrodan yedeğe düşen yazılır", () => {
    const { s, m } = setup();
    allIn(m, ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]);
    step(s, T, () => {
      m.format = 3;
    });
    expect(brief(m)).toEqual([["p8", "down", 1, null], ["p9", "down", 2, null]]);
  });

  it("yeni açılan etkinlikte sabit oyuncular kayda geçmez; sonraki değişiklikler geçer", () => {
    const { s } = setup();
    const before = attSnapshot(s);
    const m2 = allIn(match("m2", { date: "2026-10-15" }), ["p0", "p1"]);
    s.matches.push(m2);
    expect(logChanges(s, before, T)).toBe(0);
    expect(m2.log).toEqual([]);
    step(s, T, () => setAtt(m2, "p2", "in", true));
    expect(brief(m2)).toEqual([["p2", "in", 3, null]]);
  });

  it("bitmiş ya da iptal edilmiş etkinliğe kayıt yazılmaz", () => {
    const { s, m } = setup();
    allIn(m, ["p0"]);
    expect(step(s, T, () => {
      m.status = "played";
      setAtt(m, "p1", "in", true);
    })).toBe(0);
  });

  it("çıkarılan misafir adıyla kalır; silinen oyuncu için kayıt üretilmez", () => {
    const { s, m } = setup();
    m.guests.push({ id: "g1", name: "Misafir Mert", rating: 3, pos: "" });
    step(s, T, () => setAtt(m, "g1", "in", true));
    step(s, T + 1, () => setAtt(m, "p1", "in", true));
    step(s, T + 2, () => {
      m.guests = [];
      delete m.att.g1;
      m.order = m.order.filter((x) => x !== "g1");
      s.players = s.players.filter((p) => p.id !== "p1");
    });
    expect(brief(m)).toEqual([["g1", "in", 1, null], ["p1", "in", 2, null], ["g1", "clear", null, "in"]]);
    expect(m.log[2].name).toBe("Misafir Mert");
    setLang("tr");
    const lines = logLines(s, m, T);
    expect(lines.map((l) => l.who)).toEqual(["Misafir Mert", "Silinmiş kişi", "Misafir Mert"]);
  });
});

describe("haber saati ve düzeltme", () => {
  it("haber saati son kayda yazılır; kayıt anıyla aynı dakikadaysa tutulmaz", () => {
    const { s, m } = setup();
    allIn(m, ["p0"]);
    step(s, T, () => setAtt(m, "p0", "late", true));
    expect(setSaid(m, "p0", T - 90 * MIN)!.said).toBe(T - 90 * MIN);
    expect(setSaid(m, "p0", T + 20_000)!.said).toBeUndefined();
    expect(setSaid(m, "yok", T)).toBeNull();
  });

  it("geç iptal sayılmayınca kayıt ayrı satır eklenmeden çevrilir", () => {
    const { s, m } = setup();
    allIn(m, ["p0"]);
    step(s, T, () => setAtt(m, "p0", "late", true));
    relabelLast(m, "p0", "out");
    expect(brief(m)).toEqual([["p0", "out", null, "in"]]);
    expect(lastEntry(m, "p0")!.ev).toBe("out");
  });
});

describe("90 gün saklama", () => {
  it("eski bitmiş ve iptal edilmiş etkinliklerin günlüğü boşalır; açık ve yeni olanlarınki kalır", () => {
    const e: LogEntry = { id: "x", at: T, pid: "p0", ev: "in", n: 1 };
    const old = match("old", { date: "2026-07-01", status: "played", log: [{ ...e }] });
    const oldCancelled = match("oc", { date: "2026-07-01", status: "cancelled", log: [{ ...e }] });
    const oldOpen = match("oo", { date: "2026-07-01", status: "open", log: [{ ...e }] });
    const edge = match("edge", { date: "2026-07-15", status: "played", log: [{ ...e }] });
    const s = state(roster(1), [old, oldCancelled, oldOpen, edge]);
    expect(pruneLogs(s, "2026-10-13")).toBe(true);
    expect([old.log.length, oldCancelled.log.length, oldOpen.log.length, edge.log.length]).toEqual([0, 0, 1, 1]);
    expect(pruneLogs(s, "2026-10-13")).toBe(false);
    // 90. günden bir gün sonra sınırdaki de boşalır
    expect(pruneLogs(s, "2026-10-14")).toBe(true);
    expect(edge.log).toEqual([]);
  });
});

describe("günlük metni", () => {
  it("satırlar eskiden yeniye; kesinleşme anına ayraç girer; haber saati görünür", () => {
    setLang("tr");
    const { s, m } = setup();
    // Maç 13.10 21:00 → kadro 12.10 21:00'de kesinleşir (Kural 1.4)
    const lock = lockAt(m)!.getTime();
    step(s, lock - 60 * MIN, () => setAtt(m, "p0", "in", true));
    step(s, lock + 30 * MIN, () => setAtt(m, "p0", "late", true));
    setSaid(m, "p0", lock - 10 * MIN);
    const now = lock + 60 * MIN;
    const lines = logLines(s, m, now);
    expect(lines.map((l) => (l.e ? l.e.ev : "lock"))).toEqual(["in", "lock", "late"]);
    expect(lines[1].text).toBe("Kadro kesinleşti (Kural 1.4)");
    expect(lines[2].said).toBe("haber: " + stamp(lock - 10 * MIN));
    expect(logText(m.log[0])).toBe("kadroya yazıldı (1.)");
    expect(logText(m.log[1])).toBe("geç iptal etti · kadrodan çıktı");
    const text = logShareText(s, m, "Katılım günlüğü", now);
    expect(text.split("\n")).toEqual([
      "📋 Katılım günlüğü",
      stamp(lock - 60 * MIN) + " · Oyuncu 0 kadroya yazıldı (1.)",
      "— Kadro kesinleşti (Kural 1.4): " + stamp(lock) + " —",
      stamp(lock + 30 * MIN) + " · Oyuncu 0 geç iptal etti · kadrodan çıktı (haber: " + stamp(lock - 10 * MIN) + ")",
    ]);
  });

  it("kesinleşme henüz gelmediyse ayraç yok; kayıtlar kesinleşmeden önceyse ayraç sonda", () => {
    setLang("tr");
    const { s, m } = setup();
    const lock = lockAt(m)!.getTime();
    step(s, lock - 60 * MIN, () => setAtt(m, "p0", "in", true));
    expect(logLines(s, m, lock - MIN).map((l) => !!l.e)).toEqual([true]);
    expect(logLines(s, m, lock + MIN).map((l) => !!l.e)).toEqual([true, false]);
    // Etkinlikte kesinleşme kuralı 15.3; kesinleşme yoksa ayraç hiç çıkmaz
    const ev = match("e1", { kind: "paintball", lockH: 0, date: "2026-10-13" });
    s.matches.push(ev);
    const before = attSnapshot(s);
    setAtt(ev, "p1", "in", true);
    logChanges(s, before, lock);
    expect(logLines(s, ev, lock + MIN).map((l) => !!l.e)).toEqual([true]);
    // Kesinleşme anında ya da sonrasında yazılan kayıt ayraçtan sonra gelir
    ev.lockH = 24;
    expect(logLines(s, ev, lock + MIN).map((l) => (l.e ? l.e.ev : l.text))).toEqual(["Kadro kesinleşti (Kural 15.3)", "in"]);
  });
});

describe("şema v5 → v6", () => {
  it("her etkinliğe boş günlük eklenir; bozuk kayıtlar temizlenir, bilgi kaybolmaz", () => {
    const v5 = {
      v: 5,
      settings: { lang: "tr" },
      players: [player("p0", "Oyuncu Bir")],
      matches: [
        { id: "a", kind: "football", date: "2026-10-01", time: "21:00", status: "played", att: { p0: "in" }, order: ["p0"], guests: [], teams: { a: [], b: [] }, injured: {}, sheets: [] },
      ],
    };
    const s = migrate(v5);
    expect(SCHEMA_VERSION).toBe(6);
    expect(s.v).toBe(6);
    expect(s.matches[0].log).toEqual([]);
    expect(s.matches[0].att).toEqual({ p0: "in" });
    // v6 verisindeki günlük korunur; tanınmayan olay ve kişisiz kayıt temizlenir
    const v6 = JSON.parse(JSON.stringify(s));
    v6.matches[0].log = [
      { id: "l1", at: T, pid: "p0", ev: "late", from: "in", said: T - MIN, n: 0 },
      { id: "l2", at: "x", pid: "p0", ev: "garip", from: "yok", name: "Misafir" },
      { at: T, ev: "in" },
    ];
    const out = migrate(v6).matches[0].log;
    expect(out).toEqual([
      { id: "l1", at: T, pid: "p0", ev: "late", from: "in", said: T - MIN },
      { id: "l2", at: 0, pid: "p0", ev: "clear", name: "Misafir" },
    ]);
  });
});
