/**
 * Cihazlar arası eşitleme, gerçek Firebase emülatörlerine karşı iki ayrı
 * tarayıcıyla (telefon ve bilgisayar). Uydurma isimler ve e-postalar.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importBackupText, noHorizontalScroll, watchErrors } from "./helpers";

const V2 = readFileSync(resolve("tests/fixtures/backup-v2-legacy.json"), "utf8");
const PW = "deneme123";
const uniq = () => "org" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + "@example.com";

async function device(browser: Browser, kind: "phone" | "pc"): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext(
    kind === "phone"
      ? { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 } },
  );
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  return { ctx, page, errors };
}

async function emailAuth(page: Page, email: string, mode: "in" | "up"): Promise<void> {
  await page.goto("/#/settings");
  const sec = page.locator("#sync-sec");
  await expect(sec.locator('[data-a="syncGoogle"]')).toBeVisible();
  await sec.locator('details[data-keep="syncEmail"] summary').click();
  await page.locator("#sync-email").fill(email);
  await page.locator("#sync-pw").fill(PW);
  await sec.locator(mode === "up" ? '[data-a="syncEmailUp"]' : '[data-a="syncEmailIn"]').click();
  await expect(sec).toContainText(email, { timeout: 20_000 });
  await synced(page);
}

/** Durum satırı "Eşitlendi" ve bekleyen değişiklik yok. */
async function synced(page: Page): Promise<void> {
  await expect(page.locator("#sync-status")).toContainText("Eşitlendi", { timeout: 20_000 });
  await expect(page.locator("#sync-status")).not.toContainText("bekleyen", { timeout: 20_000 });
}

async function syncNow(page: Page): Promise<void> {
  if (!(await page.locator("#sync-sec").count())) await page.goto("/#/settings");
  await page.locator('#sync-sec [data-a="syncNow"]').click();
  await synced(page);
}

async function rosterNames(page: Page): Promise<string[]> {
  await page.goto("/#/players");
  await expect(page.locator("#list-roster")).toBeVisible();
  return (await page.locator("#list-roster li .plink").allTextContents()).map((s) => s.trim()).filter(Boolean);
}

test("telefondaki veriler bilgisayara gelir, değişiklikler iki yönde eşitlenir", async ({ browser }) => {
  const email = uniq();
  const phone = await device(browser, "phone");
  const pc = await device(browser, "pc");

  // Telefon: eski uygulamanın yedeği yüklenmiş, sonra hesap oluşturup giriş yapılır.
  await importBackupText(phone.page, V2);
  await expect(phone.page.locator("#banner")).toContainText("Verilerin her cihazında olsun");
  await emailAuth(phone.page, email, "up");
  await expect(phone.page.locator("#hero #sync")).toContainText("Eşitlendi");
  await expect(phone.page.locator("#banner")).not.toContainText("Verilerin her cihazında olsun");
  await noHorizontalScroll(phone.page);
  const phoneNames = await rosterNames(phone.page);
  expect(phoneNames.length).toBeGreaterThan(3);

  // Bilgisayar: boş açılır, "başka cihazda mı?" şeridi çıkar; giriş yapınca aynı kadro gelir.
  await pc.page.goto("/");
  await expect(pc.page.locator("#banner")).toContainText("Verilerin başka bir cihazda mı?");
  await emailAuth(pc.page, email, "in");
  expect((await rosterNames(pc.page)).sort()).toEqual([...phoneNames].sort());

  // Telefonda yeni oyuncu → bilgisayarda görünür.
  await phone.page.goto("/#/players");
  await phone.page.locator("#newName").fill("Senkron Deneme");
  await phone.page.locator('[data-a="addPlayer"]').click();
  await phone.page.goto("/#/settings");
  await synced(phone.page);
  await syncNow(pc.page);
  await expect(pc.page.locator("#toast")).toContainText("Diğer cihazdaki değişiklikler alındı");
  expect(await rosterNames(pc.page)).toContain("Senkron Deneme");

  // Bilgisayarda değişiklik → telefonda görünür.
  await pc.page.goto("/#/settings");
  await pc.page.locator('[data-f="s.ibanName"]').fill("Organizatör Deneme");
  await pc.page.locator('[data-f="s.ibanName"]').blur();
  await synced(pc.page);
  await syncNow(phone.page);
  await expect(phone.page.locator('[data-f="s.ibanName"]')).toHaveValue("Organizatör Deneme");

  expect(phone.errors).toEqual([]);
  expect(pc.errors).toEqual([]);
  await phone.ctx.close();
  await pc.ctx.close();
});

