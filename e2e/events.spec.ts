/**
 * Predators etkinlikleri uçtan uca: paintball (katılım, borç engeli, hazırlık,
 * raunt, araç, disiplin, bitirme), voleybol skorbordu, kıraathane masa kurası,
 * masa tenisi sırası, disiplin ve duyuru sayfaları. 360 px, konsol hatası yok.
 */
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importBackupText, noHorizontalScroll, test, watchErrors } from "./helpers";

const V2 = readFileSync(resolve("tests/fixtures/backup-v2-legacy.json"), "utf8");
const CLEAN = ["Kaleci Kemal", "Orta Ömer", "Defans Doğan", "Eldiven Ercan"];

async function newEvent(page: Page, kind: string): Promise<void> {
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="newEvent"]').first().click();
  await page.locator(`[data-a="createEvent"][data-v="${kind}"]`).click();
  await expect(page.locator("#modal")).toBeHidden();
}

async function signUp(page: Page, names: string[]): Promise<void> {
  for (const n of names) {
    await page.locator("#q-att").fill(n);
    await page.locator("#q-att").press("Enter");
    await expect(page.locator("#list-att li", { hasText: n }).locator('[data-s="in"]')).toHaveAttribute("aria-pressed", "true");
  }
}

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

test("paintball: katılım, borç engeli, hazırlık, raunt, araç, disiplin ve bitirme", async ({ page }) => {
  await stubShare(page);
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await newEvent(page, "paintball");
  await expect(page.locator("#hero")).toContainText("Paintball");
  await page.locator('input[data-f="m.title"]').fill("Sezon açılışı");
  await page.locator('input[data-f="m.title"]').press("Tab");
  await expect(page.locator(".mc-name")).toHaveText("Sezon açılışı");
  await page.locator('input[data-f="m.price"]').fill("6000");
  await page.locator('input[data-f="m.price"]').press("Tab");
  await page.locator('[data-a="toggleDetails"]').click();

  await signUp(page, CLEAN);
  // Kural 2.4: borçlu oyuncu sorulmadan yazılmaz; organizatör yine de yazabilir
  await page.locator("#q-att").fill("Bek Bülent");
  await page.locator("#q-att").press("Enter");
  await expect(page.locator("#toast")).toContainText("Bek Bülent: borçlu");
  await expect(page.locator("#list-att li", { hasText: "Bek Bülent" }).locator('[data-s="in"]')).toHaveAttribute("aria-pressed", "false");
  await page.locator("[data-toast-act]").click();
  await expect(page.locator("#list-att li", { hasText: "Bek Bülent" }).locator('[data-s="in"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hero-count b")).toHaveText("5/12");

  // Hazırlık listesi ve ön anlaşma
  await page.locator('.prep [data-a="check"]').first().click();
  await expect(page.locator('.prep [data-a="check"]').first()).toHaveAttribute("aria-checked", "true");
  await page.locator('select[data-f="m.agree"][data-k="range"]').selectOption("venue");
  await expect(page.locator('select[data-f="m.agree"][data-k="range"]')).toHaveValue("venue");
  await page.locator('.prep [data-a="msg"][data-k="brief"]').click();
  const brief = await lastShared(page);
  expect(brief).toContain("🎯 Sezon açılışı");
  expect(brief).toContain("(16.2)");
  expect(brief).toContain("Tesisin belirlediği mesafe");

  // Takımlar
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="gen"]').click();
  await expect(page.locator(".team.a .tprow").first()).toBeVisible();
  await noHorizontalScroll(page);

  // Raunt sayacı
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="round"][data-side="a"][data-d="1"]').click();
  await page.locator('[data-a="round"][data-side="a"][data-d="1"]').click();
  await page.locator('[data-a="round"][data-side="b"][data-d="1"]').click();
  await expect(page.locator(".rpanel.a .rp-num")).toHaveText("2");
  await expect(page.locator(".rpanel.b .rp-num")).toHaveText("1");

  // Araç paylaşımı (15.8)
  await page.locator("#h-cars").click();
  await page.locator("#newCarDriver").selectOption({ label: "Sürücü: Defans Doğan" });
  await page.locator('[data-a="addCar"]').click();
  await page.locator('.car [data-a="carPax"]', { hasText: "Orta Ömer" }).click();
  await page.locator('.car input[data-f="car.fuel"]').fill("600");
  await page.locator('.car input[data-f="car.fuel"]').press("Tab");
  await expect(page.locator(".car-per b")).toContainText("300");

  // Disiplin: alkollü gelen etkinliğe alınmaz, payını öder (15.7)
  await page.locator('[data-a="discNew"][data-mid]').click();
  await page.locator('select[data-f="disc.pid"]').selectOption({ label: "Eldiven Ercan" });
  await page.locator('select[data-f="disc.type"]').selectOption("alcohol");
  await expect(page.locator(".dsug")).toContainText("Etkinliğe alınmadı");
  await page.locator('[data-a="discSave"]').click();
  await expect(page.locator("#toast")).toContainText("Kayıt eklendi");
  await expect(page.locator("#list-att li", { hasText: "Eldiven Ercan" })).toContainText("etkinlikten çıkarıldı (15.7)");

  await noHorizontalScroll(page);
  await page.locator('[data-a="finish"]').click();
  await expect(page.locator(".hist", { hasText: "Sezon açılışı" })).toContainText("2 – 1");

  // Ödeme: alkollü gelen de payını öder
  await page.locator('#tabs [data-v="pay"]').click();
  await expect(page.locator(".payrow", { hasText: "Eldiven Ercan" }).first()).toContainText("1.200");
  expect(errors).toEqual([]);
});

