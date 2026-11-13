/**
 * Haftalık iş listesi: sıradaki etkinliğin adımları (davet, kadro, saha, takımlar, sonuç, ödemeler)
 * ve önceki etkinliklerden kalan işler. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { matchSteps, pastSteps, payProgress, teamsSig, todoOf, type Step } from "../src/domain/todo";
import { accounts, markPaid } from "../src/domain/ledger";
import { freezeBill } from "../src/domain/money";
import { migrate } from "../src/domain/migrate";
import { setLang } from "../src/i18n";
import type { Match, State } from "../src/domain/types";
import { allIn, match, roster, state } from "./helpers/factory";

setLang("tr");

const TODAY = "2026-10-11";
/** Yerel saatle an (testler saat diliminden bağımsız olsun). */
const at = (d: string, hm = "12:00") => new Date(d + "T" + hm + ":00");
const NOW = at(TODAY);
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => "p" + (from + i));

/** 4+1 format (kontenjan 10), maç 15.10 21:00; kaleciler ücretsiz kapalı. */
function setup(extra: Partial<Match> = {}): { s: State; m: Match } {
  const m = match("m1", { format: 4, date: "2026-10-15", time: "21:00", price: 1000, ...extra });
  const s = state(roster(14), [m], { gkFree: false, round: false, reserveDays: 2 });
  return { s, m };
}

const by = (steps: Step[], key: string) => steps.find((x) => x.key === key && !x.past)!;
const brief = (x: Step) => [x.state, x.text, x.act ? x.act.a + (x.act.k ? ":" + x.act.k : "") : null];

