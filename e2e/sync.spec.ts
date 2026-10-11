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
  // Ayarlar'da eşitleme bölümü zaten görünür; şerit ana ekranda çıkar.
  await expect(phone.page.locator("#banner")).not.toContainText("Verilerin her cihazında olsun");
  await phone.page.locator('#tabs [data-v="match"]').click();
  await expect(phone.page.locator("#banner")).toContainText("Verilerin her cihazında olsun");
  await emailAuth(phone.page, email, "up");
  await expect(phone.page.locator("#hero #sync")).toContainText("Eşitlendi");
  await phone.page.locator('#tabs [data-v="match"]').click();
  await expect(phone.page.locator("#banner")).not.toContainText("Verilerin her cihazında olsun");
  await noHorizontalScroll(phone.page);
  const phoneNames = await rosterNames(phone.page);
  expect(phoneNames.length).toBeGreaterThan(3);

  // Bilgisayar: boş açılır, "başka cihazda mı?" şeridi çıkar; giriş yapınca aynı kadro gelir.
  await pc.page.goto("/");
  await expect(pc.page.locator("#banner")).toContainText("Verilerin başka bir cihazda mı?");
  await pc.page.locator('#banner [data-a="nav"][data-v="settings"]').click();
  await expect(pc.page.locator("#sync-sec")).toBeVisible();
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