test("voleybol: skorbord, set sayısı ve takım skoru", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await newEvent(page, "volleyball");
  await signUp(page, CLEAN);
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="gen"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="newGame"][data-mode="teams"]').click();
  const a = page.locator('.sb-side.a');
  await expect(a).toBeVisible();
  for (let i = 0; i < 24; i++) await a.click();
  await expect(page.locator(".sb-alert")).toContainText("Set sayısı");
  await a.click();
  await expect(page.locator(".sb-hist")).toContainText("25–0");
  await page.locator('[data-a="ptUndo"]').click();
  await expect(page.locator(".sb-side.a .sb-big")).toHaveText("24");
  await a.click();
  for (let i = 0; i < 25; i++) await a.click();
  await expect(page.locator(".sb-side.a")).toHaveClass(/win/);
  await noHorizontalScroll(page);
  await page.locator('#modal [data-a="closeModal"]').last().click();
  await expect(page.locator(".tally b")).toHaveText("1 – 0");
  await expect(page.locator(".game.done")).toContainText("25-0, 25-0");
  expect(errors).toEqual([]);
});

test("kıraathane masa kurası ve masa tenisi kazanan kalır", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await newEvent(page, "kiraathane");
  await signUp(page, CLEAN);
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="drawGame"][data-v="tavla"]').click();
  await page.locator('[data-a="drawTables"]').click();
  await expect(page.locator(".dgroup")).toHaveCount(2);
  await noHorizontalScroll(page);
  await page.locator('[data-a="tab"][data-v="match"]').last().click();
  await page.locator('.tcard [data-a="tableWin"]').first().click();
  await expect(page.locator(".games .game")).toHaveCount(1);
  await page.locator('.tcard [data-a="newGame"][data-mode="tavla"]').first().click();
  await page.locator('.sb-side.a').click();
  await page.locator('[data-a="pt"][data-side="a"][data-n="2"]').click();
  await expect(page.locator(".sb-side.a .sb-big")).toHaveText("3");
  await page.locator('#modal .sheet-head [data-a="closeModal"]').click();

  await newEvent(page, "tabletennis");
  await signUp(page, CLEAN.slice(0, 3));
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="queueStart"]').first().click();
  await expect(page.locator(".qtable")).toBeVisible();
  const first = (await page.locator(".qt-p b").first().textContent())!;
  await page.locator('[data-a="queueWin"]').first().click();
  await expect(page.locator(".qt-p b").first()).toHaveText(first);
  await expect(page.locator(".qt-p .tag")).toContainText("1 galibiyet");
  await expect(page.locator(".games .game")).toHaveCount(1);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("disiplin ve duyuru sayfaları; oyuncu kartında sicil", async ({ page }) => {
  await stubShare(page);
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.goto("/#/discipline");
  await expect(page.locator(".subtitle")).toBeVisible();
  await page.locator('[data-a="discNew"]').first().click();
  await page.locator('select[data-f="disc.pid"]').selectOption({ label: "Golcü Gökhan" });
  await page.locator('select[data-f="disc.type"]').selectOption("swear");
  await expect(page.locator(".dsug")).toContainText("Uyarı");
  await page.locator('[data-a="discSave"]').click();
  await expect(page.locator("#list-disc")).toContainText("Golcü Gökhan");
  await page.locator("#q-disc").fill("golcu");
  await expect(page.locator("#list-disc li")).toHaveCount(1);
  await noHorizontalScroll(page);
  await page.locator('#list-disc [data-a="nav"][data-v="player"]').click();
  await expect(page.locator("#h-pdisc")).toBeVisible();
  await expect(page.locator(".pcard")).toBeVisible();

  await page.goto("/#/announce");
  await page.locator('[data-a="shareArea"][data-v="ann-move"]').click();
  expect(await lastShared(page)).toContain("Kural 14.3");
  await page.locator('input[data-f="ann.ruleText"]').fill("Borcu olan oyuncu ödeme yapana kadar yedekte bekler.");
  await expect(page.locator("#ann-rule")).toHaveValue(/ödeme yapana kadar/);
  await noHorizontalScroll(page);

  await page.goto("/#/rules/ek");
  await expect(page.locator("#rule-ek .sanctions tbody tr")).toHaveCount(16);
  await page.locator('#rule-ek a.rref[href="#/rules/9.1"]').click();
  await expect(page.locator("#rule-9\\.1")).toHaveClass(/flag/);
  expect(errors).toEqual([]);
});