describe("sıradaki etkinliğin adımları", () => {
  it("boş maçta sıra: davet → kadro → saha; takımlar, sonuç ve ödemeler zamanı gelince", () => {
    const { s, m } = setup();
    const steps = matchSteps(s, m, NOW, TODAY);
    expect(steps.map((x) => x.key)).toEqual(["invite", "squad", "field", "teams", "result", "pay"]);
    expect(brief(by(steps, "invite"))).toEqual(["todo", "gönderilmedi", "msg:invite"]);
    expect(brief(by(steps, "squad"))).toEqual(["todo", "0/10 · 10 kişi eksik", "pasteList"]);
    expect(brief(by(steps, "field"))).toEqual(["todo", "Saha seçilmedi · rezerve edilmedi", "reserve"]);
    expect(brief(by(steps, "teams"))).toEqual(["later", "kadro bekleniyor", null]);
    expect(brief(by(steps, "result"))).toEqual(["later", "maçtan sonra", null]);
    expect(brief(by(steps, "pay"))).toEqual(["later", "ödeyen yok", null]);
    const td = todoOf(s, m, NOW, TODAY);
    expect(td.next!.key).toBe("invite");
    expect([td.done, td.total]).toEqual([0, 6]);
  });

  it("davet gönderilince ya da kadro dolunca davet adımı kapanır", () => {
    const { s, m } = setup();
    m.sent.invite = at("2026-10-11", "09:30").getTime();
    expect(by(matchSteps(s, m, NOW, TODAY), "invite").state).toBe("done");
    expect(by(matchSteps(s, m, NOW, TODAY), "invite").text).toContain("gönderildi · Paz 11.10 09:30");
    expect(todoOf(s, m, NOW, TODAY).next!.key).toBe("squad");
    const x = setup();
    allIn(x.m, ids(10));
    expect(brief(by(matchSteps(x.s, x.m, NOW, TODAY), "invite"))).toEqual(["done", "kadro dolu, davet gerekmiyor", null]);
  });

  it("kadro: eksik, tamam, yedek; kesinleşince duyurulmadıysa hatırlatılır (Kural 1.4)", () => {
    const { s, m } = setup();
    allIn(m, ids(7));
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "squad"))).toEqual(["todo", "7/10 · 3 kişi eksik", "pasteList"]);
    allIn(m, ids(5, 7));
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "squad"))).toEqual(["done", "10/10 · tamam · yedek 2", null]);
    // Kesinleşme: 14.10 21:00
    const locked = at("2026-10-14", "21:30");
    expect(brief(by(matchSteps(s, m, locked, "2026-10-14"), "squad"))).toEqual(["todo", "10/10 · kesinleşti, kadroyu duyur · yedek 2", "msg:squad"]);
    m.sent.squad = locked.getTime();
    expect(by(matchSteps(s, m, locked, "2026-10-14"), "squad").state).toBe("done");
    // Kesinleştiği hâlde eksik: uyarı
    const y = setup();
    allIn(y.m, ids(8));
    expect(brief(by(matchSteps(y.s, y.m, locked, "2026-10-14"), "squad"))).toEqual(["warn", "8/10 · kesinleşti, 2 kişi eksik", "msg:squad"]);
    y.m.sent.squad = 1;
    expect(brief(by(matchSteps(y.s, y.m, locked, "2026-10-14"), "squad"))).toEqual(["warn", "8/10 · kesinleşti, 2 kişi eksik", "pasteList"]);
  });

  it("saha: ayırtma süresi yaklaşınca uyarı olur, ayırtılınca kapanır", () => {
    const { s, m } = setup();
    s.fields.push({ id: "f1", name: "Deneme Halı Saha", address: "", link: "", phone: "", price: 0, lat: null, lng: null });
    m.fieldId = "f1";
    expect(by(matchSteps(s, m, NOW, TODAY), "field").state).toBe("todo");
    expect(brief(by(matchSteps(s, m, at("2026-10-14"), "2026-10-14"), "field"))).toEqual(["warn", "Deneme Halı Saha · rezerve edilmedi", "reserve"]);
    m.reserved = true;
    expect(brief(by(matchSteps(s, m, at("2026-10-14"), "2026-10-14"), "field"))).toEqual(["done", "Deneme Halı Saha · rezerve edildi", null]);
    // Hatırlatma kapalıysa uyarıya dönmez
    m.reserved = false;
    s.settings.reserveDays = 0;
    expect(by(matchSteps(s, m, at("2026-10-14"), "2026-10-14"), "field").state).toBe("todo");
  });

  it("takımlar: kur → paylaş; paylaşıldıktan sonra değişirse ya da takımsız kalan olursa uyarır", () => {
    const { s, m } = setup();
    allIn(m, ids(6));
    // Kadro dolmadı ve kesinleşmedi: zamanı gelmedi ama kurulabilir
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "teams"))).toEqual(["later", "kurulmadı", "goTeams"]);
    allIn(m, ids(4, 6));
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "teams"))).toEqual(["todo", "kurulmadı", "goTeams"]);
    m.teams = { a: ids(5), b: ids(5, 5) };
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "teams"))).toEqual(["todo", "kuruldu, paylaşılmadı", "msg:teams"]);
    m.sent.teams = at(TODAY, "10:00").getTime();
    m.sent.teamsSig = teamsSig(m);
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "teams"))).toEqual(["done", "gönderildi · Paz 11.10 10:00", null]);
    // Takas: paylaşılan takımlar artık geçerli değil
    m.teams = { a: ["p5", ...ids(4, 1)], b: ["p0", ...ids(4, 6)] };
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "teams"))).toEqual(["warn", "paylaşıldıktan sonra değişti", "msg:teams"]);
    // Kadroya sonradan giren takımsız kalır
    m.att.p9 = "out";
    m.order = m.order.filter((x) => x !== "p9");
    allIn(m, ["p12"]);
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "teams"))).toEqual(["warn", "1 kişi takımsız", "goTeams"]);
  });

  it("takım imzası sıradan bağımsız, dağılıma bağlı", () => {
    const a = match("a", { teams: { a: ["x", "y"], b: ["z"] } });
    expect(teamsSig(a)).toBe(teamsSig(match("b", { teams: { a: ["y", "x"], b: ["z"] } })));
    expect(teamsSig(a)).not.toBe(teamsSig(match("c", { teams: { a: ["x"], b: ["y", "z"] } })));
    expect(teamsSig(a)).not.toBe(teamsSig(match("d", { teams: { a: ["z"], b: ["x", "y"] } })));
    expect(teamsSig(match("e"))).toBeGreaterThan(0);
  });

  it("sonuç: maç başlayınca girilebilir, üç saat sonra uyarı olur", () => {
    const { s, m } = setup();
    expect(by(matchSteps(s, m, at("2026-10-15", "20:59"), "2026-10-15"), "result").state).toBe("later");
    expect(brief(by(matchSteps(s, m, at("2026-10-15", "22:10"), "2026-10-15"), "result"))).toEqual(["todo", "girilmedi", "openResult"]);
    expect(by(matchSteps(s, m, at("2026-10-16", "00:01"), "2026-10-16"), "result").state).toBe("warn");
  });

  it("ödemeler: ödeyen / toplam ve kalan tutar; hepsi ödeyince kapanır", () => {
    const { s, m } = setup();
    allIn(m, ids(10));
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "pay"))).toEqual(["todo", "0/10 ödedi · kalan 1.000 ₺", "todoPay"]);
    ids(3).forEach((id) => markPaid(s, m, id, TODAY));
    expect(payProgress(s, m, accounts(s, TODAY))).toEqual({ n: 10, paid: 3, left: 700 });
    expect(by(matchSteps(s, m, NOW, TODAY), "pay").text).toBe("3/10 ödedi · kalan 700 ₺");
    ids(7, 3).forEach((id) => markPaid(s, m, id, TODAY));
    expect(brief(by(matchSteps(s, m, NOW, TODAY), "pay"))).toEqual(["done", "10 kişi ödedi, kapandı", null]);
  });

  it("etkinliklerde takım adımı kuraya döner (kıraathane masa kurası, masa tenisi sırası)", () => {
    const k = match("k1", { kind: "kiraathane", cap: 8, date: "2026-10-17", time: "20:30" });
    const s = state(roster(8), [k]);
    allIn(k, ids(8));
    const step = () => by(matchSteps(s, k, NOW, TODAY), "teams");
    expect([step().title, ...brief(step())]).toEqual(["Kura", "todo", "çekilmedi", "goTeams"]);
    k.draw = { game: "okey", size: 4, pairs: false, groups: [ids(4), ids(4, 4)] };
    expect(brief(step())).toEqual(["done", "çekildi", null]);
    expect(by(matchSteps(s, k, NOW, TODAY), "field").title).toBe("Mekân");
    const tt = match("t1", { kind: "tabletennis", cap: 8, date: "2026-10-17", time: "20:00" });
    s.matches.push(tt);
    allIn(tt, ids(4));
    const tstep = () => by(matchSteps(s, tt, NOW, TODAY), "teams");
    expect(tstep().state).toBe("later");
    tt.queue = { order: ["p2", "p3"], table: ["p0", "p1"], streak: 0 };
    expect(tstep().state).toBe("done");
  });
});

