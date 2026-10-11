/**
 * Cihazlar arası eşitleme, gerçek Firebase emülatörlerine karşı iki ayrı
 * tarayıcıyla (telefon ve bilgisayar). Uydurma isimler ve e-postalar.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importBackupText, noHorizontalScroll, stubGoogle, watchErrors } from "./helpers";

const V2 = readFileSync(resolve("tests/fixtures/backup-v2-legacy.json"), "utf8");
const PW = "deneme123";
const uniq = () => "org" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + "@example.com";

async function device(browser: Browser, kind: "phone" | "pc"): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext(
    kind === "phone"
      ? { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 } },
  );
  // Ağı kısıtlı yerel ortamda (NO_GOOGLE_APIS=1) Google betikleri boş yanıtlanır: Ayarlar'da önceden
  // kurulan Google altyapısının engellenen isteği konsola hata düşürmesin (CI'da gerçek betikler yüklenir).
  if (process.env.NO_GOOGLE_APIS) await stubGoogle(ctx);
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
  // Kendi isteğiyle çıkan cihaz "oturum kapandı" uyarısı görmez.
  await a.page.reload();
  await expect(a.page.locator("#list-roster")).toBeVisible();
  await expect(a.page.locator("#banner")).not.toContainText("Eşitleme durdu");

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

test("oturum çıkış yapılmadan kapanırsa (ör. hesap başka yerden silindi) cihaz uyarır; veriler cihazda kalır", async ({ browser }) => {
  const email = uniq();
  const d = await device(browser, "phone");
  await importBackupText(d.page, V2);
  await emailAuth(d.page, email, "up");
  const names = await rosterNames(d.page);

  // Hesap başka bir yerden geçersiz kılınır (şifre değişimi, hesap silme gibi): oturum açılışta düşer.
  const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
  const post = (path: string, body: unknown) =>
    fetch(`${AUTH}/${path}?key=demo-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ idToken?: string }>);
  const { idToken } = await post("accounts:signInWithPassword", { email, password: PW, returnSecureToken: true });
  await post("accounts:delete", { idToken });
  await d.page.reload();

  const banner = d.page.locator("#banner");
  await expect(banner).toContainText("Eşitleme durdu: oturum kapandı", { timeout: 20_000 });
  await expect(banner).not.toContainText("Verilerin her cihazında olsun"); // davet yerine uyarı
  expect((await rosterNames(d.page)).sort()).toEqual([...names].sort());
  await d.page.goto("/#/settings");
  await expect(d.page.locator("#sync-status")).toContainText("Oturum kapandı");

  // Yeniden giriş yapınca uyarı kalkar, eşitleme sürer.
  await emailAuth(d.page, uniq(), "up");
  await d.page.goto("/#/players");
  await expect(banner).not.toContainText("Eşitleme durdu");
  // Silinmiş hesabın doğrulanması tarayıcıda bir 400 yanıtı olarak görünür; bu senaryonun beklenen parçası.
  expect(d.errors.filter((e) => !/status of 400/.test(e))).toEqual([]);
  await d.ctx.close();
});

/** Emülatörün yardımcı çerçevesinin (iframe) iç durumu (tanı için). */
async function helperState(page: Page): Promise<string> {
  const fr = page.frames().find((f) => f.url().includes("/emulator/auth/iframe"));
  if (!fr) return "yardımcı çerçeve yok";
  return Promise.race([
    fr
      .evaluate(() => {
        const w = window as unknown as { gapi?: unknown; parentContainer?: unknown; storageKey?: unknown };
        return JSON.stringify({
          readyState: document.readyState,
          inlineScript: typeof w.storageKey,
          gapi: typeof w.gapi,
          parentContainer: !!w.parentContainer,
          htmlLength: document.documentElement?.outerHTML.length ?? 0,
          resources: performance.getEntriesByType("resource").map((e) => e.name.slice(0, 70)),
          sessionStorage: Object.keys(sessionStorage),
        });
      })
      .catch((err) => "değerlendirilemedi: " + String(err).slice(0, 160)),
    new Promise<string>((r) => setTimeout(() => r("değerlendirme zaman aşımı"), 3_000)),
  ]);
}

