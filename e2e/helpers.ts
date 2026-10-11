import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";

/**
 * Google'ın giriş betiklerini (apis.google.com) boş yanıtlar. Ayarlar'daki eşitleme bölümü Google girişinin
 * altyapısını önceden kurar; testler organizatörün gerçek Firebase projesine ve dış ağa bağlanmasın,
 * ağı kısıtlı ortamda da konsola hata düşmesin. (Google girişi emülatörle e2e/sync.spec.ts'te sınanır.)
 */
export async function stubGoogle(ctx: BrowserContext): Promise<void> {
  await ctx.route("https://apis.google.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
}

/** Her tarayıcı bağlamında (page fikstürü ve browser.newContext) Google betiklerini boş yanıtlayan test. */
export const test = base.extend<object, { stubbedBrowser: void }>({
  stubbedBrowser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const ctx = await newContext(options);
        await stubGoogle(ctx);
        return ctx;
      };
      await use();
    },
    { scope: "worker", auto: true },
  ],
});

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
