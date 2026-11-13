/**
 * Organizatörün haftalık işini kısaltan özellikler uçtan uca (360 px, konsol hatası yok):
 * katılım günlüğü ve haber saati.
 */
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deadZones, importBackupText, noHorizontalScroll, test, watchErrors } from "./helpers";

const V2 = readFileSync(resolve("tests/fixtures/backup-v2-legacy.json"), "utf8");

function stubShare(page: Page): Promise<void> {
  return page.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    navigator.share = async (d?: ShareData) => {
      (window as unknown as { __shared: unknown[] }).__shared.push(d);
    };
  });
}
const lastShared = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { __shared: { text: string }[] }).__shared;
  return a[a.length - 1]?.text || "";
});

/** Fikstürdeki açık maç: Perşembe 15.10 21:00 (kadro 14.10 21:00'de kesinleşir). */
async function openThursday(page: Page): Promise<void> {
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator(".chips .chip", { hasText: "Per 15.10" }).click();
  await expect(page.locator(".chips .chip.on")).toContainText("Per 15.10");
}

const attBtn = (page: Page, name: string, s: string) => page.locator("#list-att li", { hasText: name }).locator(`[data-s="${s}"]`);

test("katılım günlüğü: kim ne zaman yazıldı; geç iptalde haber saati kesinleşmeden önceyse geç iptal sayılmaz (Kural 1.4–1.5)", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await importBackupText(page, V2);
  await openThursday(page);
  const logBtn = page.locator('#view [data-a="attLog"]');
  await expect(logBtn).toHaveText("Katılım günlüğü");

  // Yazılan kişi sırasıyla günlüğe düşer
  await page.locator("#q-att").fill("Zeki Zorlu");
  await page.locator("#q-att").press("Enter");
  await expect(attBtn(page, "Zeki Zorlu", "in")).toHaveAttribute("aria-pressed", "true");
  await expect(logBtn).toHaveText("Katılım günlüğü (1)");
  await logBtn.click();
  const rows = page.locator("#modal .loglist > li");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Zeki Zorlu");
  await expect(rows.first()).toContainText("kadroya yazıldı (5.)");
  await expect(rows.first()).toContainText("Paz 11.10 12:0");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "günlük")).toEqual([]);
  await page.locator('#modal [data-a="closeModal"]').click();

  // Toplu yazma da günlüğe düşer; "Geri al" kayıtları da geri alır
  await page.locator('[data-a="copyLastWeek"]').click();
  await expect(page.locator("#toast")).toContainText("geçen haftadan kopyalandı");
  await expect(logBtn).not.toHaveText("Katılım günlüğü (1)");
  await page.locator("[data-toast-act]").click();
  await expect(logBtn).toHaveText("Katılım günlüğü (1)");

  // Kadro kesinleştikten sonra: organizatör "Yok"u bir saat geç işliyor
  await page.clock.setSystemTime(new Date("2026-10-14T22:00:00+03:00"));
  await attBtn(page, "Orta Ömer", "out").click();
  await expect(page.locator("#toast")).toContainText("Kadro kesinleşti: Orta Ömer geç iptal sayıldı");
  await expect(attBtn(page, "Orta Ömer", "late")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#toast [data-toast-act]")).toHaveText(["Haber saati", "Geç iptal sayma"]);
  await noHorizontalScroll(page);
  const sizes = await page.locator("#toast [data-toast-act]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));
  for (const [w, h] of sizes) {
    expect(w).toBeGreaterThanOrEqual(44);
    expect(h).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#toast [data-toast-act="0"]').click();
  await expect(page.locator("#modal #sheet-title")).toHaveText("Orta Ömer ne zaman haber verdi?");
  await expect(page.locator("#modal")).toContainText("Kadro Çar 14.10 21:00 anında kesinleşti (Kural 1.4)");
  await expect(page.locator("#said-at")).toHaveValue("2026-10-14T22:00");
  expect(await deadZones(page, "haber saati")).toEqual([]);
  // Oyuncu aslında 20:30'da yazmış: kesinleşmeden önce
  await page.locator("#said-at").fill("2026-10-14T20:30");
  await page.locator('[data-a="saidSave"]').click();
  await expect(page.locator("#toast")).toContainText("Orta Ömer kesinleşmeden önce haber vermiş (Çar 14.10 20:30): geç iptal sayılmadı");
  await expect(attBtn(page, "Orta Ömer", "out")).toHaveAttribute("aria-pressed", "true");
  await expect(attBtn(page, "Orta Ömer", "late")).toHaveAttribute("aria-pressed", "false");

  // Kesinleşmeden sonra haber veren geç iptal kalır; saat günlükten sonradan da düzeltilebilir
  await attBtn(page, "Golcü Gökhan", "out").click();
  await page.locator('#toast [data-toast-act="0"]').click();
  await page.locator("#said-at").fill("2026-10-14T21:40");
  await page.locator('[data-a="saidSave"]').click();
  await expect(page.locator("#toast")).toContainText("Golcü Gökhan: haber saati Çar 14.10 21:40 kaydedildi; geç iptal sayılır (Kural 1.5)");
  await expect(attBtn(page, "Golcü Gökhan", "late")).toHaveAttribute("aria-pressed", "true");

  // Günlük: yeniden eskiye; kesinleşme ayracı; tek satırda haber saati
  await expect(logBtn).toHaveText("Katılım günlüğü (3)");
  await logBtn.click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Golcü Gökhan");
  await expect(rows.nth(0)).toContainText("geç iptal etti · kadrodan çıktı · haber: Çar 14.10 21:40");
  await expect(rows.nth(1)).toContainText("Orta Ömer");
  await expect(rows.nth(1)).toContainText("Yok dedi · kadrodan çıktı · haber: Çar 14.10 20:30");
  await expect(rows.nth(2)).toContainText("Kadro kesinleşti (Kural 1.4) · Çar 14.10 21:00");
  await expect(rows.nth(3)).toContainText("Zeki Zorlu");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "günlük (dolu)")).toEqual([]);
  // Paylaşılan metin eskiden yeniye
  await page.locator('[data-a="shareLog"]').click();
  const text = await lastShared(page);
  expect(text.split("\n")[0]).toBe("📋 Katılım günlüğü – Perşembe 15.10 21:00");
  expect(text).toContain("Paz 11.10 12:0");
  expect(text.indexOf("Zeki Zorlu kadroya yazıldı (5.)")).toBeLessThan(text.indexOf("— Kadro kesinleşti (Kural 1.4): Çar 14.10 21:00 —"));
  expect(text).toContain("Orta Ömer Yok dedi · kadrodan çıktı (haber: Çar 14.10 20:30)");
  // Günlükten haber saatini düzelt: Gökhan da kesinleşmeden önce yazmış
  await rows.nth(0).locator('[data-a="saidOpen"]').click();
  await page.locator("#said-at").fill("2026-10-14T20:50");
  await page.locator('[data-a="saidSave"]').click();
  await expect(page.locator("#toast")).toContainText("Golcü Gökhan kesinleşmeden önce haber vermiş");
  await expect(attBtn(page, "Golcü Gökhan", "out")).toHaveAttribute("aria-pressed", "true");
  await expect(logBtn).toHaveText("Katılım günlüğü (3)");

  // Ödemeler'de de açılır; sayfa yenilenince kayıtlar durur
  await page.locator('#tabs [data-v="pay"]').click();
  await expect(page.locator('#view [data-a="attLog"]')).toHaveText("Katılım günlüğü (3)");
  await page.reload();
  await page.locator('#tabs [data-v="pay"]').click();
  await page.locator('#view [data-a="attLog"]').click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Yok dedi · kadrodan çıktı · haber: Çar 14.10 20:50");
  expect(errors).toEqual([]);
});
