/**
 * Organizatörün haftalık işini kısaltan özellikler uçtan uca (360 px, konsol hatası yok):
 * katılım günlüğü ve haber saati, haftalık iş listesi, hatırlatma takvimi, borç dökümü ve
 * borçlulara sırayla hatırlatma, disiplin kararı mesajı, takım dengesi özeti, banka bildiriminden
 * ödeme işaretleme.
 */
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deadZones, importBackupText, noHorizontalScroll, openResults, test, watchErrors } from "./helpers";

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

/** window.open ile açılan adresleri toplar (WhatsApp bağlantıları yeni sekme açmasın). */
function stubOpen(page: Page): Promise<void> {
  return page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = (u?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(u));
      return null;
    };
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
/** wa.me bağlantısındaki mesaj metni. */
const waText = (u: string) => new URL(u).searchParams.get("text") || "";

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
  // "Kur" takımları doğrudan kurar
  await expect(page.locator("#toast")).toContainText("Takımlar kuruldu");
  await expect(page.locator(".team.a .tp").first()).toBeVisible();
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

test("borç dökümü ve sırayla hatırlatma: kalem kalem döküm; herkese tek oturumda mesaj (Kural 2.4)", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await stubOpen(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="pay"]').click();
  const debts = page.locator('section[aria-labelledby="h-debts"]');
  const rowOf = (name: string) => debts.locator(".payrow", { hasText: name });
  const n = await debts.locator(".payrow").count();
  expect(n).toBeGreaterThan(3);
  await expect(debts.locator('[data-a="remindAll"]')).toHaveText("Sırayla hatırlat (" + n + " kişi)");
  await debts.scrollIntoViewIfNeeded();
  await noHorizontalScroll(page);
  // Bildirim kapanınca ölç: sayfanın sonundaki satırlar bildirimin altında kalmasın
  await expect(page.locator("#toast")).not.toHaveClass(/show/, { timeout: 10_000 });
  expect(await deadZones(page, "biriken borçlar")).toEqual([]);

  // Telefonu olan: döküm doğrudan WhatsApp'ta açılır
  await rowOf("Forvet Fırat").locator('[data-a="statement"]').click();
  let urls = await opened(page);
  expect(urls).toHaveLength(1);
  expect(urls[0].startsWith("https://wa.me/90")).toBe(true);
  expect(waText(urls[0]).split("\n")).toEqual([
    "Selam Forvet Fırat, 11.10.2026 itibarıyla hesap dökümün:", "",
    "• Sal 13.10 maç payı: 300 ₺ – ödenmedi", "",
    "Toplam borç: 300 ₺", "",
    "IBAN: TR00 0000 0000 0000 0000 0000 00 (Organizatör Deneme)", "",
    "Teşekkürler!",
  ]);
  // Telefonu olmayan: paylaşım menüsü
  await rowOf("Bek Bülent").locator('[data-a="statement"]').click();
  expect(await lastShared(page)).toContain("Selam Bek Bülent, 11.10.2026 itibarıyla hesap dökümün:");
  expect(await opened(page)).toHaveLength(1);

  // Kısmi ödeme dökümde kalanıyla görünür; hesap defterinden de gönderilir
  await rowOf("Forvet Fırat").locator(".plink").click();
  await page.locator("#lp-amount").fill("120");
  await page.locator('[data-a="takePayment"]').click();
  await page.locator('#modal [data-a="statement"]').click();
  urls = await opened(page);
  expect(waText(urls[1])).toContain("• Sal 13.10 maç payı: 300 ₺ – 120 ₺ ödendi, kalan 180 ₺");
  expect(waText(urls[1])).toContain("Toplam borç: 180 ₺");
  expect(waText(urls[1])).toContain("Son ödemelerin: 11.10 120 ₺");
  await page.locator('#modal [data-a="closeModal"]').click();

  // Sırayla hatırlat: gönder → sıradaki kişi hazır; atla; sonunda özet
  await debts.locator('[data-a="remindAll"]').click();
  const sheet = page.locator("#modal");
  await expect(sheet.locator("#sheet-title")).toHaveText("Sırayla hatırlat");
  await expect(sheet.locator("#rq-step")).toContainText("1/" + n);
  await noHorizontalScroll(page);
  expect(await deadZones(page, "sırayla hatırlat")).toEqual([]);
  const first = (await sheet.locator(".rq-card strong").textContent())!;
  await sheet.locator('[data-a="remindSend"][data-k="short"]').click();
  expect(await lastShared(page)).toContain("Selam " + first + ", organizasyonlardan kalan borcun 300 ₺.");
  await expect(sheet.locator("#rq-step")).toContainText("2/" + n);
  const second = (await sheet.locator(".rq-card strong").textContent())!;
  expect(second).not.toBe(first);
  await sheet.locator('[data-a="remindSend"][data-k="statement"]').click();
  expect(await lastShared(page)).toContain("Selam " + second + ", 11.10.2026 itibarıyla hesap dökümün:");
  await expect(sheet.locator("#rq-step")).toContainText("3/" + n);
  for (let i = 3; i <= n; i++) await sheet.locator('[data-a="remindSkip"]').click();
  await expect(sheet).toContainText("Sıra bitti: 2 kişi için mesaj açıldı.");
  await sheet.locator('.btn[data-a="closeModal"]').click();
  await expect(sheet).toBeHidden();

  // Şablon Ayarlar'da düzenlenebilir; kısa hatırlatma şablonu yerinde duruyor
  await page.goto("/#/settings");
  const tpl = page.locator('section[aria-labelledby="h-tpl"]');
  await expect(tpl.locator(".frow", { hasText: "Kişisel ödeme hatırlatması" })).toHaveCount(1);
  await tpl.locator(".frow", { hasText: "Borç dökümü" }).locator('[data-a="tplEdit"]').click();
  await expect(page.locator("#tpl-preview")).toContainText("Selam Ahmet,");
  await expect(page.locator("#tpl-preview")).toContainText("• Per 08.10 maç payı: 215 ₺ – 65 ₺ ödendi, kalan 150 ₺");
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("disiplin kararı: kayıttan hemen sonra ve listeden paylaşılır; madde, kademe, ceza maçı ve sicil yazar (Kural 9.3)", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await importBackupText(page, V2);
  await page.goto("/#/discipline");
  const record = async (type: string) => {
    await page.locator('[data-a="discNew"]').first().click();
    await page.locator('select[data-f="disc.pid"]').selectOption({ label: "Orta Ömer" });
    await page.locator('select[data-f="disc.type"]').selectOption(type);
    await page.locator('[data-a="discSave"]').click();
    await expect(page.locator("#modal")).toBeHidden();
  };
  await record("late");
  // Bildirimde iki eylem: kararı paylaş ve geri al
  await expect(page.locator("#toast [data-toast-act]")).toHaveText(["Kararı paylaş", "Geri al"]);
  await record("swear");
  await page.locator("#toast [data-toast-act]", { hasText: "Kararı paylaş" }).click();
  await expect(page.locator("#modal #sheet-title")).toHaveText("Kararı paylaş");
  const text = await page.locator("#mtext").inputValue();
  expect(text).toContain("Kişi: Orta Ömer");
  expect(text).toContain("İhlal: Küfür ve hakaret (Kural 9.2)");
  expect(text).toContain("2. ihlal: yaptırım kademeli (Kural 9.3");
  expect(text).toContain("Yaptırım: Bir maç kadroya alınmaz");
  expect(text).toContain("Kadroya alınmayacağı maç: Per 15.10 21:00");
  expect(text).toContain("Önceki kayıtlar (1):\n• 11.10 Geç kalma (1.7) – Uyarı");
  expect(text).toContain("son söz organizatörün (Kural 12.1)");
  await noHorizontalScroll(page);
  // Önizlemede düzenlenip paylaşılır
  await page.locator("#mtext").fill(text + "\nGeçmiş olsun.");
  await page.locator('#modal [data-a="shareSheet"]').click();
  expect(await lastShared(page)).toContain("Geçmiş olsun.");
  await page.locator('#modal [data-a="closeModal"]').click();

  // Listedeki satırdan da paylaşılır (ilk kayıt: uyarı)
  const rows = page.locator("#list-disc li");
  await expect(rows).toHaveCount(2);
  await rows.nth(1).locator('[data-a="discShare"]').click();
  await expect(page.locator("#mtext")).toHaveValue(/Yaptırım: Uyarı/);
  await page.locator('#modal [data-a="closeModal"]').click();
  await noHorizontalScroll(page);
  expect(await deadZones(page, "disiplin listesi")).toEqual([]);
  // Oyuncu kartında da paylaşım düğmesi var
  await rows.first().locator('[data-a="nav"][data-v="player"]').click();
  await expect(page.locator('#h-pdisc')).toBeVisible();
  await expect(page.locator('.drow [data-a="discShare"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("takım dengesi özeti: iki takımın sayısı, ortalama gücü ve mevkileri; isim ve kişisel seviye yok (Kural 3.1)", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await importBackupText(page, V2);
  await openThursday(page);
  // Kadroya dört kişi daha yaz, takımları kur
  for (const n of ["Zeki Zorlu", "Defans Doğan", "Eldiven Ercan"]) {
    await page.locator("#q-att").fill(n);
    await page.locator("#q-att").press("Enter");
    await expect(attBtn(page, n, "in")).toHaveAttribute("aria-pressed", "true");
  }
  await page.locator("#guestName").fill("Misafir Mehmet");
  await page.locator('[data-a="addGuest"]').click();
  await expect(page.locator(".hero-count b")).toHaveText("8/16");
  await page.locator('#tabs [data-v="teams"]').click();
  await expect(page.locator('[data-a="balanceShare"]')).toHaveCount(0);
  await page.locator('[data-a="gen"]').click();
  await page.locator('[data-a="balanceShare"]').click();
  await expect(page.locator("#modal #sheet-title")).toHaveText("Denge özeti");
  const text = await page.locator("#mtext").inputValue();
  const lines = text.split("\n");
  expect(lines[0]).toBe("⚖️ Takım dengesi – Perşembe 15.10");
  expect(lines[2]).toMatch(/^.+ Sarılar: 4 kişi · ortalama güç \d,\d · 1 kaleci/);
  expect(lines[3]).toMatch(/^.+ Turuncular: 4 kişi · ortalama güç \d,\d · 1 kaleci/);
  expect(text).toMatch(/Ortalama güç farkı: %\d+/);
  expect(text).toContain("(Kural 3.1)");
  for (const n of ["Kaleci Kemal", "Zeki Zorlu", "Orta Ömer"]) expect(text).not.toContain(n);
  await noHorizontalScroll(page);
  await page.locator('#modal [data-a="shareSheet"]').click();
  expect(await lastShared(page)).toBe(text);
  await page.locator('#modal [data-a="closeModal"]').click();
  await noHorizontalScroll(page);
  expect(await deadZones(page, "takımlar")).toEqual([]);
  expect(errors).toEqual([]);
});

test("banka bildirimi: yapıştır, önizle, kişiyi düzelt, uygula; elle eşlenen ad bir dahaki sefere kendiliğinden tutar (Kural 2.3)", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="pay"]').click();
  const debts = page.locator('section[aria-labelledby="h-debts"]');
  const owes = (name: string) => debts.locator(".payrow", { hasText: name });
  await expect(owes("Forvet Fırat")).toHaveCount(1);
  await expect(owes("Stoper Şükrü")).toHaveCount(1);
  await expect(owes("Bek Bülent")).toHaveCount(1);
  const TEXT = [
    "Hesabınıza 10.10.2026 14:05'te FORVET FIRAT tarafından 300,00 TL FAST ile gönderildi. Bakiye: 4.250,00 TL",
    "FAST STOPER ŞÜKRÜ'DEN 300 TL gelen transfer",
    "11/10/2026 Gelen FAST HASAN DENEME halisaha 300,00",
    "Kartınızdan 50,00 TL harcama yapıldı",
  ].join("\n");
  await debts.locator('[data-a="bankOpen"]').click();
  await expect(page.locator("#modal #sheet-title")).toHaveText("Banka bildirimleri");
  await page.locator("#bank-text").fill(TEXT);
  // Yapıştırınca kendiliğinden önizlenir
  const rows = page.locator("#modal .bankrow");
  await expect(rows).toHaveCount(4);
  await expect(page.locator("#modal")).toContainText("4 hareket bulundu, seçilenlerin toplamı 600 ₺");
  await expect(rows.nth(0)).toContainText("FORVET FIRAT");
  await expect(rows.nth(0)).toContainText("10.10 · adı tutuyor · borcu 300 ₺");
  await expect(rows.nth(0).locator("select option:checked")).toHaveText("Forvet Fırat");
  await expect(rows.nth(1).locator("select option:checked")).toHaveText("Stoper Şükrü");
  await expect(rows.nth(2)).toContainText("kimseyle eşleşmedi, seç");
  await expect(rows.nth(2).locator("select option:checked")).toHaveText("Atla");
  await expect(rows.nth(3)).toContainText("hesaptan çıkan, ödeme değil");
  await expect(rows.nth(3)).toContainText("−50 ₺");
  await expect(rows.nth(3).locator("select")).toBeDisabled();
  await noHorizontalScroll(page);
  expect(await deadZones(page, "banka önizleme")).toEqual([]);
  // "Metni düzenle" yazılan metni geri getirir
  await page.locator('#modal [data-a="bankOpen"]').click();
  await expect(page.locator("#bank-text")).toHaveValue(TEXT);
  // Metni elle düzenleyince kendiliğinden önizlenmez: "Önizle" ile
  await page.locator('[data-a="bankPreview"]').click();
  // Organizatör üçüncü havalenin Bek Bülent'ten geldiğini biliyor
  await rows.nth(2).locator("select").selectOption({ label: "Bek Bülent · 300 ₺" });
  await page.locator('[data-a="bankApply"]').click();
  await expect(page.locator("#toast")).toContainText("3 ödeme işlendi");
  await expect(owes("Forvet Fırat")).toHaveCount(0);
  await expect(owes("Stoper Şükrü")).toHaveCount(0);
  await expect(owes("Bek Bülent")).toHaveCount(0);
  // Geri al: üçü de geri gelir
  await page.locator("#toast [data-toast-act]", { hasText: "Geri al" }).click();
  await expect(owes("Bek Bülent")).toHaveCount(1);
  // Uygulanan metin bir dahaki açılışta gelmez; yeniden yapıştırılır
  await debts.locator('[data-a="bankOpen"]').click();
  await expect(page.locator("#bank-text")).toHaveValue("");
  await page.locator("#bank-text").fill(TEXT);
  await rows.nth(2).locator("select").selectOption({ label: "Bek Bülent · 300 ₺" });
  await page.locator('[data-a="bankApply"]').click();
  await expect(page.locator("#toast")).toContainText("3 ödeme işlendi");

  // Hesap defterinde bankadan gelen ödeme notuyla görünür
  await page.locator('[data-a="payTab"][data-v="people"]').click();
  await page.locator("#list-people li", { hasText: "Bek Bülent" }).locator("button").click();
  await expect(page.locator("#modal .llist")).toContainText("Banka: HASAN DENEME");
  await page.locator('#modal [data-a="closeModal"]').click();

  // Aynı metin ikinci kez: işlenmişler atlanır; elle eşlenen ad artık kendiliğinden tutar
  await page.locator('#view [data-a="bankOpen"]').click();
  await page.locator("#bank-text").fill(TEXT + "\n09.10.2026 Gelen FAST HASAN DENEME 150,00");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText("bu ödeme zaten işlenmiş");
  await expect(rows.nth(2)).toContainText("bu ödeme zaten işlenmiş");
  await expect(rows.nth(4)).toContainText("kayıtlı banka adı");
  await expect(rows.nth(4).locator("select option:checked")).toHaveText("Bek Bülent");
  await expect(page.locator("#modal")).toContainText("seçilenlerin toplamı 150 ₺");
  await page.locator('[data-a="bankApply"]').click();
  await expect(page.locator("#toast")).toContainText("1 ödeme işlendi");
  expect(errors).toEqual([]);
});

