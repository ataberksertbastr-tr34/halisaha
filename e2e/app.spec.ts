/** Uygulama geneli: konsol hatası yok, 360 px düzen, çevrimdışı çalışma, yüklenebilirlik, Geri al. */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importBackupText, noHorizontalScroll, watchErrors } from "./helpers";

const V2 = readFileSync(resolve("tests/fixtures/backup-v2-legacy.json"), "utf8");
const TABS = ["match", "teams", "pay", "players", "more"];
const SUBPAGES = ["settings", "stats", "rules", "discipline", "announce"];

test("tüm sekmeler hatasız açılır ve 360 px'e sığar (açık ve koyu tema)", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const tab of TABS) {
      await page.locator(`#tabs [data-v="${tab}"]`).click();
      await expect(page.locator(`#tabs [data-v="${tab}"]`)).toHaveAttribute("aria-current", "page");
      await noHorizontalScroll(page);
    }
    for (const sub of SUBPAGES) {
      await page.locator('#tabs [data-v="more"]').click();
      await page.locator(`[data-a="nav"][data-v="${sub}"]`).click();
      await expect(page.locator(".subtitle")).toBeVisible();
      await noHorizontalScroll(page);
      await page.goBack();
      await expect(page.locator(".pagetitle")).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test("service worker sonrası internetsiz açılır, yüklenebilir", async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
  const manifest = await cdp.send("Page.getAppManifest");
  expect(manifest.errors).toEqual([]);

  await page.locator('#tabs [data-v="players"]').click();
  await page.locator("#newName").fill("Çevrimdışı Çetin");
  await page.locator('[data-a="addPlayer"]').click();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#hero")).toContainText("Çevrimdışı");
  await page.locator('#tabs [data-v="players"]').click();
  await expect(page.locator("#list-roster")).toContainText("Çevrimdışı Çetin");
  await page.goto("/#/teams");
  await expect(page.locator('#tabs [data-v="teams"]')).toHaveAttribute("aria-current", "page");
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("silinen oyuncu 'Geri al' ile geri gelir", async ({ page }) => {
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="players"]').click();
  const first = page.locator("#list-roster li").first();
  const name = await first.locator(".plink").textContent();
  await first.locator('[data-a="editP"]').click();
  await page.locator('[data-a="delPlayer"]').click();
  await expect(page.locator("#toast")).toContainText(name + " silindi");
  await expect(page.locator("#list-roster li")).toHaveCount(16);
  await page.locator("[data-toast-act]").click();
  await expect(page.locator("#list-roster li")).toHaveCount(17);
});

test("katılım, misafir, takım kurma ve maçı bitirme akışı", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/#/players");
  await page.locator("details summary").click();
  await page.locator("#bulk").fill(Array.from({ length: 12 }, (_, i) => `${i + 1}. Deneme Oyuncu ${i + 1}`).join("\n"));
  await page.locator('[data-a="bulkAdd"]').click();
  await expect(page.locator("#list-roster li")).toHaveCount(12);
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="newEvent"]').first().click();
  await page.locator('[data-a="createEvent"][data-v="football"]').click();
  // Arama + Enter ile "Var"
  for (let i = 1; i <= 10; i++) {
    await page.locator("#q-att").fill("Oyuncu " + i);
    await page.locator("#q-att").press("Enter");
  }
  await expect(page.locator(".counts .count").first()).toContainText("10");
  await page.locator("#guestName").fill("Misafir Mehmet");
  await page.locator('[data-a="addGuest"]').click();
  await expect(page.locator(".counts .count").first()).toContainText("11");
  await page.locator('[data-a="goTeams"]').click();
  await page.locator('[data-a="gen"]').click();
  await expect(page.locator(".team.a .tprow").first()).toBeVisible();
  const a = await page.locator(".team.a .tprow").count();
  const b = await page.locator(".team.b .tprow").count();
  expect(a + b).toBe(11);
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator("#scA").fill("3");
  await page.locator("#scB").fill("2");
  await page.locator('[data-a="finish"]').click();
  await expect(page.locator(".hist").first()).toContainText("3 – 2");
  expect(errors).toEqual([]);
});

