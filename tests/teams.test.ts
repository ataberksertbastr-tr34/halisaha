/** Takım dengeleme: güç farkı, kaleci dağılımı, mevki dengesi, herkesin yerleşmesi. */
import { describe, expect, it } from "vitest";
import { generateTeams, previousTeams, repeatRatio, swapPlayers, teamSum } from "../src/domain/teams";
import { goalFactor, perfRatings, strengthFn } from "../src/domain/elo";
import { cleanTeams } from "../src/domain/lineup";
import type { Pos } from "../src/domain/types";
import { allIn, match, roster, state } from "./helpers/factory";
import { seeded } from "./helpers/rng";

function setup(ratings: number[], pos: Pos[] = []) {
  const ps = roster(ratings.length, { ratings, pos });
  const m = allIn(match("m"), ps.map((p) => p.id));
  const s = state(ps, [m], { perf: false });
  return { s, m };
}

describe("otomatik takım kurma", () => {
  it("herkes tam bir takıma yerleşir, takım boyları en fazla 1 farklı", () => {
    for (let n = 2; n <= 16; n++) {
      const { s, m } = setup(Array.from({ length: n }, (_, i) => (i % 5) + 1));
      generateTeams(s, m, seeded(n));
      const all = [...m.teams.a, ...m.teams.b];
      expect(new Set(all).size).toBe(n);
      expect(all.length).toBe(n);
      expect(Math.abs(m.teams.a.length - m.teams.b.length)).toBeLessThanOrEqual(1);
      expect(cleanTeams(s, m)).toEqual([]);
    }
  });

  it("güç farkı mümkün olan en küçük değere yakın (200 rastgele kadro)", () => {
    const rng = seeded(42);
    for (let k = 0; k < 200; k++) {
      const n = 10 + Math.floor(rng() * 7);
      const ratings = Array.from({ length: n }, () => 1 + Math.floor(rng() * 5));
      const { s, m } = setup(ratings);
      generateTeams(s, m, seeded(k));
      const diff = Math.abs(teamSum(s, m, m.teams.a) - teamSum(s, m, m.teams.b));
      const total = ratings.reduce((a, b) => a + b, 0);
      // Eşit sayılı takımlarda tek/çift toplam nedeniyle alt sınır 0 ya da 1'dir.
      expect(diff, `kadro ${ratings.join(",")}`).toBeLessThanOrEqual(total % 2 === 0 && n % 2 === 0 ? 2 : 3);
    }
  }, 30_000); // 200 kadro: yoğun CI makinesinde 5 sn'yi aşabiliyor

  it("dengeli bilinen kadroda farkı 0 bulur", () => {
    const { s, m } = setup([5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
    generateTeams(s, m, seeded(7));
    expect(teamSum(s, m, m.teams.a)).toBe(teamSum(s, m, m.teams.b));
  });

  it("iki kaleci varsa her takıma bir kaleci (Kural 3.2)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pos: Pos[] = ["GK", "GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD", "MID", "DEF", "FWD", "MID", "DEF", "MID"];
      const { s, m } = setup([3, 4, 3, 5, 2, 4, 3, 5, 1, 2, 4, 3, 3, 2], pos);
      generateTeams(s, m, seeded(seed));
      const gkA = m.teams.a.filter((id) => s.players.find((p) => p.id === id)!.pos === "GK").length;
      expect(gkA).toBe(1);
    }
  });

  it("mevkiler dengelenir (defans/orta/forvet farkı en fazla 1)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pos: Pos[] = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"];
      const { s, m } = setup([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], pos);
      generateTeams(s, m, seeded(seed));
      for (const k of ["DEF", "MID", "FWD"]) {
        const ca = m.teams.a.filter((id) => s.players.find((p) => p.id === id)!.pos === k).length;
        const cb = m.teams.b.filter((id) => s.players.find((p) => p.id === id)!.pos === k).length;
        expect(Math.abs(ca - cb), k).toBeLessThanOrEqual(1);
      }
    }
  });

  it("yalnızca oynayan kadroyu kullanır: yedek ve 'Belki' takıma girmez", () => {
    const ps = roster(20);
    const m = allIn(match("m", { format: 4 }), ps.slice(0, 12).map((p) => p.id)); // kontenjan 10
    m.att.p15 = "maybe";
    const s = state(ps, [m]);
    generateTeams(s, m, seeded(1));
    const all = [...m.teams.a, ...m.teams.b];
    expect(all).toHaveLength(10);
    expect(all).not.toContain("p10");
    expect(all).not.toContain("p11");
    expect(all).not.toContain("p15");
  });

  it("karıştırınca farklı ama yine dengeli takımlar çıkabilir", () => {
    const { s, m } = setup([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      generateTeams(s, m, seeded(seed));
      seen.add([...m.teams.a].sort().join(","));
      expect(teamSum(s, m, m.teams.a)).toBe(teamSum(s, m, m.teams.b));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe("kilit, eşleşme kuralları, tekrar etmeme", () => {
  it("kilitli oyuncu her zaman kendi takımında", () => {
    for (let seed = 0; seed < 40; seed++) {
      const { s, m } = setup([5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
      m.locks = { p0: "a", p1: "a", p9: "b" };
      generateTeams(s, m, seeded(seed));
      expect(m.teams.a).toContain("p0");
      expect(m.teams.a).toContain("p1");
      expect(m.teams.b).toContain("p9");
    }
  });

  it("'aynı takımda olsun' ve 'olmasın' kurallarına uyar", () => {
    for (let seed = 0; seed < 40; seed++) {
      const { s, m } = setup([5, 4, 4, 3, 3, 3, 2, 2, 2, 1, 3, 3]);
      s.pairRules = [
        { id: "r1", a: "p0", b: "p1", together: true },
        { id: "r2", a: "p2", b: "p3", together: false },
        { id: "r3", a: "p4", b: "p5", together: true },
      ];
      const r = generateTeams(s, m, seeded(seed));
      const same = (x: string, y: string) => m.teams.a.includes(x) === m.teams.a.includes(y);
      expect(same("p0", "p1")).toBe(true);
      expect(same("p2", "p3")).toBe(false);
      expect(same("p4", "p5")).toBe(true);
      expect(r.broken).toEqual([]);
      expect(Math.abs(m.teams.a.length - m.teams.b.length)).toBeLessThanOrEqual(1);
    }
  });

  it("kadroda olmayan oyuncunun kuralı yok sayılır", () => {
    const { s, m } = setup([3, 3, 3, 3]);
    s.pairRules = [{ id: "r", a: "p0", b: "yok", together: true }];
    expect(generateTeams(s, m, seeded(1)).broken).toEqual([]);
  });

  it("geçen maçın takımlarını tekrar etmez (denk alternatif varken)", () => {
    const ratings = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
    const ps = roster(10, { ratings });
    const ids = ps.map((p) => p.id);
    const prev = allIn(match("prev", { date: "2026-10-06", status: "played" }), ids);
    prev.teams = { a: ids.slice(0, 5), b: ids.slice(5) };
    const m = allIn(match("m", { date: "2026-10-13" }), ids);
    const s = state(ps, [prev, m]);
    for (let seed = 0; seed < 30; seed++) {
      generateTeams(s, m, seeded(seed));
      expect(repeatRatio(prev.teams, m.teams.a, m.teams.b)).toBeLessThanOrEqual(0.6);
    }
    s.settings.avoidRepeat = false;
    expect(previousTeams(s, m)).not.toBeNull();
  });

  it("sürükle-bırak takası takımları değiştirir, kilidi taşır", () => {
    const m = match("m");
    m.teams = { a: ["x", "y"], b: ["z", "w"] };
    m.locks = { x: "a" };
    expect(swapPlayers(m, "x", "w")).toBe(true);
    expect(m.teams).toEqual({ a: ["w", "y"], b: ["z", "x"] });
    expect(m.locks.x).toBe("b");
    expect(swapPlayers(m, "w", "y")).toBe(false);
  });
});

describe("performans puanı (Elo)", () => {
  function season(results: [number, number][]) {
    const ps = roster(4);
    const ms = results.map(([a, b], i) => {
      const m = allIn(match("m" + i, { date: "2026-09-" + String(10 + i), status: "played", format: 1 }), ["p0", "p1", "p2", "p3"]);
      m.teams = { a: ["p0", "p1"], b: ["p2", "p3"] };
      m.score = { a, b };
      return m;
    });
    return state(ps, ms);
  }

  it("kazanan puan alır, kaybeden kaybeder; toplam korunur", () => {
    const r = perfRatings(season([[5, 2], [3, 1], [4, 4]]));
    expect(r.p0.elo).toBeGreaterThan(1000);
    expect(r.p2.elo).toBeLessThan(1000);
    expect(r.p0.elo + r.p1.elo + r.p2.elo + r.p3.elo).toBe(4000);
    expect(r.p0.games).toBe(3);
  });

  it("seviyeyle harmanlanır; kapatılınca yalnızca seviye kullanılır", () => {
    const s = season(Array.from({ length: 10 }, () => [5, 0] as [number, number]));
    const m = s.matches[0];
    const on = strengthFn(s, m);
    expect(on("p0")).toBeGreaterThan(3);
    expect(on("p0")).toBeLessThanOrEqual(4);
    expect(on("p2")).toBeLessThan(3);
    s.settings.perf = false;
    expect(strengthFn(s, m)("p0")).toBe(3);
  });

  it("gol farkı çarpanı", () => {
    expect(goalFactor(1)).toBe(1);
    expect(goalFactor(2)).toBe(1.5);
    expect(goalFactor(-3)).toBe(1.75);
  });
});
