/**
 * Skor tabelası (voleybol 18.2, ayak tenisi 19.5, masa tenisi 20.1/20.3,
 * tavla 21.4), kura (19.1, 21.1), kazanan kalır (20.7) ve araç paylaşımı (15.8).
 */
import { describe, expect, it } from "vitest";
import { addPoint, gamesTally, newGame, presetFor, replay, resultGame, scoreLine, undoPoint, winnerOf } from "../src/domain/scoring";
import { drawTables, drawTeams, partners, queueResult, startQueue, syncQueue } from "../src/domain/draw";
import { cleanCars, newCar, perHead, seatsLeft, unassigned } from "../src/domain/cars";
import { gameRecord, eventTable } from "../src/domain/stats";
import type { Game } from "../src/domain/types";
import { allIn, match, player, roster, state } from "./helpers/factory";
import { seeded } from "./helpers/rng";

/** "a" ve "b" harflerinden oluşan diziyi sırayla sayı olarak ekler. */
function play(g: Game, seq: string): void {
  for (const ch of seq) addPoint(g, ch as "a" | "b");
}
const times = (ch: string, n: number) => ch.repeat(n);

describe("voleybol (Kural 18.2)", () => {
  const m = match("v", { kind: "volleyball" });
  it("25'lik setler, karar seti 15, 3 sette 2", () => {
    const g = newGame(m, "sets", ["x"], ["y"], "Maç", "2026-10-17");
    expect(g.cfg).toEqual({ to: 25, last: 15, bestOf: 3, by2: true, serve: "rally" });
    play(g, times("a", 25));
    expect(replay(g).sets).toEqual([[25, 0]]);
    play(g, times("b", 25));
    expect(replay(g).setsWon).toEqual([1, 1]);
    expect(replay(g).target).toBe(15);
    play(g, times("a", 14) + times("b", 14));
    expect(replay(g).done).toBe(false);
    play(g, "a");
    expect(replay(g).done).toBe(false); // 15-14: 2 fark yok
    play(g, "a");
    const st = replay(g);
    expect(st.done).toBe(true);
    expect(st.win).toBe("a");
    expect(scoreLine(g)).toBe("25-0, 0-25, 16-14");
    expect(addPoint(g, "b")).toBe(false);
  });
  it("2 fark kuralı: 24-24'ten sonra 26-24", () => {
    const g = newGame(m, "sets", ["x"], ["y"], "Maç", "2026-10-17");
    play(g, times("ab", 24));
    expect(replay(g).cur).toEqual([24, 24]);
    play(g, "a");
    expect(replay(g).point).toBe("a");
    play(g, "a");
    expect(replay(g).sets).toEqual([[26, 24]]);
  });
  it("servisi ralliyi kazanan atar; set puanı uyarısı", () => {
    const g = newGame(m, "sets", ["x"], ["y"], "Maç", "2026-10-17", "b");
    expect(replay(g).server).toBe("b");
    play(g, "a");
    expect(replay(g).server).toBe("a");
    play(g, times("a", 23));
    expect(replay(g).point).toBe("a");
  });
  it("anlaşmaya göre format: 21'lik setler ya da tek set", () => {
    expect(presetFor(match("v", { kind: "volleyball", agree: { fmt: "bo3s" } }), "sets")).toMatchObject({ to: 21, last: 15, bestOf: 3 });
    expect(presetFor(match("v", { kind: "volleyball", agree: { fmt: "bo1" } }), "sets")).toMatchObject({ to: 25, bestOf: 1 });
    expect(presetFor(match("f", { kind: "footvolley" }), "sets")).toMatchObject({ to: 15, by2: true });
  });
  it("geri al son sayıyı siler; elle bitirme de geri alınır", () => {
    const g = newGame(m, "sets", ["x"], ["y"], "Maç", "2026-10-17");
    play(g, "aab");
    undoPoint(g);
    expect(replay(g).cur).toEqual([2, 0]);
    g.win = "b";
    g.done = true;
    expect(winnerOf(g)).toBe("b");
    undoPoint(g);
    expect(winnerOf(g)).toBeNull();
    expect(replay(g).cur).toEqual([2, 0]);
  });
});