test("kadro görseli: armalı kare PNG önizlenir, dosya olarak paylaşılır; kesinleştikten sonra paylaşılınca kadro duyurusu sayılır (Kural 1.4)", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __files: { name: string; type: string; size: number }[] };
    w.__files = [];
    navigator.canShare = (d?: ShareData) => !!d?.files?.length;
    navigator.share = async (d?: ShareData) => {
      for (const f of d?.files || []) w.__files.push({ name: f.name, type: f.type, size: f.size });
    };
  });
  const files = () => page.evaluate(() => (window as unknown as { __files: { name: string; type: string; size: number }[] }).__files);
  await importBackupText(page, V2);
  await openThursday(page);
  const open = page.locator('#view [data-a="imgOpen"]');
  await expect(open).toHaveText("Kadro görseli");
  await open.click();
  await expect(page.locator("#modal #sheet-title")).toHaveText("Kadro görseli");
  const img = page.locator("#sq-img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([1080, 1080]);
  await expect(page.locator('#modal [data-a="imgShare"]')).toBeEnabled();
  await expect(page.locator("#modal")).toContainText("telefon, IBAN ve borç yazmaz");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "kadro görseli")).toEqual([]);
  await page.locator('#modal [data-a="imgShare"]').click();
  await expect.poll(files).toHaveLength(1);
  const [f] = await files();
  expect([f.name, f.type]).toEqual(["kadro-2026-10-15.png", "image/png"]);
  expect(f.size).toBeGreaterThan(20_000);
  await page.locator('#modal [data-a="closeModal"]').click();

  // Kadro kesinleşti: görseli paylaşmak, iş listesindeki "kadroyu duyur" adımını kapatır
  await page.clock.setSystemTime(new Date("2026-10-14T22:00:00+03:00"));
  await page.goto("/#/settings");
  await openThursday(page);
  const todo = page.locator("#view .todobox");
  await todo.locator('[data-a="todoToggle"]').click();
  const squad = todo.locator('[data-step="squad"]');
  await expect(squad.locator('[data-a="msg"]')).toHaveText("Paylaş");
  await open.click();
  await expect(page.locator('#modal [data-a="imgShare"]')).toBeEnabled();
  await page.locator('#modal [data-a="imgShare"]').click();
  await expect.poll(files).toHaveLength(2);
  await page.locator('#modal [data-a="closeModal"]').click();
  await expect(squad.locator('[data-a="msg"]')).toHaveCount(0);
  await expect(squad.locator('[data-a="pasteList"]')).toBeVisible();
  expect(errors).toEqual([]);
});

