/**
 * Uygulama ikonlarını üretir (SVG kaynak + PNG çıktılar):
 *   node scripts/make-icons.ts
 * Çıktılar public/icons/ altına yazılır ve repoya eklenir; derlemede tekrar
 * çalıştırmaya gerek yoktur.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const GREEN = "#1E6A42", STRIPE = "#22714A", YELLOW = "#E2F01C", ORANGE = "#FF6A1A", INK = "#13201A";

function ball(cx: number, cy: number, r: number): string {
  const pent = (x: number, y: number, R: number, rot: number) =>
    Array.from({ length: 5 }, (_, k) => {
      const a = ((rot + k * 72) * Math.PI) / 180;
      return (x + R * Math.cos(a)).toFixed(1) + "," + (y + R * Math.sin(a)).toFixed(1);
    }).join(" ");
  const pr = r * 0.3;
  let s = `<clipPath id="bc"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>`;
  s += `<g clip-path="url(#bc)" fill="${INK}" stroke="${INK}" stroke-width="${r * 0.045}" stroke-linejoin="round">`;
  s += `<polygon points="${pent(cx, cy, pr, -90)}"/>`;
  for (let k = 0; k < 5; k++) {
    const a = ((-90 + k * 72) * Math.PI) / 180;
    const x1 = cx + pr * Math.cos(a), y1 = cy + pr * Math.sin(a);
    const x2 = cx + r * 0.8 * Math.cos(a), y2 = cy + r * 0.8 * Math.sin(a);
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" fill="none"/>`;
    const ox = cx + r * 1.05 * Math.cos(a), oy = cy + r * 1.05 * Math.sin(a);
    s += `<polygon points="${pent(ox, oy, pr * 0.72, -90 + k * 72 + 36)}"/>`;
  }
  s += `</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="${r * 0.07}"/>`;
  return s;
}

/** rounded: köşeleri yuvarlatılmış "any" ikon; aksi halde tam dolu (maskable / iOS). */
function iconSVG(rounded: boolean): string {
  const S = 512;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`;
  s += `<defs><clipPath id="bg"><rect width="${S}" height="${S}" rx="${rounded ? 112 : 0}"/></clipPath></defs>`;
  s += `<g clip-path="url(#bg)"><rect width="${S}" height="${S}" fill="${GREEN}"/>`;
  for (let x = 0; x < S; x += 128) s += `<rect x="${x + 64}" y="0" width="64" height="${S}" fill="${STRIPE}"/>`;
  s += `<line x1="256" y1="0" x2="256" y2="${S}" stroke="#fff" stroke-opacity=".85" stroke-width="10"/>`;
  const R = 150;
  s += `<path d="M256 ${256 - R} A${R} ${R} 0 0 0 256 ${256 + R}" fill="none" stroke="${YELLOW}" stroke-width="24"/>`;
  s += `<path d="M256 ${256 - R} A${R} ${R} 0 0 1 256 ${256 + R}" fill="none" stroke="${ORANGE}" stroke-width="24"/>`;
  s += ball(256, 256, 88);
  s += `</g></svg>`;
  return s;
}

mkdirSync("public/icons", { recursive: true });
const any = iconSVG(true), full = iconSVG(false);
writeFileSync("public/icons/icon.svg", any);
writeFileSync("public/icons/icon-maskable.svg", full);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
async function png(svg: string, size: number, out: string) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.locator("svg").screenshot({ path: out, omitBackground: true });
}
await png(any, 192, "public/icons/icon-192.png");
await png(any, 512, "public/icons/icon-512.png");
await png(full, 192, "public/icons/icon-maskable-192.png");
await png(full, 512, "public/icons/icon-maskable-512.png");
await png(full, 180, "public/icons/apple-touch-icon.png");
await png(any, 32, "public/icons/favicon-32.png");
await browser.close();
console.log("İkonlar üretildi: public/icons/");
