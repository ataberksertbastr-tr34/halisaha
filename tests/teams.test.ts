/** Takım dengeleme: güç farkı, kaleci dağılımı, mevki dengesi, herkesin yerleşmesi. */
import { describe, expect, it } from "vitest";
import { generateTeams, teamSum } from "../src/domain/teams";
import { cleanTeams } from "../src/domain/lineup";
import type { Pos } from "../src/domain/types";
import { allIn, match, roster, state } from "./helpers/factory";
import { seeded } from "./helpers/rng";

function setup(ratings: number[], pos: Pos[] = []) {
  const ps = roster(ratings.length, { ratings, pos });
  const m = allIn(match("m"), ps.map((p) => p.id));
  const s = state(ps, [m]);
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
  });

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