/** Dosya paylaşımını yakalar: paylaşılan dosyaların adı, türü ve boyutu. */
async function stubFileShare(page: Page): Promise<() => Promise<{ name: string; type: string; size: number }[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __files: { name: string; type: string; size: number }[] };
    w.__files = [];
    navigator.canShare = (d?: ShareData) => !!d?.files?.length;
    navigator.share = async (d?: ShareData) => {
      for (const f of d?.files || []) w.__files.push({ name: f.name, type: f.type, size: f.size });
    };
  });
  return () => page.evaluate(() => (window as unknown as { __files: { name: string; type: string; size: number }[] }).__files);
}

test("takım görseli: iki takım yelek renkleriyle kare PNG olarak paylaşılır; iş listesinde takımlar duyurulmuş sayılır (Kural 3.3)", async ({ page }) => {
  const errors = watchErrors(page);
  const files = await stubFileShare(page);
  await importBackupText(page, V2);
  await openThursday(page);
  await page.locator('#tabs [data-v="teams"]').click();
  // Takımlar kurulmadan görsel düğmesi yok
  await expect(page.locator('#view [data-a="imgTeams"]')).toHaveCount(0);
  await page.locator('#view [data-a="gen"]').click();
  const open = page.locator('#view [data-a="imgTeams"]');
  await expect(open).toHaveText("Takım görseli");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "takımlar")).toEqual([]);
  await open.click();
  await expect(page.locator("#modal #sheet-title")).toHaveText("Takım görseli");
  const img = page.locator("#sq-img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([1080, 1080]);
  await expect(page.locator("#modal")).toContainText("seviye, telefon ve borç yazmaz");
  expect(await deadZones(page, "takım görseli")).toEqual([]);
  await page.locator('#modal [data-a="imgShare"]').click();
  await expect.poll(files).toHaveLength(1);
  const [f] = await files();
  expect([f.name, f.type]).toEqual(["takimlar-2026-10-15.png", "image/png"]);
  expect(f.size).toBeGreaterThan(20_000);
  await page.locator('#modal [data-a="closeModal"]').click();
  // İş listesi: takımlar paylaşıldı
  await page.locator('#tabs [data-v="match"]').click();
  const todo = page.locator("#view .todobox");
  await todo.locator('[data-a="todoToggle"]').click();
  await expect(todo.locator('[data-step="teams"]')).toContainText("gönderildi");
  expect(errors).toEqual([]);
});

