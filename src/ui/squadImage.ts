/**
 * Kadro görseli: SquadCard içeriğini 1080×1080 kare bir PNG'ye çizer (WhatsApp sohbette resmi
 * kare keser; kare görsel olduğu gibi görünür). Ortak çizim araçları imgkit.ts'te.
 */
import { t } from "../i18n";
import { gridOf, type CardName, type SquadCard } from "../domain/squadcard";
import {
  alpha, band, baseCanvas, BORDO, CREAM, fit, font, fontsReady, footer, frame, GOLD, header, IMG, loadImage, M, moreText, p2, pill, rrect, spaced, toPng, up, venueLine,
} from "./imgkit";

export const IMG_W = IMG;
export const IMG_H = IMG;

/**
 * Yedek sırasını en çok `maxLines` satıra dizer; sığmayanlar son satırın sonunda "+n kişi" olur.
 * Ölçü işlevi dışarıdan gelir (test edilebilsin).
 */
export function waitLines(items: string[], max: number, w: (s: string) => number, sep = "   ", maxLines = 2): string[] {
  const lines: string[] = [];
  let cur = "", used = 0;
  for (const it of items) {
    const next = cur ? cur + sep + it : it;
    if (!cur || w(next) <= max) {
      cur = next;
      used++;
      continue;
    }
    if (lines.length === maxLines - 1) break;
    lines.push(cur);
    cur = it;
    used++;
  }
  lines.push(cur);
  let rest = items.length - used;
  if (rest > 0) {
    let last = lines[lines.length - 1];
    while (w(last + sep + moreText(rest)) > max && last.includes(sep)) {
      last = last.slice(0, last.lastIndexOf(sep));
      rest++;
    }
    lines[lines.length - 1] = last + sep + moreText(rest);
  }
  return lines;
}

/** Görselde geçen bütün yazılar (yazı tipinin Türkçe harf alt kümesi de yüklensin diye). */
function allText(card: SquadCard): string {
  const ns = (a: CardName[]) => a.map((x) => x.n).join("");
  return card.kicker + card.title + card.day + card.date + card.venue + card.status + card.lockLine + ns(card.playing) + ns(card.wait) + t("imgGk") + t("imgGuest") + t("imgWait");
}

/** Görseli çizer (test ve önizleme için tuvali de döner). */
export async function drawSquad(card: SquadCard, crestSrc = "brand/crest.webp"): Promise<HTMLCanvasElement> {
  const [crest] = await Promise.all([loadImage(crestSrc), fontsReady(allText(card))]);
  const { cv, c } = baseCanvas();
  header(c, crest, card.kicker);

  // Sağ üst: sayı ve "n kişi eksik / Kadro tam"
  c.fillStyle = GOLD;
  font(c, 800, card.cap ? 92 : 68, true);
  c.textAlign = "right";
  c.fillText(card.count, IMG - M, 126);
  c.textAlign = "left";
  if (card.status) {
    const st = up(card.status);
    font(c, 700, 23, true);
    const w = c.measureText(st).width + 2 * (Array.from(st).length - 1) + 32;
    const x = IMG - M - w, y = 142;
    rrect(c, x, y, w, 38, 19);
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
    spaced(c, st, x + 16, y + 20, 2);
    c.textBaseline = "alphabetic";
  }

  const top = venueLine(c, card.venue, band(c, card.title, card.day, card.date, card.time)) + 4;

  // Kadro: iki sütun, önce sol sütun dolar; kontenjana kadar boş yerler
  const hasWait = card.wait.length > 0;
  const bottom = hasWait ? 922 : 980;
  const { slots, rows } = gridOf(card);
  const gap = 36, colW = (IMG - 2 * M - gap) / 2;
  if (!slots) {
    c.fillStyle = alpha(CREAM, 0.6);
    font(c, 600, 36);
    c.textAlign = "center";
    c.fillText(t("imgEmpty"), IMG / 2, (top + bottom) / 2);
    c.textAlign = "left";
  } else {
    const rowH = Math.min(76, (bottom - top) / rows);
    const fs = Math.max(18, Math.min(38, rowH * 0.53));
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
        if (p.gk) tagW = pill(c, up(t("imgGk")), x + colW, mid, fs * 0.5, GOLD) + 10;
        else if (p.guest) tagW = pill(c, up(t("imgGuest")), x + colW, mid, fs * 0.5, alpha(CREAM, 0.6)) + 10;
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

  // Yedek sırası (Kural 1.3): tek satır, sığmayan "+n kişi"
  if (hasWait) {
    const y = 966;
    c.fillStyle = GOLD;
    font(c, 700, 28, true);
    const lw = spaced(c, up(t("imgWait")), M, y, 4) + 22;
    font(c, 600, 28);
    c.fillStyle = CREAM;
    const items = card.wait.map((w, i) => i + 1 + ". " + w.n);
    const max = IMG - 2 * M - lw;
    const [line] = waitLines(items, max, (x) => c.measureText(x).width, "   ", 1);
    c.fillText(fit(c, line, max), M + lw, y);
  }

  footer(c, card.lockLine, card.maybe ? t("imgMaybe", { n: card.maybe }) : "", card.lockLine ? card.locked : undefined);
  frame(c);
  return cv;
}

export async function squadPng(card: SquadCard): Promise<Blob> {
  return toPng(await drawSquad(card));
}