describe("önceki etkinliklerden kalan işler", () => {
  /** Oynanmış maç: 10 kişi, 7'si ödedi. */
  function played(id: string, date: string, s: State, paid = 7): Match {
    const m = allIn(match(id, { format: 4, date, time: "21:00", price: 1000, status: "played" }), ids(10));
    s.matches.push(m);
    freezeBill(s, m);
    ids(paid).forEach((p) => markPaid(s, m, p, date));
    return m;
  }

  it("ödemesi kapanmamış son maç en başa gelir ve sıradaki iş olur", () => {
    const { s, m } = setup();
    played("old", "2026-10-06", s);
    const past = pastSteps(s, m, NOW, TODAY);
    expect(past.map((x) => [x.key, x.mid, x.title, x.state, x.text, x.act?.a])).toEqual([["pay", "old", "Sal 06.10 ödemeleri", "warn", "7/10 ödedi · kalan 300 ₺", "todoPay"]]);
    const td = todoOf(s, m, NOW, TODAY);
    expect(td.steps[0].mid).toBe("old");
    expect(td.next!.mid).toBe("old");
    // Sayaç yalnızca sıradaki etkinliğin adımlarını sayar
    expect(td.total).toBe(6);
  });

  it("hepsi ödenmiş maç ve 30 günden eski maç listelenmez; en çok son üç maç", () => {
    const { s, m } = setup();
    played("paid", "2026-10-06", s, 10);
    played("ancient", "2026-09-01", s);
    expect(pastSteps(s, m, NOW, TODAY)).toEqual([]);
    ["2026-09-15", "2026-09-22", "2026-09-29", "2026-10-08"].forEach((d, i) => played("x" + i, d, s));
    expect(pastSteps(s, m, NOW, TODAY).map((x) => x.mid)).toEqual(["x1", "x2", "x3"]);
  });

  it("saati geçtiği hâlde bitirilmemiş maç 'sonuç' işi olarak kalır; açık maç yoksa da görünür", () => {
    const { s, m } = setup();
    const stale = allIn(match("stale", { format: 4, date: "2026-10-08", time: "21:00" }), ids(4));
    s.matches.push(stale);
    const past = pastSteps(s, m, NOW, TODAY);
    expect(past.map((x) => [x.key, x.mid, x.title, x.state, x.act?.a])).toEqual([["result", "stale", "Per 08.10 sonucu", "warn", "openResult"]]);
    // Seçili maçın kendisi "önceki" sayılmaz
    expect(pastSteps(s, stale, NOW, TODAY)).toEqual([]);
    s.matches = s.matches.filter((x) => x.id !== "m1");
    const td = todoOf(s, null, NOW, TODAY);
    expect(td.steps.map((x) => x.mid)).toEqual(["stale"]);
    expect([td.done, td.total]).toEqual([0, 0]);
  });
});

describe("şema v6: gönderilen mesajlar", () => {
  it("v5 verisine boş kayıt eklenir; bozuk değerler temizlenir", () => {
    const v5 = {
      v: 5, settings: { lang: "tr" }, players: [],
      matches: [{ id: "a", kind: "football", date: "2026-10-01", time: "21:00", status: "open", att: {}, order: [], guests: [], teams: { a: [], b: [] }, injured: {}, sheets: [] }],
    };
    const s = migrate(v5);
    expect(s.matches[0].sent).toEqual({});
    const v6 = JSON.parse(JSON.stringify(s));
    v6.matches[0].sent = { invite: 1700000000000, teams: "x", squad: 0, teamsSig: 12345, pay: -5 };
    expect(migrate(v6).matches[0].sent).toEqual({ invite: 1700000000000, teamsSig: 12345 });
  });
});
