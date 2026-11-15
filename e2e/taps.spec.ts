/**
 * Dokunuş bütçesi: bir maç haftası 360 px'te en kısa yoldan oynanır, her adımın dokunuş ve yazma
 * sayısı ölçülür. Adımlar bütçeyi aşarsa test düşer (yeni bir özellik akışı uzatmasın).
 * Ölçüm tablosu test çıktısına yazılır.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importBackupText, test, watchErrors } from "./helpers";

const V2 = readFileSync(resolve("tests/fixtures/backup-v2-legacy.json"), "utf8");

interface Step {
  name: string;
  taps: number;
  types: number;
}

function counter() {
  const steps: Step[] = [];
  let cur: Step | null = null;
  return {
    steps,
    start(name: string) {
      cur = { name, taps: 0, types: 0 };
      steps.push(cur);
    },
    async tap(l: Locator) {
      cur!.taps++;
      await l.click();
    },
    async type(l: Locator, text: string) {
      cur!.types++;
      await l.fill(text);
    },
    /** Hedef görünmüyorsa (kısayol yoksa) eski yolun düğmesine basılır, o da sayılır. */
    async ensure(target: Locator, fallback: Locator) {
      if (await target.isVisible().catch(() => false)) return;
      await target.waitFor({ state: "visible", timeout: 800 }).catch(async () => {
        cur!.taps++;
        await fallback.click();
      });
      await target.waitFor({ state: "visible" });
    },
  };
}

function stubShare(page: Page): Promise<void> {
  return page.addInitScript(() => {
    navigator.share = async () => undefined;
    window.open = () => null;
  });
}

const LIST = ["⚽ Perşembe 15.10 – 21:00", "", "1. Kaleci Kemal", "2. Golcü Gökhan", "3. Orta Ömer", "4. Forvet Fırat", "5. Zeki Zorlu", "6. Defans Doğan", "7. Eldiven Ercan", "8. Ali Aslan", "9. Ozan Örnek", "10. Irmak Iğdır", "11.", "12."].join("\n");

test("dokunuş bütçesi: bir maç haftası", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await importBackupText(page, V2);
  const c = counter();
  const todo = page.locator("#view .todobox");
  const step = (key: string) => todo.locator(`[data-step="${key}"]`);
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator(".chips .chip", { hasText: "Per 15.10" }).click();
  // Önceki maçın ödemeleri bu ölçümün dışında: kapat
  await page.locator('#tabs [data-v="pay"]').click();
  const prev = await page.locator('select[data-f="payId"] option', { hasText: "13.10" }).getAttribute("value");
  await page.locator('select[data-f="payId"]').selectOption(prev!);
  await page.locator('[data-a="allPaid"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="todoToggle"]').click();

  c.start("Davet gönder");
  await c.tap(step("invite").locator("button"));
  await expect(step("invite")).toContainText("gönderildi");

  c.start("WhatsApp listesinden kadro");
  await c.tap(step("squad").locator("button"));
  await c.type(page.locator("#plist"), LIST);
  await c.ensure(page.locator('[data-a="pasteApply"]'), page.locator('[data-a="pastePreview"]'));
  await c.tap(page.locator('[data-a="pasteApply"]'));
  await expect(page.locator(".hero-count b")).toHaveText("10/16");

  c.start("Saha rezerve");
  await c.tap(step("field").locator("button"));
  await expect(step("field")).toContainText("rezerve edildi");

  c.start("Takımları kur ve paylaş");
  await c.tap(step("teams").locator("button"));
  await c.ensure(page.locator(".team.a .tp").first(), page.locator('[data-a="gen"]'));
  await c.tap(page.locator('[data-a="msg"][data-k="teams"]'));
  await c.tap(page.locator('#tabs [data-v="match"]'));
  await expect(step("teams")).toContainText("gönderildi");

  c.start("Kesinleşen kadroyu duyur");
  await page.clock.setSystemTime(new Date("2026-10-14T21:30:00+03:00"));
  await page.reload();
  await c.tap(step("squad").locator("button"));
  // Kadro eksik kaldı: duyurulduktan sonra adım "liste yapıştır"a döner
  await expect(step("squad").locator("button")).toHaveText("Liste yapıştır");

  c.start("Sonuç: 2 gol, maçın oyuncusu, bitir");
  await page.clock.setSystemTime(new Date("2026-10-15T22:15:00+03:00"));
  await page.reload();
  await c.tap(step("result").locator("button"));
  const goals = page.locator("details.goals");
  await c.tap(goals.locator('[data-a="goal"][data-d="1"]').first());
  await c.tap(goals.locator('[data-a="goal"][data-d="1"]').last());
  await c.tap(goals.locator('[data-a="mvp"]').first());
  await c.tap(page.locator('[data-a="finish"]'));
  await expect(page.locator("#toast")).toContainText("Maç kaydedildi");

  c.start("Ödemeler: banka bildirimi (2 havale)");
  // Biten maç artık "önceki etkinlikten kalan iş": sıradaki iş onun ödemeleri
  await c.tap(step("pay-past").locator("button"));
  await c.tap(page.locator('section[aria-labelledby="h-debts"] [data-a="bankOpen"]'));
  await c.type(page.locator("#bank-text"), "Hesabınıza ORTA ÖMER tarafından 200,00 TL gönderildi\nFAST ZEKİ ZORLU'DAN 200 TL");
  await c.ensure(page.locator('[data-a="bankApply"]'), page.locator('[data-a="bankPreview"]'));
  await c.tap(page.locator('[data-a="bankApply"]'));
  await expect(page.locator("#toast")).toContainText("2 ödeme işlendi");

  c.start("Ödemeyenlere sırayla hatırlat (3 kişi)");
  await c.tap(page.locator('[data-a="remindAll"]'));
  for (let i = 0; i < 3; i++) await c.tap(page.locator('[data-a="remindSend"][data-k="short"]'));
  await c.tap(page.locator('#modal [data-a="closeModal"]'));

  const table = c.steps.map((s) => s.name.padEnd(42) + String(s.taps).padStart(3) + " dokunuş" + (s.types ? " + " + s.types + " yapıştırma" : "")).join("\n");
  console.log("\nDokunuş ölçümü (360 px)\n" + table + "\nToplam: " + c.steps.reduce((x, s) => x + s.taps, 0) + " dokunuş");
  // Bütçe: adım başına en çok
  const budget: Record<string, number> = {
    "Davet gönder": 1, "WhatsApp listesinden kadro": 2, "Saha rezerve": 1, "Takımları kur ve paylaş": 3,
    "Kesinleşen kadroyu duyur": 1, "Sonuç: 2 gol, maçın oyuncusu, bitir": 5, "Ödemeler: banka bildirimi (2 havale)": 3, "Ödemeyenlere sırayla hatırlat (3 kişi)": 5,
  };
  if (!process.env.TAPS_MEASURE) for (const s of c.steps) expect(s.taps, s.name).toBeLessThanOrEqual(budget[s.name]);
  expect(errors).toEqual([]);
});