/**
 * Emülatörün sahte Google penceresiyle giriş.
 *
 * Emülatörün penceresi sonucu sayfadaki yardımcı çerçeveye (iframe) gönderir; çerçeve Google'ın betiğini
 * (apis.google.com) yükleyip hazır olmadan sonucu uygulamaya iletemez. Pencere, çerçeve yüklenirken açılınca
 * CI'da çerçevenin belgesi hiç yüklenmiyordu (belge boş, pencere açık kalıyor). Uygulama artık çerçeveyi
 * Ayarlar'daki bölüm açılınca kurar; test de bir insan gibi çerçeve hazır olduktan sonra dokunur. Yine de
 * olmazsa, kullanıcının yapacağı gibi pencereyi kapatıp sayfayı yeniler ve yeniden dener; başarısız her
 * denemenin tanısı CI kaydına yazılır. Hiçbir deneme başarılı olmazsa test başarısız olur.
 */
async function googleSignIn(page: Page, gmail: string): Promise<void> {
  const logs: string[] = [];
  const short = (u: string) => u.replace(/\?.*$/, "").slice(0, 90);
  const ctx = page.context();
  const interesting = (u: string) => /9099\/emulator|google|unpkg/.test(u);
  const from = (r: { frame(): { url(): string } }) => {
    try {
      return short(r.frame().url());
    } catch {
      return "?";
    }
  };
  ctx.on("request", (r) => interesting(r.url()) && logs.push("istek: " + short(r.url()) + " ← " + from(r)));
  ctx.on("requestfinished", (r) => interesting(r.url()) && logs.push("bitti: " + short(r.url())));
  ctx.on("requestfailed", (r) => logs.push("İSTEK BAŞARISIZ: " + short(r.url()) + " " + (r.failure()?.errorText || "")));
  ctx.on("console", (m) => logs.push("konsol " + m.type() + ": " + m.text().slice(0, 200)));
  ctx.on("weberror", (e) => logs.push("HATA: " + e.error().message));
  ctx.on("dialog", (dlg) => {
    logs.push("UYARI PENCERESİ (" + dlg.type() + "): " + dlg.message());
    dlg.dismiss().catch(() => undefined);
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    logs.push("--- " + attempt + ". deneme");
    if (attempt > 1) await page.reload();
    await page.goto("/#/settings");
    // Bölüm açılınca giriş modülü önceden yüklenir; kullanıcı gibi o yüklendikten sonra dokun.
    await page.waitForFunction(() => performance.getEntriesByType("resource").some((r) => r.name.includes("/assets/auth-")));
    // Uygulama Google altyapısını (yardımcı çerçeve) bölüm açılınca kurar; insan dokunana dek hazır olur.
    const ready = async () => (await helperState(page)).includes('"parentContainer":true');
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000 && !(await ready())) await page.waitForTimeout(250);
    logs.push("yardımcı çerçeve, dokunmadan önce (" + (Date.now() - t0) + " ms): " + (await helperState(page)));
    const popupP = page.waitForEvent("popup");
    await page.locator('#sync-sec [data-a="syncGoogle"]').click();
    const popup = await popupP;
    popup.on("close", () => logs.push("pencere kapandı"));
    await popup.waitForLoadState();
    await popup.getByText(/Add new account/i).click();
    await popup.locator("#email-input").fill(gmail);
    await popup.locator("#display-name-input").fill("Google Deneme");
    if (await ready()) {
      for (let i = 0; i < 4 && !popup.isClosed(); i++) {
        await popup.locator("#sign-in").click({ timeout: 5_000 }).catch(() => undefined);
        await popup.waitForEvent("close", { timeout: 3_000 }).catch(() => undefined);
      }
      const ok = await expect(page.locator("#sync-sec"))
        .toContainText(gmail, { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        if (attempt > 1) console.log("Google girişi " + attempt + ". denemede oldu. Önceki denemelerin tanısı:\n" + logs.join("\n"));
        else console.log("Google girişi ilk denemede oldu · " + logs.filter((l) => l.includes("dokunmadan önce")).map((l) => l.slice(0, 60)).join(" · "));
        await synced(page);
        return;
      }
    }
    logs.push("durum: " + (await page.locator("#sync-status").textContent()) + " · toast: " + (await page.locator("#toast").textContent()));
    if (!popup.isClosed()) {
      logs.push("pencere açık: " + short(popup.url()) + " · " + (await popup.locator("body").innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 200));
      await popup.close().catch(() => undefined);
    }
  }
  const body = logs.join("\n");
  await test.info().attach("google-giris-tani", { body, contentType: "text/plain" });
  console.log(body);
  throw new Error("Google ile giriş 3 denemede de tamamlanmadı (tanı: google-giris-tani)");
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
