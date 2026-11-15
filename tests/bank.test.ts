/**
 * Banka bildiriminden ödeme (Kural 2.3, 2.4): tutar, tarih ve gönderen çıkarma; kişiyle eşleştirme;
 * önizleme; deftere yazma; elle eşlenen gönderen adının öğrenilmesi. İsimler ve tutarlar uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { applyBank, BANK_NOTE, parseBank, planBank, senderOf } from "../src/domain/bank";
import { accounts } from "../src/domain/ledger";
import { freezeBill } from "../src/domain/money";
import { migrate } from "../src/domain/migrate";
import { merge3 } from "../src/sync/merge";
import type { State } from "../src/domain/types";
import { allIn, match, player, state } from "./helpers/factory";

const TODAY = "2026-10-14";

describe("banka metnini okuma", () => {
  it("farklı biçimler: bildirim, FAST, hesap hareketi, sembol önce; bakiye ve tarih/saat tutar sanılmaz", () => {
    const lines = parseBank([
      "Hesabınıza 12.10.2026 20:15'te AHMET YILMAZ tarafından 150,00 TL FAST ile gönderildi. Bakiye: 2.345,67 TL",
      "FAST: MEHMET ALİ KAYA'DAN 1.200,50 TL gelen transfer, ref 12345",
      "13/10/26 Gelen FAST ŞÜKRÜ ÖZDEMİR halisaha 300,00",
      "₺250 ZEYNEP ÇELİK",
      "IBAN TR12 0006 4000 0011 2345 6789 01",
      "",
      "Tutar yok bu satırda",
    ].join("\n"), TODAY);
    expect(lines.map((l) => [l.amount, l.date, l.sender, l.out])).toEqual([
      [150, "2026-10-12", "AHMET YILMAZ", false],
      [1200.5, TODAY, "MEHMET ALİ KAYA", false],
      [300, "2026-10-13", "ŞÜKRÜ ÖZDEMİR", false],
      [250, TODAY, "ZEYNEP ÇELİK", false],
    ]);
  });

  it("giden para ve harcama işaretlenir; ileri ya da geçersiz tarih bugüne döner", () => {
    const lines = parseBank("Kartınızdan 89,90 TL harcama yapıldı\nGiden FAST 31.02.2026 ALİ VELİ 100 TL\n20.12.2026 VELİ CAN 75 TL", TODAY);
    expect(lines.map((l) => [l.amount, l.out, l.date])).toEqual([[89.9, true, TODAY], [100, true, TODAY], [75, false, TODAY]]);
  });

  it("gönderen: en uzun büyük harfli kelime dizisi; banka kelimeleri ve ekler atılır", () => {
    expect(senderOf("FAST EFT HAVALE")).toBe("");
    expect(senderOf("ZİRAAT BANKASI A.Ş. AYŞE NUR DEMİR'DEN 100 TL")).toBe("AYŞE NUR DEMİR");
    expect(senderOf("gönderen: Ali Veli 100 TL")).toBe("");
    expect(senderOf("TEK 100 TL")).toBe("");
  });
});

/** Ali, Berk ve Cem: geçen maçın payı 100 ₺; Ali'nin telefondaki adı "Kaleci Ali" değil "Ali Yılmaz". */
function setup(): State {
  const ps = [player("a", "Ali Yılmaz"), player("b", "Berk Kaya"), player("c", "Kaleci Cem"), player("d", "Ali Demir")];
  const m1 = match("m1", { date: "2026-10-06", price: 400, format: 1, status: "played", guests: [{ id: "g1", name: "Misafir Mert", rating: 3, pos: "", host: "b" }] });
  allIn(m1, ["a", "b", "c", "g1"]);
  const s = state(ps, [m1], { round: false, gkFree: false });
  freezeBill(s, m1);
  return s;
}

describe("eşleştirme ve önizleme", () => {
  it("adın bütün kelimeleri satırda geçen kişi; Türkçe harf ve büyük/küçük farkı sayılmaz", () => {
    const s = setup();
    const rows = planBank(s, parseBank([
      "Hesabınıza ALİ YILMAZ tarafından 100,00 TL gönderildi",
      "FAST BERK KAYA'DAN 60 TL",
      "FAST CEM ÖZTÜRK 100 TL",
      "MİSAFİR MERT 100 TL",
    ].join("\n"), TODAY), TODAY);
    expect(rows.map((r) => [r.pid, r.note, r.apply])).toEqual([["a", "match", true], ["b", "match", true], ["", "none", false], ["g1", "match", true]]);
  });

  it("iki kişi aynı derecede tutarsa belirsiz; daha çok kelimesi tutan kazanır", () => {
    const s = setup();
    s.players.push(player("e", "Ali"));
    const rows = planBank(s, parseBank("ALİ DEMİR YILMAZ 100 TL\nALİ VELİ 100 TL", TODAY), TODAY);
    expect(rows.map((r) => [r.pid, r.note, [...r.cands].sort()])).toEqual([["", "ambiguous", ["a", "d"]], ["e", "match", []]]);
  });

  it("giden para ve daha önce işlenmiş aynı bildirim varsayılan olarak atlanır", () => {
    const s = setup();
    const text = "12.10.2026 ALİ YILMAZ 100,00 TL gelen\n12.10.2026 ALİ YILMAZ 100,00 TL gelen\nGiden FAST BERK KAYA 50 TL";
    const rows = planBank(s, parseBank(text, TODAY), TODAY);
    expect(rows.map((r) => [r.note, r.apply])).toEqual([["match", true], ["dup", false], ["out", false]]);
    applyBank(s, rows.map((row) => ({ row, pid: row.apply ? row.pid : "" })));
    expect(planBank(s, parseBank(text, TODAY), TODAY)[0].note).toBe("dup");
  });
});

