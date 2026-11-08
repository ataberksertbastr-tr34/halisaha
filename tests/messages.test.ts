/** Mesajlar ve şablonlar: varsayılan şablonlar eski uygulamanın mesajlarını aynen üretir. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseBackup } from "../src/domain/migrate";
import { msgInvite, msgPay, msgResult, msgTeams, personalPayText, promotedText } from "../src/domain/messages";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, render, TEMPLATE_KEYS } from "../src/domain/templates";
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