test("maç afişi: halı saha maçında arma, saha ve slogan; tarih ve saat maçtan gelir, kare PNG paylaşılır", async ({ page }) => {
  const errors = watchErrors(page);
  const files = await stubFileShare(page);
  await importBackupText(page, V2);
  await openThursday(page);
  const open = page.locator('#view [data-a="imgPoster"]');
  await expect(open).toHaveText("Maç afişi");
  await open.click();
  await expect(page.locator("#modal #sheet-title")).toHaveText("Maç afişi");
  const img = page.locator("#sq-img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([1080, 1080]);
  await noHorizontalScroll(page);
  expect(await deadZones(page, "maç afişi")).toEqual([]);
  await expect(page.locator('#modal [data-a="imgSave"]')).toBeEnabled();
  await page.locator('#modal [data-a="imgShare"]').click();
  await expect.poll(files).toHaveLength(1);
  const [f] = await files();
  expect([f.name, f.type]).toEqual(["mac-afisi-2026-10-15.png", "image/png"]);
  expect(f.size).toBeGreaterThan(50_000);
  await page.locator('#modal [data-a="closeModal"]').click();
  expect(errors).toEqual([]);
});

test("mevkiler: defansif ve ofansif orta saha seçilir, rozet ve filtrede görünür, sahada orta saha hattında yer alır", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="players"]').click();
  const setPos = async (name: string, label: string) => {
    const row = page.locator(".prow", { hasText: name });
    await row.locator('[data-a="editP"]').click();
    const sel = page.locator('[data-f="p.pos"]');
    await expect(sel.locator("option")).toHaveText(["Mevki yok", "Kaleci", "Defans", "Defansif orta saha", "Orta saha", "Ofansif orta saha", "Forvet"]);
    await sel.selectOption({ label });
    await row.locator('[data-a="editP"]').click();
    await expect(page.locator('[data-f="p.pos"]')).toHaveCount(0);
  };
  await setPos("Orta Ömer", "Defansif orta saha");
  await setPos("Golcü Gökhan", "Ofansif orta saha");
  await expect(page.locator(".prow", { hasText: "Orta Ömer" }).locator(".pos")).toHaveText("DOS");
  await expect(page.locator(".prow", { hasText: "Golcü Gökhan" }).locator(".pos")).toHaveText("OOS");
  // Filtre: yalnızca defansif orta sahalar
  await page.locator('[data-a="flt"][data-t="pos"][data-v="DM"]').click();
  await expect(page.locator("#view .prow:visible")).toHaveCount(1);
  await expect(page.locator("#view .prow:visible")).toContainText("Orta Ömer");
  await page.locator('[data-a="flt"][data-t="pos"][data-v=""]').click();
  await noHorizontalScroll(page);
  expect(await deadZones(page, "oyuncular")).toEqual([]);

  // Takımlar: sahada DOS ve OOS rozetleri
  await openThursday(page);
  await page.locator('#tabs [data-v="teams"]').click();
  await page.locator('#view [data-a="gen"]').click();
  const labels = await page.locator("svg.pitch .pp text").allTextContents();
  expect(labels).toContain("DOS");
  expect(labels).toContain("OOS");
  expect(errors).toEqual([]);
});

