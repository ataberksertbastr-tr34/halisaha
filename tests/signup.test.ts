/** WhatsApp davet listesini yapıştırma: ayrıştırma, eşleştirme, öneri ve uygulama (Kural 1.3, 2.4, 9.1). İsimler uydurmadır. */
import { describe, expect, it } from "vitest";
import { applyPlan, candidates, choose, listDateIssues, parseList, planList, type PlanRow } from "../src/domain/signup";
import { addInfraction } from "../src/domain/discipline";
import { lineup, setAtt } from "../src/domain/lineup";
import { allIn, match, player, state } from "./helpers/factory";

const TODAY = "2026-10-10";

// Eski uygulamanın davet şablonuyla üretilmiş, grupta doldurulmuş mesaj
const FILLED = `⚽ Salı 13.10 – 21:00
📍 Yeşil Vadi Halı Saha
🗺️ https://maps.app.goo.gl/ornekLink
👥 7+1 (3/16)
💰 Kişi başı ~215 ₺

1. Kaleci Kemal 🧤
2. Orta Ömer
3. *İLKER İLERİ*
4. ali a.
5. 
6. ~Bek Bülent~
7. Misafir Mert
8. Orta Ömer
16. 

⏳ Yedek: Irmak Iğdır, Zeki Zorlu
🤔 Belki: Ozan Örnek

Gelecek olan ismini listeye yazsın. Kadro maçtan 24 saat önce kesinleşir; geç iptal eden kendi payını öder.`;

const people = () => [
  player("kk", "Kaleci Kemal", 3, "GK"), player("oo", "Orta Ömer"), player("ii", "İlker İleri"), player("aa", "Ali Aslan"),
  player("bb", "Bek Bülent"), player("ir", "Irmak Iğdır"), player("zz", "Zeki Zorlu"), player("oz", "Ozan Örnek"),
];

describe("liste ayrıştırma", () => {
  it("numaralı satırlar ve Yedek → Var, Belki → Belki; boş numara, üstü çizili, tekrar ve diğer satırlar atlanır", () => {
    expect(parseList(FILLED)).toEqual([
      { name: "Kaleci Kemal", st: "in" },
      { name: "Orta Ömer", st: "in" },
      { name: "İLKER İLERİ", st: "in" },
      { name: "ali a.", st: "in" },
      { name: "Misafir Mert", st: "in" },
      { name: "Irmak Iğdır", st: "in" },
      { name: "Zeki Zorlu", st: "in" },
      { name: "Ozan Örnek", st: "maybe" },
    ]);
  });

  it("numara sırası esastır; tarih ve saatle başlayan satırlar liste sayılmaz; İngilizce şablon da okunur", () => {
    expect(parseList("13.10 Salı\n21:00 Yeşil Vadi\n2) Veli\n1- Ali\n10.Can\n⏳ Waitlist: Deniz\n🤔 Maybe: Ece").map((e) => e.name + ":" + e.st))
      .toEqual(["Ali:in", "Veli:in", "Can:in", "Deniz:in", "Ece:maybe"]);
    expect(parseList("")).toEqual([]);
  });
});

describe("eşleştirme", () => {
  const pool = people();
  it("tam ad (Türkçe harf, büyük/küçük fark etmez), yoksa kelime kelime baş kısmı", () => {
    expect(candidates(pool, "İLKER İLERİ")).toEqual(["ii"]);
    expect(candidates(pool, "irmak igdir")).toEqual(["ir"]);
    expect(candidates(pool, "ali a.")).toEqual(["aa"]);
    expect(candidates(pool, "Zeki")).toEqual(["zz"]);
    expect(candidates(pool, "Kemal")).toEqual([]); // soyadı tek başına eşleşmez
    expect(candidates([...pool, player("av", "Ali Veli")], "Ali")).toEqual(["aa", "av"]);
  });
});