describe("deftere yazma", () => {
  it("genel ödeme olarak yazılır, en eski borçtan kapanır; fazlası avans olur", () => {
    const s = setup();
    const rows = planBank(s, parseBank("12.10.2026 ALİ YILMAZ 150,00 TL\nBERK KAYA 100 TL", TODAY), TODAY);
    expect(applyBank(s, rows.map((row) => ({ row, pid: row.pid })))).toBe(2);
    const p = s.payments.find((x) => x.pid === "a")!;
    expect(p).toMatchObject({ amount: 150, at: "2026-10-12", note: BANK_NOTE + ": ALİ YILMAZ" });
    expect(p.mid).toBeUndefined();
    const acc = accounts(s, TODAY);
    expect([acc.get("a")!.owed, acc.get("a")!.credit]).toEqual([0, 50]);
    expect(acc.get("b")!.owed).toBe(0);
    // Misafirin payı ayrı hesap: getirene yazılan para misafirin borcunu kapatmaz
    expect(acc.get("g1")!.owed).toBe(100);
  });

  it("elle eşlenen gönderen adı oyuncuya kaydedilir ve bir dahaki sefere kendiliğinden tutar", () => {
    const s = setup();
    const rows = planBank(s, parseBank("FAST CEM ÖZTÜRK 100 TL", TODAY), TODAY);
    expect(rows[0].pid).toBe("");
    applyBank(s, [{ row: rows[0], pid: "c" }]);
    expect(s.players.find((p) => p.id === "c")!.bank).toEqual(["CEM ÖZTÜRK"]);
    // İkinci kez aynı adla eklenmez
    applyBank(s, [{ row: rows[0], pid: "c" }]);
    expect(s.players.find((p) => p.id === "c")!.bank).toEqual(["CEM ÖZTÜRK"]);
    const next = planBank(s, parseBank("20.10.2026 Gelen FAST Cem Öztürk 100,00", "2026-10-21"), "2026-10-21");
    expect([next[0].pid, next[0].note, next[0].apply]).toEqual(["c", "alias", true]);
    // Otomatik eşleşen kişiye banka adı yazılmaz
    applyBank(s, [{ row: planBank(s, parseBank("ALİ YILMAZ 10 TL", TODAY), TODAY)[0], pid: "a" }]);
    expect(s.players.find((p) => p.id === "a")!.bank).toBeUndefined();
  });

  it("seçilmeyen satır ve hesaptan çıkan para yazılmaz", () => {
    const s = setup();
    const rows = planBank(s, parseBank("ALİ YILMAZ 10 TL\nGiden FAST ALİ YILMAZ 20 TL", TODAY), TODAY);
    expect(applyBank(s, [{ row: rows[0], pid: "" }, { row: rows[1], pid: "a" }])).toBe(0);
    expect(s.payments).toEqual([]);
  });
});

describe("banka adlarının verisi", () => {
  it("eski veride alan yok; bozuk değerler temizlenir, tekrarlar atılır", () => {
    const s = migrate({ v: 6, settings: {}, matches: [], players: [{ id: "a", name: "Ali", bank: ["ALİ YILMAZ", "", 5, "ALİ YILMAZ"] }, { id: "b", name: "Berk", bank: "x" }] });
    expect(s.players[0].bank).toEqual(["ALİ YILMAZ", "5"]);
    expect("bank" in s.players[1]).toBe(false);
  });

  it("eşitleme: bir cihazda öğrenilen banka adı, diğer cihazdaki değişiklikle birlikte korunur", () => {
    const b = migrate(setup());
    b.updatedAt = 1000;
    const fork = (t: number): State => ({ ...(JSON.parse(JSON.stringify(b)) as State), updatedAt: t });
    const l = fork(2000), r = fork(3000);
    l.players.find((p) => p.id === "c")!.bank = ["CEM ÖZTÜRK"];
    r.players.find((p) => p.id === "c")!.rating = 5;
    const out = merge3(b, l, r).players.find((p) => p.id === "c")!;
    expect([out.bank, out.rating]).toEqual([["CEM ÖZTÜRK"], 5]);
  });
});