test("oyuncu ekleme: altı mevki ve beş seviye düğmesi; seçilen mevki ve seviyeyle kaydedilir", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="players"]').click();
  const add = page.locator('section[aria-labelledby="h-add"]');
  await expect(add.locator("#newPos option")).toHaveText(["Mevki yok", "Kaleci", "Defans", "Defansif orta saha", "Orta saha", "Ofansif orta saha", "Forvet"]);
  const rates = add.locator('[data-a="newRate"]');
  await expect(rates).toHaveText(["1", "2", "3", "4", "5"]);
  await expect(add.locator('[data-a="newRate"][aria-pressed="true"]')).toHaveText("3");
  await expect(add).toContainText("1 zayıf · 5 çok iyi");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "oyuncu ekle")).toEqual([]);
  // Ad yazılır, mevki ve seviye seçilir: yazılan ad seviye seçilince kaybolmaz
  await add.locator("#newName").fill("Yeni Yıldız");
  await add.locator("#newPos").selectOption({ label: "Ofansif orta saha" });
  await rates.nth(4).click();
  await expect(rates.nth(4)).toHaveAttribute("aria-pressed", "true");
  await expect(rates.nth(2)).toHaveAttribute("aria-pressed", "false");
  await expect(add.locator("#newName")).toHaveValue("Yeni Yıldız");
  await add.locator('[data-a="addPlayer"]').click();
  const row = page.locator(".prow", { hasText: "Yeni Yıldız" });
  await expect(row.locator(".pos")).toHaveText("OOS");
  await expect(row.locator(".pips")).toHaveText("●●●●●");
  await row.locator('[data-a="editP"]').click();
  await expect(page.locator('[data-f="p.pos"]')).toHaveValue("AM");
  await expect(page.locator('.editor [data-a="rate"][aria-pressed="true"]')).toHaveText("5");
  // Form varsayılana döner
  await expect(add.locator('[data-a="newRate"][aria-pressed="true"]')).toHaveText("3");
  expect(errors).toEqual([]);
});

