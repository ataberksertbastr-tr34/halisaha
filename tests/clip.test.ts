/**
 * Panodaki metnin türü: WhatsApp listesi mi, banka bildirimi mi (Kural 1.2, 2.3).
 * İsimler ve banka satırları uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { clipKind } from "../src/domain/clip";
import { msgInvite } from "../src/domain/messages";
import { LIST_PRESET } from "../src/domain/templates";
import { setLang } from "../src/i18n";
import { allIn, match, player, state } from "./helpers/factory";

setLang("tr");
const TODAY = "2026-10-14";

describe("panodaki metin", () => {
  it("organizatörün liste biçimi (ücret satırı tutar içerse de) liste sayılır", () => {
    const txt = ["18.12.2026 CUMA 22.00-23.00", "", "1-Ali Deneme", "2-Berk Deneme", "3-", "", "14 kişi, kişi başı 320₺"].join("\n");
    expect(clipKind(txt, TODAY)).toBe("list");
  });

  it("uygulamanın paylaştığı davet (varsayılan ve kısa biçim) liste sayılır", () => {
    const ps = [player("a", "Ali Deneme"), player("b", "Berk Deneme")];
    const m = allIn(match("m", { date: "2026-10-15" }), ["a", "b"]);
    const s = state(ps, [m]);
    expect(clipKind(msgInvite(s, m), TODAY)).toBe("list");
    s.settings.templates = { invite: LIST_PRESET.tr };
    expect(clipKind(msgInvite(s, m), TODAY)).toBe("list");
  });

  it("banka bildirimleri ve hesap hareketleri banka sayılır", () => {
    expect(clipKind("Hesabınıza 12.10.2026 20:15'te AHMET DENEME tarafından 150,00 TL FAST ile gönderildi.", TODAY)).toBe("bank");
    expect(clipKind("13/10/26 Gelen FAST ŞÜKRÜ DENEME halisaha 300,00\nFAST BERK DENEME'DEN 60 TL", TODAY)).toBe("bank");
    // Giden para da banka metnidir (önizlemede atlanır)
    expect(clipKind("Kartınızdan 89,90 TL harcama yapıldı", TODAY)).toBe("bank");
  });

  it("boş, tek isim ya da ilgisiz metin: hiçbiri (yapıştırma kutusu açılır)", () => {
    expect(clipKind("", TODAY)).toBe("none");
    expect(clipKind("   \n ", TODAY)).toBe("none");
    expect(clipKind("1-Ali Deneme", TODAY)).toBe("none");
    expect(clipKind("Akşam maç var mı?", TODAY)).toBe("none");
    expect(clipKind("Maça 2 kişi daha lazım, saha 4480 TL", TODAY)).toBe("none");
  });
});