test("geç iptal: yerine yedekten giren payı öder, geç iptal eden kendiliğinden muaf olur (Kural 15.3)", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await newEvent(page, "paintball");
  await page.locator('input[data-f="m.cap"]').fill("3");
  await page.locator('input[data-f="m.cap"]').press("Tab");
  await page.locator('input[data-f="m.price"]').fill("900");
  await page.locator('input[data-f="m.price"]').press("Tab");
  await page.locator('[data-a="toggleDetails"]').click();
  await signUp(page, CLEAN); // 3 kişi kadroda, Eldiven Ercan yedekte
  await page.locator("#list-att li", { hasText: "Orta Ömer" }).locator('[data-s="late"]').click();
  await expect(page.locator("#toast")).toContainText("Orta Ömer geç iptal etti; yerine Eldiven Ercan girdi. Payı Eldiven Ercan öder, Orta Ömer muaf (Kural 15.3)");
  await page.locator('#tabs [data-v="pay"]').click();
  const row = page.locator(".payrow", { hasText: "Orta Ömer" });
  await expect(row.locator('[data-a="exempt"]')).toHaveText("Muafiyeti kaldır");
  await expect(page.locator(".money-sum .count").first()).toContainText("300");
  await expect(page.locator("section.section").first()).not.toContainText("Muaf tut\" de");
  // Geri dönen sıranın sonuna (yedeğe) yazılır; başkasının yerine kadroya girince muafiyeti kalkar ve payını öder
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator("#list-att li", { hasText: "Orta Ömer" }).locator('[data-s="in"]').click();
  await page.locator("#list-att li", { hasText: "Defans Doğan" }).locator('[data-s="late"]').click();
  await expect(page.locator("#toast")).toContainText("yerine Orta Ömer girdi");
  await page.locator('#tabs [data-v="pay"]').click();
  await expect(row.locator('[data-a="exempt"]')).toHaveText("Muaf tut");
  await expect(row).toContainText("300");
  await expect(page.locator(".payrow", { hasText: "Defans Doğan" }).locator('[data-a="exempt"]')).toHaveText("Muafiyeti kaldır");
  // Yedek yokken geç iptal eden öder; boşalan yere eklenen misafirin onun yerine gelip gelmediği sorulur
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator("#list-att li", { hasText: "Kaleci Kemal" }).locator('[data-s="late"]').click();
  await page.locator("#guestName").fill("Misafir Mehmet");
  await page.locator('[data-a="addGuest"]').click();
  await expect(page.locator("#toast")).toContainText("Misafir Mehmet kadroya girdi. Geç iptal eden Kaleci Kemal yerine mi geldi?");
  await page.locator("[data-toast-act]").click();
  await expect(page.locator("#toast")).toContainText("Payı Misafir Mehmet öder, Kaleci Kemal muaf");
  await page.locator('#tabs [data-v="pay"]').click();
  await expect(page.locator(".payrow", { hasText: "Kaleci Kemal" }).locator('[data-a="exempt"]')).toHaveText("Muafiyeti kaldır");
  await expect(page.locator(".payrow", { hasText: "Misafir Mehmet" })).toContainText("300");
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