test("sabit kişi başı ücret: ayarlardan girilir; maç bilgileri, davet ve ödemeler bu ücreti gösterir (Kural 2.1, 2.2)", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await importBackupText(page, V2);
  await openThursday(page);
  // Kadro dolmadan tahmin kontenjana göre (4 kişi yazılı, 3 ödeyen): 3000 / 14 → 215
  await expect(page.locator("#view")).toContainText("Kişi başı ~215 ₺");
  await page.goto("/#/settings");
  const fee = page.locator('[data-f="s.fixedShare"]');
  await expect(fee).toHaveAttribute("placeholder", "Boş: saha ücreti bölünür");
  await fee.fill("320");
  await fee.press("Tab");
  await expect(page.locator("#toast")).toContainText("Kaydedildi");
  await expect(page.locator("#view")).toContainText("herkes bu ücreti öder");
  await noHorizontalScroll(page);
  await openThursday(page);
  await expect(page.locator("#view")).toContainText("Kişi başı 320 ₺");
  await page.locator('#view [data-a="msg"][data-k="invite"]').click();
  expect(await lastShared(page)).toContain("Kişi başı ~320 ₺");
  await page.locator('#tabs [data-v="pay"]').click();
  await page.locator('select[data-f="payId"]').selectOption({ label: "Perşembe 15.10 21:00" });
  await expect(page.locator(".money-sum .count").first()).toContainText("320 ₺");
  await expect(page.locator("#view")).toContainText("Kişi başı sabit ücret");
  expect(errors).toEqual([]);
});