describe("masa tenisi (Kural 20.1, 20.3)", () => {
  const m = match("t", { kind: "tabletennis" });
  it("ikişer servis, 10-10'dan sonra her sayıda değişir", () => {
    const g = newGame(m, "sets", ["x"], ["y"], "Maç", "2026-10-17");
    expect(g.cfg).toMatchObject({ to: 11, bestOf: 3, serve: "tt" });
    const servers: string[] = [];
    for (let i = 0; i < 6; i++) {
      servers.push(replay(g).server!);
      addPoint(g, i % 2 ? "b" : "a");
    }
    expect(servers.join("")).toBe("aabbaa");
    const d = newGame(m, "sets", ["x"], ["y"], "Maç", "2026-10-17");
    play(d, times("ab", 10));
    expect(replay(d).cur).toEqual([10, 10]);
    const deuce: string[] = [];
    for (let i = 0; i < 4; i++) {
      deuce.push(replay(d).server!);
      addPoint(d, i % 2 ? "b" : "a");
    }
    expect(deuce.join("")).toBe("abab");
  });
  it("bir oyunda ilk servisi atan sonrakinde karşılar; 5 oyun anlaşması", () => {
    const g = newGame(m, "sets", ["x"], ["y"], "Maç", "2026-10-17");
    play(g, times("a", 11));
    expect(replay(g).server).toBe("b");
    expect(presetFor(match("t", { kind: "tabletennis", agree: { bo: "5" } }), "sets").bestOf).toBe(5);
  });
});

describe("tavla (Kural 21.4)", () => {
  it("5 sayıya, mars 2 sayı", () => {
    const m = match("k", { kind: "kiraathane" });
    const g = newGame(m, "tavla", ["x"], ["y"], "Masa 1", "2026-10-17");
    expect(g.cfg.to).toBe(5);
    addPoint(g, "a", 2);
    addPoint(g, "b");
    addPoint(g, "a", 2);
    expect(replay(g).point).toBe("a");
    addPoint(g, "a");
    expect(winnerOf(g)).toBe("a");
    expect(scoreLine(g)).toBe("5-1");
    expect(presetFor(match("k", { kind: "kiraathane", agree: { tavla: "7" } }), "tavla").to).toBe(7);
  });
});

describe("takım skoru ve kişisel kayıt", () => {
  it("voleybolda oyunlar takım skoruna, kişisel galibiyetlere işlenir", () => {
    const m = match("v", { kind: "volleyball", teams: { a: ["p0", "p1"], b: ["p2", "p3"] } });
    const g1 = newGame(m, "sets", ["p0", "p1"], ["p2", "p3"], "1", "2026-10-17");
    play(g1, times("a", 25) + times("a", 25));
    const g2 = newGame(m, "sets", ["p2", "p3"], ["p0", "p1"], "2", "2026-10-17");
    play(g2, times("a", 25) + times("a", 25));
    m.games = [g1, g2, resultGame(["p0"], ["p2"], "a", "x", "2026-10-17")];
    expect(gamesTally(m)).toEqual({ a: 1, b: 1 });
    expect(gameRecord(m, "p0")).toEqual({ w: 2, l: 1, g: 3 });
  });
  it("etkinlik tablosu: halı saha hariç katılım ve galibiyet", () => {
    const players = roster(4);
    const ev = allIn(match("e", { kind: "kiraathane", status: "played", cap: 0 }), ["p0", "p1", "p2"]);
    ev.games = [resultGame(["p0"], ["p1", "p2"], "a", "Masa 1", "2026-10-17")];
    const fb = allIn(match("m", { status: "played" }), ["p0", "p3"]);
    const s = state(players, [ev, fb]);
    const t = eventTable(s);
    expect(t.map((r) => r.id)).toEqual(["p0", "p1", "p2"]);
    expect(t[0]).toMatchObject({ events: 1, wins: 1, games: 1, byKind: { kiraathane: 1 } });
  });
});

