/**
 * Yönetmeliğin tamamlanan maddeleri: turnuva tablosu (20.1), puan cetveli
 * (21.1–21.2), kapanış listeleri (3.3, 10.1, 17.4, 20.8, 21.7–21.8) ve
 * şema v4 → v5. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { bracketSize, champion, makeBracket, pairKey, playable, resolveBracket, roundKey, setPick } from "../src/domain/bracket";
import { leaders, newSheet, parseScore, sheetFor, totals } from "../src/domain/sheet";
import { addPoint, newGame } from "../src/domain/scoring";
import { isCup, KIND_DEFS, postProgress } from "../src/domain/kinds";
import { migrate } from "../src/domain/migrate";
import { SCHEMA_VERSION } from "../src/domain/schema";
import { KINDS } from "../src/domain/types";
import type { Draw } from "../src/domain/types";
import { match } from "./helpers/factory";
import { seeded } from "./helpers/rng";

const sides = (n: number) => Array.from({ length: n }, (_, i) => ["p" + i]);

describe("turnuva tablosu (Kural 20.1)", () => {
  it("tablo 2'nin kuvveti büyüklüğünde; baylar dengeli dağılır, iki bay karşılaşmaz", () => {
    expect(bracketSize(2)).toBe(2);
    expect(bracketSize(5)).toBe(8);
    expect(bracketSize(8)).toBe(8);
    expect(bracketSize(9)).toBe(16);
    for (const n of [2, 3, 5, 6, 7, 9, 12]) {
      const br = makeBracket(sides(n), seeded(n));
      expect(br.seeds).toHaveLength(bracketSize(n));
      expect(br.seeds.filter(Boolean)).toHaveLength(n);
      for (let i = 0; i < br.seeds.length; i += 2) expect(br.seeds[i] || br.seeds[i + 1]).toBeTruthy();
      const ids = br.seeds.filter(Boolean).flat();
      expect(new Set(ids).size).toBe(n);
    }
  });

  it("bay geçen ikinci tura kendiliğinden çıkar; final oynanınca şampiyon belli olur", () => {
    const br = makeBracket(sides(3), seeded(2));
    let r = resolveBracket(br, []);
    expect(r).toHaveLength(2);
    const bye = r[0].find((x) => x.bye)!;
    expect(bye.win).toBeTruthy();
    expect(playable(r)).toHaveLength(1);
    // İlk tur maçını elle bitir
    const m0 = r[0].find((x) => !x.bye)!;
    setPick(br, m0, { win: "a" });
    r = resolveBracket(br, []);
    expect(r[1][0].a && r[1][0].b).toBeTruthy();
    expect(champion(r)).toBeNull();
    setPick(br, r[1][0], { win: "b" });
    r = resolveBracket(br, []);
    expect(champion(r)).toEqual(r[1][0].b);
    expect(playable(r)).toHaveLength(0);
  });

  it("skor tabelasındaki oyunun sonucu tabloya işlenir; oyun silinirse karar düşer", () => {
    const m = match("t1", { kind: "tabletennis", agree: { org: "cup", bo: "5" } });
    m.bracket = makeBracket(sides(2), seeded(1));
    const [bm] = resolveBracket(m.bracket, m.games)[0];
    const g = newGame(m, "sets", bm.a!, bm.b!, "Final", "2026-10-17");
    expect(g.cfg.bestOf).toBe(5);
    m.games.push(g);
    setPick(m.bracket, bm, { gid: g.id, win: null });
    expect(champion(resolveBracket(m.bracket, m.games))).toBeNull();
    for (let set = 0; set < 3; set++) for (let i = 0; i < 11; i++) addPoint(g, "b");
    expect(champion(resolveBracket(m.bracket, m.games))).toEqual(bm.b);
    m.games = [];
    expect(champion(resolveBracket(m.bracket, m.games))).toBeNull();
  });

  it("eşleşme değişirse eski karar geçersiz sayılır", () => {
    const br = makeBracket(sides(4), seeded(5));
    const r = resolveBracket(br, []);
    setPick(br, r[0][0], { win: "a" });
    setPick(br, r[0][1], { win: "a" });
    setPick(br, resolveBracket(br, [])[1][0], { win: "a" });
    expect(champion(resolveBracket(br, []))).toBeTruthy();
    // İlk maçın sonucu değişince finalin anahtarı tutmaz
    setPick(br, r[0][0], { win: "b" });
    const r2 = resolveBracket(br, []);
    expect(r2[1][0].win).toBeNull();
    expect(br.picks["1-0"].key).not.toBe(pairKey(r2[1][0].a, r2[1][0].b));
  });

  it("tur adları: final, yarı final, çeyrek final", () => {
    expect(roundKey(3, 2).k).toBe("final");
    expect(roundKey(3, 1).k).toBe("semi");
    expect(roundKey(3, 0).k).toBe("quarter");
    expect(roundKey(5, 0)).toEqual({ k: "roundN", n: 1 });
  });

  it("turnuva düzeni yalnızca masa tenisi ve ayak tenisinde", () => {
    expect(isCup({ kind: "tabletennis", agree: { org: "cup" } })).toBe(true);
    expect(isCup({ kind: "tabletennis", agree: {} })).toBe(false);
    expect(isCup({ kind: "footvolley", agree: { org: "cup" } })).toBe(true);
    expect(isCup({ kind: "volleyball", agree: { org: "cup" } })).toBe(false);
  });
});

describe("kıraathane puan cetveli (Kural 21.1–21.2)", () => {
  const d: Draw = { game: "101", size: 4, pairs: false, groups: [["a", "b", "c", "d"], ["e", "f"]] };

  it("101'de düşük puan kazanır; toplam ve önde olan doğru", () => {
    const sh = newSheet(0, d)!;
    expect(sh.low).toBe(true);
    expect(sh.seats).toEqual([["a"], ["b"], ["c"], ["d"]]);
    sh.rows.push([10, 50, 0, 101], [20, -5, 30, 0]);
    expect(totals(sh)).toEqual([30, 45, 30, 101]);
    expect(leaders(sh)).toEqual([0, 2]);
    sh.rows.push([5, 0, 0, 0]);
    expect(leaders(sh)).toEqual([2]);
  });

  it("puanlı okey 20'den başlar, yüksek kalan önde; eşli oyunda taraflar eşler", () => {
    const ok = newSheet(0, { ...d, game: "okey" })!;
    expect(ok.start).toBe(20);
    ok.rows.push([-2, -2, 0, -2]);
    expect(totals(ok)).toEqual([18, 18, 20, 18]);
    expect(leaders(ok)).toEqual([2]);
    const bt = newSheet(0, { ...d, game: "batak", pairs: true })!;
    expect(bt.seats).toEqual([["a", "c"], ["b", "d"]]);
    expect(bt.low).toBe(false);
  });

  it("kura yeniden çekilirse eski cetvel o masaya ait sayılmaz", () => {
    const sh = newSheet(0, d)!;
    expect(sheetFor([sh], d, 0)).toBe(sh);
    expect(sheetFor([sh], { ...d, groups: [["d", "c", "b", "a"]] }, 0)).toBeNull();
    expect(sheetFor([sh], { ...d, game: "king" }, 0)).toBeNull();
  });

  it("puan girişi: eksi, artı, virgül, boş", () => {
    expect(parseScore("-20")).toBe(-20);
    expect(parseScore("−4")).toBe(-4);
    expect(parseScore("+3")).toBe(3);
    expect(parseScore("1,5")).toBe(1.5);
    expect(parseScore("")).toBe(0);
    expect(parseScore("abc")).toBe(0);
  });
});

describe("kapanış listeleri", () => {
  it("her türün kapanış listesi var ve maddeler yönetmelik numarası taşır", () => {
    for (const k of KINDS) {
      const post = KIND_DEFS[k].post;
      expect(post.length).toBeGreaterThan(0);
      for (const c of post) {
        expect(c.key.startsWith("post.")).toBe(true);
        expect(c.rule).toMatch(/^\d+\.\d+$/);
      }
    }
    expect(KIND_DEFS.football.post.map((c) => c.rule)).toEqual(expect.arrayContaining(["3.3", "10.1"]));
    expect(KIND_DEFS.airsoft.post.map((c) => c.rule)).toContain("17.4");
    expect(KIND_DEFS.kiraathane.post.map((c) => c.rule)).toEqual(expect.arrayContaining(["21.7", "21.8"]));
  });

  it("kapanış listesi hazırlık sayacını etkilemez", () => {
    const m = match("m", { checks: { "post.bibs": true, "post.room": true } });
    expect(postProgress(m)).toEqual({ done: 2, total: KIND_DEFS.football.post.length });
  });
});

describe("şema v4 → v5", () => {
  it("sakatlık ve cetvel alanları eklenir; turnuva ve korner serisi temizlenerek korunur", () => {
    const v4 = {
      v: 4,
      settings: { lang: "tr" },
      players: [],
      matches: [
        { id: "a", kind: "football", date: "2026-10-01", time: "21:00", status: "played", att: {}, order: [], guests: [], teams: { a: [], b: [] } },
        { id: "b", kind: "tabletennis", date: "2026-10-02", time: "20:00", status: "open", att: {}, order: [], guests: [], teams: { a: [], b: [] },
          bracket: { seeds: [["x"], ["y"], ["z"]], picks: { "0-0": { key: "x|y", win: "a" }, kötü: { key: 1 } } }, corners: { a: 2, b: -1 }, injured: { x: true, y: 0 },
          sheets: [{ id: "s", t: 0, key: "x+y", game: "okey", low: 0, start: "20", seats: [["x"], ["y"]], rows: [["3", "x"]], done: false }, { seats: [["x"]] }] },
      ],
    };
    const s = migrate(v4);
    expect(s.v).toBe(SCHEMA_VERSION);
    expect(s.matches[0].injured).toEqual({});
    expect(s.matches[0].sheets).toEqual([]);
    expect(s.matches[0].bracket).toBeUndefined();
    const b = s.matches[1];
    expect(b.bracket!.seeds).toHaveLength(4);
    expect(b.bracket!.seeds[3]).toBeNull();
    expect(Object.keys(b.bracket!.picks)).toEqual(["0-0"]);
    expect(b.corners).toEqual({ a: 2, b: 0 });
    expect(b.injured).toEqual({ x: true });
    expect(b.sheets).toHaveLength(1);
    expect(b.sheets[0].start).toBe(20);
    expect(b.sheets[0].rows).toEqual([[3, 0]]);
  });
});
