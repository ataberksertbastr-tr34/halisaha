/**
 * Kadro görseli: SquadCard içeriğini 1080×1350 (4:5, WhatsApp'ta kırpılmadan görünür) bir PNG'ye
 * çizer. Predators kimliği: gece siyahı zemin, altın varak çizgiler ve rakamlar, bordo kuşak,
 * krem yazı, arma; Barlow / Barlow Condensed. Bağımlılık yok, tamamen cihazda çizilir.
 */
import { lang, t } from "../i18n";
import { gridOf, type CardName, type SquadCard } from "../domain/squadcard";

export const IMG_W = 1080;
export const IMG_H = 1350;

const NIGHT = "#13161C";
const GOLD = "#C9A04B";
const BORDO = "#84191F";
const CREAM = "#EEEAD9";
const FC = '"Barlow Condensed", "Arial Narrow", sans-serif';
const FB = 'Barlow, system-ui, sans-serif';
const M = 64;

type Ctx = CanvasRenderingContext2D;

const up = (s: string) => s.toLocaleUpperCase(lang() === "tr" ? "tr" : "en");
const p2 = (n: number) => String(n).padStart(2, "0");
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
};

function font(c: Ctx, weight: number, size: number, cond = false): void {
  c.font = weight + " " + Math.round(size) + "px " + (cond ? FC : FB);
}

/** Harf aralıklı yazı (canvas letterSpacing her tarayıcıda yok). Genişliği döner. */
function spaced(c: Ctx, text: string, x: number, y: number, sp: number, align: "left" | "right" = "left"): number {
  const chars = Array.from(text);
  const w = chars.reduce((a, ch) => a + c.measureText(ch).width, 0) + sp * Math.max(0, chars.length - 1);
  let cx = align === "right" ? x - w : x;
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

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function pin(c: Ctx, x: number, y: number, s: number, color: string): void {
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

function lock(c: Ctx, x: number, y: number, s: number, color: string, open: boolean): void {
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

/** Etiket hapı (Kaleci, Misafir); genişliği döner. */
function pill(c: Ctx, text: string, right: number, mid: number, size: number, color: string, draw = true): number {
  font(c, 700, size, true);
  const tw = c.measureText(text).width + 2 * Math.max(0, Array.from(text).length - 1);
  const h = size * 1.5, w = tw + size * 1.2;
  if (draw) {
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 2;
    rrect(c, right - w, mid - h / 2, w, h, h / 2);
    c.stroke();
    c.fillStyle = color;
    c.textBaseline = "middle";
    spaced(c, text, right - w + size * 0.6, mid + 1, 2);
    c.restore();
  }
  return w;
}

/**
 * Yedek sırasını en çok iki satıra dizer; sığmayanlar son satırın sonunda "+n kişi" olur.
 * Ölçü işlevi dışarıdan gelir (test edilebilsin).
 */
export function waitLines(items: string[], max: number, w: (s: string) => number, sep = "   "): string[] {
  const lines: string[] = [];
  let cur = "", used = 0;
  for (const it of items) {
    const next = cur ? cur + sep + it : it;
    if (!cur || w(next) <= max) {
      cur = next;
      used++;
      continue;
    }
    if (lines.length === 1) break;
    lines.push(cur);
    cur = it;
    used++;
  }
  lines.push(cur);
  let rest = items.length - used;
  if (rest > 0) {
    let last = lines[lines.length - 1];
    while (w(last + sep + t("imgMore", { n: rest })) > max && last.includes(sep)) {
      last = last.slice(0, last.lastIndexOf(sep));
      rest++;
    }
    lines[lines.length - 1] = last + sep + t("imgMore", { n: rest });
  }
  return lines;
}

function loadCrest(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/** Görselde geçen bütün yazılar (yazı tipinin Türkçe harf alt kümesi de yüklensin diye). */
function allText(card: SquadCard): string {
  const ns = (a: CardName[]) => a.map((x) => x.n).join("");
  return "PREDATORS0123456789/·…+:. " + card.kicker + card.title + card.day + card.date + card.venue + card.status + card.lockLine + ns(card.playing) + ns(card.wait) + up(card.title + card.kicker + card.day + card.date) + t("imgGk") + t("imgGuest") + t("imgWait") + "İŞĞÜÖÇıişğüöç";
}

async function fontsReady(card: SquadCard): Promise<void> {
  if (!document.fonts || typeof document.fonts.load !== "function") return;
  const text = allText(card);
  const faces = ['800 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', "600 40px Barlow", "700 40px Barlow"];
  const timeout = new Promise<void>((r) => setTimeout(r, 3000));
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, text).catch(() => []))).then(() => undefined), timeout]);
}