describe("kura (Kural 19.1, 21.1)", () => {
  it("ayak tenisi çiftleri dengeli; artan yedekte", () => {
    const players = [player("a", "A", 5), player("b", "B", 5), player("c", "C", 1), player("d", "D", 1), player("e", "E", 3)];
    const s = state(players);
    const m = allIn(match("f", { kind: "footvolley" }), players.map((p) => p.id));
    const d = drawTeams(s, m, 2, seeded(3));
    expect(d.groups).toHaveLength(3);
    expect(d.groups[2]).toHaveLength(1);
    const sums = d.groups.slice(0, 2).map((g) => g.reduce((t, id) => t + players.find((p) => p.id === id)!.rating, 0));
    expect(Math.abs(sums[0] - sums[1])).toBeLessThanOrEqual(2);
  });
  it("kıraathane: 4'lü masalar, eşli oyunda karşılıklı oturanlar eş", () => {
    const s = state(roster(9));
    const m = allIn(match("k", { kind: "kiraathane" }), s.players.map((p) => p.id));
    const d = drawTables(s, m, "batak", true, seeded(1));
    expect(d.size).toBe(4);
    expect(d.pairs).toBe(true);
    expect(d.groups.map((g) => g.length)).toEqual([4, 4, 1]);
    expect(new Set(d.groups.flat()).size).toBe(9);
    const [x, y] = partners(["a", "b", "c", "d"]);
    expect(x).toEqual(["a", "c"]);
    expect(y).toEqual(["b", "d"]);
    expect(drawTables(s, m, "okey", true, seeded(1)).pairs).toBe(false);
    expect(drawTables(s, m, "tavla", false, seeded(1)).groups[0]).toHaveLength(2);
  });
});

describe("kazanan kalır (Kural 20.7)", () => {
  it("kazanan masada kalır, kaybeden sıranın sonuna; sınırda ikisi de sona", () => {
    let q = startQueue(["a", "b", "c", "d"], seeded(7));
    q = { table: ["a", "b"], order: ["c", "d"], streak: 0 };
    q = queueResult(q, "a", 3);
    expect(q).toEqual({ table: ["a", "c"], order: ["d", "b"], streak: 1 });
    q = queueResult(q, "a", 3);
    expect(q).toEqual({ table: ["a", "d"], order: ["b", "c"], streak: 2 });
    q = queueResult(q, "a", 3);
    expect(q.streak).toBe(0);
    expect(q.table).toEqual(["b", "c"]);
    expect(q.order).toEqual(["d", "a"]);
    q = queueResult(q, "c", 3);
    expect(q).toEqual({ table: ["c", "d"], order: ["a", "b"], streak: 1 });
  });
  it("sınır yoksa seri sürer; ayrılan çıkar, gelen sona eklenir", () => {
    let q = { table: ["a", "b"], order: ["c"], streak: 5 };
    q = queueResult(q, "a", 0);
    expect(q.streak).toBe(6);
    const sy = syncQueue({ table: ["a", "c"], order: ["b"], streak: 6 }, ["a", "b", "e"]);
    expect(sy.table).toEqual(["a", "b"]);
    expect(sy.order).toEqual(["e"]);
    expect(sy.streak).toBe(6); // şampiyon masada, serisi sürer
    expect(syncQueue({ table: ["a", "c"], order: ["b"], streak: 6 }, ["b", "c"]).streak).toBe(0);
  });
});

describe("araç paylaşımı (Kural 15.8)", () => {
  it("masraf araçtakilere eşit bölünür, liraya yukarı yuvarlanır", () => {
    const c = newCar("a", 5);
    c.pax = ["b", "c"];
    c.fuel = 700;
    c.toll = 101;
    expect(perHead(c)).toBe(267);
    expect(seatsLeft(c)).toBe(2);
  });
  it("araçsızlar ve kadrodan çıkanların temizlenmesi", () => {
    const s = state(roster(5));
    const m = allIn(match("e", { kind: "paintball", cap: 12 }), ["p0", "p1", "p2", "p3"]);
    const c1 = newCar("p0");
    c1.pax = ["p1", "p4"];
    const c2 = newCar("p4");
    m.cars = [c1, c2];
    cleanCars(s, m);
    expect(m.cars).toHaveLength(1);
    expect(m.cars[0].pax).toEqual(["p1"]);
    expect(unassigned(s, m)).toEqual(["p2", "p3"]);
  });
});
