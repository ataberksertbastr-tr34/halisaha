/**
 * Maç afişi (halı saha): solda arma ve maçın günü, tarihi, saati; sağda gece projektör ışığında
 * halı saha; sağ üstte "HALI SAHA VAR, MAÇ VAR, ÇARPIŞACAZ!". 1080×1080 kare PNG. Saha, basit bir
 * perspektifle doğrudan tuvale çizilir (dış görsel ve SVG süzgeci yok; iPhone'da da aynı çıkar).
 */
import type { PosterCard } from "../domain/matchcards";
import { alpha, BORDO, CREAM, fit, font, fontsReady, GOLD, IMG, loadImage, NIGHT, pin, spaced, toPng, up, type Ctx } from "./imgkit";

/** Sahne: sol kenarı çapraz kesilmiş sağ bölüm (x0'dan sağa). */
const X0 = 400, SW = IMG - X0;
/** Perspektif: ufuk, odak, kamera yüksekliği (metre), sahnenin ortası. */
const HZ = 600, F = 600, H = 4.2, CX = 390;
type Pt = [number, number];
export const project = (x: number, z: number, y = 0): Pt => [X0 + CX + (F * x) / z, HZ + (F * (H - y)) / z];

function poly(c: Ctx, pts: Pt[], fill: string | CanvasGradient): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function seg(c: Ctx, a: Pt, b: Pt, w: number, color: string): void {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

/** Yumuşak ışık lekesi (elips): merkezde renk, kenarda saydam. */
function glow(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, a: number): void {
  c.save();
  c.translate(cx, cy);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(0.3, alpha(color, a * 0.45));
  g.addColorStop(1, alpha(color, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function scene(c: Ctx): void {
  c.save();
  c.beginPath();
  c.moveTo(X0 + 110, 0);
  c.lineTo(IMG, 0);
  c.lineTo(IMG, IMG);
  c.lineTo(X0, IMG);
  c.closePath();
  c.clip();

  // Gökyüzü ve yıldızlar
  const sky = c.createLinearGradient(0, 0, 0, HZ + 60);
  sky.addColorStop(0, "#07090D");
  sky.addColorStop(0.55, "#121A26");
  sky.addColorStop(1, "#1E2B3B");
  c.fillStyle = sky;
  c.fillRect(X0, 0, SW, IMG);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) {
    c.fillStyle = alpha(CREAM, 0.15 + rnd() * 0.45);
    c.beginPath();
    c.arc(X0 + 110 + rnd() * (SW - 110), rnd() * 470, rnd() * 1.4 + 0.3, 0, Math.PI * 2);
    c.fill();
  }

  const XW = 14, ZF = 34, ZN = 2.2, FZ = ZF + 4, FH = 6;
  // Uzaktaki tepe silueti
  const sil: Pt[] = [project(-60, 70, 0)];
  for (let x = -60; x <= 60; x += 6) sil.push(project(x, 70, 7 + 4 * Math.abs(Math.sin(x * 1.7))));
  sil.push(project(60, 70, 0));
  poly(c, sil, "#0C1016");

  // Zemin: enine biçme şeritleri ve kenar payı
  for (let z = ZN, i = 0; z < ZF + 4; z += 2.6, i++) {
    const z2 = Math.min(z + 2.6, ZF + 4);
    poly(c, [project(-XW - 4, z), project(XW + 4, z), project(XW + 4, z2), project(-XW - 4, z2)], i % 2 ? "#2F7A3A" : "#28692F");
  }
  poly(c, [project(-XW - 4, ZN), project(-XW - 40, ZN), project(-XW - 40, ZF + 4), project(-XW - 4, ZF + 4)], "#1C4A23");
  poly(c, [project(XW + 4, ZN), project(XW + 40, ZN), project(XW + 40, ZF + 4), project(XW + 4, ZF + 4)], "#1C4A23");
  // Projektör ışığı sahada
  const p1 = project(-6, 16), p2 = project(8, 24);
  glow(c, p1[0], p1[1], 340, 110, "#E9FFD9", 0.22);
  glow(c, p2[0], p2[1], 280, 80, "#E9FFD9", 0.2);

  // Çizgiler
  const W = "rgba(244,246,239,.9)";
  c.lineCap = "round";
  seg(c, project(-XW, ZN), project(-XW, ZF), 4, W);
  seg(c, project(XW, ZN), project(XW, ZF), 4, W);
  seg(c, project(-XW, ZF), project(XW, ZF), 3, W);
  const ZH = 12;
  seg(c, project(-XW, ZH), project(XW, ZH), 4, W);
  c.beginPath();
  for (let a = 0; a <= 360; a += 6) {
    const [x, y] = project(4.5 * Math.cos((a * Math.PI) / 180), ZH + 4.5 * Math.sin((a * Math.PI) / 180));
    if (a) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.lineWidth = 3.5;
  c.strokeStyle = W;
  c.stroke();
  const box: Pt[] = [project(-8, ZF), project(-8, ZF - 7), project(8, ZF - 7), project(8, ZF)];
  c.beginPath();
  box.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.lineWidth = 3;
  c.stroke();
  for (const [x, y, r] of [[...project(0, ZH), 5], [...project(0, ZF - 5), 3]]) {
    c.fillStyle = W;
    c.beginPath();
    c.ellipse(x, y, r, r / 2, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Kale ve file
  const GW = 2.5, GH = 2, GD = 1.4;
  for (let x = -GW; x <= GW + 0.01; x += 0.5) seg(c, project(x, ZF, GH), project(x, ZF + GD, 0), 1, "rgba(244,246,239,.45)");
  for (let k = 0; k <= 5; k++) {
    const tt = k / 5;
    seg(c, project(-GW, ZF + GD * tt, GH * (1 - tt)), project(GW, ZF + GD * tt, GH * (1 - tt)), 1, "rgba(244,246,239,.45)");
  }
  seg(c, project(-GW, ZF), project(-GW, ZF, GH), 6, "#FFFFFF");
  seg(c, project(GW, ZF), project(GW, ZF, GH), 6, "#FFFFFF");
  seg(c, project(-GW, ZF, GH), project(GW, ZF, GH), 6, "#FFFFFF");

  // Halı saha kafesi: arka ve yan file
  const net = "rgba(185,196,207,.22)";
  for (let x = -XW - 4; x <= XW + 4.01; x += 1) seg(c, project(x, FZ), project(x, FZ, FH), 1, net);
  for (let y = 0; y <= FH; y++) seg(c, project(-XW - 4, FZ, y), project(XW + 4, FZ, y), 1, net);
  for (const sx of [-1, 1]) {
    const X = sx * (XW + 4);
    for (let z = 6; z <= FZ; z += 2) seg(c, project(X, z), project(X, z, FH), 1, net);
    for (let y = 0; y <= FH; y++) seg(c, project(X, 6, y), project(X, FZ, y), 1, net);
  }
  for (let x = -XW - 4; x <= XW + 4.01; x += 6) seg(c, project(x, FZ), project(x, FZ, FH), 4, "#5D6874");

  // Projektör direği (solda, çitin arkasında) ve sağ üstte kadraj dışındaki ışık
  const s = 0.62, base = project(-17, 48), top = project(-17, 48, 17);
  seg(c, base, top, 7 * s, "#3A434E");
  const lw = 120 * s, lh = 54 * s, lx = top[0] - lw / 2, ly = top[1] - lh;
  const cone = c.createLinearGradient(0, ly + lh, 0, HZ + 520);
  cone.addColorStop(0, "rgba(255,243,208,.16)");
  cone.addColorStop(1, "rgba(255,243,208,0)");
  poly(c, [[lx + 10, ly + lh], [lx + lw - 10, ly + lh], [X0 + CX + 260 * s, HZ + 520], [X0 + CX - 380 * s, HZ + 520]], cone);
  glow(c, top[0], ly + lh / 2, 210 * s, 210 * s, "#FFF6DC", 0.95);
  c.beginPath();
  c.roundRect?.(lx, ly, lw, lh, 6 * s);
  if (!c.roundRect) c.rect(lx, ly, lw, lh);
  c.fillStyle = "#20262E";
  c.fill();
  c.fillStyle = "#FFF8E4";
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) c.fillRect(lx + 8 * s + k * 27 * s, ly + 7 * s + r * 23 * s, 23 * s, 18 * s);
  glow(c, IMG + 30, -30, 360, 360, "#FFF6DC", 0.45);
  const cone2 = c.createLinearGradient(0, 0, 0, HZ + 480);
  cone2.addColorStop(0, "rgba(255,243,208,.12)");
  cone2.addColorStop(1, "rgba(255,243,208,0)");
  poly(c, [[IMG - 40, 0], [IMG, 0], [X0 + CX + 300, HZ + 480], [X0 + CX - 40, HZ + 480]], cone2);

  // Top (önde, sağ altta)
  const bx = X0 + 545, by = 945, br = 58;
  glow(c, bx + 14, by + br - 4, br * 1.1, br * 0.25, "#000000", 0.55);
  const shade = c.createRadialGradient(bx - br * 0.24, by - br * 0.36, 0, bx, by, br * 1.05);
  shade.addColorStop(0, "#FFFFFF");
  shade.addColorStop(0.6, "#E9E6DA");
  shade.addColorStop(1, "#9C9A92");
  c.fillStyle = shade;
  c.beginPath();
  c.arc(bx, by, br, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(bx, by, br, 0, Math.PI * 2);
  c.clip();
  const pent = (x: number, y: number, r: number, rot: number): Pt[] => {
    const a: Pt[] = [];
    for (let i = 0; i < 5; i++) a.push([x + r * Math.cos(rot + (i * 2 * Math.PI) / 5), y + r * Math.sin(rot + (i * 2 * Math.PI) / 5)]);
    poly(c, a, "#1B1E24");
    return a;
  };
  const ox = bx - 4, oy = by - 6;
  pent(ox, oy, br * 0.3, -Math.PI / 2).forEach(([x, y]) => {
    const ang = Math.atan2(y - oy, x - ox);
    seg(c, [x, y], [ox + Math.cos(ang) * br * 0.62, oy + Math.sin(ang) * br * 0.62], 3, "#1B1E24");
    pent(ox + Math.cos(ang + Math.PI / 5) * br * 0.86, oy + Math.sin(ang + Math.PI / 5) * br * 0.86, br * 0.26, ang + Math.PI / 5);
  });
  c.restore();
  c.lineWidth = 2;
  c.strokeStyle = "#0E1014";
  c.beginPath();
  c.arc(bx, by, br, 0, Math.PI * 2);
  c.stroke();

  // Alt kararma
  const fade = c.createLinearGradient(0, 820, 0, IMG);
  fade.addColorStop(0, alpha(NIGHT, 0));
  fade.addColorStop(1, alpha(NIGHT, 0.55));
  c.fillStyle = fade;
  c.fillRect(X0, 820, SW, IMG - 820);
  c.restore();

  // Bordo çapraz kuşak ve altın çizgiler
  poly(c, [[X0 + 80, 0], [X0 + 110, 0], [X0, IMG], [X0 - 30, IMG]], BORDO);
  seg(c, [X0 + 110, 0], [X0, IMG], 3, GOLD);
  seg(c, [X0 + 80, 0], [X0 - 30, IMG], 2, alpha(GOLD, 0.5));
}

function allText(card: PosterCard): string {
  return card.lines.join("") + card.hit + "!" + card.day + card.date + card.time + card.venue;
}

export async function drawPoster(card: PosterCard, crestSrc = "brand/crest.webp"): Promise<HTMLCanvasElement> {
  const [crest] = await Promise.all([loadImage(crestSrc), fontsReady(allText(card))]);
  const cv = document.createElement("canvas");
  cv.width = IMG;
  cv.height = IMG;
  const c = cv.getContext("2d");
  if (!c) throw new Error("canvas");
  c.fillStyle = NIGHT;
  c.fillRect(0, 0, IMG, IMG);
  glow(c, 215, 390, 470, 470, GOLD, 0.2);
  glow(c, 0, IMG, 700, 600, BORDO, 0.35);
  scene(c);

  // Sol: arma, gün, tarih, saat, saha
  const cx = 214;
  if (crest) {
    const h = 380, w = (h * crest.naturalWidth) / crest.naturalHeight;
    c.save();
    c.shadowColor = "rgba(0,0,0,.6)";
    c.shadowBlur = 40;
    c.shadowOffsetY = 18;
    c.drawImage(crest, cx - w / 2, 120, w, h);
    c.restore();
  }
  c.fillStyle = alpha(GOLD, 0.7);
  c.fillRect(cx - 60, 548, 120, 2);
  c.fillStyle = GOLD;
  font(c, 800, 56, true);
  spaced(c, up(card.day), cx, 622, 5, "center");
  c.fillStyle = CREAM;
  font(c, 700, 46, true);
  spaced(c, up(card.date), cx, 680, 3, "center");
  c.fillStyle = GOLD;
  font(c, 800, 112, true);
  c.textAlign = "center";
  c.fillText(card.time, cx, 796);
  c.textAlign = "left";
  if (card.venue) {
    font(c, 600, 26);
    const v = fit(c, card.venue, 300), w = c.measureText(v).width + 32;
    pin(c, cx - w / 2 + 10, 838, 26, GOLD);
    c.fillStyle = alpha(CREAM, 0.85);
    c.fillText(v, cx - w / 2 + 32, 848);
  }

  // Sağ üst: slogan (hafif eğik), son satır bordo kutuda, ünlem altın
  const k = Math.tan((7 * Math.PI) / 180), R = IMG - 52;
  c.save();
  c.transform(1, 0, -k, 1, k * 230, 0);
  c.shadowColor = "rgba(0,0,0,.65)";
  c.shadowBlur = 24;
  c.shadowOffsetY = 6;
  c.fillStyle = CREAM;
  font(c, 800, 88, true);
  spaced(c, up(card.lines[0]), R, 136, 1.5, "right");
  spaced(c, up(card.lines[1]), R, 216, 1.5, "right");
  font(c, 800, 112, true);
  const hit = up(card.hit);
  const ex = c.measureText("!").width, hw = c.measureText(hit).width + 2 * (Array.from(hit).length - 1);
  const bw = hw + ex + 48, bt = 238, bh = 112;
  c.shadowColor = "rgba(0,0,0,.55)";
  c.shadowBlur = 40;
  c.shadowOffsetY = 14;
  c.fillStyle = GOLD;
  c.fillRect(R - bw - 3, bt - 3, bw + 6, bh + 6);
  c.shadowColor = "transparent";
  c.fillStyle = BORDO;
  c.fillRect(R - bw, bt, bw, bh);
  c.shadowColor = "rgba(0,0,0,.65)";
  c.shadowBlur = 24;
  c.shadowOffsetY = 6;
  c.fillStyle = CREAM;
  spaced(c, hit, R - bw + 22, bt + 92, 2);
  c.fillStyle = GOLD;
  c.fillText("!", R - 26 - ex, bt + 92);
  c.restore();

  c.strokeStyle = alpha(GOLD, 0.55);
  c.lineWidth = 2;
  c.strokeRect(18, 18, IMG - 36, IMG - 36);
  return cv;
}

export async function posterPng(card: PosterCard): Promise<Blob> {
  return toPng(await drawPoster(card));
}
