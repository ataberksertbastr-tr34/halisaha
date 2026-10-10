/** KURALLAR.md ayrıştırma, arama ve paylaşım metni. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findRule, matchesRule, parseRules, ruleShareText, sectionOf } from "../src/domain/rules";

const md = readFileSync(new URL("../KURALLAR.md", import.meta.url), "utf8");
const book = parseRules(md);

describe("kural kitabı", () => {
  it("başlık, alt başlık, 13 altın kural (iki grup) ve 21 bölüm", () => {
    expect(book.title).toBe("Halı Saha ve Etkinlik Kuralları");
    expect(book.subtitle).toMatch(/^Predators/);
    expect(book.intro.length).toBeGreaterThan(40);
    expect(book.golden).toHaveLength(13);
    expect(book.goldenGroups.map((g) => [g.title, g.items.length])).toEqual([["Halı sahada", 10], ["Grupta ve etkinliklerde", 3]]);
    expect(book.golden[2].text).toContain("IBAN");
    expect(book.sections.map((s) => s.num)).toEqual(Array.from({ length: 21 }, (_, i) => String(i + 1)));
    expect(book.notes).toHaveLength(3);
  });
  it("üç kısım: halı saha, grup, etkinlikler", () => {
    expect(book.parts.map((p) => p.num + " " + p.title)).toEqual(["1 Halı Saha", "2 Grup ve Uygulama", "3 Etkinlikler"]);
    expect(book.sections.filter((s) => s.part === "1").map((s) => s.num)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(book.sections.filter((s) => s.part === "2").map((s) => s.num)).toEqual(["13", "14"]);
    expect(book.sections.filter((s) => s.part === "3").map((s) => s.title)).toEqual(["Etkinliklerde Genel Kurallar", "Paintball", "Airsoft", "Voleybol", "Ayak Tenisi", "Masa Tenisi", "Kıraathane"]);
    expect(sectionOf(book, "17.4")?.title).toBe("Airsoft");
  });
  it("vurgulu maddeler: sıfır tolerans ve güvenlik", () => {
    const flagged = book.sections.flatMap((s) => s.items).filter((i) => i.flag).map((i) => i.id + " " + i.flag);
    expect(flagged).toEqual(["9.1 Sıfır tolerans", "16.2 Güvenlik", "17.2 Güvenlik", "17.4 Güvenlik"]);
    expect(findRule(book, "9.1")!.title).toBe("Kavga ve fiziksel saldırı");
    expect(ruleShareText(findRule(book, "9.1")!, "Altın kural")).toMatch(/^⚠️ Kural 9\.1 – Kavga/);
  });
  it("yaptırımlar özet tablosu", () => {
    expect(book.appendixTitle).toBe("Yaptırımlar Özet Tablosu");
    expect(book.sanctions).toHaveLength(16);
    expect(book.sanctions.every((r) => r.rules.length > 0 && r.violation && r.sanction)).toBe(true);
    const fight = book.sanctions.find((r) => r.rules.includes("9.1"))!;
    expect(fight.severe).toBe(true);
    const allIds = new Set(book.sections.flatMap((s) => s.items.map((i) => i.id)));
    expect(book.sanctions.flatMap((r) => r.rules).filter((x) => !allIds.has(x))).toEqual([]);
  });
  it("her madde numarası, başlığı ve metniyle", () => {
    const r = findRule(book, "2.3")!;
    expect(r.title).toBe("Ödeme zamanı (IBAN disiplini)");
    expect(r.text).toMatch(/^Saha ücreti maça çıkmadan önce/);
    expect(book.sections[0].items.map((i) => i.id)).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9"]);
    const total = book.sections.reduce((n, s) => n + s.items.length, 0);
    expect(total).toBe(122); // grep -c "^\*\*N.N " KURALLAR.md
  });
  it("arama Türkçe karakterden bağımsız ve numarayla çalışır", () => {
    const all = book.sections.flatMap((s) => s.items);
    expect(all.filter((i) => matchesRule(i, "kucuk")).length).toBeGreaterThan(0);
    expect(all.filter((i) => matchesRule(i, "ÇİVİLİ")).map((i) => i.id)).toEqual(["4.3"]);
    expect(all.filter((i) => matchesRule(i, "2.3")).map((i) => i.id)).toEqual(["2.3"]);
    expect(all.filter((i) => matchesRule(i, "kural 1.5")).map((i) => i.id)).toEqual(["1.5"]);
    expect(all.filter((i) => matchesRule(i, "geç iptal")).map((i) => i.id)).toContain("1.5");
  });
  it("paylaşım metni", () => {
    expect(ruleShareText(findRule(book, "2.3")!, "Altın kural")).toMatch(/^📖 Kural 2\.3 – Ödeme zamanı \(IBAN disiplini\)\nSaha ücreti/);
    expect(ruleShareText(findRule(book, "A5")!, "Altın kural")).toBe("⭐ Altın kural 5\nÇivili krampon, saat, yüzük ve kolye yok.");
  });
});
