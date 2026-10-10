/**
 * Eski tek dosyalık uygulamayı (legacy/index.html) gerçek bir tarayıcıda
 * kullanarak veri girer ve "Yedeği kopyala" çıktısını döndürür.
 * Hem test fikstürü üretmek hem de e2e uyumluluk testi için kullanılır.
 * Tüm isimler uydurmadır.
 */
import type { Page } from "@playwright/test";

export const FAKE_PLAYERS = [
  "Kaleci Kemal", "Eldiven Ercan", "Defans Doğan", "Stoper Şükrü", "Bek Bülent",
  "Orta Ömer", "Pasör Polat", "Çalımcı Çağrı", "İlker İleri", "Forvet Fırat",
  "Golcü Gökhan", "Ümit Uydurma", "Ozan Örnek", "Irmak Iğdır", "Zeki Zorlu",
  "Ali Aslan", "Veli Vural",
];

const POSITIONS: Record<string, string> = {
  "Kaleci Kemal": "GK", "Eldiven Ercan": "GK", "Defans Doğan": "DEF", "Stoper Şükrü": "DEF",
  "Bek Bülent": "DEF", "Orta Ömer": "MID", "Pasör Polat": "MID", "Çalımcı Çağrı": "MID",
  "Forvet Fırat": "FWD", "Golcü Gökhan": "FWD",
};

async function attendance(page: Page, name: string, s: "in" | "maybe" | "out" | "late") {
  const row = page.locator('#list-att li.prow').filter({ has: page.locator("strong", { hasText: new RegExp("^" + name + "$") }) });
  await row.locator(`button[data-a="att"][data-s="${s}"]`).click();
}

