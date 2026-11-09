/** Uygulama geneli: konsol hatası yok, 360 px düzen, çevrimdışı çalışma, yüklenebilirlik, Geri al. */
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deadZones, importBackupText, noHorizontalScroll, test, watchErrors } from "./helpers";

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
      await page.locator(`#view [data-a="nav"][data-v="${sub}"]`).click();
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
  // Kayıt IndexedDB'ye yazılmadan sayfa yenilenirse yazma yarıda kalabilir; yazıldığını gör, sonra yenile.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((res) => {
        const q = indexedDB.open("halisaha");
        q.onerror = () => res(false);
        q.onsuccess = () => {
          const db = q.result;
          const g = db.transaction("kv").objectStore("kv").get("state");
          g.onsuccess = () => {
            res(JSON.stringify(g.result || {}).includes("Çevrimdışı Çetin"));
            db.close();
          };
          g.onerror = () => res(false);
        };
      }),
  );

  await context.setOffline(true);
  // İnternet yokken Google'ın giriş betiği hiç istenmemeli (her deneme konsola hata düşürür).
  const offlineGoogle: string[] = [];
  page.on("request", (r) => r.url().includes("apis.google.com") && offlineGoogle.push(r.url()));
  await page.reload();
  await expect(page.locator("#hero")).toContainText("Çevrimdışı");
  await page.locator('#tabs [data-v="players"]').click();
  await expect(page.locator("#list-roster")).toContainText("Çevrimdışı Çetin");
  await page.goto("/#/teams");
  await expect(page.locator('#tabs [data-v="teams"]')).toHaveAttribute("aria-current", "page");
  await page.goto("/#/settings");
  await expect(page.locator("#sync-status")).toContainText("Giriş yapılmadı");
  // Ayar değişince sayfa yeniden çizilir; her çizimde de Google betiği denenmemeli.
  await page.locator('select[data-f="s.theme"]').selectOption("dark");
  await page.locator('select[data-f="s.theme"]').selectOption("light");
  await expect(page.locator("#sync-status")).toContainText("Giriş yapılmadı");
  expect(offlineGoogle).toEqual([]);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("iPhone ana ekran uygulaması: Google düğmesi yerine ne yapılacağı yazar, e-posta formu açık gelir", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  await ctx.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const google: string[] = [];
  page.on("request", (r) => r.url().includes("apis.google.com") && google.push(r.url()));
  await page.goto("/#/settings");
  const sec = page.locator("#sync-sec");
  await expect(sec).toContainText("Ana ekrandaki uygulamada Google ile giriş açılmıyor");
  await expect(sec.locator('[data-a="syncGoogle"]')).toHaveCount(0);
  await expect(sec.locator('details[data-keep="syncEmail"]')).toHaveAttribute("open", "");
  await expect(page.locator("#sync-email")).toBeVisible();
  await noHorizontalScroll(page);
  // Bağlantı gidip gelince de Google altyapısı burada kurulmaz (düğme yok).
  await ctx.setOffline(true);
  await ctx.setOffline(false);
  await page.waitForTimeout(500);
  expect(google).toEqual([]);
  expect(errors).toEqual([]);
  await ctx.close();
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

test("WhatsApp listesi yapıştırılınca katılım tek seferde işaretlenir; önce önizlenir, geri alınabilir", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator('[data-a="newEvent"]').first().click();
  await page.locator('[data-a="createEvent"][data-v="football"]').click();
  await expect(page.locator("#modal")).toBeHidden();
  await page.locator('[data-a="pasteList"]').click();
  await page.locator("#plist").fill([
    "⚽ Perşembe 15.10 – 21:00", "📍 Yeşil Vadi Halı Saha", "",
    "1. Kaleci Kemal 🧤", "2. orta ömer", "3. İlker İleri", "4. DEFANS DOĞAN", "5. Mehmet Yeni", "6. Eldivn Ercan", "7. ", "",
    "⏳ Yedek: Zeki Zorlu", "🤔 Belki: Ali Aslan",
  ].join("\n"));
  await page.locator('[data-a="pastePreview"]').click();
  await expect(page.locator("#modal")).toContainText("8 isim bulundu");
  await expect(page.locator("#pr-2")).toHaveValue("skip"); // İlker İleri borçlu (Kural 2.4)
  await expect(page.locator("label.fld", { has: page.locator("#pr-2") })).toContainText("borçlu");
  await expect(page.locator("#pr-4")).toHaveValue("guest"); // kayıtlı değil
  await page.locator("#pr-5").selectOption({ label: "Eldiven Ercan" }); // yazım hatası elle düzeltilir
  await noHorizontalScroll(page);
  await page.locator('[data-a="pasteApply"]').click();
  await expect(page.locator("#toast")).toContainText("Listeden 7 kişi işaretlendi");
  await expect(page.locator(".counts .count").first()).toContainText("6");
  const rows = page.locator("#list-att li");
  await expect(rows.nth(0)).toContainText("Kaleci Kemal");
  await expect(rows.nth(2)).toContainText("Defans Doğan");
  await expect(rows.nth(3)).toContainText("Mehmet Yeni");
  await expect(rows.nth(4)).toContainText("Eldiven Ercan");
  await expect(rows.nth(5)).toContainText("Zeki Zorlu");
  await expect(page.locator("#list-att li", { hasText: "Ali Aslan" }).locator('[data-s="maybe"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#list-att li", { hasText: "İlker İleri" }).locator('[data-s="in"]')).toHaveAttribute("aria-pressed", "false");
  // Geri al: hepsi eski hâline döner
  await page.locator("[data-toast-act]").click();
  await expect(page.locator(".counts .count").first()).toContainText("0");
  await expect(page.locator("#list-att li", { hasText: "Mehmet Yeni" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("maç sonu: sonucu girilmemiş maç uyarısı, Ödemeler'de biten maç, sonuç ve iptal duyurusu paylaşımı", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    navigator.share = async (d?: ShareData) => {
      (window as unknown as { __shared: unknown[] }).__shared.push(d);
    };
  });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  const banner = page.locator("#banner");
  await page.locator('#tabs [data-v="match"]').click();
  await expect(banner).not.toContainText("Sonuç bekleniyor");
  // Ertesi sabah: 15 Ekim 21:00 maçı bitirilmedi (tarayıcının saat diliminden bağımsız olarak 3 saatten fazla geçti)
  await page.clock.setSystemTime(new Date("2026-10-16T10:00:00+03:00"));
  await page.locator('#tabs [data-v="players"]').click();
  await expect(banner).toContainText("Sonuç bekleniyor");
  await expect(banner).toContainText("Perşembe 15.10 21:00");
  await noHorizontalScroll(page);
  await banner.locator('[data-a="openResult"]').click();
  await expect(page.locator(".chip.on")).toContainText("15.10");
  // Organizatör arada geçen haftanın ödemelerine bakar, sonra maçı bitirir
  await page.locator('#tabs [data-v="pay"]').click();
  const lastWeek = await page.locator('[data-f="payId"] option', { hasText: "13.10" }).getAttribute("value");
  await page.locator('[data-f="payId"]').selectOption(lastWeek!);
  await page.locator('#tabs [data-v="match"]').click();
  await expect(page.locator(".chip.on")).toContainText("15.10");
  await page.locator("#scA").fill("3");
  await page.locator("#scB").fill("2");
  await page.locator('[data-a="finish"]').click();
  await expect(page.locator("#toast")).toContainText("Maç kaydedildi");
  await expect(banner).not.toContainText("Sonuç bekleniyor");
  // Ödemeler biten maçı açar: paylar kesinleşti
  await page.locator('#tabs [data-v="pay"]').click();
  await expect(page.locator('[data-f="payId"] option:checked')).toContainText("15.10");
  await expect(page.locator('[data-f="payId"] option:checked')).toContainText("Oynandı");
  // Geçmişten sonuç: önce önizlenir, sonra paylaşılır
  await page.locator('#tabs [data-v="match"]').click();
  await page.locator(".hist", { hasText: "15.10" }).locator('[data-a="msgPreview"][data-k="result"]').click();
  await expect(page.locator("#mtext")).toHaveValue(/^🏁 Maç sonucu – Perşembe 15\.10/);
  await expect(page.locator("#mtext")).toHaveValue(/Sarılar 3 – 2 Turuncular/);
  await page.locator('[data-a="shareSheet"]').click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { text: string }[] }).__shared);
  expect(shared.at(-1)?.text).toContain("Tatlı Turuncular takımından");
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).toBeHidden();
  // Günü gelmemiş iptal edilmiş maçın duyurusu: geçmişten ve Duyurular'dan
  const gone = page.locator(".hist", { hasText: "20.10" });
  await expect(gone).toContainText("İptal");
  await gone.locator('[data-a="msgPreview"][data-k="cancel"]').click();
  await expect(page.locator("#mtext")).toHaveValue(/^❌ İPTAL – Salı 20\.10 21:00 maçı/);
  await page.keyboard.press("Escape");
  await page.goto("/#/announce");
  await expect(page.locator('[data-f="ann.cancel"] option:checked')).toContainText("20.10");
  await expect(page.locator('[data-f="ann.cancel"] option:checked')).toContainText("İptal");
  await noHorizontalScroll(page);
  // Şablon düzenleyicide sonuç önizlemesi son oynanan maçla
  await page.goto("/#/settings");
  await page.locator('[data-a="tplEdit"][data-k="result"]').click();
  await expect(page.locator("#tpl-preview")).toContainText("Sarılar 3 – 2 Turuncular");
  await page.keyboard.press("Escape");
  // Günü geçen iptal edilmiş maç artık duyurulmaz
  await page.clock.setSystemTime(new Date("2026-10-22T10:00:00+03:00"));
  await page.goto("/#/match");
  await expect(page.locator(".hist", { hasText: "20.10" })).toContainText("İptal");
  await expect(page.locator(".hist", { hasText: "20.10" }).locator('[data-k="cancel"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("misafir: getiren sorumlu; borcu getirenin engeline sayılır, hatırlatma misafirin adıyla, ihlalde getirene 1.8 kaydı (Kural 1.8)", async ({ page }) => {
  const errors = watchErrors(page);
  await importBackupText(page, V2);
  await page.locator('#tabs [data-v="match"]').click();
  const rows = page.locator("#list-att li");
  // Önceki misafir adıyla önerilir; yazılınca önceki mevkii gelir (borcu yok, sorulmaz)
  await expect(page.locator('#guestPrev option[value="Misafir Mert"]')).toHaveCount(1);
  await page.locator("#guestName").fill("misafir mert");
  await expect(page.locator("#guestPos")).toHaveValue("MID");
  await page.locator('[data-a="addGuest"]').click();
  await expect(rows.filter({ hasText: "misafir mert" })).toHaveCount(1);
  await expect(page.locator("#guestPrev option")).toHaveCount(0);
  // Getireniyle yeni misafir
  await page.locator("#guestName").fill("Konuk Kaan");
  await page.locator("#guestHost").selectOption({ label: "Getiren: Zeki Zorlu" });
  await page.locator('[data-a="addGuest"]').click();
  await expect(rows.filter({ hasText: "Konuk Kaan" })).toHaveCount(1);
  await noHorizontalScroll(page);
  // Maç oynandı, misafir payını ödemedi
  await page.clock.setSystemTime(new Date("2026-10-16T10:00:00+03:00"));
  await page.locator('#tabs [data-v="players"]').click();
  await page.locator('#banner [data-a="openResult"]').click();
  await page.locator("#scA").fill("1");
  await page.locator("#scB").fill("0");
  await page.locator('[data-a="finish"]').click();
  await expect(page.locator(".chip.on")).toContainText("22.10");
  // Getiren sıradaki maça yazılırken sorulur (Kural 2.4, 1.8)
  await rows.filter({ hasText: "Zeki Zorlu" }).locator('[data-s="in"]').click();
  await expect(page.locator("#toast")).toContainText("Zeki Zorlu: borçlu");
  await expect(page.locator("#toast")).toContainText("misafiri Konuk Kaan");
  await expect(page.locator("#toast")).toContainText("Kural 2.4, 1.8");
  await expect(rows.filter({ hasText: "Zeki Zorlu" }).locator('[data-s="in"]')).toHaveAttribute("aria-pressed", "false");
  await expect(rows.filter({ hasText: "Zeki Zorlu" })).toContainText("borçlu");
  // Aynı misafir yeniden getirilirken getireni kendiliğinden gelir; ödenmemiş payı sorulur (12.1)
  await page.locator("#guestName").fill("Konuk Kaan");
  await expect(page.locator("#guestHost option:checked")).toHaveText("Getiren: Zeki Zorlu");
  await page.locator('[data-a="addGuest"]').click();
  await expect(page.locator("#toast")).toContainText("Konuk Kaan: önceki gelişinden");
  await expect(page.locator("#toast")).toContainText("(Zeki Zorlu misafiri) · Kural 1.8, 2.4");
  await expect(rows.filter({ hasText: "Konuk Kaan" })).toHaveCount(0);
  await page.locator("[data-toast-act]").click();
  await expect(rows.filter({ hasText: "Konuk Kaan" })).toHaveCount(1);
  // Hatırlatma getirene, misafirin adıyla
  await page.locator('#tabs [data-v="players"]').click();
  await page.locator(".prow", { hasText: "Zeki Zorlu" }).locator('[data-a="editP"]').click();
  await page.locator('[data-f="p.phone"]').fill("0555 000 00 00");
  await page.locator('[data-f="p.phone"]').press("Tab");
  await page.locator('#tabs [data-v="pay"]').click();
  // Hem maçın ödeme listesinde hem biriken borçlarda
  for (const where of ["#view section:not([aria-labelledby])", 'section[aria-labelledby="h-debts"]']) {
    const remind = page.locator(where).locator(".payrow", { hasText: "Konuk Kaan" }).locator("a.linkbtn", { hasText: "Hatırlat" });
    await expect(remind).toHaveAttribute("href", /^https:\/\/wa\.me\/90555/);
    const href = decodeURIComponent((await remind.getAttribute("href")) || "");
    expect(href).toContain("Selam Zeki Zorlu, getirdiğin misafir Konuk Kaan için");
    expect(href).toContain("(Kural 1.8)");
  }
  // Misafire ihlal yazılınca getirene de 1.8 kaydı önerilir; tek kayıtla ikisi yazılır
  await page.goto("/#/discipline");
  await page.locator('[data-a="discNew"]').first().click();
  const mid = await page.locator('[data-f="disc.mid"] option', { hasText: "15.10" }).first().getAttribute("value");
  await page.locator('[data-f="disc.mid"]').selectOption(mid!);
  await page.locator('[data-f="disc.pid"]').selectOption({ label: "Konuk Kaan (misafir)" });
  const hostToggle = page.locator('[data-a="discHost"]');
  await expect(hostToggle).toHaveText("Getireni de kaydet: Zeki Zorlu · Uyarı (Kural 1.8)");
  await expect(hostToggle).toHaveAttribute("aria-pressed", "true");
  await noHorizontalScroll(page);
  await page.locator('[data-a="discSave"]').click();
  await expect(page.locator("#toast")).toContainText("getiren Zeki Zorlu için de 1.8 kaydı yazıldı");
  await expect(page.locator("#list-disc li")).toHaveCount(2);
  await expect(page.locator("#list-disc li", { hasText: "Zeki Zorlu" })).toContainText("Getirdiği misafirin ihlali");
  // Geri al: ikisi birden
  await page.locator("[data-toast-act]").click();
  await expect(page.locator("#list-disc li")).toHaveCount(0);
  expect(errors).toEqual([]);
});

/**
 * Önce mobil: 360 px'te her düğme, bağlantı ve alan en az 44 × 44 px dokunma alanı sunar.
 * Bir boyutu 44 px'ten küçük olan öğenin merkezinden 20 px öteye dokunulunca da o öğeye (ya da
 * bitişik başka bir dokunulabilir öğeye) denk gelinmeli; boşa giden dokunuş "ölü bölge"dir.
 * Kural metinlerinin içindeki satır içi bağlantılar (.rref) metnin parçasıdır, sayılmaz.
 */
test("dokunma alanları en az 44 px: hiçbir ekranda boşa giden dokunuş yok", async ({ page }) => {
  await importBackupText(page, V2);
  const dead = (where: string) => deadZones(page, where);
  const found: string[] = [];
  for (const r of ["match", "teams", "pay", "players", "more", "settings", "stats", "rules", "discipline", "announce"]) {
    await page.goto("/#/" + r);
    await expect(page.locator("#view")).not.toBeEmpty();
    found.push(...(await dead(r)));
  }
  // Bildirimdeki "Geri al"
  await page.goto("/#/pay");
  await page.locator('[data-a="allPaid"]').click();
  await expect(page.locator("[data-toast-act]")).toBeVisible();
  found.push(...(await dead("toast")));
  expect(found).toEqual([]);
});

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test("iPhone Safari'de veri varken ana ekrana eklemeden önce yedek ya da eşitleme hatırlatılır; bir kez kapatılır", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto("/#/match");
  // Veri yokken hatırlatma yok
  await expect(page.locator("#banner")).not.toContainText("Ana ekrana eklemeden önce");
  await importBackupText(page, V2);
  await page.goto("/#/match");
  const banner = page.locator("#banner .banner", { hasText: "Ana ekrana eklemeden önce" });
  await expect(banner).toContainText("Safari'deki verileri görmez");
  await expect(banner.locator('[data-a="shareBackup"]')).toBeVisible();
  await expect(banner.locator('[data-a="nav"][data-v="settings"]')).toBeVisible();
  // Eşitleme daveti ayrıca çıkmaz (bu şerit giriş yapmayı da önerir)
  await expect(page.locator("#banner")).not.toContainText("Verilerin her cihazında olsun");
  await noHorizontalScroll(page);
  // Kurulum anlatımı da uyarır
  await page.goto("/#/settings");
  await expect(page.locator('section[aria-labelledby="h-app"]')).toContainText("önce yedeği paylaş ya da eşitlemeye giriş yap");
  await page.goto("/#/match");
  await banner.locator('[data-a="iosMoveDismiss"]').click();
  await expect(page.locator("#banner")).not.toContainText("Ana ekrana eklemeden önce");
  // Kapatınca eşitleme daveti yerine gelir
  await expect(page.locator("#banner")).toContainText("Verilerin her cihazında olsun");
  await page.reload();
  await expect(page.locator("#view")).not.toBeEmpty();
  await expect(page.locator("#banner")).not.toContainText("Ana ekrana eklemeden önce");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("iPhone ana ekrandaki boş uygulama Safari'deki yedeği yüklemeyi önerir; eşitleme daveti ikinci şerit olarak çıkmaz", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE });
  await ctx.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto("/#/match");
  const banner = page.locator("#banner .banner", { hasText: "Safari'deki verilerin buraya gelmez" });
  await expect(banner).toBeVisible();
  await expect(banner.locator('[data-a="nav"][data-v="settings"]')).toBeVisible();
  await expect(page.locator("#banner")).not.toContainText("Verilerin başka bir cihazda mı?");
  await noHorizontalScroll(page);
  await banner.locator('[data-a="importOpen"]').click();
  await expect(page.locator("#mtext")).toBeVisible();
  await page.locator("#mtext").fill(V2);
  await page.locator('[data-a="doImport"]').click();
  await page.locator('[data-a="confirmImport"]').click();
  await expect(page.locator("#toast")).toContainText("Yedek yüklendi");
  // Veri geldi: şerit kalkar
  await expect(page.locator("#banner")).not.toContainText("Safari'deki verilerin buraya gelmez");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("iPhone dışında Safari/ana ekran hatırlatması çıkmaz", async ({ page }) => {
  await importBackupText(page, V2);
  await page.goto("/#/match");
  await expect(page.locator("#view")).not.toBeEmpty();
  await expect(page.locator("#banner")).not.toContainText("Ana ekrana eklemeden önce");
  await expect(page.locator("#banner")).not.toContainText("Safari'deki verilerin buraya gelmez");
});
