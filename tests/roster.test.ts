/** Kadro yardımcıları: geçen haftayı kopyalama, sabit oyuncular, 24 saat kuralı, güvenilirlik. */
import { describe, expect, it } from "vitest";
import { applyFixed, copyLastWeek, isLocked, lastWeekSource, noShowLastTime, reliability } from "../src/domain/roster";
import { lineup } from "../src/domain/lineup";
import { allIn, match, player, roster, state } from "./helpers/factory";

describe("geçen haftanın kadrosu", () => {
  it("aynı gün ve saatteki önceki maçı kaynak alır, yalnızca yanıtsızları ekler", () => {
    const ps = roster(6);
    const tue = allIn(match("tue", { date: "2026-10-06", time: "21:00", status: "played" }), ["p0", "p1", "p2", "p3"]);
    const thu = allIn(match("thu", { date: "2026-10-08", time: "21:00", status: "played" }), ["p4", "p5"]);
    const next = match("next", { date: "2026-10-13", time: "21:00" });
    next.att.p1 = "out";
    const s = state(ps, [tue, thu, next]);
    expect(lastWeekSource(s, next)!.id).toBe("tue");
    expect(copyLastWeek(s, next)).toBe(3);
    expect(next.order).toEqual(["p0", "p2", "p3"]);
    expect(next.att.p1).toBe("out");
  });
  it("aynı gün yoksa en yakın önceki maç; misafirler ve pasifler kopyalanmaz", () => {
    const ps = [...roster(3), player("x", "Pasif", 3, "", { active: false })];
    const prev = allIn(match("prev", { date: "2026-10-08", time: "20:00", status: "played" }), ["p0", "g1", "x", "p1"]);
    prev.guests = [{ id: "g1", name: "Misafir", rating: 3, pos: "" }];
    const next = match("next", { date: "2026-10-13", time: "21:00" });
    const s = state(ps, [prev, next]);
    expect(copyLastWeek(s, next)).toBe(2);
    expect(next.order).toEqual(["p0", "p1"]);
  });
  it("iptal edilen maç kaynak olmaz", () => {
    const prev = allIn(match("prev", { date: "2026-10-06", status: "cancelled" }), ["p0"]);
    const next = match("next", { date: "2026-10-13" });
    expect(lastWeekSource(state(roster(1), [prev, next]), next)).toBeNull();
  });
});

describe("sabit oyuncular", () => {
  it("yeni maça otomatik 'Var' yazılır (aktif olanlar)", () => {
    const ps = [player("a", "Sabit", 3, "", { fixed: true }), player("b", "Normal"), player("c", "Sabit pasif", 3, "", { fixed: true, active: false })];
    const m = match("m");
    const s = state(ps, [m]);
    expect(applyFixed(s, m)).toBe(1);
    expect(lineup(s, m).playing).toEqual(["a"]);
  });
});

describe("24 saat kuralı (Kural 1.4)", () => {
  it("maça 24 saatten az kalınca kadro kesinleşir", () => {
    const m = match("m", { date: "2026-10-13", time: "21:00" });
    expect(isLocked(m, new Date(2026, 9, 12, 20, 0))).toBe(false);
    expect(isLocked(m, new Date(2026, 9, 12, 21, 30))).toBe(true);
    expect(isLocked({ ...m, status: "played" }, new Date(2026, 9, 13, 22))).toBe(false);
  });
});

describe("güvenilirlik", () => {
  it("geç iptal 1, habersiz gelmeme 2 ceza; sadece oynanmış maçlar", () => {
    const ps = roster(3);
    const ms = [1, 2, 3, 4].map((i) => allIn(match("m" + i, { date: "2026-10-0" + i, status: "played", format: 1 }), ["p0", "p1"]));
    ms[0].att.p2 = "late";
    ms[1].noshow.p1 = true;
    const open = allIn(match("o", { status: "open" }), ["p0"]);
    open.att.p2 = "late";
    const r = reliability(state(ps, [...ms, open]));
    expect(r.p0).toEqual({ commits: 4, late: 0, noshow: 0, score: 100 });
    expect(r.p1).toEqual({ commits: 4, late: 0, noshow: 1, score: 50 });
    expect(r.p2).toEqual({ commits: 1, late: 1, noshow: 0, score: 0 });
  });
  it("geçen maç gelmeyenler (Kural 1.6)", () => {
    const prev = allIn(match("prev", { date: "2026-10-06", status: "played" }), ["p0", "p1"]);
    prev.noshow.p1 = true;
    const next = match("next", { date: "2026-10-13" });
    expect([...noShowLastTime(state(roster(2), [prev, next]), next)]).toEqual(["p1"]);
  });
});
