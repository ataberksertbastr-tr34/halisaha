/** Mesajlar ve şablonlar: varsayılan şablonlar eski uygulamanın mesajlarını aynen üretir. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseBackup } from "../src/domain/migrate";
import { msgInvite, msgPay, msgResult, msgTeams, personalPayText, promotedText } from "../src/domain/messages";
import { DEFAULT_TEMPLATES, LIST_PRESET, PLACEHOLDERS, render, TEMPLATE_KEYS } from "../src/domain/templates";
import { setLang } from "../src/i18n";
import { legacyMigrate, makeLegacy } from "./helpers/legacy";
import { allIn, match, player, state } from "./helpers/factory";

const V2 = readFileSync(new URL("./fixtures/backup-v2-legacy.json", import.meta.url), "utf8");
const V1 = readFileSync(new URL("./fixtures/backup-v1.json", import.meta.url), "utf8");
/**
 * İçerik karşılaştırması: satır sonu boşlukları ve boş satırlar yok sayılır
 * (yeni şablon "Belki" satırından önce her zaman boş satır bırakır; içerik ve sıra aynıdır).
 */
const tidy = (x: string) => x.replace(/[ \t]+$/gm, "").replace(/\n\s*\n/g, "\n").trim();

describe("varsayılan şablonlar = eski mesajlar", () => {
  setLang("tr");
  for (const [name, text] of [["v2", V2], ["v1", V1]] as const) {
    it(name + " yedeğindeki her maç için davet, takım ve ödeme mesajları aynı", () => {
      const raw = JSON.parse(text);
      const LS = legacyMigrate(raw);
      const L = makeLegacy(LS, "2099-01-01");
      const s = parseBackup(text);
      s.matches.filter((m) => m.status !== "cancelled").forEach((m) => {
        const lm = LS.matches.find((x: { id: string }) => x.id === m.id);
        expect(tidy(msgInvite(s, m)), "davet " + m.id).toBe(tidy(L.msgInvite(lm)));
        if (m.teams.a.length) expect(tidy(msgTeams(s, m)), "takım " + m.id).toBe(tidy(L.msgTeams(lm)));
        expect(tidy(msgPay(s, m, "2099-01-01")), "ödeme " + m.id).toBe(tidy(L.msgPay(lm)));
      });
    });
  }
});

