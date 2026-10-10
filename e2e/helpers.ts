import { expect, type Page } from "@playwright/test";

/** Sayfadaki konsol hatalarını ve yakalanmamış istisnaları toplar. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  return errors;
}

/** Yeni uygulamada "Yedekten yükle" → yapıştır → Yükle → onay. */
export async function importBackupText(page: Page, text: string): Promise<void> {
  await page.goto("/#/settings");
  await page.locator('[data-a="importOpen"]').click();
  await page.locator("#mtext").fill(text);
  await page.locator('[data-a="doImport"]').click();
  await expect(page.locator('[data-a="confirmImport"]')).toBeVisible();
  await page.locator('[data-a="confirmImport"]').click();
  await expect(page.locator("#toast")).toContainText("Yedek yüklendi");
}

export async function noHorizontalScroll(page: Page): Promise<void> {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, "yatay kaydırma olmamalı").toBeLessThanOrEqual(cw);
}
