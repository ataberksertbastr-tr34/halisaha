/** Toplu oyuncu ekleme satırı: ad, isteğe bağlı mevki ve seviye. İsimler uydurmadır. */
import { describe, expect, it } from "vitest";
import { parseBulkLine } from "../src/domain/bulk";

describe("toplu ekleme satırı", () => {
  it("yalnızca ad: mevki boş, seviye 3; liste numarası atılır", () => {
    expect(parseBulkLine("Ali Deneme")).toEqual({ name: "Ali Deneme", pos: "", rating: 3 });
    expect(parseBulkLine("3. Ali Deneme")).toEqual({ name: "Ali Deneme", pos: "", rating: 3 });
    expect(parseBulkLine("4-Veli Örnek")).toEqual({ name: "Veli Örnek", pos: "", rating: 3 });
  });

  it("ayraçsız rakamlı ad bozulmaz", () => {
    expect(parseBulkLine("Mehmet Amca 1")).toEqual({ name: "Mehmet Amca 1", pos: "", rating: 3 });
    expect(parseBulkLine("6-Mehmet Amca 2")).toEqual({ name: "Mehmet Amca 2", pos: "", rating: 3 });
  });

  it("virgül, tire, eğik çizgiyle mevki ve seviye; kısaltma ya da tam ad", () => {
    expect(parseBulkLine("Ali Deneme, DOS, 4")).toEqual({ name: "Ali Deneme", pos: "DM", rating: 4 });
    expect(parseBulkLine("Ali Deneme - Ofansif orta saha - 5")).toEqual({ name: "Ali Deneme", pos: "AM", rating: 5 });
    expect(parseBulkLine("Ali Deneme; kaleci")).toEqual({ name: "Ali Deneme", pos: "GK", rating: 3 });
    expect(parseBulkLine("Ali Deneme | 2 | FORVET")).toEqual({ name: "Ali Deneme", pos: "FWD", rating: 2 });
    expect(parseBulkLine("Ali Deneme, D, 4/5")).toEqual({ name: "Ali Deneme", pos: "DEF", rating: 4 });
    expect(parseBulkLine("Ali Deneme, orta saha, seviye 1")).toEqual({ name: "Ali Deneme", pos: "MID", rating: 1 });
  });

  it("tanınmayan parça adın devamı sayılır; boş satır yok sayılır", () => {
    expect(parseBulkLine("Ali, Deneme")).toEqual({ name: "Ali Deneme", pos: "", rating: 3 });
    expect(parseBulkLine("   ")).toBeNull();
    expect(parseBulkLine("7-")).toBeNull();
  });
});