describe("şablon motoru", () => {
  it("boş yer tutuculu satır ve paragraf düşer", () => {
    expect(render("A {x}\n📍 {saha}\nB\n\nÖdemeyenler:\n{liste}\n\nSon", { x: "1", saha: "", liste: "" })).toBe("A 1\nB\n\nSon");
  });
  it("bilinmeyen yer tutucu olduğu gibi kalır", () => {
    expect(render("Merhaba {bilinmeyen} {ad}", { ad: "Ece" })).toBe("Merhaba {bilinmeyen} Ece");
  });
  it("her varsayılan şablon kendi yer tutucularını kullanır, iki dilde de tanımlı", () => {
    for (const k of TEMPLATE_KEYS) {
      for (const l of ["tr", "en"] as const) {
        const used = [...DEFAULT_TEMPLATES[l][k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        used.forEach((u) => expect(PLACEHOLDERS[k], k + ":" + u).toContain(u));
      }
    }
  });
  it("kişisel şablon IBAN yoksa IBAN satırını atar; özel şablon kullanılır", () => {
    setLang("tr");
    const s = state([player("a", "Deniz Örnek")]);
    expect(personalPayText(s, "Deniz", 215)).toBe("Selam Deniz, organizasyonlardan kalan borcun 215 ₺.\nTeşekkürler!");
    s.settings.iban = "TR11";
    expect(personalPayText(s, "Deniz", 215)).toContain("IBAN: TR11");
    s.settings.templates.personalPay = "{ad}: {tutar}";
    expect(personalPayText(s, "Deniz", 215)).toBe("Deniz: 215 ₺");
  });
  it("yedekten kadroya giren için mesaj", () => {
    setLang("tr");
    const m = allIn(match("m", { date: "2026-10-13", time: "21:00" }), ["a"]);
    const s = state([player("a", "Can Deneme")], [m]);
    expect(promotedText(s, m, "a")).toBe("Selam Can Deneme, Salı 13.10 21:00 maçında yer açıldı, kadrodasın! ⚽\nGelemeyeceksen hemen haber ver lütfen.");
  });
});

describe("maç sonucu mesajı", () => {
  const players = [player("a", "Ali Deneme"), player("b", "Berk Deneme"), player("c", "Cem Deneme"), player("d", "Doğa Deneme")];
  const played = (extra = {}) => {
    const m = allIn(match("m", { date: "2026-10-13", time: "21:00", status: "played", teams: { a: ["a", "b"], b: ["c", "d"] }, ...extra }), ["a", "b", "c", "d"]);
    return { s: state(players, [m]), m };
  };
  it("skor, goller (çoktan aza, sonra ada göre), maçın oyuncusu ve tatlı (Kural 11.1)", () => {
    setLang("tr");
    const { s, m } = played({ score: { a: 3, b: 4 }, goals: { c: 1, a: 2, d: 3, b: 1, x: 5 }, mvp: "d" });
    expect(msgResult(s, m)).toBe(
      "🏁 Maç sonucu – Salı 13.10\n\n🟡 Sarılar 3 – 4 Turuncular 🟠\n\n⚽ Goller\n• Doğa Deneme ×3\n• Ali Deneme ×2\n• Berk Deneme\n• Cem Deneme\n\n⭐ Maçın oyuncusu: Doğa Deneme\n\nTatlı Sarılar takımından",
    );
  });
  it("berabere, golsüz ve tatlı iddiası yoksa teşekkür; boş satırlar düşer", () => {
    setLang("tr");
    const { s, m } = played({ score: { a: 2, b: 2 } });
    expect(msgResult(s, m)).toBe("🏁 Maç sonucu – Salı 13.10\n\n🟡 Sarılar 2 – 2 Turuncular 🟠\n\nHerkese teşekkürler, haftaya görüşürüz!");
    m.score = { a: 5, b: 1 };
    m.agree.dessert = "no";
    expect(msgResult(s, m)).not.toContain("Tatlı");
  });
  it("skoru olmayan maçta skor satırı yazılmaz", () => {
    setLang("tr");
    const { s, m } = played({ mvp: "b" });
    expect(msgResult(s, m)).toBe("🏁 Maç sonucu – Salı 13.10\n\n⭐ Maçın oyuncusu: Berk Deneme\n\nHerkese teşekkürler, haftaya görüşürüz!");
  });
  it("İngilizce ve organizatörün kendi şablonu", () => {
    setLang("en");
    const { s, m } = played({ score: { a: 1, b: 0 }, goals: { a: 1 } });
    expect(msgResult(s, m)).toBe("🏁 Final score – Tuesday 13.10\n\n🟡 Yellows 1 – 0 Oranges 🟠\n\n⚽ Goals\n• Ali Deneme\n\nDessert is on the Oranges");
    setLang("tr");
    s.settings.templates.result = "{takima} {skora}-{skorb} {takimb}\n{mvp}";
    expect(msgResult(s, m)).toBe("Sarılar 1-0 Turuncular");
  });
  it("etkinlikte skor ya da oynanan oyun sayısı", () => {
    setLang("tr");
    const { s, m } = played({ kind: "paintball", title: "Sezon açılışı", score: { a: 2, b: 1 }, mvp: "c" });
    const txt = msgResult(s, m);
    expect(txt.split("\n")[0]).toBe("🎯 Sezon açılışı – Salı 13.10");
    expect(txt).toContain("🏁 Sarılar 2 – 1 Turuncular");
    expect(txt).toContain("⭐ Günün oyuncusu: Cem Deneme");
    expect(txt).not.toContain("Tatlı");
    m.score = null;
    // Yalnızca bitirilen oyun sayılır
    m.games = [{ id: "g1", done: true }, { id: "g2", done: false }] as unknown as typeof m.games;
    expect(msgResult(s, m)).toContain("🏁 1 oyun");
  });
});

describe("kısa liste biçimi (organizatörün WhatsApp kalıbı)", () => {
  // Cuma 18 Aralık 22:00, 6+1 (kontenjan 14), sabit kişi başı 320 ₺; isimler uydurma
  const setup = (n: number) => {
    const ps = Array.from({ length: n }, (_, i) => player("p" + i, "Deneme Oyuncu " + (i + 1), 3, i === 0 ? "GK" : ""));
    const m = allIn(match("m1", { date: "2026-12-18", time: "22:00", format: 6 }), ps.map((p) => p.id));
    const s = state(ps, [m], { format: 6, fixedShare: 320, templates: { invite: LIST_PRESET.tr } });
    return { s, m };
  };

  it("tarih, BÜYÜK harfle gün, saat aralığı, 1-İsim satırları, boş yerler, kişi ve ücret", () => {
    setLang("tr");
    const { s, m } = setup(12);
    const lines = msgInvite(s, m).split("\n");
    expect(lines[0]).toBe("18.12.2026 CUMA 22:00-23:00");
    expect(lines[2]).toBe("1-Deneme Oyuncu 1 🧤");
    expect(lines.slice(13, 16)).toEqual(["12-Deneme Oyuncu 12", "13-", "14-"]);
    // Yedek ve Belki yokken o satırlar düşer
    expect(msgInvite(s, m)).not.toContain("Yedek");
    expect(lines[lines.length - 1]).toBe("14 kişi, kişi başı 320 ₺");
  });

  it("kontenjan dolunca yedekler ayrı satırda", () => {
    setLang("tr");
    const { s, m } = setup(16);
    const txt = msgInvite(s, m);
    expect(txt).toContain("14-Deneme Oyuncu 14\n\n⏳ Yedek: Deneme Oyuncu 15, Deneme Oyuncu 16");
  });

  it("büyük harfli yer tutucu her şablonda çalışır; İngilizcede i harfi İ olmaz", () => {
    setLang("en");
    try {
      expect(render("{GUN} {gun}", { gun: "Friday" })).toBe("FRIDAY Friday");
    } finally {
      setLang("tr");
    }
    expect(render("{GUN} {Gun} {gun}", { gun: "Çarşamba" })).toBe("ÇARŞAMBA Çarşamba Çarşamba");
    // Türkçe klavyeyle de İngilizce klavyeyle de büyük yazılan yer tutucu bulunur
    expect(render("{TAMTARIH} {TAMTARİH} {KİSİ} {KISI}", { tamtarih: "18.12.2026", kisi: "6+1 (12/14)" })).toBe("18.12.2026 18.12.2026 6+1 (12/14) 6+1 (12/14)");
  });

  it("bitiş saati: halı saha 60 dk, etkinlik türünün süresi; gece yarısını geçer", () => {
    setLang("tr");
    const ps = [player("a", "Ali Deneme")];
    const late = allIn(match("g", { date: "2026-12-18", time: "23:30" }), ["a"]);
    const pb = allIn(match("pb", { kind: "paintball", date: "2026-12-19", time: "11:00", cap: 12 }), ["a"]);
    const s = state(ps, [late, pb], { templates: { invite: "{saat}-{bitis}" } });
    expect(msgInvite(s, late)).toBe("23:30-00:30");
    expect(render("{saat}-{bitis}", { saat: "11:00", bitis: "14:00" })).toBe("11:00-14:00");
  });

  it("varsayılan davet değişmez: {liste} hâlâ \"1. İsim\"", () => {
    setLang("tr");
    const { s, m } = setup(2);
    s.settings.templates = {};
    const txt = msgInvite(s, m);
    expect(txt).toContain("\n1. Deneme Oyuncu 1 🧤\n2. Deneme Oyuncu 2\n3.\n");
    expect(txt).not.toContain("1-");
  });
});
