/** Türkçe/İngilizce metinler ve Türkçe karakter işlemleri. */
import { describe, expect, it } from "vitest";
import { allKeys, money, setLang, t } from "../src/i18n";
import { cleanBulkLine, norm, phoneDigits, trSort } from "../src/domain/text";

describe("dil dosyaları", () => {
  it("iki dilde de aynı anahtarlar var ve hiçbiri boş değil", () => {
    expect(allKeys("en").sort()).toEqual(allKeys("tr").sort());
    setLang("en");
    allKeys("en").forEach((k) => expect(t(k as never), k).not.toBe(""));
    setLang("tr");
  });
  it("yer tutucular doldurulur", () => {
    setLang("tr");
    expect(t("spotsLeft", { n: 3 })).toBe("3 kişi eksik");
    setLang("en");
    expect(t("spotsLeft", { n: 3 })).toBe("3 spots left");
    setLang("tr");
  });
  it("para Türk lirası biçiminde", () => {
    expect(money(1234.5).replace(/\s/g, " ")).toBe("1.234,5 ₺");
    expect(money(300)).toBe("300 ₺");
  });
});

describe("Türkçe metin", () => {
  it("alfabetik sıralama Türkçe kurallarına uyar", () => {
    const names = ["Zeki", "Çağrı", "İlker", "Irmak", "Ömer", "Ozan", "Şükrü", "Sinan", "Ümit", "Ufuk", "Cem", "Gökhan", "Ğ"].map((name) => ({ name }));
    expect(names.sort(trSort).map((x) => x.name)).toEqual(["Cem", "Çağrı", "Gökhan", "Ğ", "Irmak", "İlker", "Ozan", "Ömer", "Sinan", "Şükrü", "Ufuk", "Ümit", "Zeki"]);
  });
  it("arama Türkçe karakterden bağımsız", () => {
    expect(norm("ÇAĞRI IŞIK")).toBe("cagri isik");
    expect(norm("İlker Şükrü Gökhan")).toBe("ilker sukru gokhan");
  });
  it("toplu ekleme satırlarını temizler", () => {
    expect(cleanBulkLine("12. Ahmet Yılmaz 😀")).toBe("Ahmet Yılmaz");
    expect(cleanBulkLine("3) Ömer")).toBe("Ömer");
  });
  it("telefonu wa.me biçimine çevirir", () => {
    expect(phoneDigits("0555 123 45 67")).toBe("905551234567");
    expect(phoneDigits("555 123 45 67")).toBe("905551234567");
    expect(phoneDigits("+90 555 123 45 67")).toBe("905551234567");
    expect(phoneDigits("0049 170 1234567")).toBe("491701234567");
    expect(phoneDigits("")).toBe("");
  });
});
