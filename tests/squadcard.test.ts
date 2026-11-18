/**
 * Kadro görseli içeriği: tarih, saat, saha, numaralı kadro, boş yerler, yedek sırası ve
 * kesinleşme (Kural 1.3, 1.4, 15.3). Kişisel veri (telefon, IBAN, seviye, borç) yazılmaz.
 * İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { gridOf, longDate, squadCard } from "../src/domain/squadcard";
import { waitLines } from "../src/ui/squadImage";
import { setLang } from "../src/i18n";
import type { State } from "../src/domain/types";
import { allIn, match, player, state } from "./helpers/factory";

setLang("tr");
const BEFORE = new Date(2026, 9, 11, 12, 0);
const AFTER = new Date(2026, 9, 15, 9, 0);

/** 2+1 format (kontenjan 6): yedi kişi "Var" (biri misafir, biri kaleci), biri Belki. */
function setup(): State {
  const ps = [
    player("a", "Ali Deneme", 5, "GK", { phone: "0555 000 00 01" }), player("b", "Berk Deneme", 1), player("c", "Cem Deneme"),
    player("d", "Deniz Deneme"), player("e", "Ege Deneme"), player("f", "Fatih Deneme"), player("h", "Hakan Deneme"),
  ];
  const m = match("m1", { date: "2026-10-15", time: "21:00", format: 2, guests: [{ id: "g1", name: "Misafir Mert", rating: 3, pos: "", host: "b" }] });
  allIn(m, ["a", "b", "c", "d", "e", "g1", "f"]);
  m.att.h = "maybe";
  const s = state(ps, [m], { iban: "TR11 2222", ibanName: "Organizatör Deneme" });
  s.fields.push({ id: "f1", name: "Deneme Halı Saha", address: "Gizli Sokak 5", link: "", phone: "0212 000 00 00", price: 3000, lat: null, lng: null });
  m.fieldId = "f1";
  return s;
}

describe("kadro görseli içeriği", () => {
  it("halı saha: başlık, gün, tarih, saha, sayı, kaleci ve misafir işaretli kadro, yedek sırası", () => {
    const s = setup();
    const c = squadCard(s, s.matches[0], BEFORE);
    expect(c).toMatchObject({
      kicker: "Halı saha maçı · 2+1", title: "Kadro", day: "Perşembe", date: "15 Ekim", time: "21:00", venue: "Deneme Halı Saha",
      cap: 6, count: "6/6", status: "Kadro tam", full: true, open: 0, maybe: 1, file: "kadro-2026-10-15.png",
    });
    expect(c.playing).toEqual([{ n: "Ali Deneme", gk: true }, { n: "Berk Deneme" }, { n: "Cem Deneme" }, { n: "Deniz Deneme" }, { n: "Ege Deneme" }, { n: "Misafir Mert", guest: true }]);
    expect(c.wait).toEqual([{ n: "Fatih Deneme" }]);
  });

  it("eksik kadro: boş yerler kontenjana kadar, kaç kişi eksik yazar", () => {
    const s = setup();
    const m = s.matches[0];
    for (const id of ["d", "e", "g1", "f"]) m.att[id] = "out";
    const c = squadCard(s, m, BEFORE);
    expect([c.count, c.status, c.full, c.open, c.wait.length]).toEqual(["3/6", "3 kişi eksik", false, 3, 0]);
    expect(gridOf(c)).toEqual({ slots: 6, rows: 3 });
  });

  it("kesinleşme: önce ne zaman kesinleşeceği, sonra kesinleştiği (Kural 1.4)", () => {
    const s = setup();
    const before = squadCard(s, s.matches[0], BEFORE);
    expect([before.locked, before.lockLine]).toEqual([false, "Kadro Çar 21:00 kesinleşir · Kural 1.4"]);
    const after = squadCard(s, s.matches[0], AFTER);
    expect([after.locked, after.lockLine]).toEqual([true, "Kadro kesinleşti · Kural 1.4"]);
  });

  it("etkinlik: başlık etkinliğin adı, kontenjansızsa kişi sayısı, Kural 15.3; kaleci işareti yok", () => {
    const s = setup();
    const m = s.matches[0];
    m.kind = "paintball";
    m.title = "Orman paintball";
    m.cap = 0;
    m.lockH = 48;
    const c = squadCard(s, m, BEFORE);
    expect(c).toMatchObject({ kicker: "Kadro", title: "Orman paintball", count: "7 kişi", status: "", open: 0, lockLine: "Kadro Sal 21:00 kesinleşir · Kural 15.3" });
    expect(c.playing[0]).toEqual({ n: "Ali Deneme" });
    m.lockH = 0;
    expect(squadCard(s, m, AFTER).lockLine).toBe("");
  });

  it("telefon, IBAN, adres, seviye, mevki, getiren ve borç yazılmaz", () => {
    const s = setup();
    const json = JSON.stringify(squadCard(s, s.matches[0], AFTER));
    for (const secret of ["0555", "TR11", "Organizatör Deneme", "Gizli Sokak", "0212", "rating", "host", "phone", "3000", "\"GK\""]) expect(json).not.toContain(secret);
  });

  it("İngilizce", () => {
    setLang("en");
    try {
      const s = setup();
      const c = squadCard(s, s.matches[0], AFTER);
      expect([c.title, c.day, c.date, c.status, c.lockLine, c.file]).toEqual(["Squad", "Thursday", "15 October", "Squad full", "Squad locked · Rule 1.4", "squad-2026-10-15.png"]);
    } finally {
      setLang("tr");
    }
  });

  it("uzun tarih", () => {
    expect(longDate("2026-01-05")).toBe("5 Ocak");
    expect(longDate("2026-12-31")).toBe("31 Aralık");
  });
});

describe("yedek satırları", () => {
  // Her harf 10 birim: ölçü tarayıcıdan bağımsız
  const w = (s: string) => s.length * 10;

  it("sığanlar tek satırda", () => {
    expect(waitLines(["1. Ali", "2. Can"], 1000, w)).toEqual(["1. Ali   2. Can"]);
  });

  it("taşınca ikinci satıra geçer", () => {
    expect(waitLines(["1. Aaaaaaa", "2. Bbbbbbb", "3. Ccccccc"], 250, w)).toEqual(["1. Aaaaaaa   2. Bbbbbbb", "3. Ccccccc"]);
  });

  it("iki satıra sığmayanlar '+n kişi' olur, sıra korunur", () => {
    const items = ["1. Aaaaaaa", "2. Bbbbbbb", "3. Ccccccc", "4. Ddddddd", "5. Eeeeeee", "6. Fffffff"];
    const lines = waitLines(items, 250, w);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("1. Aaaaaaa   2. Bbbbbbb");
    expect(lines[1]).toMatch(/^3\. Ccccccc.*\+\d kişi$/);
    const shown = lines.join(" ").match(/\d\. /g)!.length;
    expect(lines[1]).toContain("+" + (items.length - shown) + " kişi");
    for (const l of lines) expect(w(l)).toBeLessThanOrEqual(250);
  });
});
