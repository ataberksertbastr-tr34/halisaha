/**
 * Uygulama ikonlarını kulüp armasından üretir (PNG çıktılar):
 *   node scripts/make-icons.ts
 * Kaynak: brand/predators-crest.png (şeffaf arka planlı arma).
 * Çıktılar public/icons/ altına yazılır ve repoya eklenir; derlemede tekrar
 * çalıştırmaya gerek yoktur.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const ONYX = "#13161C", ONYX_2 = "#0C0E12", CRIMSON = "#84191F", GOLD = "#C9A04B";
const crest = "data:image/png;base64," + readFileSync("brand/predators-crest.png").toString("base64");
// Armanın en/boy oranı (571 × 640)
const RATIO = 571 / 640;

/**
 * rounded: köşeleri yuvarlatılmış "any" ikon; aksi halde tam dolu (maskable / iOS).
 * scale: armanın ikon yüksekliğine oranı (maskable güvenli alan için daha küçük).
 */
function iconSVG(rounded: boolean, scale: number): string {
  const S = 512;
  const h = S * scale, w = h * RATIO;
  const x = (S - w) / 2, y = (S - h) / 2 + S * 0.01;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`;
  s += `<defs><clipPath id="bg"><rect width="${S}" height="${S}" rx="${rounded ? 112 : 0}"/></clipPath>`;
  s += `<radialGradient id="glow" cx="78%" cy="18%" r="85%"><stop offset="0" stop-color="${CRIMSON}" stop-opacity=".75"/><stop offset=".45" stop-color="${CRIMSON}" stop-opacity=".18"/><stop offset="1" stop-color="${CRIMSON}" stop-opacity="0"/></radialGradient>`;
  s += `<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ONYX}"/><stop offset="1" stop-color="${ONYX_2}"/></linearGradient></defs>`;
  s += `<g clip-path="url(#bg)"><rect width="${S}" height="${S}" fill="url(#base)"/><rect width="${S}" height="${S}" fill="url(#glow)"/>`;
  if (rounded) s += `<rect x="6" y="6" width="${S - 12}" height="${S - 12}" rx="106" fill="none" stroke="${GOLD}" stroke-opacity=".55" stroke-width="4"/>`;
  s += `<image href="${crest}" xlink:href="${crest}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
  s += `</g></svg>`;
  return s;
}

mkdirSync("public/icons", { recursive: true });
const any = iconSVG(true, 0.84), full = iconSVG(false, 0.66), apple = iconSVG(false, 0.78);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
async function png(svg: string, size: number, out: string) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.locator("svg").screenshot({ path: out, omitBackground: true });
}
await png(any, 192, "public/icons/icon-192.png");
await png(any, 512, "public/icons/icon-512.png");
await png(full, 192, "public/icons/icon-maskable-192.png");
await png(full, 512, "public/icons/icon-maskable-512.png");
await png(apple, 180, "public/icons/apple-touch-icon.png");
await png(any, 32, "public/icons/favicon-32.png");
await browser.close();
console.log("İkonlar üretildi: public/icons/");
