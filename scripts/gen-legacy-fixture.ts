/**
 * Eski uygulamayı Chromium'da çalıştırıp gerçek bir v2 yedeği üretir:
 *   node scripts/gen-legacy-fixture.ts
 * Çıktı: tests/fixtures/backup-v2-legacy.json (uydurma isimler).
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildLegacyBackup } from "../e2e/legacy-driver.ts";

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => { console.error("Sayfa hatası:", e); process.exitCode = 1; });
const url = pathToFileURL(resolve("legacy/index.html")).href;
const text = await buildLegacyBackup(page, url);
const obj = JSON.parse(text);
writeFileSync("tests/fixtures/backup-v2-legacy.json", JSON.stringify(obj, null, 2) + "\n");
console.log("Oyuncu:", obj.players.length, "Maç:", obj.matches.length, "Saha:", obj.fields.length);
await browser.close();
