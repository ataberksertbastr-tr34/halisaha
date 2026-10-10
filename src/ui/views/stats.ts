/** İstatistikler: sezon tablosu, en çok maça gelenler, gol krallığı. */
import { t } from "../../i18n";
import { store, ui } from "../../app/store";
import { esc } from "../../domain/text";
import { seasons, seasonTable, type SeasonRow } from "../../domain/stats";
import { subHeader } from "../components";

const pct = (x: number) => Math.round(x * 100);

function seasonChips(list: string[], cur: string): string {
  const items = [...list.map((y) => [y, y]), ["all", t("allTime")]];
  return '<div class="chips" role="tablist" aria-label="' + esc(t("season")) + '">' + items.map(([v, l]) =>
    '<button type="button" role="tab" class="chip' + (v === cur ? " on" : "") + '" aria-selected="' + (v === cur) + '" data-a="season" data-v="' + v + '">' + esc(l) + "</button>").join("") + "</div>";
}

/** Tek serili yatay çubuklar: değer metni çubuğun yanında, renk değil metin taşır. */
function bars(rows: SeasonRow[], value: (r: SeasonRow) => number, label: (r: SeasonRow) => string): string {
  const max = Math.max(1, ...rows.map(value));
  return '<ul class="bars">' + rows.map((r) => {
    const w = (value(r) / max) * 100;
    return '<li title="' + esc(r.name + ": " + label(r)) + '"><button type="button" class="barrow" data-a="nav" data-v="player" data-id="' + esc(r.id) + '"><span class="bname">' + esc(r.name) + '</span><span class="btrack"><span class="bfill" style="width:' + w.toFixed(1) + '%"></span></span><span class="bval">' + esc(label(r)) + "</span></button></li>";
  }).join("") + "</ul>";
}

export function viewStats(): string {
  const S = store.s;
  const list = seasons(S);
  const cur = ui.season || list[0] || "all";
  const rows = seasonTable(S, cur === "all" ? "" : cur);
  let h = subHeader(t("statsTitle"), "more");
  if (!rows.length) return h + '<section class="section empty"><p>' + esc(t("noStats")) + "</p></section>";
  h += seasonChips(list, cur);
  h += '<section class="section" aria-labelledby="h-season"><h2 id="h-season">' + esc(t("seasonTable")) + '</h2><div class="tablewrap"><table class="stable"><thead><tr><th scope="col">#</th><th scope="col" class="tl">' + esc(t("name")) + "</th>" +
    ["colPlayed", "colW", "colD", "colL", "colGoals", "colPts", "colRate"].map((k) => '<th scope="col">' + esc(t(k as never)) + "</th>").join("") + "</tr></thead><tbody>";
  rows.forEach((r, i) => {
    h += '<tr><td class="rank">' + (i + 1) + '</td><th scope="row" class="tl"><button type="button" class="plink" data-a="nav" data-v="player" data-id="' + esc(r.id) + '">' + esc(r.name) + "</button></th>" +
      "<td>" + r.played + "</td><td>" + r.w + "</td><td>" + r.d + "</td><td>" + r.l + "</td><td>" + r.goals + '</td><td class="pts">' + r.pts + "</td><td>%" + pct(r.rate) + "</td></tr>";
  });
  h += '</tbody></table></div><p class="small muted mt-s m0">' + esc(t("tableHint")) + "</p></section>";
  const attended = rows.slice().sort((a, b) => b.played - a.played || b.rate - a.rate || a.name.localeCompare(b.name, "tr")).slice(0, 10);
  h += '<section class="section" aria-labelledby="h-att"><h2 id="h-att">' + esc(t("mostAttended")) + "</h2>" + bars(attended, (r) => r.played, (r) => t("attendN", { n: r.played, r: pct(r.rate) })) + "</section>";
  const scorers = rows.filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals || a.played - b.played).slice(0, 10);
  if (scorers.length) h += '<section class="section" aria-labelledby="h-gol"><h2 id="h-gol">' + esc(t("topScorers")) + "</h2>" + bars(scorers, (r) => r.goals, (r) => t("goalsShort", { n: r.goals })) + "</section>";
  const mvps = rows.filter((r) => r.mvp > 0).sort((a, b) => b.mvp - a.mvp).slice(0, 5);
  if (mvps.length) h += '<section class="section" aria-labelledby="h-mvp"><h2 id="h-mvp">' + esc(t("mvpCount")) + "</h2>" + bars(mvps, (r) => r.mvp, (r) => String(r.mvp)) + "</section>";
  return h;
}
