/**
 * Uyumluluk: eski uygulamada (legacy/index.html) gerçek kullanıcı gibi veri
 * girilir, "Yedeği kopyala" çıktısı alınır ve yeni uygulamada "Yedekten yükle"
 * ile içe aktarılır. Oyuncular, maç geçmişi ve borçlar birebir aynı olmalı.
 */
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { buildLegacyBackup, FAKE_PLAYERS } from "./legacy-driver";
import { importBackupText, watchErrors } from "./helpers";

const LEGACY_URL = pathToFileURL(resolve("legacy/index.html")).href;

test("eski uygulamanın yedeği yeni uygulamaya eksiksiz yüklenir", async ({ browser }) => {
  // 1) Eski uygulama: veri gir, yedek al, borç listesini oku
  const legacyCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const legacy = await legacyCtx.newPage();
  await legacy.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const text = await buildLegacyBackup(legacy, LEGACY_URL);
  await legacy.locator('[data-a="closeModal"]').click();
  await legacy.locator('[data-a="tab"][data-v="pay"]').click();
  const legacyDebts = await legacy.locator(".section").last().locator(".payrow").evaluateAll((rows) =>
    rows.map((r) => [r.querySelector("strong")!.textContent!.trim(), r.querySelector(".amount")!.textContent!.trim()]),
  );
  await legacyCtx.close();
  const raw = JSON.parse(text);
  expect(raw.v).toBe(2);
  expect(raw.players).toHaveLength(FAKE_PLAYERS.length);

  // 2) Yeni uygulama: yapıştırarak yükle
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await importBackupText(page, text);

  // Oyuncular (aktif + pasif)
  await page.locator('#tabs [data-v="players"]').click();
  const names = await page.locator("#list-roster li strong").allTextContents();
  expect(names.sort()).toEqual([...FAKE_PLAYERS].sort());
  await expect(page.locator("#list-roster li.passive")).toHaveCount(1);

  // Geçmiş: oynanan (7–5) ve iptal edilen maç
  await page.locator('#tabs [data-v="match"]').click();
  await expect(page.locator("#h-hist")).toBeVisible();
  await expect(page.locator(".hist").first()).toBeVisible();
  const hist = await page.locator(".hist").allTextContents();
  expect(hist.join(" ")).toContain("7 – 5");
  expect(hist.join(" ")).toContain("İptal");

  // Borçlar eski uygulamayla aynı
  await page.locator('#tabs [data-v="pay"]').click();
  const debtsSection = page.locator("section", { has: page.locator("#h-debts") });
  const newDebts = await debtsSection.locator(".payrow").evaluateAll((rows) =>
    rows.map((r) => [r.querySelector("strong")!.textContent!.trim(), r.querySelector(".amount")!.textContent!.trim()]),
  );
  expect(newDebts).toEqual(legacyDebts);
  expect(newDebts.length).toBeGreaterThan(0);

  // Sayfa yenilense de veri kalır (IndexedDB)
  await page.reload();
  await page.locator('#tabs [data-v="players"]').click();
  await expect(page.locator("#list-roster li")).toHaveCount(FAKE_PLAYERS.length);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("v1 ve v2 yedek dosyaları 'Dosya seç' ile de yüklenir", async ({ page }) => {
  const errors = watchErrors(page);
  for (const [file, players] of [["tests/fixtures/backup-v1.json", 10], ["tests/fixtures/backup-v2-legacy.json", 17]] as const) {
    await page.goto("/#/settings");
    await page.locator('[data-a="importOpen"]').click();
    await page.setInputFiles("#importFile", resolve(file));
    await expect(page.locator(".sheet")).toContainText(String(players) + " oyuncu");
    await page.locator('[data-a="confirmImport"]').click();
    await page.locator('#tabs [data-v="players"]').click();
    await expect(page.locator("#list-roster li")).toHaveCount(players);
  }
  // v1: eski saha metni kayıtlı saha olarak görünür
  await page.goto("/#/settings");
  await page.locator('[data-a="importOpen"]').click();
  await page.locator("#mtext").fill(readFileSync(resolve("tests/fixtures/backup-v1.json"), "utf8"));
  await page.locator('[data-a="doImport"]').click();
  await page.locator('[data-a="confirmImport"]').click();
  await expect(page.locator("section", { has: page.locator("#h-fields") }).locator(".flist")).toContainText("Eski Saha Spor Kompleksi");
  expect(errors).toEqual([]);
});
