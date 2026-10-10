/** Sezon tablosu, katılım oranı, oyuncu kartı. */
import { describe, expect, it } from "vitest";
import { playerCard, seasons, seasonTable } from "../src/domain/stats";
import { allIn, match, roster, state } from "./helpers/factory";

function data() {
  const ps = roster(4);
  const m1 = allIn(match("m1", { date: "2025-12-30", status: "played", format: 1 }), ["p0", "p1", "p2", "p3"]);
  m1.teams = { a: ["p0", "p1"], b: ["p2", "p3"] };
  m1.score = { a: 3, b: 1 };
  m1.goals = { p0: 2, p1: 1, p2: 1 };
  m1.mvp = "p0";
  const m2 = allIn(match("m2", { date: "2026-01-06", status: "played", format: 1 }), ["p0", "p2", "p3"]);
  m2.teams = { a: ["p0", "p2"], b: ["p3"] };
  m2.score = { a: 2, b: 2 };
  m2.goals = { p3: 2, p0: 1, p2: 1 };
  const m3 = allIn(match("m3", { date: "2026-01-13", status: "played", format: 1 }), ["p1", "p3"]);
  const m4 = allIn(match("m4", { date: "2026-01-20", status: "cancelled", format: 1 }), ["p1"]);
  return state(ps, [m1, m2, m3, m4]);
}

describe("istatistikler", () => {
  it("sezonlar yeniden eskiye", () => {
    expect(seasons(data())).toEqual(["2026", "2025"]);
  });
  it("tüm zamanlar tablosu: puan, G/B/M, gol, maçın oyuncusu, sıralama", () => {
    const t = seasonTable(data());
    expect(t.map((r) => [r.id, r.played, r.w, r.d, r.l, r.goals, r.mvp, r.pts])).toEqual([
      ["p0", 2, 1, 1, 0, 3, 1, 4],
      ["p1", 2, 1, 0, 0, 1, 0, 3],
      ["p3", 3, 0, 1, 1, 2, 0, 1],
      ["p2", 2, 0, 1, 1, 2, 0, 1],
    ]);
  });
  it("katılım oranı oyuncunun ilk maçından itibaren; iptal maç sayılmaz", () => {
    const t = seasonTable(data(), "2026");
    const p1 = t.find((r) => r.id === "p1")!;
    expect(p1.played).toBe(1);
    expect(p1.possible).toBe(1); // 2026'da ilk maçı m3, sonrasında oynanan tek maç
    const p0 = t.find((r) => r.id === "p0")!;
    expect(p0.rate).toBe(1 / 2);
  });
  it("oyuncu kartı: son maçlar ve sonuçlar", () => {
    const c = playerCard(data(), "p2");
    expect(c.recent.map((x) => [x.m.id, x.result, x.goals])).toEqual([["m2", "d", 1], ["m1", "l", 1]]);
  });
});