test("yazı yazılırken gelen değişiklik yazılanı silmez; yazı bitince uygulanır", async ({ browser }) => {
  const email = uniq();
  const phone = await device(browser, "phone");
  const pc = await device(browser, "pc");
  await importBackupText(phone.page, V2);
  await emailAuth(phone.page, email, "up");
  await emailAuth(pc.page, email, "in");

  // Bilgisayarda yeni oyuncu adı yazılıyor (henüz eklenmedi)
  await pc.page.goto("/#/players");
  await pc.page.locator("#newName").fill("Yarım Kalan");
  // Bu sırada telefonda başka bir oyuncu eklenir ve gönderilir
  await phone.page.goto("/#/players");
  await phone.page.locator("#newName").fill("Telefondan Gelen");
  await phone.page.locator('[data-a="addPlayer"]').click();
  await phone.page.goto("/#/settings");
  await synced(phone.page);
  // Bilgisayar öne gelir (eşitleme tetiklenir): yazılan metin yerinde kalır
  await pc.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await pc.page.waitForTimeout(2500);
  await expect(pc.page.locator("#newName")).toHaveValue("Yarım Kalan");
  // Yazı tamamlanıp eklenince bekleyen değişiklik de uygulanır
  await pc.page.locator('[data-a="addPlayer"]').click();
  await expect.poll(async () => (await pc.page.locator("#list-roster li .plink").allTextContents()).map((x) => x.trim()), { timeout: 20_000 }).toEqual(expect.arrayContaining(["Yarım Kalan", "Telefondan Gelen"]));
  await pc.page.goto("/#/settings");
  await synced(pc.page);
  await syncNow(phone.page);
  expect(await rosterNames(phone.page)).toEqual(expect.arrayContaining(["Yarım Kalan", "Telefondan Gelen"]));
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

/**
 * Emülatörün sahte Google penceresiyle giriş. Başarısız olursa tanı için tarayıcı ve pencere
 * kayıtlarını, başarısız istekleri ve pencerenin son hâlini rapora ekler.
 */
async function googleSignIn(page: Page, gmail: string): Promise<void> {
  const logs: string[] = [];
  const watch = (p: Page, tag: string) => {
    p.on("console", (m) => logs.push(tag + " " + m.type() + ": " + m.text()));
    p.on("requestfailed", (r) => logs.push(tag + " İSTEK BAŞARISIZ: " + r.url() + " " + (r.failure()?.errorText || "")));
    p.on("pageerror", (e) => logs.push(tag + " HATA: " + e.message));
    p.on("requestfinished", (r) => {
      if (!r.url().includes("apis.google.com")) return;
      let from = "";
      try {
        from = r.frame().url().slice(0, 60);
      } catch {
        /* çerçevesiz istek */
      }
      logs.push(tag + " yüklendi: " + r.url().slice(0, 90) + " ← " + from);
    });
    p.on("framenavigated", (f) => f === p.mainFrame() && logs.push(tag + " → " + f.url()));
  };
  watch(page, "sayfa");
  page.on("dialog", (dlg) => {
    logs.push("UYARI PENCERESİ (" + dlg.type() + "): " + dlg.message());
    dlg.dismiss().catch(() => undefined);
  });
  // Firebase'in iletişim çerçevesi ve emülatörün yardımcı çerçevesi Google'ın betiklerini
  // (apis.google.com) yükler. CI'da tarayıcının bu isteklerinden biri arada bir hiç bitmiyor ve giriş
  // sonucu uygulamaya ulaşamıyordu. Bu istekler tarayıcı yerine Playwright üzerinden, zaman aşımı ve
  // yeniden denemeyle yapılır; uygulamanın ve Google betiklerinin davranışı aynı kalır.
  await page.context().route("https://apis.google.com/**", async (route) => {
    for (let i = 1; i <= 4; i++) {
      try {
        const response = await route.fetch({ timeout: 4_000 });
        if (i > 1) logs.push("Google betiği " + i + ". denemede yüklendi: " + route.request().url().slice(0, 90));
        await route.fulfill({ response });
        return;
      } catch (err) {
        logs.push("Google betiği yüklenemedi (" + i + "): " + route.request().url().slice(0, 90) + " " + String(err).slice(0, 80));
      }
    }
    await route.abort().catch(() => undefined);
  });
  await page.goto("/#/settings");
  // Bölüm açılınca giriş modülü önceden yüklenir; kullanıcı gibi o yüklendikten sonra dokun.
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((r) => r.name.includes("/assets/auth-")));
  const popupP = page.waitForEvent("popup");
  await page.locator('#sync-sec [data-a="syncGoogle"]').click();
  const popup = await popupP;
  watch(popup, "pencere");
  popup.on("close", () => logs.push("pencere KAPANDI"));
  await popup.waitForLoadState();
  await popup.getByText(/Add new account/i).click();
  await popup.locator("#email-input").fill(gmail);
  await popup.locator("#display-name-input").fill("Google Deneme");
  // Emülatörün penceresi sonucu sayfadaki yardımcı çerçeveye (iframe) gönderir; çerçeve Google'ın
  // betiği yüklenip hazır olmadan sonucu uygulamaya iletemez. İnsan hesap seçerken çerçeve çoktan
  // hazır olur; test insan hızının çok üstünde olduğu için önce çerçevenin hazır olmasını bekler.
  await expect.poll(() => page.frames().some((f) => f.url().includes("/emulator/auth/iframe")), { timeout: 15_000 }).toBe(true);
  const helper = page.frames().find((f) => f.url().includes("/emulator/auth/iframe"))!;
  const ready = () =>
    Promise.race([
      helper.evaluate(() => !!(window as unknown as { parentContainer?: unknown }).parentContainer).catch(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(false), 2_000)),
    ]);
  const t0 = Date.now();
  while (Date.now() - t0 < 20_000 && !(await ready())) await page.waitForTimeout(250);
  logs.push("yardımcı çerçeve " + ((await ready()) ? "hazır" : "HAZIR DEĞİL") + " (" + (Date.now() - t0) + " ms)");
  // Sonuç iletilemezse pencere açık kalır; kullanıcı gibi birkaç saniye arayla yeniden gönderilir
  // (başarısız deneme emülatörde hesap oluşturmaz).
  for (let i = 0; i < 6 && !popup.isClosed(); i++) {
    await popup.locator("#sign-in").click({ timeout: 5_000 }).catch(() => undefined);
    await popup.waitForEvent("close", { timeout: 3_000 }).catch(() => undefined);
  }
  try {
    await expect(page.locator("#sync-sec")).toContainText(gmail, { timeout: 25_000 });
  } catch (e) {
    let pop = "pencere kapalı";
    if (!popup.isClosed()) {
      const seen = await popup
        .evaluate(() => {
          const o = window.opener as Window | null;
          if (!o) return "opener yok";
          const out: string[] = ["opener çerçeve sayısı: " + o.frames.length];
          for (let i = 0; i < o.frames.length; i++) {
            try {
              out.push(i + ": " + o.frames[i].location.href);
            } catch (err) {
              out.push(i + ": erişilemedi (" + String(err).slice(0, 80) + ")");
            }
          }
          return out.join("\n");
        })
        .catch((err) => "değerlendirilemedi: " + String(err).slice(0, 200));
      pop = "pencere açık: " + popup.url() + "\n" + seen + "\n" + (await popup.locator("body").innerText().catch(() => "?")).slice(0, 600);
    }
    pop += "\nsayfa çerçeveleri: " + page.frames().map((f) => f.url()).join(" | ");
    const fr = page.frames().find((f) => f.url().includes("/emulator/auth/iframe"));
    if (fr) {
      pop += "\nçerçeve durumu: " + (await fr
        .evaluate(() => {
          const w = window as unknown as { gapi?: unknown; parentContainer?: unknown };
          return JSON.stringify({ gapi: typeof w.gapi, parentContainer: !!w.parentContainer, sessionStorage: Object.keys(sessionStorage) });
        })
        .catch((err) => "değerlendirilemedi: " + String(err).slice(0, 200)));
    }
    const body = [logs.join("\n"), "toast: " + (await page.locator("#toast").textContent()), "durum: " + (await page.locator("#sync-status").textContent()), pop].join("\n\n");
    await test.info().attach("google-giris-tani", { body, contentType: "text/plain" });
    console.log(body);
    throw e;
  }
  await synced(page);
}