/** Görseli çizer (test ve önizleme için tuvali de döner). */
export async function drawSquad(card: SquadCard, crestSrc = "brand/crest.webp"): Promise<HTMLCanvasElement> {
  const [crest] = await Promise.all([loadCrest(crestSrc), fontsReady(card)]);
  const cv = document.createElement("canvas");
  cv.width = IMG_W;
  cv.height = IMG_H;
  const c = cv.getContext("2d");
  if (!c) throw new Error("canvas");
  c.textBaseline = "alphabetic";

  // Zemin: gece siyahı, sağ üstte altın, sol altta bordo ışıltı
  c.fillStyle = NIGHT;
  c.fillRect(0, 0, IMG_W, IMG_H);
  let g = c.createRadialGradient(IMG_W * 0.86, 150, 0, IMG_W * 0.86, 150, 760);
  g.addColorStop(0, alpha(GOLD, 0.14));
  g.addColorStop(1, alpha(GOLD, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, IMG_W, IMG_H);
  g = c.createRadialGradient(0, IMG_H, 0, 0, IMG_H, 760);
  g.addColorStop(0, alpha(BORDO, 0.28));
  g.addColorStop(1, alpha(BORDO, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, IMG_W, IMG_H);
  // Altın çerçeve
  c.strokeStyle = alpha(GOLD, 0.55);
  c.lineWidth = 2;
  c.strokeRect(28, 28, IMG_W - 56, IMG_H - 56);

  // Üst: arma, PREDATORS, tür ve sayı
  const ch = 168, cw = crest ? (ch * crest.naturalWidth) / crest.naturalHeight : 0;
  if (crest) c.drawImage(crest, M, 58, cw, ch);
  const tx = M + (crest ? cw + 28 : 0);
  c.fillStyle = GOLD;
  font(c, 800, 70, true);
  spaced(c, "PREDATORS", tx, 128, 6);
  c.fillStyle = alpha(CREAM, 0.72);
  font(c, 600, 28);
  spaced(c, up(card.kicker), tx, 174, 5);

  c.fillStyle = GOLD;
  font(c, 800, card.cap ? 112 : 84, true);
  c.textAlign = "right";
  c.fillText(card.count, IMG_W - M, 158);
  c.textAlign = "left";
  if (card.status) {
    const st = up(card.status);
    font(c, 700, 26, true);
    const w = c.measureText(st).width + 2 * (Array.from(st).length - 1) + 36;
    const x = IMG_W - M - w, y = 180;
    rrect(c, x, y, w, 44, 22);
    if (card.full) {
      c.strokeStyle = GOLD;
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = GOLD;
    } else {
      c.fillStyle = BORDO;
      c.fill();
      c.fillStyle = CREAM;
    }
    c.textBaseline = "middle";
    spaced(c, st, x + 18, y + 23, 2);
    c.textBaseline = "alphabetic";
  }

  // Bordo kuşak: başlık, gün ve saat
  const by = 262, bh = 150;
  c.fillStyle = BORDO;
  c.fillRect(28, by, IMG_W - 56, bh);
  c.fillStyle = GOLD;
  c.fillRect(28, by, IMG_W - 56, 2);
  c.fillRect(28, by + bh - 2, IMG_W - 56, 2);
  const when = up(card.day + " · " + card.date);
  font(c, 800, 74, true);
  const timeW = c.measureText(card.time).width;
  font(c, 700, 40, true);
  const dayW = c.measureText(when).width;
  const titleMax = IMG_W - 2 * M - Math.max(timeW, dayW) - 40;
  let ts = 132;
  font(c, 800, ts, true);
  while (ts > 64 && c.measureText(up(card.title)).width > titleMax) font(c, 800, (ts -= 4), true);
  c.fillStyle = CREAM;
  c.fillText(fit(c, up(card.title), titleMax), M, by + bh - 30);
  c.textAlign = "right";
  font(c, 700, 40, true);
  c.fillStyle = alpha(CREAM, 0.92);
  c.fillText(when, IMG_W - M, by + 58);
  font(c, 800, 74, true);
  c.fillStyle = GOLD;
  c.fillText(card.time, IMG_W - M, by + bh - 26);
  c.textAlign = "left";

  // Saha
  let top = 452;
  if (card.venue) {
    pin(c, M + 12, 456, 34, GOLD);
    c.fillStyle = CREAM;
    font(c, 600, 34);
    c.fillText(fit(c, card.venue, IMG_W - 2 * M - 44), M + 44, 470);
    top = 512;
  }

  // Kadro: iki sütun, önce sol sütun dolar; kontenjana kadar boş yerler
  const hasWait = card.wait.length > 0;
  const bottom = hasWait ? 1092 : 1210;
  const { slots, rows } = gridOf(card);
  const gap = 40, colW = (IMG_W - 2 * M - gap) / 2;
  if (!slots) {
    c.fillStyle = alpha(CREAM, 0.6);
    font(c, 600, 40);
    c.textAlign = "center";
    c.fillText(t("imgEmpty"), IMG_W / 2, (top + bottom) / 2);
    c.textAlign = "left";
  } else {
    const rowH = Math.min(86, (bottom - top) / rows);
    const fs = Math.max(20, Math.min(42, rowH * 0.52));
    const numW = fs * 1.7;
    for (let i = 0; i < slots; i++) {
      const col = i < rows ? 0 : 1, row = i % rows;
      const x = M + col * (colW + gap), y = top + row * rowH, base = y + rowH * 0.66;
      const p = card.playing[i];
      c.fillStyle = p ? GOLD : alpha(GOLD, 0.35);
      font(c, 800, fs * 1.05, true);
      c.fillText(p2(i + 1), x, base);
      if (p) {
        let tagW = 0;
        const mid = base - fs * 0.34;
        if (p.gk) tagW = pill(c, up(t("imgGk")), x + colW, mid, fs * 0.5, GOLD) + 12;
        else if (p.guest) tagW = pill(c, up(t("imgGuest")), x + colW, mid, fs * 0.5, alpha(CREAM, 0.6)) + 12;
        c.fillStyle = CREAM;
        font(c, 600, fs);
        c.fillText(fit(c, p.n, colW - numW - tagW), x + numW, base);
      } else {
        c.save();
        c.strokeStyle = alpha(CREAM, 0.28);
        c.lineWidth = 3;
        c.lineCap = "round";
        c.setLineDash([1, 12]);
        c.beginPath();
        c.moveTo(x + numW, base - fs * 0.3);
        c.lineTo(x + colW, base - fs * 0.3);
        c.stroke();
        c.restore();
      }
      c.fillStyle = alpha(GOLD, 0.16);
      c.fillRect(x, y + rowH - 1, colW, 1);
    }
  }

  // Yedek sırası (Kural 1.3): en çok iki satır, sığmayan "+n kişi"
  if (hasWait) {
    const y = bottom + 44;
    c.fillStyle = GOLD;
    font(c, 700, 30, true);
    spaced(c, up(t("imgWait")), M, y, 4);
    font(c, 600, 30);
    c.fillStyle = CREAM;
    const items = card.wait.map((w, i) => i + 1 + ". " + w.n);
    const lines = waitLines(items, IMG_W - 2 * M, (x) => c.measureText(x).width);
    lines.forEach((l, i) => c.fillText(fit(c, l, IMG_W - 2 * M), M, y + 42 + i * 38));
  }

  // Alt: kesinleşme ve Belki
  c.fillStyle = alpha(GOLD, 0.35);
  c.fillRect(M, 1236, IMG_W - 2 * M, 1);
  if (card.lockLine) {
    lock(c, M, 1262, 28, GOLD, !card.locked);
    c.fillStyle = alpha(CREAM, 0.82);
    font(c, 600, 26);
    c.fillText(fit(c, card.lockLine, IMG_W - 2 * M - 260), M + 40, 1284);
  }
  if (card.maybe) {
    c.fillStyle = alpha(CREAM, 0.6);
    font(c, 600, 26);
    c.textAlign = "right";
    c.fillText(t("imgMaybe", { n: card.maybe }), IMG_W - M, 1284);
    c.textAlign = "left";
  }
  return cv;
}

export async function squadPng(card: SquadCard): Promise<Blob> {
  const cv = await drawSquad(card);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}