test("liste yapıştırma: listedeki tarih ya da gün seçili etkinlikle tutmuyorsa önizlemede uyarır, engellemez", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await openThursday(page);
  await page.locator('#view [data-a="pasteList"]').click();
  // Çok satırlı yapıştırma kendiliğinden önizlenir
  await page.locator("#plist").fill("20.12.2026\nCUMA AKŞAM\n22.00-23.00\n\n1-Zeki Zorlu\n2-\n");
  await expect(page.locator('#modal [data-a="pasteApply"]')).toBeVisible();
  const warn = page.locator("#paste-date");
  await expect(warn).toContainText("Tarihi kontrol et");
  await expect(warn).toContainText("Listede 20.12.2026 yazıyor, seçili etkinlik ise Perşembe 15.10.");
  await expect(warn).toContainText("Listede 20.12.2026 CUMA yazıyor, ama bu tarih Pazar gününe denk geliyor.");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "liste önizleme")).toEqual([]);
  // Uyarıya rağmen uygulanabilir
  await page.locator('#modal [data-a="pasteApply"]').click();
  await expect(page.locator("#list-att li", { hasText: "Zeki Zorlu" }).locator('[data-s="in"]')).toHaveAttribute("aria-pressed", "true");
  // Doğru gün ve tarihli listede uyarı yok
  await page.locator('#view [data-a="pasteList"]').click();
  await page.locator("#plist").fill("Perşembe 15.10\n1-Zeki Zorlu\n2-Defans Doğan\n");
  await expect(page.locator('#modal [data-a="pasteApply"]')).toBeVisible();
  await expect(page.locator("#paste-date")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("etkinlik sayfası: sonuç bölümü maç gününe kadar kapalı, iptal her zaman görünür; maç günü açık", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await openThursday(page);
  const res = page.locator("details.res-later");
  await expect(res).toBeVisible();
  await expect(res).not.toHaveAttribute("open", "");
  await expect(res.locator(":scope > summary")).toContainText("Maç günü açılır");
  await expect(page.locator('[data-a="finish"]')).toBeHidden();
  await expect(page.locator('[data-a="cancelMatch"]')).toBeVisible();
  await noHorizontalScroll(page);
  expect(await deadZones(page, "kapalı sonuç")).toEqual([]);
  // İstenirse önceden açılır ve açık kalır
  await res.locator(":scope > summary").click();
  await expect(page.locator('[data-a="finish"]')).toBeVisible();
  await page.locator('#tabs [data-v="pay"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  await expect(page.locator('[data-a="finish"]')).toBeVisible();
  // Maç günü: bölüm kendiliğinden açık (katlanmaz)
  await page.clock.setSystemTime(new Date("2026-10-15T18:00:00+03:00"));
  await page.reload();
  await openThursday(page);
  await expect(page.locator("details.res-later")).toHaveCount(0);
  await expect(page.locator('[data-a="finish"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("toplu ekleme: satırdaki mevki ve seviye alınır; rakamlı ad bozulmaz", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="players"]').click();
  const add = page.locator('section[aria-labelledby="h-add"]');
  await add.locator("summary", { hasText: "Toplu ekle" }).click();
  await expect(add).toContainText("Ali Yılmaz, DOS, 4");
  await add.locator("#bulk").fill("Toplu Bir, DOS, 4\nToplu İki - Forvet - 2\n7-Toplu Amca 1\n");
  await add.locator('[data-a="bulkAdd"]').click();
  await expect(page.locator("#toast")).toContainText("3");
  const row = (n: string) => page.locator(".prow", { hasText: n });
  await expect(row("Toplu Bir").locator(".pos")).toHaveText("DOS");
  await expect(row("Toplu Bir").locator(".pips")).toHaveText("●●●●○");
  await expect(row("Toplu İki").locator(".pos")).toHaveText("F");
  await expect(row("Toplu İki").locator(".pips")).toHaveText("●●○○○");
  await expect(row("Toplu Amca 1").locator(".pos")).toHaveCount(0);
  await expect(row("Toplu Amca 1").locator(".pips")).toHaveText("●●●○○");
  expect(errors).toEqual([]);
});

test("maç günü Cuma 22:00'ye alınınca eski günlerdeki boş maçlar kalkar; format ve ücret yaklaşan maçlara geçer", async ({ page }) => {
  const errors = watchErrors(page);
  // Boş uygulama: varsayılan Salı ve Perşembe 21:00 maçları kendiliğinden planlanır
  await page.goto("/#/players");
  await page.locator("details summary", { hasText: "Toplu" }).click();
  await page.locator("#bulk").fill("Ali Deneme\nVeli Deneme");
  await page.locator('[data-a="bulkAdd"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  await expect(page.locator('.chips [data-a="selMatch"]')).toHaveText(["Sal 13.10", "Per 15.10", "Sal 20.10", "Per 22.10"]);
  await page.goto("/#/settings");
  const time = page.locator('input[data-f="slot.0.t"]');
  await time.fill("22:00");
  await time.press("Tab");
  await page.locator('select[data-f="slot.0.d"]').selectOption("5");
  await expect(page.locator("#toast")).toContainText("eski günlerdeki 2 boş maç kaldırıldı");
  await page.locator('select[data-f="slot.1.d"]').selectOption("");
  await page.locator('select[data-f="s.format"]').selectOption("6");
  await expect(page.locator("#toast")).toContainText("yaklaşan 4 maç güncellendi");
  const price = page.locator('input[data-f="s.price"]');
  await price.fill("4480");
  await price.press("Tab");
  await expect(page.locator("#toast")).toContainText("yaklaşan 4 maç güncellendi");
  await page.locator('#tabs [data-v="match"]').click();
  await expect(page.locator('.chips [data-a="selMatch"]')).toHaveText(["Cum 16.10", "Cum 23.10", "Cum 30.10", "Cum 06.11"]);
  await expect(page.locator("#hero")).toContainText("Cuma 22:00");
  await expect(page.locator("#hero")).toContainText("0/14");
  await expect(page.locator(".mcard")).toContainText("6+1 · 4.480 ₺");
  // Eski günün maçı için rezervasyon uyarısı kalmaz
  await expect(page.locator("#view")).not.toContainText("Salı");
  expect(errors).toEqual([]);
});

test("maç gecesi: gece yarısından sonra açılınca sonucu girilecek maç seçili; ertesi gün Ödemeler oynanan maçı açar (Kural 2.3)", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/#/players");
  await page.locator("details summary", { hasText: "Toplu" }).click();
  await page.locator("#bulk").fill("Ali Deneme\nVeli Deneme\nCan Deneme\nEge Deneme");
  await page.locator('[data-a="bulkAdd"]').click();
  await page.locator('#tabs [data-v="match"]').click();
  for (const n of ["Ali", "Veli", "Can", "Ege"]) {
    await page.locator("#q-att").fill(n + " Deneme");
    await page.locator("#q-att").press("Enter");
  }
  await expect(page.locator(".counts .count").first()).toContainText("4");
  // Salı 21:00 maçı bitti; organizatör gece 00:30'da uygulamayı açıyor
  await page.clock.setSystemTime(new Date("2026-10-14T00:30:00+03:00"));
  await page.reload();
  await expect(page.locator("#hero")).toContainText("13.10");
  await expect(page.locator('.chips [data-a="selMatch"].on')).toContainText("Sal 13.10");
  await openResults(page);
  await page.locator("#scA").fill("4");
  await page.locator("#scB").fill("3");
  await page.locator('[data-a="finish"]').click();
  await expect(page.locator(".hist").first()).toContainText("4 – 3");
  // Ertesi gün: sıradaki maçın kadrosu henüz kesinleşmedi; Ödemeler parası toplanacak maçı açar
  await page.clock.setSystemTime(new Date("2026-10-14T12:00:00+03:00"));
  await page.reload();
  await page.locator('#tabs [data-v="pay"]').click();
  await expect(page.locator('select[data-f="payId"] option:checked')).toHaveText("Salı 13.10 21:00 (Oynandı)");
  expect(errors).toEqual([]);
});

test("kısa liste biçimi: davet şablonu tek dokunuşla 1-İsim kalıbına döner; ✕ sonrası güncel liste paylaşılır (Kural 1.2, 1.5)", async ({ page }) => {
  const errors = watchErrors(page);
  await stubShare(page);
  await importBackupText(page, V2);
  await page.goto("/#/settings");
  await page.locator('[data-a="tplEdit"][data-k="invite"]').click();
  await page.locator('[data-a="tplPreset"]').click();
  await expect(page.locator("#tpl-text")).toHaveValue(/^\{tamtarih\} \{GUN\} \{saat\}-\{bitis\}/);
  await expect(page.locator("#tpl-preview")).toContainText("1-");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "şablon")).toEqual([]);
  await page.locator('[data-a="tplSave"]').click();
  await expect(page.locator("#toast")).toContainText("kaydedildi");
  await openThursday(page);
  const invite = page.locator('#view [data-a="msg"][data-k="invite"]').last();
  await invite.click();
  const first = await lastShared(page);
  const lines = first.split("\n");
  expect(lines[0]).toBe("15.10.2026 PERŞEMBE 21:00-22:00");
  expect(lines[2]).toMatch(/^1-\S/);
  expect(first).toMatch(/\n16-$/m);
  // Gönderildikten sonra aynı düğme güncel listeyi paylaşır
  await expect(invite).toContainText("Güncel listeyi paylaş");
  const name = lines[2].slice(2).replace(" 🧤", "");
  await attBtn(page, name, "out").click();
  await invite.click();
  const next = await lastShared(page);
  expect(next).not.toContain(name);
  expect(next.split("\n")[2]).toMatch(/^1-\S/);
  expect(errors).toEqual([]);
});

