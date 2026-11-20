/**
 * Paylaşılan görsellerin ortak çizim araçları (kadro, takımlar, maç afişi). Görseller 1080×1080
 * karedir: WhatsApp sohbette resmi kare keser, kare görsel olduğu gibi görünür. Predators kimliği:
 * gece siyahı zemin, altın varak çizgi ve rakamlar, bordo kuşak, krem yazı, arma; Barlow /
 * Barlow Condensed. Bağımlılık yok, tamamen cihazda çizilir.
 */
import { lang, t } from "../i18n";

export const IMG = 1080;
export const NIGHT = "#13161C";
export const GOLD = "#C9A04B";
export const BORDO = "#84191F";
export const CREAM = "#EEEAD9";
export const M = 56;
const FC = '"Barlow Condensed", "Arial Narrow", sans-serif';
const FB = 'Barlow, system-ui, sans-serif';

export type Ctx = CanvasRenderingContext2D;

export const up = (s: string): string => s.toLocaleUpperCase(lang() === "tr" ? "tr" : "en");
export const p2 = (n: number): string => String(n).padStart(2, "0");
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

/** Renk açık mı (üstüne koyu yazı yazılsın mı). */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export function font(c: Ctx, weight: number, size: number, cond = false): void {
  c.font = weight + " " + Math.round(size) + "px " + (cond ? FC : FB);
}

/** Harf aralıklı yazı (canvas letterSpacing her tarayıcıda yok). Genişliği döner. */
export function spaced(c: Ctx, text: string, x: number, y: number, sp: number, align: "left" | "right" | "center" = "left"): number {
  const chars = Array.from(text);
  const w = chars.reduce((a, ch) => a + c.measureText(ch).width, 0) + sp * Math.max(0, chars.length - 1);
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  const old = c.textAlign;
  c.textAlign = "left";
  for (const ch of chars) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + sp;
  }
  c.textAlign = old;
  return w;
}

/** Sığmayan yazıyı "…" ile kısaltır. */
export function fit(c: Ctx, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  const chars = Array.from(text);
  let lo = 0, hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (c.measureText(chars.slice(0, mid).join("").trimEnd() + "…").width <= max) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("").trimEnd() + "…";
}

export function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function pin(c: Ctx, x: number, y: number, s: number, color: string): void {
  c.save();
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, s * 0.42, Math.PI * 0.82, Math.PI * 0.18);
  c.lineTo(x, y + s * 0.62);
  c.closePath();
  c.fill();
  c.fillStyle = NIGHT;
  c.beginPath();
  c.arc(x, y, s * 0.16, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function lock(c: Ctx, x: number, y: number, s: number, color: string, open: boolean): void {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = s * 0.12;
  c.beginPath();
  if (open) c.arc(x + s * 0.5, y - s * 0.05, s * 0.24, Math.PI, Math.PI * 1.9);
  else c.arc(x + s * 0.5, y, s * 0.24, Math.PI, 0);
  c.stroke();
  rrect(c, x + s * 0.14, y, s * 0.72, s * 0.56, s * 0.08);
  c.fill();
  c.restore();
}

/** Etiket hapı (Kaleci, Misafir) sağa yaslı; genişliği döner. */
export function pill(c: Ctx, text: string, right: number, mid: number, size: number, color: string): number {
  font(c, 700, size, true);
  const tw = c.measureText(text).width + 2 * Math.max(0, Array.from(text).length - 1);
  const h = size * 1.5, w = tw + size * 1.2;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 2;
  rrect(c, right - w, mid - h / 2, w, h, h / 2);
  c.stroke();
  c.fillStyle = color;
  c.textBaseline = "middle";
  spaced(c, text, right - w + size * 0.6, mid + 1, 2);
  c.restore();
  return w;
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/** Yazı tipleri (Türkçe harf alt kümesi dahil) yüklenene kadar, en çok 3 sn bekler. */
export async function fontsReady(text: string): Promise<void> {
  if (!document.fonts || typeof document.fonts.load !== "function") return;
  const all = "PREDATORS0123456789/·…+:.!, " + text + up(text) + "İŞĞÜÖÇıişğüöç";
  const faces = ['800 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', "600 40px Barlow", "700 40px Barlow"];
  const timeout = new Promise<void>((r) => setTimeout(r, 3000));
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, all).catch(() => []))).then(() => undefined), timeout]);
}