describe("öneri ve uygulama", () => {
  function setup() {
    const ps = people();
    const m = allIn(match("m", { date: "2026-10-13", price: 1600, format: 7 }), ["oo"]); // Orta Ömer zaten Var
    m.att.zz = "late"; // Zeki Zorlu geç iptal etmiş
    const unpaid = allIn(match("old", { date: "2026-10-06", status: "played", price: 500 }), ["ir"]);
    unpaid.bill = { payers: ["ir"], share: 500 }; // Irmak Iğdır borçlu
    const s = state(ps, [unpaid, m], { debtBlock: true });
    addInfraction(s, { pid: "kk", type: "fight", at: TODAY, sanction: "expel", rule: "9.1" }, TODAY);
    return { s, m };
  }

  it("aynı yanıt değişmez; geç iptal, borçlu ve cezalı atlanır; kayıtlı olmayan misafir önerilir", () => {
    const { s, m } = setup();
    const plan = planList(s, m, parseList(FILLED), TODAY);
    const view = plan.map((r) => [r.name, r.act, r.note, r.block?.rule || ""]);
    expect(view).toEqual([
      ["Kaleci Kemal", "skip", "blocked", "9.1"],
      ["Orta Ömer", "skip", "already", ""],
      ["İLKER İLERİ", "in", "", ""],
      ["ali a.", "in", "", ""],
      ["Misafir Mert", "guest", "none", ""],
      ["Irmak Iğdır", "skip", "blocked", "2.4"],
      ["Zeki Zorlu", "skip", "late", ""],
      ["Ozan Örnek", "maybe", "", ""],
    ]);
  });

  it("liste sırasıyla uygulanır, mevcut sıra bozulmaz; misafir maça, yeni oyuncu kadroya eklenir; organizatör engelliyi yine de yazabilir", () => {
    const { s, m } = setup();
    const plan: PlanRow[] = planList(s, m, parseList(FILLED), TODAY);
    plan[5].act = "in"; // Irmak Iğdır: "Yine de yaz" (Kural 12.1)
    const extra = planList(s, m, [{ name: "Yeni Yüz", st: "in" }], TODAY)[0];
    extra.act = "player";
    expect(applyPlan(s, m, [...plan, extra])).toBe(6);
    const guest = m.guests.find((g) => g.name === "Misafir Mert")!;
    const added = s.players.find((p) => p.name === "Yeni Yüz")!;
    expect(lineup(s, m).playing).toEqual(["oo", "ii", "aa", guest.id, "ir", added.id]);
    expect(m.att.oz).toBe("maybe");
    expect(m.att.zz).toBe("late");
    expect(m.att.kk).toBeUndefined();
  });

  it("Var olan kişi listede Belki görünse de Var kalır; iki kez yazılan bir kez sayılır", () => {
    const { s, m } = setup();
    setAtt(m, "aa", "in", true);
    const plan = planList(s, m, [{ name: "Ali Aslan", st: "maybe" }, { name: "İlker İleri", st: "in" }, { name: "ilker ileri", st: "in" }], TODAY);
    expect(plan.map((r) => [r.act, r.note])).toEqual([["skip", "already"], ["in", ""], ["skip", "dup"]]);
  });
});

describe("yeni oyuncu", () => {
  it("aynı adlı pasif oyuncu varsa yenisi açılmaz, o yeniden aktif olur", () => {
    const s = state([player("vv", "Veli Vural", 3, "", { active: false })], [match("m")]);
    const m = s.matches[0];
    const [row] = planList(s, m, [{ name: "veli vural", st: "in" }], TODAY);
    expect(row).toMatchObject({ id: null, act: "guest", note: "none" }); // pasif oyuncular listede aranmaz
    expect(applyPlan(s, m, [{ ...row, act: "player" }])).toBe(1);
    expect(s.players).toHaveLength(1);
    expect(s.players[0].active).toBe(true);
    expect(m.att.vv).toBe("in");
  });
});

describe("önizlemedeki seçim", () => {
  it("iş değişir; kayıtlı bir kişi seçilince listedeki yanıtla o yazılır; bilinmeyen değer yok sayılır", () => {
    const r: PlanRow = { name: "Kemal", st: "in", id: null, cands: [], act: "guest", note: "none" };
    expect(choose(r, "skip").act).toBe("skip");
    expect(choose(r, "p:kk")).toMatchObject({ id: "kk", act: "in" });
    expect(choose(r, "xyz")).toBe(r);
  });
});

