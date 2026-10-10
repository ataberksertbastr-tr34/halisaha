/**
 * Eski uygulamanın "Yedeği kopyala" çıktısının (şema v1 ve v2) eksiksiz
 * içe aktarıldığını doğrular. v2 fikstürü gerçek eski uygulamada üretildi
 * (scripts/gen-legacy-fixture.ts), v1 fikstürü eski migrate() mantığına göre
 * elle hazırlandı. İsimler uydurmadır.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BackupError, migrate, parseBackup } from "../src/domain/migrate";
import { SCHEMA_VERSION } from "../src/domain/schema";
import { debts, shareOf, estShare, payersOf } from "../src/domain/money";
import { lineup } from "../src/domain/lineup";
import { computeStats } from "../src/domain/stats";
import { fieldOf } from "../src/domain/fields";
import { legacyMigrate, makeLegacy } from "./helpers/legacy";

const read = (f: string) => readFileSync(new URL("./fixtures/" + f, import.meta.url), "utf8");
const V1 = read("backup-v1.json");
const V2 = read("backup-v2-legacy.json");
const FAR_FUTURE = "2099-01-01";

describe("v2 yedeği (gerçek eski uygulama çıktısı)", () => {
  const raw = JSON.parse(V2);
  const s = parseBackup(V2);

  it("güncel şema sürümüne taşınır", () => {
    expect(s.v).toBe(SCHEMA_VERSION);
  });

  it("tüm oyuncular tüm alanlarıyla korunur", () => {
    expect(s.players).toHaveLength(raw.players.length);
    raw.players.forEach((p: Record<string, unknown>) => {
      const n = s.players.find((x) => x.id === p.id)!;
      expect(n).toBeTruthy();
      expect(n.name).toBe(p.name);
      expect(n.rating).toBe(p.rating);
      expect(n.pos).toBe(p.pos);
      expect(n.phone).toBe(p.phone);
      expect(n.active).toBe(p.active !== false);
    });
    expect(s.players.find((p) => p.name === "Veli Vural")!.active).toBe(false);
    expect(s.players.find((p) => p.name === "Forvet Fırat")!.phone).toBe("0555 000 00 01");
  });

  it("sahalar ve ayarlar korunur", () => {
    expect(s.fields).toEqual(raw.fields);
    expect(s.settings.iban).toBe(raw.settings.iban);
    expect(s.settings.ibanName).toBe(raw.settings.ibanName);
    expect(s.settings.price).toBe(3400);
    expect(s.settings.defaultFieldId).toBe(raw.settings.defaultFieldId);
    expect(s.settings.slots).toEqual(raw.settings.slots);
    expect(s.settings.gkFree).toBe(true);
    expect(s.settings.round).toBe(true);
  });

  it("maçlar: katılım, sıra, misafir, takımlar, skor, muafiyet, durum aynen", () => {
    expect(s.matches).toHaveLength(raw.matches.length);
    raw.matches.forEach((m: Record<string, unknown>) => {
      const n = s.matches.find((x) => x.id === m.id)!;
      for (const k of ["date", "time", "fieldId", "price", "format", "status", "att", "order", "guests", "exempt", "teams", "score"]) {
        expect(n[k as keyof typeof n], k).toEqual(m[k]);
      }
    });
  });

  it("borçlar, paylar ve istatistikler eski uygulamayla birebir aynı", () => {
    const LS = legacyMigrate(raw);
    const L = makeLegacy(LS, FAR_FUTURE);
    const mine = debts(s, FAR_FUTURE).map((d) => [d.id, d.total, d.n]);
    const theirs = L.debts().map((d: { id: string; total: number; n: number }) => [d.id, d.total, d.n]);
    expect(mine).toEqual(theirs);
    expect(mine.length).toBeGreaterThan(0);
    s.matches.forEach((m) => {
      const lm = LS.matches.find((x: { id: string }) => x.id === m.id);
      expect(shareOf(s, m)).toBe(L.shareOf(lm));
      expect(estShare(s, m)).toBe(L.estShare(lm));
      expect(payersOf(s, m)).toEqual(L.payersOf(lm));
      expect(lineup(s, m)).toEqual(L.lineup(lm));
    });
    expect(computeStats(s)).toEqual(L.computeStats());
  });

  it("yedek listesindeki misafir ödeme yapanlar arasında değildir", () => {
    const m1 = s.matches.find((m) => m.status === "played")!;
    const { wait } = lineup(s, m1);
    expect(wait).toHaveLength(1);
    expect(m1.guests.find((g) => g.id === wait[0])!.name).toBe("Misafir Mert");
    expect(payersOf(s, m1)).not.toContain(wait[0]);
  });
});

describe("v1 yedeği (eski şema)", () => {
  const raw = JSON.parse(V1);
  const s = parseBackup(V1);

  it("eski saha metni kayıtlı sahaya dönüşür ve varsayılan olur", () => {
    expect(s.fields).toHaveLength(1);
    expect(s.fields[0].name).toBe("Eski Saha Spor Kompleksi");
    expect(s.fields[0].price).toBe(2800);
    expect(s.settings.defaultFieldId).toBe(s.fields[0].id);
    expect((s.settings as unknown as Record<string, unknown>).field).toBeUndefined();
  });

  it("gk:true → mevki Kaleci; eksik telefon/seviye/aktif doldurulur", () => {
    expect(s.players.find((p) => p.id === "p1")!.pos).toBe("GK");
    expect(s.players.find((p) => p.id === "p9")!.pos).toBe("GK");
    expect(s.players.find((p) => p.id === "p2")!.pos).toBe("");
    expect(s.players.every((p) => p.phone === "")).toBe(true);
    expect(s.players.find((p) => p.id === "p7")!.rating).toBe(3);
    expect(s.players.find((p) => p.id === "p5")!.active).toBe(true);
    expect(s.players.find((p) => p.id === "p8")!.active).toBe(false);
    expect(s.players.some((p) => "gk" in p)).toBe(false);
  });

  it("maç saha isimleri sahaya bağlanır; kayıtsız saha adı korunur", () => {
    const m1 = s.matches.find((m) => m.id === "m1")!;
    expect(m1.fieldId).toBe(s.fields[0].id);
    const m2 = s.matches.find((m) => m.id === "m2")!;
    expect(m2.fieldId).toBe("");
    expect(fieldOf(s, m2)!.name).toBe("Komşu Saha");
  });

  it("eksik maç alanları (muafiyet, takımlar, format) eski davranışla doldurulur", () => {
    const m3 = s.matches.find((m) => m.id === "m3")!;
    expect(m3.exempt).toEqual({});
    expect(m3.teams).toEqual({ a: [], b: [] });
    expect(s.matches.find((m) => m.id === "m2")!.format).toBe(6);
    expect(s.matches.find((m) => m.id === "m1")!.guests[0].pos).toBe("");
  });

  it("tüm oyuncu, maç, katılım ve ödemeler korunur", () => {
    expect(s.players.map((p) => p.id)).toEqual(raw.players.map((p: { id: string }) => p.id));
    expect(s.matches.map((m) => m.id)).toEqual(raw.matches.map((m: { id: string }) => m.id));
    raw.matches.forEach((m: { id: string; att: object; order: string[]; paid: object; score?: object; status: string }) => {
      const n = s.matches.find((x) => x.id === m.id)!;
      expect(n.att).toEqual(m.att);
      expect(n.order).toEqual(m.order);
      expect(n.paid).toEqual(m.paid);
      expect(n.status).toBe(m.status);
      expect(n.score).toEqual(m.score ?? null);
    });
  });

  it("borçlar, paylar (yuvarlamasız) ve istatistikler eski uygulamayla aynı", () => {
    const LS = legacyMigrate(raw);
    const L = makeLegacy(LS, FAR_FUTURE);
    expect(debts(s, FAR_FUTURE).map((d) => [d.id, d.total, d.n])).toEqual(L.debts().map((d: { id: string; total: number; n: number }) => [d.id, d.total, d.n]));
    s.matches.forEach((m) => {
      const lm = LS.matches.find((x: { id: string }) => x.id === m.id);
      expect(shareOf(s, m)).toBe(L.shareOf(lm));
      expect(lineup(s, m)).toEqual(L.lineup(lm));
    });
    expect(computeStats(s)).toEqual(L.computeStats());
    // Yuvarlama kapalı: 2800 / 7 ödeyen = 400; ikinci maç 3000 / 4 = 750 (geç iptal dahil, kaleciler hariç)
    expect(shareOf(s, s.matches[0])).toBe(400);
    expect(shareOf(s, s.matches[1])).toBe(750);
  });

  it("sürüm alanı olmayan v1 de aynı şekilde taşınır", () => {
    const noV = { ...raw };
    delete noV.v;
    const s2 = migrate(noV);
    expect(s2.v).toBe(SCHEMA_VERSION);
    expect(s2.players).toHaveLength(raw.players.length);
    expect(s2.fields[0].name).toBe("Eski Saha Spor Kompleksi");
  });
});

describe("migration güvenceleri", () => {
  it("idempotent: taşınmış veri tekrar taşınınca değişmez", () => {
    const once = parseBackup(V2);
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    const v1once = parseBackup(V1);
    expect(migrate(JSON.parse(JSON.stringify(v1once)))).toEqual(v1once);
  });

  it("yeni yedek → yeniden yükleme turu kayıpsız", () => {
    const s = parseBackup(V2);
    expect(parseBackup(JSON.stringify(s))).toEqual(s);
  });

  it("bilinmeyen alanlar silinmez", () => {
    const raw = JSON.parse(V2);
    raw.extraTopLevel = { a: 1 };
    raw.players[0].note = "not";
    const s = migrate(raw) as unknown as Record<string, unknown> & { players: Record<string, unknown>[] };
    expect(s.extraTopLevel).toEqual({ a: 1 });
    expect(s.players[0].note).toBe("not");
  });

  it("geçersiz metinler reddedilir", () => {
    expect(() => parseBackup("")).toThrow(BackupError);
    expect(() => parseBackup("merhaba")).toThrow(BackupError);
    expect(() => parseBackup("[]")).toThrow(BackupError);
    expect(() => parseBackup('{"players":[]}')).toThrow(BackupError);
    expect(() => parseBackup('{"players":{},"matches":[]}')).toThrow(BackupError);
  });

  it("baştaki/sondaki boşluk ve BOM sorun değil (WhatsApp'tan kopyalama)", () => {
    expect(parseBackup("﻿  \n" + V2 + "\n ").players.length).toBe(17);
  });

  it("daha yeni sürümden gelen yedek veri kaybını önlemek için reddedilir", () => {
    const raw = JSON.parse(V2);
    raw.v = SCHEMA_VERSION + 1;
    try {
      parseBackup(JSON.stringify(raw));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      expect((e as BackupError).code).toBe("future");
    }
  });

  it("boş/geçersiz girdi varsayılan duruma döner (eski davranış)", () => {
    expect(migrate(null).players).toEqual([]);
    expect(migrate("x").matches).toEqual([]);
  });
});
