/** Kontenjan ve yedek listesi (Kural 1.2, 1.3). */
import { describe, expect, it } from "vitest";
import { capOf, currentMatch, lineup, promoted, setAtt } from "../src/domain/lineup";
import { allIn, match, roster, state } from "./helpers/factory";

describe("kontenjan ve yedek listesi", () => {
  it("kontenjan (format+1)×2", () => {
    const s = state();
    expect(capOf(s, match("m", { format: 7 }))).toBe(16);
    expect(capOf(s, match("m", { format: 6 }))).toBe(14);
    expect(capOf(s, match("m", { format: 0 }))).toBe(16); // maç formatı yoksa ayardaki 7+1
  });

  it("ilk yazanlar kadroya girer, gerisi sırayla yedek", () => {
    const ps = roster(18);
    const m = allIn(match("m", { format: 7 }), ps.map((p) => p.id));
    const s = state(ps, [m]);
    const { playing, wait } = lineup(s, m);
    expect(playing).toEqual(ps.slice(0, 16).map((p) => p.id));
    expect(wait).toEqual(["p16", "p17"]);
  });

  it("kadrodan biri çekilince yedekteki ilk kişi kadroya girer", () => {
    const ps = roster(18);
    const m = allIn(match("m", { format: 7 }), ps.map((p) => p.id));
    const s = state(ps, [m]);
    const before = lineup(s, m).playing;
    setAtt(m, "p3", "out", true);
    const after = lineup(s, m).playing;
    expect(after).toContain("p16");
    expect(after).not.toContain("p3");
    expect(promoted(before, after)).toEqual(["p16"]);
    expect(lineup(s, m).wait).toEqual(["p17"]);
  });

  it("'Belki' kadroda sayılmaz", () => {
    const ps = roster(3);
    const m = allIn(match("m"), ["p0"]);
    setAtt(m, "p1", "maybe", false);
    const s = state(ps, [m]);
    expect(lineup(s, m).playing).toEqual(["p0"]);
  });

  it("aynı yanıta tekrar basmak yanıtı siler; tekrar 'Var' diyen sona yazılır", () => {
    const m = match("m");
    setAtt(m, "a", "in", false);
    setAtt(m, "b", "in", false);
    setAtt(m, "a", "in", false);
    expect(m.att.a).toBeUndefined();
    expect(m.order).toEqual(["b"]);
    setAtt(m, "a", "in", false);
    expect(m.order).toEqual(["b", "a"]);
    setAtt(m, "a", "in", true); // force: kalır
    expect(m.att.a).toBe("in");
  });

  it("silinmiş oyuncu kadroda yer kaplamaz", () => {
    const ps = roster(2);
    const m = allIn(match("m"), ["p0", "ghost", "p1"]);
    const s = state(ps, [m]);
    expect(lineup(s, m).playing).toEqual(["p0", "p1"]);
  });

  it("sıradaki maç: seçili açık maç, yoksa bugünden sonraki ilk açık maç", () => {
    const a = match("a", { date: "2026-10-01" });
    const b = match("b", { date: "2026-10-13" });
    const c = match("c", { date: "2026-10-15" });
    const d = match("d", { date: "2026-10-20", status: "played" });
    const s = state([], [c, a, d, b]);
    expect(currentMatch(s, null, "2026-10-09")!.id).toBe("b");
    expect(currentMatch(s, "c", "2026-10-09")!.id).toBe("c");
    expect(currentMatch(s, "d", "2026-10-09")!.id).toBe("b");
    expect(currentMatch(s, null, "2026-12-01")!.id).toBe("c");
  });
});