describe("listedeki tarih ve gün", () => {
  const tue = match("u", { date: "2026-10-13", time: "21:00" });
  const thu = match("t", { date: "2026-10-15", time: "21:00" });
  const fri = match("f", { date: "2026-12-18", time: "22:00" });
  const sun = match("s", { date: "2026-12-20", time: "22:00" });
  const ORG = "20.12.2026\nCUMA AKŞAM\n22.00-23.00\n\n1-Deneme Bir\n2-Deneme İki\n3-\n\n14 kişi, kişi başı 320₺";

  it("uygulamanın davet mesajından dolan liste (gün + tarih) kendi etkinliğiyle tutar; başka etkinliğe yapıştırılınca uyarır", () => {
    expect(listDateIssues(FILLED, tue)).toEqual([]);
    expect(listDateIssues(FILLED, thu)).toEqual(["Listede 13.10 yazıyor, seçili etkinlik ise Perşembe 15.10. Doğru etkinliğe yapıştırdığından emin ol."]);
  });

  it("başka tarihin listesi: tarih uyarısı; yazılan gün o tarihe denk gelmiyorsa gün uyarısı", () => {
    expect(listDateIssues(ORG, fri)).toEqual([
      "Listede 20.12.2026 yazıyor, seçili etkinlik ise Cuma 18.12. Doğru etkinliğe yapıştırdığından emin ol.",
      "Listede 20.12.2026 CUMA yazıyor, ama bu tarih Pazar gününe denk geliyor.",
    ]);
    // Tarih doğru, gün yanlış
    expect(listDateIssues(ORG, sun)).toEqual(["Listede 20.12.2026 CUMA yazıyor, ama bu tarih Pazar gününe denk geliyor."]);
    expect(listDateIssues("18.12.2026 Cuma\n1- Deneme", fri)).toEqual([]);
    expect(listDateIssues("20 Aralık Pazar\n1- Deneme", sun)).toEqual([]);
    expect(listDateIssues("20 Aralık\n1- Deneme", fri)[0]).toContain("Listede 20 Aralık yazıyor");
  });

  it("yalnızca gün yazıyorsa etkinliğin günüyle karşılaştırılır", () => {
    expect(listDateIssues("Salı maçı\n1- Deneme", thu)).toEqual(["Listede Salı yazıyor, seçili etkinlik ise Perşembe 15.10."]);
    expect(listDateIssues("Perşembe maçı\n1- Deneme", thu)).toEqual([]);
  });

  it("isim satırındaki gün adı, saat ve tarihsiz liste uyarı vermez", () => {
    expect(listDateIssues("1- Cuma Yılmaz\n2- Pazar Deneme\nYedek: Salı Örnek", thu)).toEqual([]);
    expect(listDateIssues("Saat 13.10\n1- Deneme", thu)).toEqual([]);
    expect(listDateIssues("22.00-23.00\n1- Deneme", thu)).toEqual([]);
    expect(listDateIssues("1- Deneme\n2- Örnek", thu)).toEqual([]);
  });
});

describe("uygulamanın paylaştığı kısa liste geri yapıştırılınca", () => {
  it("isimler, sıra ve yedekler aynen okunur; tarih ve gün uyarısı çıkmaz", async () => {
    const { msgInvite } = await import("../src/domain/messages");
    const { LIST_PRESET } = await import("../src/domain/templates");
    const ps = Array.from({ length: 16 }, (_, i) => player("p" + i, "Deneme Oyuncu " + (i + 1)));
    const m = allIn(match("m1", { date: "2026-12-18", time: "22:00", format: 6 }), ps.map((p) => p.id));
    const s = state(ps, [m], { format: 6, fixedShare: 320, templates: { invite: LIST_PRESET.tr } });
    const text = msgInvite(s, m);
    expect(listDateIssues(text, m)).toEqual([]);
    // Boş bir maça yapıştırılınca herkes aynı sırayla yazılır; 15. ve 16. yedekte kalır
    const fresh = match("m2", { date: "2026-12-18", time: "22:00", format: 6 });
    const s2 = state(ps.map((p) => ({ ...p })), [fresh], { format: 6 });
    const rows = planList(s2, fresh, parseList(text), "2026-12-14");
    expect(rows.map((r) => r.id)).toEqual(ps.map((p) => p.id));
    expect(applyPlan(s2, fresh, rows)).toBe(16);
    const { playing, wait } = lineup(s2, fresh);
    expect([playing.length, wait]).toEqual([14, ["p14", "p15"]]);
  });
});