test("listeden düşen: yeniden yapıştırılan listede adı olmayan 'Listede artık yok' altında çıkar, Yok yazılır (Kural 1.2, 1.5)", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await openThursday(page);
  // Organizatör "gelemiyorum" diyen Golcü Gökhan'ı listeden silip listeyi yeniden atmış
  await page.locator('#view [data-a="pasteList"]').last().click();
  await page.locator("#plist").fill(["⚽ Perşembe 15.10 – 21:00", "", "1. Kaleci Kemal", "2. Orta Ömer", "3. Forvet Fırat", "4. Mehmet Yeni", "5."].join("\n"));
  await expect(page.locator('[data-a="pasteApply"]')).toBeVisible();
  const gone = page.locator(".paste-gone");
  await expect(gone).toContainText("Listede artık yok");
  await expect(gone).toContainText("Golcü Gökhan");
  await expect(gone).toContainText("Var idi");
  await expect(gone.locator("select")).toHaveValue("out");
  // "4 isim bulundu": düşen kişi sayılmaz
  await expect(page.locator("#modal")).toContainText("4 isim bulundu");
  await noHorizontalScroll(page);
  expect(await deadZones(page, "liste önizleme")).toEqual([]);
  await page.locator('[data-a="pasteApply"]').click();
  await expect(page.locator("#toast")).toContainText("Listeden 2 kişi işaretlendi");
  await expect(attBtn(page, "Golcü Gökhan", "out")).toHaveAttribute("aria-pressed", "true");
  await expect(attBtn(page, "Orta Ömer", "in")).toHaveAttribute("aria-pressed", "true");
  // Geri al: Gökhan yeniden Var
  await page.locator("[data-toast-act]").first().click();
  await expect(attBtn(page, "Golcü Gökhan", "in")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