/** Eski uygulamada zengin bir veri seti oluşturur ve yedek JSON metnini döndürür. */
export async function buildLegacyBackup(page: Page, legacyUrl: string): Promise<string> {
  await page.goto(legacyUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Ayarlar: IBAN, varsayılan ücret, saha
  await page.locator('[data-a="tab"][data-v="settings"]').click();
  await page.locator('[data-f="s.iban"]').fill("TR00 0000 0000 0000 0000 0000 00");
  await page.locator('[data-f="s.iban"]').dispatchEvent("change");
  await page.locator('[data-f="s.ibanName"]').fill("Organizatör Deneme");
  await page.locator('[data-f="s.ibanName"]').dispatchEvent("change");
  await page.locator('[data-f="s.price"]').fill("3400");
  await page.locator('[data-f="s.price"]').dispatchEvent("change");
  await page.locator('[data-a="newField"]').click();
  await page.locator("#fe-name").fill("Yeşil Vadi Halı Saha");
  await page.locator("#fe-address").fill("Örnek Mah. Deneme Sk. No:1");
  await page.locator("#fe-link").fill("https://maps.app.goo.gl/ornekLink");
  await page.locator("#fe-phone").fill("0212 000 00 00");
  await page.locator("#fe-price").fill("3600");
  await page.locator('[data-a="saveField"]').click();
  await page.locator('[data-a="newField"]').click();
  await page.locator("#fe-name").fill("Çamlık Spor Tesisi");
  await page.locator("#fe-price").fill("3000");
  await page.locator('[data-a="saveField"]').click();

  // Oyuncular: toplu ekleme + mevki/telefon/seviye
  await page.locator('[data-a="tab"][data-v="players"]').click();
  await page.locator("details summary").click();
  await page.locator("#bulk").fill(FAKE_PLAYERS.map((n, i) => `${i + 1}. ${n}`).join("\n"));
  await page.locator('[data-a="bulkAdd"]').click();
  for (const [name, pos] of Object.entries(POSITIONS)) {
    const row = page.locator("#list-roster li.prow").filter({ has: page.locator("strong", { hasText: new RegExp("^" + name + "$") }) });
    await row.locator('[data-a="editP"]').click();
    await page.locator('select[data-f="p.pos"]').selectOption(pos);
    if (name === "Golcü Gökhan" || name === "Orta Ömer") await page.locator('[data-a="rate"][data-v="5"]').click();
    if (name === "Bek Bülent") await page.locator('[data-a="rate"][data-v="2"]').click();
    if (name === "Forvet Fırat") {
      await page.locator('input[data-f="p.phone"]').fill("0555 000 00 01");
      await page.locator('input[data-f="p.phone"]').dispatchEvent("change");
    }
    await page.locator('[data-a="editP"][aria-expanded="true"]').click();
  }
  // Bir oyuncuyu pasif yap
  {
    const row = page.locator("#list-roster li.prow").filter({ has: page.locator("strong", { hasText: /^Veli Vural$/ }) });
    await row.locator('[data-a="editP"]').click();
    await page.locator('[data-a="active"]').click();
    await page.locator('[data-a="editP"][aria-expanded="true"]').click();
  }

  // 1. maç: katılım, misafir, takımlar, ödeme, muafiyet, sonuç
  await page.locator('[data-a="tab"][data-v="match"]').click();
  await page.locator('[data-a="newMatch"]').first().click();
  await page.locator('select[data-f="m.format"]').selectOption("6");
  const ins = ["Kaleci Kemal", "Eldiven Ercan", "Defans Doğan", "Stoper Şükrü", "Bek Bülent", "Orta Ömer",
    "Pasör Polat", "Çalımcı Çağrı", "İlker İleri", "Forvet Fırat", "Golcü Gökhan", "Ümit Uydurma", "Ozan Örnek", "Irmak Iğdır"];
  for (const n of ins) await attendance(page, n, "in");
  await attendance(page, "Zeki Zorlu", "maybe");
  await attendance(page, "Ali Aslan", "late");
  await page.locator("#guestName").fill("Misafir Mert");
  await page.locator("#guestPos").selectOption("MID");
  await page.locator('[data-a="addGuest"]').click();
  await page.locator('[data-a="goTeams"]').click();
  await page.locator('[data-a="gen"]').click();
  await page.locator('[data-a="tab"][data-v="pay"]').click();
  await page.locator('.payrow', { hasText: "Defans Doğan" }).locator('[data-a="paid"]').click();
  await page.locator('.payrow', { hasText: "Orta Ömer" }).locator('[data-a="paid"]').click();
  await page.locator('.payrow', { hasText: "Ali Aslan" }).locator('[data-a="exempt"]').click();
  await page.locator('[data-a="tab"][data-v="match"]').click();
  await page.locator("#scA").fill("7");
  await page.locator("#scB").fill("5");
  await page.locator('[data-a="finish"]').click();

  // 2. maç (açık): farklı saha, birkaç katılım, bir kişi ödemiş
  await page.locator('[data-a="newMatch"]').first().click();
  const fieldSel = page.locator('select[data-f="m.fieldId"]');
  const opts = await fieldSel.locator("option").allTextContents();
  const camlik = opts.findIndex((o) => o.includes("Çamlık"));
  await fieldSel.selectOption({ index: camlik });
  for (const n of ["Kaleci Kemal", "Golcü Gökhan", "Orta Ömer", "Forvet Fırat"]) await attendance(page, n, "in");
  await attendance(page, "Bek Bülent", "out");
  await page.locator('[data-a="tab"][data-v="pay"]').click();
  await page.locator('.payrow', { hasText: "Golcü Gökhan" }).locator('[data-a="paid"]').click();

  // 3. maç: iptal edilmiş
  await page.locator('[data-a="tab"][data-v="match"]').click();
  await page.locator('[data-a="newMatch"]').first().click();
  await attendance(page, "Kaleci Kemal", "in");
  await page.locator('[data-a="cancelMatch"]').click();
  await page.locator('[data-a="cancelMatch"]').click();

  // Yedeği kopyala
  await page.locator('[data-a="tab"][data-v="settings"]').click();
  await page.locator('[data-a="export"]').click();
  return await page.locator("#mtext").inputValue();
}
