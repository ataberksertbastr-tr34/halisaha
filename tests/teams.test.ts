/** Takım dengeleme: güç farkı, kaleci dağılımı, mevki dengesi, herkesin yerleşmesi. */
import { describe, expect, it } from "vitest";
import { generateTeams, previousTeams, repeatRatio, swapPlayers, teamSum, unevenTeams } from "../src/domain/teams";
import { goalFactor, perfRatings, strengthFn } from "../src/domain/elo";
import { cleanTeams } from "../src/domain/lineup";
import type { Pos } from "../src/domain/types";
import { allIn, match, player, roster, state } from "./helpers/factory";
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

  it("defansif ve ofansif orta saha: orta saha hattı dengelenir, DOS ve OOS iki takıma dağılır", () => {
    const line = (p: Pos) => (p === "DEF" ? "D" : p === "FWD" ? "F" : p === "DM" || p === "MID" || p === "AM" ? "M" : p);
    for (let seed = 0; seed < 50; seed++) {
      const pos: Pos[] = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DM", "DM", "MID", "MID", "AM", "AM", "FWD", "FWD"];
      const { s, m } = setup([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], pos);
      generateTeams(s, m, seeded(seed));
      const posOf = (id: string) => s.players.find((p) => p.id === id)!.pos;
      for (const k of ["D", "M", "F"]) {
        const ca = m.teams.a.filter((id) => line(posOf(id)) === k).length;
        const cb = m.teams.b.filter((id) => line(posOf(id)) === k).length;
        expect(Math.abs(ca - cb), "hat " + k).toBeLessThanOrEqual(1);
      }
      for (const k of ["DM", "AM", "GK"]) {
        const ca = m.teams.a.filter((id) => posOf(id) === k).length;
        expect(ca, k).toBe(1);
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

describe("Kural 4.2: takımlar sahada eşit sayıda", () => {
  it("halı sahada iki takımın kişi sayısı farklıysa uyarılır; etkinliklerde ve kurulmamış takımda uyarı yok", () => {
    const m = match("m", { teams: { a: ["a", "b", "c"], b: ["d", "e"] } });
    expect(unevenTeams(m)).toBe(true);
    m.teams.b.push("f");
    expect(unevenTeams(m)).toBe(false);
    expect(unevenTeams(match("m", { teams: { a: ["a"], b: [] } }))).toBe(false);
    expect(unevenTeams(match("m", { kind: "volleyball", teams: { a: ["a", "b"], b: ["c"] } }))).toBe(false);
  });
});

describe("takım dengesi özeti (Kural 3.1, 3.2)", () => {
  it("kişi sayısı, ortalama güç, kaleci ve mevki; güç farkı yüzdesi; kişisel seviye yazmaz", async () => {
    const { balanceOf } = await import("../src/domain/teams");
    const { balanceText } = await import("../src/domain/messages");
    const { setLang } = await import("../src/i18n");
    setLang("tr");
    const ps = [
      player("k1", "Kaleci Bir", 3, "GK"), player("d1", "Defans Bir", 4, "DEF"), player("o1", "Orta Bir", 3, "MID"), player("f1", "Forvet Bir", 5, "FWD"),
      player("k2", "Kaleci İki", 3, "GK"), player("d2", "Defans İki", 3, "DEF"), player("d3", "Defans Üç", 4, "DEF"), player("o2", "Orta İki", 4, "MID"),
    ];
    const m = allIn(match("m1", { date: "2026-10-15", format: 3 }), ps.map((p) => p.id));
    m.teams = { a: ["k1", "d1", "o1", "f1"], b: ["k2", "d2", "d3", "o2"] };
    const s = state(ps, [m], { perf: false });
    const b = balanceOf(s, m)!;
    expect(b.a).toEqual({ n: 4, avg: 3.75, gk: 1, pos: { DEF: 1, MID: 1, FWD: 1 } });
    expect(b.b).toEqual({ n: 4, avg: 3.5, gk: 1, pos: { DEF: 2, MID: 1 } });
    expect(b.pct).toBe(7);
    expect(b.diff).toBe(1);
    expect(b.repeat).toBeNull();
    const text = balanceText(s, m);
    expect(text).toBe([
      "⚖️ Takım dengesi – Perşembe 15.10", "",
      "🟡 Sarılar: 4 kişi · ortalama güç 3,8 · 1 kaleci · 1 defans, 1 orta saha, 1 forvet",
      "🟠 Turuncular: 4 kişi · ortalama güç 3,5 · 1 kaleci · 2 defans, 1 orta saha", "",
      "Ortalama güç farkı: %7", "",
      "Takımlar seviye ve mevki dengesi gözetilerek kuruldu (Kural 3.1). Kişisel seviyeler paylaşılmaz.",
    ].join("\n"));
    // Kişisel seviye ve isim yok
    for (const p of ps) expect(text).not.toContain(p.name);
  });

  it("defansif ve ofansif orta saha özete adıyla ve sırasıyla yazılır", async () => {
    const { balanceText } = await import("../src/domain/messages");
    const { setLang } = await import("../src/i18n");
    setLang("tr");
    const ps = [
      player("a1", "Bir", 3, "AM"), player("a2", "İki", 3, "DEF"), player("a3", "Üç", 3, "DM"),
      player("b1", "Dört", 3, "MID"), player("b2", "Beş", 3, "FWD"), player("b3", "Altı", 3, "AM"),
    ];
    const m = allIn(match("m1", { date: "2026-10-15", format: 2 }), ps.map((p) => p.id));
    m.teams = { a: ["a1", "a2", "a3"], b: ["b1", "b2", "b3"] };
    const text = balanceText(state(ps, [m], { perf: false }), m);
    expect(text).toContain("🟡 Sarılar: 3 kişi · ortalama güç 3,0 · 0 kaleci · 1 defans, 1 defansif orta saha, 1 ofansif orta saha");
    expect(text).toContain("🟠 Turuncular: 3 kişi · ortalama güç 3,0 · 0 kaleci · 1 orta saha, 1 ofansif orta saha, 1 forvet");
  });

  it("geçen maçla karşılaştırma; takımlar kurulmadıysa özet yok; etkinlikte mevki yazılmaz", async () => {
    const { balanceOf } = await import("../src/domain/teams");
    const { balanceText } = await import("../src/domain/messages");
    const ps = roster(4);
    const prev = allIn(match("p", { date: "2026-10-08", status: "played" }), ["p0", "p1", "p2", "p3"]);
    prev.teams = { a: ["p0", "p1"], b: ["p2", "p3"] };
    const m = allIn(match("m", { date: "2026-10-15" }), ["p0", "p1", "p2", "p3"]);
    const s = state(ps, [prev, m], { perf: false });
    expect(balanceOf(s, m)).toBeNull();
    expect(balanceText(s, m)).toBe("");
    m.teams = { a: ["p0", "p2"], b: ["p1", "p3"] };
    expect(balanceOf(s, m)!.repeat).toBe(0);
    m.teams = { a: ["p0", "p1"], b: ["p2", "p3"] };
    expect(balanceOf(s, m)!.repeat).toBe(1);
    expect(balanceText(s, m)).toContain("Geçen maçta aynı takımda olanların %100'i yine birlikte");
    const ev = allIn(match("e", { kind: "paintball", cap: 4, date: "2026-10-17" }), ["p0", "p1", "p2", "p3"]);
    ev.teams = { a: ["p0", "p1"], b: ["p2", "p3"] };
    s.matches.push(ev);
    const text = balanceText(s, ev);
    expect(text).toContain("🟡 Sarılar: 2 kişi · ortalama güç 3,0\n");
    expect(text).not.toContain("kaleci");
  });
});