test("mesajlar tek dokunuşla paylaşılır; Web Share yoksa panoya kopyalanır", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    navigator.share = async (d?: ShareData) => {
      (window as unknown as { __shared: unknown[] }).__shared.push(d);
    };
  });
  const page = await ctx.newPage();
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="msg"][data-k="invite"]').click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { text: string }[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0].text).toContain("1. Kaleci Kemal 🧤");
  expect(shared[0].text).toContain("Çamlık Spor Tesisi");
  await ctx.close();

  // Web Share yok: kopyala
  const ctx2 = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  await ctx2.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  const page2 = await ctx2.newPage();
  await importBackupText(page2, V2);
  await page2.locator('#tabs [data-v="pay"]').click();
  await page2.locator('[data-a="msg"][data-k="pay"]').click();
  await expect(page2.locator("#toast")).toContainText("Kopyalandı");
  const clip = await page2.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Saha ücreti");
  await ctx2.close();
});

test("hesap defteri: kısmi ödeme, avans, gider ve kasa", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="pay"]').click();
  await page.locator('[data-a="payTab"][data-v="people"]').click();
  // En borçlu kişinin defterini aç, 100 TL kısmi ödeme al
  const first = page.locator("#list-people .acctrow").first();
  const name = (await first.locator("strong").textContent())!.trim();
  await first.click();
  await expect(page.locator(".ledger-bal")).toContainText("Borç 300");
  await page.locator("#lp-amount").fill("100");
  await page.locator('[data-a="takePayment"]').click();
  await expect(page.locator(".ledger-bal")).toContainText("Borç 200");
  // Fazla ödeme → avans
  await page.locator("#lp-amount").fill("250");
  await page.locator('[data-a="takePayment"]').click();
  await expect(page.locator(".ledger-bal")).toContainText("Avans 50");
  await page.locator('[data-a="closeModal"]').click();
  await expect(page.locator("#list-people")).toContainText(name);
  // Kasa: gider ekle
  await page.locator('[data-a="payTab"][data-v="cash"]').click();
  await page.locator("#ex-amount").fill("450");
  await page.locator("#ex-cat").selectOption("ball");
  await page.locator('[data-a="addExpense"]').click();
  await expect(page.locator(".llist")).toContainText("Top");
  // 350 alındı − 3600 saha − 450 gider (fikstürde önceden 3 ödeme: 300+300+1000)
  await expect(page.locator(".cashbig")).toBeVisible();
  expect(errors).toEqual([]);
});

test("takımlar: sahada sürükle-bırak takas, kilit ve eşleşme kuralı", async ({ browser }) => {
  const ctx = await browser.newContext({ isMobile: false, hasTouch: false });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="copyLastWeek"]').click();
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="gen"]').click();
  await page.evaluate(() => {
    const r = document.querySelector(".pitch")!.getBoundingClientRect();
    window.scrollBy(0, r.top - 10);
  });
  const a = page.locator('.pitch .pp[data-side="a"]').first();
  const b = page.locator('.pitch .pp[data-side="b"]').first();
  const aId = (await a.getAttribute("data-id"))!;
  const sa = (await a.locator("circle:not(.hit)").first().boundingBox())!;
  const sb = (await b.locator("circle:not(.hit)").first().boundingBox())!;
  await page.mouse.move(sa.x + sa.width / 2, sa.y + sa.height / 2);
  await page.mouse.down();
  await page.mouse.move(sa.x + 30, sa.y + 60, { steps: 4 });
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#toast")).toContainText("⇄");
  await expect(page.locator(`.pitch .pp[data-side="b"][data-id="${aId}"]`)).toHaveCount(1);
  // Kilit: yeniden karıştırınca kilitli oyuncu takımında kalır
  await page.locator(".team.a .lockbtn").first().click();
  const locked = await page.locator(".team.a .tp .nm").first().textContent();
  for (let i = 0; i < 3; i++) await page.locator('[data-a="gen"]').click();
  await expect(page.locator(".team.a .tp .nm", { hasText: locked! })).toHaveCount(1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("kurallar: arama, derin bağlantı ve madde paylaşımı", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    navigator.share = async (d?: ShareData) => {
      (window as unknown as { __shared: unknown[] }).__shared.push(d);
    };
  });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto("/#/rules/2.4");
  await expect(page.locator("#rule-2\\.4")).toHaveClass(/focus/);
  await page.locator("#rule-2\\.4 [data-a=shareRule]").click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { text: string }[] }).__shared[0].text);
  expect(shared).toMatch(/^📖 Kural 2\.4 – Borçlu oyuncu\n/);
  await page.locator("#q-rules").fill("krampon");
  await expect(page.locator(".rule")).toHaveCount(3); // altın kural 5, 4.3, 10.1
  await expect(page.locator("#q-rules")).toHaveValue("krampon");
  expect(errors).toEqual([]);
  await ctx.close();
});
