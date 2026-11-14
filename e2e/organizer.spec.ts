/**
 * Organizatörün haftalık işini kısaltan özellikler uçtan uca (360 px, konsol hatası yok):
 * katılım günlüğü ve haber saati, haftalık iş listesi, hatırlatma takvimi.
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

test("haftalık iş listesi: sıradaki iş tek dokunuşla yapılır, adımlar durumunu gösterir", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await importBackupText(page, V2);
  await openThursday(page);
  const todo = page.locator("#view .todobox");
  const row = (step: string) => todo.locator(`[data-step="${step}"]`);
  await expect(todo.locator("h2")).toHaveText("Sıradaki iş");
  // Kapalıyken yalnızca sıradaki iş: önceki maçın kapanmamış ödemeleri
  await expect(todo.locator(".todo-row")).toHaveCount(1);
  await expect(row("pay-past")).toContainText("Sal 13.10 ödemeleri");
  await expect(row("pay-past")).toContainText("2/12 ödedi · kalan 3.000 ₺");
  await expect(todo.locator('[data-a="todoToggle"]')).toHaveText("0/6 · Tümü");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "iş listesi (kapalı)")).toEqual([]);

  // "Tümü": önceki maçtan kalan iş + bu maçın altı adımı
  await todo.locator('[data-a="todoToggle"]').click();
  await expect(todo.locator(".todo-row")).toHaveCount(7);
  await expect(todo.locator(".todo-row strong")).toHaveText(["Sal 13.10 ödemeleri", "Davet", "Kadro", "Saha", "Takımlar", "Sonuç", "Ödemeler"]);
  await expect(row("invite")).toContainText("gönderilmedi");
  await expect(row("squad")).toContainText("4/16 · 12 kişi eksik");
  await expect(row("field")).toContainText("rezerve edilmedi");
  await expect(row("teams")).toContainText("kurulmadı");
  await expect(row("result")).toContainText("maçtan sonra");
  await expect(row("pay")).toContainText("1/3 ödedi");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "iş listesi (açık)")).toEqual([]);

  // Davet tek dokunuşla gider ve adım kapanır
  await row("invite").locator("button").click();
  expect(await lastShared(page)).toContain("1. Kaleci Kemal");
  await expect(row("invite")).toContainText("gönderildi · Paz 11.10 12:0");
  await expect(row("invite").locator("button")).toHaveCount(0);
  await expect(todo.locator('[data-a="todoToggle"]')).toHaveText("1/6 · Kapat");
  // Saha
  await row("field").locator("button").click();
  await expect(row("field")).toContainText("rezerve edildi");
  await expect(page.locator(".hero-chips")).toContainText("Rezerve edildi");
  // Kadro: WhatsApp listesi penceresi açılır
  await row("squad").locator("button").click();
  await expect(page.locator("#plist")).toBeVisible();
  await page.locator('#modal [data-a="closeModal"]').click();

  // Takımlar: kur → paylaş → iş listesinde kapanır; takas sonrası yeniden paylaşmak gerekir
  await row("teams").locator("button").click();
  await expect(page.locator('#tabs [data-v="teams"]')).toHaveAttribute("aria-current", "page");
  await page.locator('[data-a="gen"]').click();
  await page.locator('[data-a="msg"][data-k="teams"]').click();
  expect(await lastShared(page)).toContain("Sarılar");
  await page.locator('#tabs [data-v="match"]').click();
  await expect(row("teams")).toContainText("gönderildi · Paz 11.10 12:0");
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator(".team.a .tp").first().click();
  await page.locator('#tabs [data-v="match"]').click();
  await expect(row("teams")).toContainText("paylaşıldıktan sonra değişti");
  // Önizlemeden paylaşmak da sayılır
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('[data-a="msgPreview"][data-k="teams"]').click();
  await page.locator('#modal [data-a="shareSheet"]').click();
  await page.locator('#modal [data-a="closeModal"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  await expect(row("teams")).toContainText("gönderildi");

  // Ödemeler: bu maç ve önceki maç doğru maçla açılır
  await row("pay").locator("button").click();
  await expect(page.locator('#tabs [data-v="pay"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('select[data-f="payId"] option:checked')).toContainText("15.10");
  await page.locator('#tabs [data-v="match"]').click();
  await row("pay-past").locator("button").click();
  await expect(page.locator('select[data-f="payId"] option:checked')).toContainText("13.10");
  // Önceki maçın ödemeleri kapanınca iş listesinden düşer
  await page.locator('[data-a="allPaid"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  await expect(row("pay-past")).toHaveCount(0);
  await expect(todo.locator(".todo-row")).toHaveCount(6);

  // Gönderim kayıtları kalıcı: sayfa yenilenince durur, liste kapalı açılır ve sıradaki işi gösterir
  await page.reload();
  await openThursday(page);
  await expect(todo.locator(".todo-row")).toHaveCount(1);
  await expect(row("squad")).toContainText("4/16 · 12 kişi eksik");
  await expect(todo.locator('[data-a="todoToggle"]')).toHaveText("3/6 · Tümü");
  expect(errors).toEqual([]);
});

test("hatırlatmalar: haftalık maç günlerinden takvim dosyası ve Google Takvim bağlantıları", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  const sec = page.locator('section[aria-labelledby="h-rem"]');
  await expect(sec.locator("h2")).toHaveText("Hatırlatmalar");
  // Davet günü ve hatırlatma saati ayarı
  await sec.locator('select[data-f="s.inviteDays"]').selectOption("2");
  await expect(page.locator("#toast")).toContainText("Kaydedildi");
  await sec.locator('input[data-f="s.remindAt"]').fill("10:30");
  await sec.locator('input[data-f="s.remindAt"]').press("Tab");
  await sec.scrollIntoViewIfNeeded();
  await noHorizontalScroll(page);
  expect(await deadZones(page, "ayarlar: hatırlatmalar")).toEqual([]);

  await sec.locator('[data-a="remOpen"]').click();
  const sheet = page.locator("#modal");
  await expect(sheet.locator("#sheet-title")).toHaveText("Hatırlatmalar");
  await expect(sheet.locator("h3")).toHaveText(["Salı 21:00 maçı", "Perşembe 21:00 maçı"]);
  const rows = sheet.locator(".lrow");
  await expect(rows).toHaveCount(10);
  // Salı maçı: davet 2 gün önce 10:30 (Pazar), saha 2 gün önce (Pazar), kesinleşmeden 2 saat önce (Pazartesi 19:00)
  await expect(rows.nth(0)).toContainText("Daveti gönder");
  await expect(rows.nth(0)).toContainText("Her Pazar 10:30");
  await expect(rows.nth(2)).toContainText("Kadroyu tamamla");
  await expect(rows.nth(2)).toContainText("Her Pazartesi 19:00");
  await expect(rows.nth(3)).toContainText("Her Salı 22:30");
  await expect(rows.nth(4)).toContainText("Ödemeleri kapat");
  await expect(rows.nth(4)).toContainText("Her Çarşamba 10:30");
  const g = new URL((await rows.nth(0).locator("a").getAttribute("href"))!);
  expect(g.origin + g.pathname).toBe("https://calendar.google.com/calendar/render");
  expect(g.searchParams.get("text")).toBe("Davet gönder: Salı 21:00 maçı");
  expect(g.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY;BYDAY=SU");
  expect(g.searchParams.get("ctz")).toBe("Europe/Istanbul");
  expect(g.searchParams.get("dates")).toBe("20261018T103000/20261018T104500");
  expect(g.searchParams.get("details")).toContain("http://localhost:4173/");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "hatırlatma penceresi")).toEqual([]);

  // Takvim dosyası: on hatırlatma, haftalık tekrar, yerel saat
  const [dl] = await Promise.all([page.waitForEvent("download"), sheet.locator('[data-a="remIcs"]').click()]);
  expect(dl.suggestedFilename()).toBe("predators-hatirlatmalar.ics");
  const ics = readFileSync(await dl.path(), "utf8");
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(10);
  expect(ics).toContain("DTSTART:20261018T103000\r\nDTEND:20261018T104500\r\nRRULE:FREQ=WEEKLY;BYDAY=SU\r\nSUMMARY:Davet gönder: Salı 21:00 maçı");
  expect(ics).toContain("SUMMARY:Kadro kesinleşiyor (21:00): Perşembe 21:00 maçı");

  // Ayar kalıcı
  await page.reload();
  await expect(sec.locator('select[data-f="s.inviteDays"]')).toHaveValue("2");
  await expect(sec.locator('input[data-f="s.remindAt"]')).toHaveValue("10:30");
  expect(errors).toEqual([]);
});
