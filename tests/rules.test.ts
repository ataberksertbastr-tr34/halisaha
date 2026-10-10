/** KURALLAR.md ayrıştırma, arama ve paylaşım metni. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findRule, matchesRule, parseRules, ruleShareText } from "../src/domain/rules";

const md = readFileSync(new URL("../KURALLAR.md", import.meta.url), "utf8");
const book = parseRules(md);

describe("kural kitabı", () => {
  it("başlık, 10 altın kural ve 12 bölüm", () => {
    expect(book.title).toBe("Halı Saha Kuralları ve Disiplin Yönetmeliği");
    expect(book.golden).toHaveLength(10);
    expect(book.golden[2].text).toContain("IBAN");
    expect(book.sections.map((s) => s.num)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  });
  it("her madde numarası, başlığı ve metniyle", () => {
    const r = findRule(book, "2.3")!;
    expect(r.title).toBe("Ödeme zamanı (IBAN disiplini)");
    expect(r.text).toMatch(/^Saha ücreti maça çıkmadan önce/);
    expect(book.sections[0].items.map((i) => i.id)).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9"]);
    const total = book.sections.reduce((n, s) => n + s.items.length, 0);
    expect(total).toBe(52); // grep -c "^\*\*N.N " KURALLAR.md
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
