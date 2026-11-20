/**
 * Takım görseli: iki takım yan yana, yelek renginde başlıklarla (Kural 3.3), numaralı oyuncular,
 * kaleci ve misafir etiketleri. 1080×1080 kare PNG; ortak çizim araçları imgkit.ts'te.
 */
import { t } from "../i18n";
import type { TeamCard, TeamSide } from "../domain/matchcards";
import {
  alpha, band, baseCanvas, CREAM, fit, font, fontsReady, footer, frame, GOLD, header, IMG, isLight, loadImage, M, NIGHT, p2, pill, rrect, spaced, toPng, up, venueLine,
} from "./imgkit";

function allText(card: TeamCard): string {
  const ns = (s: TeamSide) => s.name + s.players.map((x) => x.n).join("");
  return card.kicker + card.title + card.day + card.date + card.venue + card.foot + ns(card.a) + ns(card.b) + t("imgGk") + t("imgGuest") + t("imgPeople", { n: 0 });
}

export async function drawTeams(card: TeamCard, crestSrc = "brand/crest.webp"): Promise<HTMLCanvasElement> {
  const [crest] = await Promise.all([loadImage(crestSrc), fontsReady(allText(card))]);
  const { cv, c } = baseCanvas();
  header(c, crest, card.kicker);
  const top = venueLine(c, card.venue, band(c, card.title, card.day, card.date, card.time)) + 6;

  const gap = 64, colW = (IMG - 2 * M - gap) / 2, hh = 64;
  const rows = Math.max(card.a.players.length, card.b.players.length, 1);
  const listTop = top + hh + 14, bottom = 978;
  const rowH = Math.min(70, (bottom - listTop) / rows);
  const fs = Math.max(18, Math.min(36, rowH * 0.53));
  const numW = fs * 1.6;

  ([card.a, card.b] as TeamSide[]).forEach((side, k) => {
    const x = M + k * (colW + gap);
    // Yelek renginde başlık (koyu yelekte de görünsün diye altın kenar)
    rrect(c, x, top, colW, hh, 14);
    c.fillStyle = side.color;
    c.fill();
    c.strokeStyle = alpha(GOLD, 0.8);
    c.lineWidth = 2;
    c.stroke();
    const ink = isLight(side.color) ? NIGHT : CREAM;
    const count = up(t("imgPeople", { n: side.players.length }));
    font(c, 700, 22, true);
    c.fillStyle = ink;
    const cw = spaced(c, count, x + colW - 18, top + hh / 2 + 8, 2, "right");
    font(c, 800, 40, true);
    c.fillText(fit(c, up(side.name), colW - cw - 52), x + 20, top + hh / 2 + 14);
    // Takım rengi şerit
    c.fillStyle = side.color;
    c.fillRect(x, listTop, 5, rows * rowH - 8);
    side.players.forEach((p, i) => {
      const y = listTop + i * rowH, base = y + rowH * 0.66, lx = x + 20;
      c.fillStyle = GOLD;
      font(c, 800, fs * 1.05, true);
      c.fillText(p2(i + 1), lx, base);
      let tagW = 0;
      const mid = base - fs * 0.34;
      if (p.gk) tagW = pill(c, up(t("imgGk")), x + colW, mid, fs * 0.5, GOLD) + 10;
      else if (p.guest) tagW = pill(c, up(t("imgGuest")), x + colW, mid, fs * 0.5, alpha(CREAM, 0.6)) + 10;
      c.fillStyle = CREAM;
      font(c, 600, fs);
      c.fillText(fit(c, p.n, colW - 20 - numW - tagW), lx + numW, base);
      c.fillStyle = alpha(GOLD, 0.16);
      c.fillRect(lx, y + rowH - 1, colW - 20, 1);
    });
  });
  // Ortada VS
  c.fillStyle = GOLD;
  font(c, 800, 38, true);
  c.textAlign = "center";
  c.fillText("VS", IMG / 2, top + hh / 2 + 13);
  c.textAlign = "left";

  footer(c, card.foot);
  frame(c);
  return cv;
}

export async function teamsPng(card: TeamCard): Promise<Blob> {
  return toPng(await drawTeams(card));
}
