/**
 * Premium sürüm: kulüp çubuğu ve maç günü başlığı, masa tenisi turnuvası
 * (Kural 20.1), kıraathane puan cetveli (21.1–21.2), korner serisi (7.6),
 * sakatlık (8.3) ve kapanış listesi (3.3, 10.1). 360 px, konsol hatası yok.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importBackupText, noHorizontalScroll, watchErrors } from "./helpers";

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

test("üst bölüm: Etkinlik'te maç günü başlığı, diğer sayfalarda kulüp çubuğu", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="match"]').click();
  await expect(page.locator("#hero")).not.toHaveClass(/compact/);
  await expect(page.locator("#hero .hero-day")).toBeVisible();
  await expect(page.locator("#hero .hm-bar")).toHaveAttribute("role", "progressbar");
  for (const tab of ["teams", "pay", "players", "more"]) {
    await page.locator(`#tabs [data-v="${tab}"]`).click();
    await expect(page.locator("#hero")).toHaveClass(/compact/);
    await expect(page.locator("#hero .hero-next")).toBeVisible();
    await noHorizontalScroll(page);
  }
  // Kulüp çubuğundaki rozet Etkinlik sekmesine götürür
  await page.locator("#hero .hero-next").click();
  await expect(page.locator('#tabs [data-v="match"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#hero")).not.toHaveClass(/compact/);
  expect(errors).toEqual([]);
});

test("masa tenisi turnuvası: kura, skor tabelası, tur atlama ve şampiyon (Kural 20.1)", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    navigator.share = async (d?: ShareData) => {
      (window as unknown as { __shared: unknown[] }).__shared.push(d);
    };
  });
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await newEvent(page, "tabletennis");
  await signUp(page, CLEAN.slice(0, 3));
  await page.locator('select[data-f="m.agree"][data-k="org"]').selectOption("cup");
  await expect(page.locator("#toast")).toContainText("5 oyunda 3");
  await expect(page.locator('select[data-f="m.agree"][data-k="bo"]')).toHaveValue("5");
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="cupStart"]').click();
  // 3 katılımcı: 4'lük tablo, bir bay, yarı final ve final
  await expect(page.locator(".cup-r")).toHaveCount(2);
  await expect(page.locator(".cmatch .cm-st", { hasText: "Bay geçti" })).toHaveCount(1);
  await noHorizontalScroll(page);
  // Yarı finali skor tabelasında oyna: 3 oyun 11-0
  await page.locator('[data-a="cupPlay"]').first().click();
  const a = page.locator(".sb-side.a");
  for (let i = 0; i < 33; i++) await a.click();
  await expect(a).toHaveClass(/win/);
  await page.locator('#modal [data-a="closeModal"]').last().click();
  await expect(page.locator(".cmatch.done")).toHaveCount(2);
  // Final: elle bitir
  await page.locator('[data-a="cupPlay"]').last().click();
  await page.locator("#modal details summary").click();
  await page.locator('[data-a="ptEnd"][data-w="b"]').click();
  await page.locator('#modal [data-a="closeModal"]').last().click();
  await expect(page.locator(".champ .champ-n")).toBeVisible();
  await page.locator('[data-a="cupShare"]').click();
  const shared = await page.evaluate(() => {
    const a = (window as unknown as { __shared: { text: string }[] }).__shared;
    return a[a.length - 1]?.text || "";
  });
  expect(shared).toContain("Şampiyon");
  expect(shared).toContain("Final");
  // Sonuç bölümünde şampiyon görünür
  await page.locator('#tabs [data-v="match"]').click();
  await expect(page.locator("#h-res ~ .champ, .section .champ")).toBeVisible();
  expect(errors).toEqual([]);
});

test("kıraathane puan cetveli: el el puan, önde olan ve masa sonucu (Kural 21.1–21.2)", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await newEvent(page, "kiraathane");
  await signUp(page, CLEAN);
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="drawGame"][data-v="101"]').click();
  await page.locator('[data-a="drawTables"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="sheetOpen"]').first().click();
  await expect(page.locator('[data-a="sheetLow"][data-v="1"]')).toHaveAttribute("aria-checked", "true");
  // Enter bir sonraki kişiye geçer, sonuncuda eli yazar
  for (const [i, v] of ["12", "45", "0", "101"].entries()) {
    await page.locator("#sh-in-" + i).fill(v);
    await page.locator("#sh-in-" + i).press("Enter");
  }
  await expect(page.locator(".sht tbody tr:not(.sh-new)")).toHaveCount(1);
  await page.locator("#sh-in-0").fill("-5");
  await page.locator("#sh-in-1").fill("3");
  await page.locator("#sh-in-2").fill("20");
  await page.locator("#sh-in-3").fill("0");
  await page.locator('[data-a="sheetAdd"]').click();
  await expect(page.locator(".sht tfoot td.lead")).toHaveText("7");
  await expect(page.locator('[data-a="sheetLow"]').first()).toBeDisabled();
  await noHorizontalScroll(page);
  await page.locator('[data-a="sheetFinish"]').click();
  await expect(page.locator(".sh-lead")).toContainText("Kazanan");
  await page.locator('#modal .sheet-head [data-a="closeModal"]').click();
  await expect(page.locator(".games .game")).toHaveCount(1);
  await expect(page.locator(".sheetbtn").first()).toContainText("bitti");
  expect(errors).toEqual([]);
});

test("halı saha: korner serisi, sakatlık ve kapanış listesi (Kural 7.6, 8.3, 3.3, 10.1)", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="match"]').click();
  // Yedekteki sıradaki maçta 4 kişi zaten "Var"
  await expect(page.locator(".hero-count b")).toHaveText("4/16");
  await page.locator(".prep summary").click();
  await page.locator('select[data-f="m.agree"][data-k="corners"]').selectOption("yes");
  const ca = page.locator('[data-a="corner"][data-side="a"]');
  await ca.click();
  await ca.click();
  await expect(ca.locator(".cdots i.on")).toHaveCount(2);
  // Rakip korner kullanınca seri sıfırlanır
  await page.locator('[data-a="corner"][data-side="b"]').click();
  await expect(ca.locator(".cdots i.on")).toHaveCount(0);
  await ca.click();
  await ca.click();
  await ca.click();
  await expect(page.locator("#toast")).toContainText("penaltı");
  // Sakatlık
  await page.locator('[data-a="injured"]').first().click();
  await expect(page.locator('[data-a="injured"]').first()).toHaveAttribute("aria-pressed", "true");
  // Kapanış listesi
  const closing = page.locator("details.closing");
  if (!(await closing.getAttribute("open"))) await closing.locator("summary").click();
  await closing.locator('[data-k="post.bibs"]').click();
  await expect(closing.locator('[data-k="post.bibs"]')).toHaveAttribute("aria-checked", "true");
  await expect(closing.locator(".meta")).toContainText("1/4");
  await noHorizontalScroll(page);
  await page.locator('[data-a="finish"]').click();
  await expect(page.locator(".hist", { hasText: "1 sakatlık" })).toHaveCount(1);
  expect(errors).toEqual([]);
});