/** Kare tuval: gece siyahı zemin, altın ve bordo ışıltı, ince altın çerçeve. */
export function baseCanvas(): { cv: HTMLCanvasElement; c: Ctx } {
  const cv = document.createElement("canvas");
  cv.width = IMG;
  cv.height = IMG;
  const c = cv.getContext("2d");
  if (!c) throw new Error("canvas");
  c.textBaseline = "alphabetic";
  c.fillStyle = NIGHT;
  c.fillRect(0, 0, IMG, IMG);
  let g = c.createRadialGradient(IMG * 0.86, 130, 0, IMG * 0.86, 130, 640);
  g.addColorStop(0, alpha(GOLD, 0.14));
  g.addColorStop(1, alpha(GOLD, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, IMG, IMG);
  g = c.createRadialGradient(0, IMG, 0, 0, IMG, 640);
  g.addColorStop(0, alpha(BORDO, 0.28));
  g.addColorStop(1, alpha(BORDO, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, IMG, IMG);
  return { cv, c };
}

export function frame(c: Ctx): void {
  c.strokeStyle = alpha(GOLD, 0.55);
  c.lineWidth = 2;
  c.strokeRect(24, 24, IMG - 48, IMG - 48);
}

/** Üst bölüm: arma, PREDATORS ve küçük üst satır (tür · format). */
export function header(c: Ctx, crest: HTMLImageElement | null, kicker: string): void {
  const ch = 130, cw = crest ? (ch * crest.naturalWidth) / crest.naturalHeight : 0;
  if (crest) c.drawImage(crest, M, 46, cw, ch);
  const tx = M + (crest ? cw + 24 : 0);
  c.fillStyle = GOLD;
  font(c, 800, 58, true);
  spaced(c, "PREDATORS", tx, 108, 5);
  c.fillStyle = alpha(CREAM, 0.72);
  font(c, 600, 24);
  spaced(c, up(kicker), tx, 146, 4);
}

/** Bordo kuşak: büyük başlık solda, gün · tarih ve saat sağda. Kuşağın alt kenarını döner. */
export function band(c: Ctx, title: string, day: string, date: string, time: string): number {
  const by = 204, bh = 118;
  c.fillStyle = BORDO;
  c.fillRect(24, by, IMG - 48, bh);
  c.fillStyle = GOLD;
  c.fillRect(24, by, IMG - 48, 2);
  c.fillRect(24, by + bh - 2, IMG - 48, 2);
  const when = up(day + " · " + date);
  font(c, 800, 62, true);
  const timeW = c.measureText(time).width;
  font(c, 700, 34, true);
  const dayW = c.measureText(when).width;
  const max = IMG - 2 * M - Math.max(timeW, dayW) - 36;
  let ts = 104;
  font(c, 800, ts, true);
  while (ts > 56 && c.measureText(up(title)).width > max) font(c, 800, (ts -= 4), true);
  c.fillStyle = CREAM;
  c.fillText(fit(c, up(title), max), M, by + bh - 24);
  c.textAlign = "right";
  font(c, 700, 34, true);
  c.fillStyle = alpha(CREAM, 0.92);
  c.fillText(when, IMG - M, by + 48);
  font(c, 800, 62, true);
  c.fillStyle = GOLD;
  c.fillText(time, IMG - M, by + bh - 20);
  c.textAlign = "left";
  return by + bh;
}

/** Saha satırı (varsa); altındaki ilk boş y'yi döner. */
export function venueLine(c: Ctx, venue: string, top: number): number {
  if (!venue) return top + 34;
  pin(c, M + 11, top + 36, 30, GOLD);
  c.fillStyle = CREAM;
  font(c, 600, 30);
  c.fillText(fit(c, venue, IMG - 2 * M - 40), M + 40, top + 48);
  return top + 84;
}

/** Alt satır: altın çizgi, kilit ve yazı (solda), ek bilgi (sağda). */
export function footer(c: Ctx, left: string, right = "", locked?: boolean): void {
  c.fillStyle = alpha(GOLD, 0.35);
  c.fillRect(M, 994, IMG - 2 * M, 1);
  let x = M;
  if (locked !== undefined && left) {
    lock(c, M, 1014, 26, GOLD, !locked);
    x = M + 36;
  }
  font(c, 600, 24);
  if (left) {
    c.fillStyle = alpha(CREAM, 0.82);
    c.fillText(fit(c, left, IMG - 2 * M - 250), x, 1034);
  }
  if (right) {
    c.fillStyle = alpha(CREAM, 0.6);
    c.textAlign = "right";
    c.fillText(right, IMG - M, 1034);
    c.textAlign = "left";
  }
}

export function toPng(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}

/** Yapılandırılmış ad: "+3 kişi". */
export const moreText = (n: number): string => t("imgMore", { n });
