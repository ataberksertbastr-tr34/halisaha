/**
 * Yeni sürüm akışı (service worker): "Güncelle" yeni sürümü indirip uygular, veri aynen kalır,
 * öbür pencere uyarılır. Sunucudaki sw.js'yi değiştirebilmek için derlenmiş uygulama (dist)
 * bu dosyadaki küçük bir sunucudan verilir; Playwright service worker betiğinin isteğini yakalayamaz.
 */
import { expect, type Page } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, resolve } from "node:path";
import { test, watchErrors } from "./helpers";

const DIST = resolve("dist");
const PORT = 4175;
const ORIGIN = "http://localhost:" + PORT;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json",
};
const SW = readFileSync(join(DIST, "sw.js"), "utf8");
const VERSION = /"halisaha-"\+"([^"]+)"/.exec(SW)![1];
let sw = SW;
let server: Server;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    if (p === "/sw.js") {
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      return res.end(sw);
    }
    const f = join(DIST, p);
    if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise<void>((ok) => server.listen(PORT, ok));
});
test.afterAll(() => new Promise<void>((ok) => server.close(() => ok())));
test.beforeEach(() => {
  sw = SW;
});

/** Sunucuda yeni sürüm yayınlanır (yalnızca sürüm adı değişir). */
const publish = (v: string) => {
  sw = SW.split('"' + VERSION + '"').join('"' + v + '"');
};

/** Sayfayı denetleyen service worker'ın sürümü. */
const swVersion = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((ok) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => ok(String(e.data));
        navigator.serviceWorker.controller!.postMessage({ type: "VERSION" }, [ch.port2]);
      }),
  );

async function open(page: Page): Promise<void> {
  await page.goto(ORIGIN + "/#/players");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test("'Güncelle' yeni sürümü sunucudan indirip uygular; veri aynen kalır, öbür pencere uyarılır", async ({ context }) => {
  const page = await context.newPage();
  const errors = watchErrors(page);
  await open(page);
  expect(await swVersion(page)).toBe(VERSION);
  await page.locator("#newName").fill("Sürüm Sinan");
  await page.locator('[data-a="addPlayer"]').click();
  await expect(page.locator("#list-roster li")).toHaveCount(1);
  const other = await context.newPage();
  await other.goto(ORIGIN + "/#/players");
  await expect(other.locator("#list-roster li")).toHaveCount(1);

  // Eşitleme "başka cihaz daha yeni sürümde" dediğinde çıkan düğmenin işi (syncReload)
  publish("e2e-next");
  await page.evaluate(() => document.getElementById("view")!.insertAdjacentHTML("afterbegin", '<button type="button" id="upd" data-a="syncReload">x</button>'));
  await Promise.all([page.waitForEvent("load"), page.locator("#upd").click()]);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  expect(await swVersion(page)).toBe("e2e-next");
  await expect(page.locator("#list-roster li")).toHaveCount(1);
  await expect(page.locator("#list-roster")).toContainText("Sürüm Sinan");

  // Öbür pencere eski kodla kalmaz: yenilemesi istenir
  const banner = other.locator("#banner");
  await expect(banner).toContainText("Uygulama güncellendi");
  await Promise.all([other.waitForEvent("load"), banner.locator('[data-a="reloadPage"]').click()]);
  expect(await swVersion(other)).toBe("e2e-next");
  await expect(other.locator("#banner")).not.toContainText("Uygulama güncellendi");
  expect(errors).toEqual([]);
});

test("yeni sürüm yoksa 'Güncelle' sayfayı yeniden yükler", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await page.evaluate(() => document.getElementById("view")!.insertAdjacentHTML("afterbegin", '<button type="button" id="upd" data-a="syncReload">x</button>'));
  await Promise.all([page.waitForEvent("load"), page.locator("#upd").click()]);
  expect(await swVersion(page)).toBe(VERSION);
  expect(errors).toEqual([]);
});

test("'Önce güncelle' ekranındaki düğme yeni sürümü açar; yeni şemadaki veri ezilmez", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await page.locator("#newName").fill("Gelecek Gani");
  await page.locator('[data-a="addPlayer"]').click();
  await expect(page.locator("#list-roster li")).toHaveCount(1);
  // Başka bir pencere yeni sürümle, yeni şemayla kaydetti
  const v = await page.evaluate(
    () =>
      new Promise<number>((ok) => {
        const q = indexedDB.open("halisaha");
        q.onsuccess = () => {
          const tx = q.result.transaction("kv", "readwrite");
          const st = tx.objectStore("kv");
          const g = st.get("state");
          let next = 0;
          g.onsuccess = () => {
            next = g.result.v + 1;
            st.put({ ...g.result, v: next }, "state");
          };
          tx.oncomplete = () => {
            q.result.close();
            ok(next);
          };
        };
      }),
  );
  await page.reload();
  await expect(page.locator("#view")).toContainText("Önce güncelle");
  publish("e2e-next");
  await Promise.all([page.waitForEvent("load"), page.locator("#future-update").click()]);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  expect(await swVersion(page)).toBe("e2e-next");
  const stored = await page.evaluate(
    () =>
      new Promise<{ v: number; players: { name: string }[] }>((ok) => {
        const q = indexedDB.open("halisaha");
        q.onsuccess = () => {
          const g = q.result.transaction("kv").objectStore("kv").get("state");
          g.onsuccess = () => {
            ok(g.result);
            q.result.close();
          };
        };
      }),
  );
  expect(stored.v).toBe(v);
  expect(stored.players.map((p) => p.name)).toEqual(["Gelecek Gani"]);
  expect(errors).toEqual([]);
});
