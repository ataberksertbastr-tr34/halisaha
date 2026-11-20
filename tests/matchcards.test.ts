/**
 * Takım görseli ve maç afişi içerikleri: takım adı ve yelek rengi ayarlardan, oyuncular takımdaki
 * sırayla (kaleci ve misafir işaretli); seviye, telefon, IBAN yazılmaz. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { teamCard } from "../src/domain/matchcards";
import { setLang } from "../src/i18n";
import type { State } from "../src/domain/types";
import { allIn, match, player, state } from "./helpers/factory";

setLang("tr");

function setup(): State {
  const ps = [
    player("a", "Ali Deneme", 5, "GK", { phone: "0555 000 00 01" }), player("b", "Berk Deneme", 1, "DEF"), player("c", "Cem Deneme"),
    player("d", "Deniz Deneme", 4, "GK"), player("e", "Ege Deneme"),
  ];
  const m = match("m1", { date: "2026-12-18", time: "22:00", format: 6, guests: [{ id: "g1", name: "Misafir Mert", rating: 3, pos: "", host: "b" }] });
  allIn(m, ["a", "b", "c", "d", "e", "g1"]);
  m.teams = { a: ["a", "b", "g1"], b: ["d", "c", "e"] };
  const s = state(ps, [m], { iban: "TR11 2222" });
  s.fields.push({ id: "f1", name: "Deneme Halı Saha", address: "Gizli Sokak 5", link: "", phone: "0212 000 00 00", price: 3840, lat: null, lng: null });
  m.fieldId = "f1";
  return s;
}

describe("takım görseli içeriği", () => {
  it("takım adı ve yelek rengi ayarlardan, oyuncular takımdaki sırayla; kaleci ve misafir işaretli", () => {
    const s = setup();
    const c = teamCard(s, s.matches[0]);
    expect(c).toMatchObject({ kicker: "Halı saha maçı · 6+1", title: "Takımlar", day: "Cuma", date: "18 Aralık", time: "22:00", venue: "Deneme Halı Saha", ready: true, file: "takimlar-2026-12-18.png" });
    expect(c.a).toEqual({ name: "Sarılar", color: "#E6CF3A", players: [{ n: "Ali Deneme", gk: true }, { n: "Berk Deneme" }, { n: "Misafir Mert", guest: true }] });
    expect(c.b).toEqual({ name: "Turuncular", color: "#EE7A2C", players: [{ n: "Deniz Deneme", gk: true }, { n: "Cem Deneme" }, { n: "Ege Deneme" }] });
    expect(c.foot).toContain("Kural 3.3");
  });

  it("ayarlarda değiştirilen takım adı ve rengi kullanılır", () => {
    const s = setup();
    s.settings.teamA = { name: "Kartallar", color: "#2F6FD6" };
    s.settings.teamB = { name: "", color: "#1C1F26" };
    const c = teamCard(s, s.matches[0]);
    expect([c.a.name, c.a.color, c.b.name, c.b.color]).toEqual(["Kartallar", "#2F6FD6", "Siyahlar", "#1C1F26"]);
  });

  it("takımlardan biri boşsa görsel hazır değildir", () => {
    const s = setup();
    s.matches[0].teams = { a: ["a", "b"], b: [] };
    expect(teamCard(s, s.matches[0]).ready).toBe(false);
  });

  it("etkinlikte üst satır etkinliğin adı, kaleci işareti yok", () => {
    const s = setup();
    const m = s.matches[0];
    m.kind = "paintball";
    m.title = "Orman paintball";
    const c = teamCard(s, m);
    expect(c.kicker).toBe("Orman paintball");
    expect(c.a.players[0]).toEqual({ n: "Ali Deneme" });
  });

  it("telefon, IBAN, adres, seviye ve mevki yazılmaz", () => {
    const s = setup();
    const json = JSON.stringify(teamCard(s, s.matches[0]));
    for (const secret of ["0555", "TR11", "Gizli Sokak", "0212", "rating", "\"DEF\"", "\"GK\"", "host", "3840"]) expect(json).not.toContain(secret);
  });
});