test("iki cihazda internetsizken yapılan farklı değişiklikler kaybolmadan birleşir", async ({ browser }) => {
  const email = uniq();
  const phone = await device(browser, "phone");
  const pc = await device(browser, "pc");
  await importBackupText(phone.page, V2);
  await emailAuth(phone.page, email, "up");
  await emailAuth(pc.page, email, "in");

  await phone.ctx.setOffline(true);
  await pc.ctx.setOffline(true);
  await phone.page.goto("/#/settings");
  await expect(phone.page.locator("#hero #sync")).toContainText("Çevrimdışı");
  await phone.page.locator('[data-f="s.price"]').fill("4321");
  await phone.page.locator('[data-f="s.price"]').blur();
  await pc.page.goto("/#/players");
  await pc.page.locator("#newName").fill("Çevrimdışı Eklenen");
  await pc.page.locator('[data-a="addPlayer"]').click();
  await pc.page.goto("/#/settings");
  await expect(pc.page.locator("#sync-status")).toContainText("Çevrimdışı");

  // Bağlantı sırayla gelir (aynı anda gelirse iki cihaz da yazmaya çalışır; çakışma birim testlerinde sınanıyor).
  await phone.ctx.setOffline(false);
  await syncNow(phone.page);
  await pc.ctx.setOffline(false);
  await syncNow(pc.page);
  await syncNow(phone.page);

  await expect(pc.page.locator('[data-f="s.price"]')).toHaveValue("4321");
  expect(await rosterNames(phone.page)).toContain("Çevrimdışı Eklenen");
  expect(await rosterNames(pc.page)).toContain("Çevrimdışı Eklenen");
  expect(phone.errors).toEqual([]);
  expect(pc.errors).toEqual([]);
  await phone.ctx.close();
  await pc.ctx.close();
});

test("başka hesap bu verileri görmez; çıkış yapınca veriler cihazda kalır", async ({ browser }) => {
  const a = await device(browser, "phone");
  await importBackupText(a.page, V2);
  await emailAuth(a.page, uniq(), "up");
  const before = await rosterNames(a.page);

  // Çıkış: eşitleme durur, veriler yerinde.
  await a.page.goto("/#/settings");
  const out = a.page.locator('#sync-sec [data-a="syncOut"]');
  await out.click();
  await out.click(); // iki dokunuşla onay
  await expect(a.page.locator('#sync-sec [data-a="syncGoogle"]')).toBeVisible({ timeout: 20_000 });
  await expect(a.page.locator("#hero #sync")).toContainText("Bu cihazda kayıtlı");
  expect(await rosterNames(a.page)).toEqual(before);

  // Boş bir cihazda başka bir hesap: kimsenin verisini görmez.
  const b = await device(browser, "pc");
  await emailAuth(b.page, uniq(), "up");
  await b.page.goto("/#/players");
  await expect(b.page.locator("#list-roster")).toHaveCount(0);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test("Google ile giriş (emülatörün sahte Google penceresi), şifre belirleyip e-postayla aynı hesaba giriş", async ({ browser }) => {
  // Firebase giriş penceresi apis.google.com'dan yüklenir; ağı kısıtlı yerel ortamlarda NO_GOOGLE_APIS=1 ile atlanır (CI'da çalışır).
  test.skip(!!process.env.NO_GOOGLE_APIS, "apis.google.com erişilemiyor");
  const gmail = "google." + uniq();
  const d = await device(browser, "pc");
  await importBackupText(d.page, V2);
  await d.page.goto("/#/settings");
  const popupP = d.page.waitForEvent("popup");
  await d.page.locator('#sync-sec [data-a="syncGoogle"]').click();
  const popup = await popupP;
  await popup.waitForLoadState();
  await popup.getByText(/Add new account/i).click();
  await popup.locator("#email-input").fill(gmail);
  await popup.locator("#display-name-input").fill("Google Deneme");
  await popup.locator("#sign-in").click();
  await expect(d.page.locator("#sync-sec")).toContainText(gmail, { timeout: 20_000 });
  await synced(d.page);
  // Google hesabına şifre eklenir (iPhone ana ekran uygulaması için)
  await d.page.locator('details[data-keep="syncPw"] summary').click();
  await d.page.locator("#sync-newpw").fill("yenisifre1");
  await d.page.locator('[data-a="syncSetPw"]').click();
  await expect(d.page.locator("#toast")).toContainText("Şifre kaydedildi", { timeout: 15_000 });
  await expect(d.page.locator('details[data-keep="syncPw"]')).toHaveCount(0);
  const names = await rosterNames(d.page);

  // Başka bir cihazda (iPhone gibi) aynı e-posta ve şifreyle: aynı hesap, aynı veriler.
  const phone = await device(browser, "phone");
  await page_emailIn(phone.page, gmail, "yenisifre1");
  expect((await rosterNames(phone.page)).sort()).toEqual([...names].sort());
  expect(d.errors).toEqual([]);
  expect(phone.errors).toEqual([]);
  await d.ctx.close();
  await phone.ctx.close();
});

async function page_emailIn(page: Page, email: string, pw: string): Promise<void> {
  await page.goto("/#/settings");
  const sec = page.locator("#sync-sec");
  await sec.locator('details[data-keep="syncEmail"] summary').click();
  await page.locator("#sync-email").fill(email);
  await page.locator("#sync-pw").fill(pw);
  await sec.locator('[data-a="syncEmailIn"]').click();
  await expect(sec).toContainText(email, { timeout: 20_000 });
  await synced(page);
}
