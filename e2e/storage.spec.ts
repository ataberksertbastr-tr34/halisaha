/**
 * Açılışta depolama hatası: IndexedDB açılamazsa organizatör uyarılır, değişiklikler acil kopyaya
 * yazılır; bir sonraki açılışta geri yüklenir. Veri daha yeni bir sürümle kaydedilmişse uygulama
 * hiçbir şey yazmadan "Önce güncelle" der.
 */
import { expect } from "@playwright/test";
import { test, watchErrors } from "./helpers";

test("IndexedDB açılamazsa uyarılır, girilenler kaybolmaz: sonraki açılışta geri yüklenir", async ({ context }) => {
  // Adreste ?broken varsa IndexedDB her açılışta hata verir (iPhone'daki "Connection to Indexed Database server lost" gibi)
  await context.addInitScript(() => {
    if (location.search.includes("broken")) {
      IDBFactory.prototype.open = function () {
        throw new DOMException("Connection to Indexed Database server lost", "UnknownError");
      };
    }
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto("/#/players");
  await page.locator("#newName").fill("Kalıcı Kerem");
  await page.locator('[data-a="addPlayer"]').click();
  await expect(page.locator("#list-roster li")).toHaveCount(1);

  const broken = await context.newPage();
  await broken.goto("/?broken=1#/players");
  const banner = broken.locator("#banner");
  await expect(banner).toContainText("Veriler asıl depoya yazılamıyor", { timeout: 15_000 });
  await broken.locator("#newName").fill("Acil Ayşe");
  await broken.locator('[data-a="addPlayer"]').click();
  await expect(broken.locator("#list-roster")).toContainText("Acil Ayşe");
  await broken.close();

  await page.reload();
  await expect(page.locator("#toast")).toContainText("geri yüklendi");
  await expect(page.locator("#list-roster")).toContainText("Acil Ayşe");
  await expect(page.locator("#banner")).not.toContainText("Veriler asıl depoya yazılamıyor");
  // Önceki hâl kilitli sürüm olarak durur
  await page.goto("/#/settings");
  await page.locator('[data-a="versions"]').click();
  await expect(page.locator("#modal")).toContainText("Kurtarma öncesi");
  expect(errors.filter((e) => !e.includes("Indexed Database"))).toEqual([]);
});

test("veri daha yeni bir sürümle kaydedilmişse 'Önce güncelle' ekranı; hiçbir şey yazılmaz", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/#/players");
  await page.locator("#newName").fill("Bugünkü Burak");
  await page.locator('[data-a="addPlayer"]').click();
  await expect(page.locator("#list-roster li")).toHaveCount(1);
  // Yeni sürümdeki bir pencere veriyi yeni şemayla kaydetti
  const write = (v: number) =>
    page.evaluate(
      (v) =>
        new Promise<void>((ok, fail) => {
          const q = indexedDB.open("halisaha");
          q.onerror = () => fail(q.error);
          q.onsuccess = () => {
            const tx = q.result.transaction("kv", "readwrite");
            const st = tx.objectStore("kv");
            const g = st.get("state");
            g.onsuccess = () => st.put({ ...g.result, v }, "state");
            tx.oncomplete = () => {
              q.result.close();
              ok();
            };
          };
        }),
      v,
    );
  const version = () =>
    page.evaluate(
      () =>
        new Promise<number>((ok) => {
          const q = indexedDB.open("halisaha");
          q.onsuccess = () => {
            const g = q.result.transaction("kv").objectStore("kv").get("state");
            g.onsuccess = () => {
              ok(g.result.v);
              q.result.close();
            };
          };
        }),
    );
  const v0 = await version();
  await write(v0 + 1);
  await page.reload();
  await expect(page.locator("#view")).toContainText("Önce güncelle");
  await expect(page.locator("#future-update")).toBeVisible();
  await expect(page.locator("#tabs")).toBeEmpty();
  expect(await version()).toBe(v0 + 1);
  expect(errors).toEqual([]);
});
