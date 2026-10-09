/** Saha çizimi (SVG): kaleci kalede, defans/orta saha/forvet sıralı. */
import { t } from "../i18n";
import { store } from "../app/store";
import type { Match, Person } from "../domain/types";
import { esc } from "../domain/text";
import { getP, isGK } from "../domain/lineup";
import { posShort } from "./components";

export const PITCH_W = 300;
export const PITCH_H = 470;

export function pitchSVG(m: Match): string {
  const W = PITCH_W, H = PITCH_H;
  let s = '<svg class="pitch" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(t("tabTeams")) + '">';
  s += '<rect width="' + W + '" height="' + H + '" fill="#1E6A42"/>';
  for (let i = 1; i < 10; i += 2) s += '<rect x="0" y="' + (i * H) / 10 + '" width="' + W + '" height="' + H / 10 + '" fill="#246F47"/>';
  const ln = 'fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2"';
  s += '<rect x="12" y="12" width="' + (W - 24) + '" height="' + (H - 24) + '" ' + ln + '/><line x1="12" y1="' + H / 2 + '" x2="' + (W - 12) + '" y2="' + H / 2 + '" ' + ln + '/><circle cx="' + W / 2 + '" cy="' + H / 2 + '" r="38" ' + ln + "/>";
  s += '<rect x="80" y="12" width="140" height="58" ' + ln + '/><rect x="80" y="' + (H - 70) + '" width="140" height="58" ' + ln + '/><rect x="122" y="5" width="56" height="7" ' + ln + '/><rect x="122" y="' + (H - 12) + '" width="56" height="7" ' + ln + "/>";
  const draw = (ids: string[], top: boolean) => {
    const ps = ids.map((id) => getP(store.s, m, id)).filter(Boolean) as Person[];
    const gk = ps.find(isGK);
    const rest = ps.filter((p) => p !== gk);
    const by: Record<string, Person[]> = { DEF: [], MID: [], FWD: [] };
    rest.forEach((p) => (by[p.pos] || by.MID).push(p));
    const rows: Person[][] = [];
    [by.DEF, by.MID, by.FWD].forEach((r) => {
      if (!r.length) return;
      if (r.length <= 4) rows.push(r);
      else {
        const h = Math.ceil(r.length / 2);
        rows.push(r.slice(0, h), r.slice(h));
      }
    });
    const color = top ? "#E2F01C" : "#FF6A1A";
    const pts: { p: Person; x: number; y: number }[] = [];
    if (gk) pts.push({ p: gk, x: W / 2, y: 42 });
    rows.forEach((r, ri) => {
      const y = rows.length === 1 ? 140 : 92 + ri * (96 / (rows.length - 1));
      r.forEach((p, j) => pts.push({ p, x: 30 + ((W - 60) * (j + 1)) / (r.length + 1), y }));
    });
    pts.forEach((o) => {
      const y = top ? o.y : H - o.y;
      const nm = o.p.name.length > 10 ? o.p.name.slice(0, 9) + "…" : o.p.name;
      s += '<g class="pp" data-id="' + esc(o.p.id) + '" data-side="' + (top ? "a" : "b") + '">';
      s += '<circle cx="' + o.x + '" cy="' + y + '" r="12" fill="' + color + '" stroke="#13201A" stroke-width="2"/>';
      if (o.p.pos) {
        const lbl = t(posShort(o.p.pos));
        s += '<text x="' + o.x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="' + (lbl.length > 1 ? 9 : 11) + '" font-weight="700" fill="#13201A">' + esc(lbl) + "</text>";
      }
      s += '<text x="' + o.x + '" y="' + (y + 27) + '" text-anchor="middle" font-size="12" font-weight="600" fill="#fff" stroke="#0F3B24" stroke-width="3" paint-order="stroke">' + esc(nm) + "</text></g>";
    });
  };
  draw(m.teams.a, true);
  draw(m.teams.b, false);
  return s + "</svg>";
}