test("Google ile giriş (boş cihaz), şifre belirleyip başka cihazda e-postayla aynı hesaba giriş", async ({ browser }) => {
  // Firebase giriş penceresi apis.google.com'dan yüklenir; ağı kısıtlı yerel ortamlarda NO_GOOGLE_APIS=1 ile atlanır (CI'da çalışır).
  test.skip(!!process.env.NO_GOOGLE_APIS, "apis.google.com erişilemiyor");
  const gmail = "google." + uniq();
  const d = await device(browser, "pc");
  await googleSignIn(d.page, gmail);
  // Girişten sonra yedek yüklenir: buluta gider
  await importBackupText(d.page, V2);
  await d.page.goto("/#/settings");
  await synced(d.page);
  // Google hesabına şifre eklenir (iPhone ana ekran uygulaması için)
  await d.page.locator('details[data-keep="syncPw"] summary').click();
  await d.page.locator("#sync-newpw").fill("yenisifre1");
  await d.page.locator('[data-a="syncSetPw"]').click();
  await expect(d.page.locator("#toast")).toContainText("Şifre kaydedildi", { timeout: 15_000 });
  await expect(d.page.locator('details[data-keep="syncPw"]')).toHaveCount(0);
  const names = await rosterNames(d.page);
  expect(names.length).toBeGreaterThan(3);

  // Başka bir cihazda (iPhone gibi) aynı e-posta ve şifreyle: aynı hesap, aynı veriler.
  const phone = await device(browser, "phone");
  await page_emailIn(phone.page, gmail, "yenisifre1");
  expect((await rosterNames(phone.page)).sort()).toEqual([...names].sort());
  expect(d.errors).toEqual([]);
  expect(phone.errors).toEqual([]);
  await d.ctx.close();
  await phone.ctx.close();
});

test("yedek yüklendikten sonra Google ile giriş (organizatörün bilgisayardaki akışı)", async ({ browser }) => {
  test.skip(!!process.env.NO_GOOGLE_APIS, "apis.google.com erişilemiyor");
  const gmail = "google." + uniq();
  const d = await device(browser, "pc");
  await importBackupText(d.page, V2);
  const names = await rosterNames(d.page);
  await googleSignIn(d.page, gmail);
  // Cihazdaki veri buluta gider; başka cihaz aynı hesapla (Google oturumu yok, yeni bağlam) görmez ama
  // bu cihazda veriler yerinde kalır
  expect((await rosterNames(d.page)).sort()).toEqual([...names].sort());
  expect(d.errors).toEqual([]);
  await d.ctx.close();
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
