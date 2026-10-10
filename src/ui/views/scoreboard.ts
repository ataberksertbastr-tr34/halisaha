/**
 * Canlı skor tabelası: iki büyük dokunma alanı (sayı için tarafa dokun),
 * servis göstergesi, set/oyun puanı uyarısı, geri al. Durum her dokunuşta
 * kaydedilir; uygulama kapansa da oyun kaldığı yerden sürer.
 */
import { t } from "../../i18n";
import { store } from "../../app/store";
import type { Game, Match } from "../../domain/types";
import { esc } from "../../domain/text";
import { getP } from "../../domain/lineup";
import { replay, type Side } from "../../domain/scoring";
import { teamColor, teamName, onColor } from "../../domain/teamstyle";
import { showModal, updateModal } from "../modal";
import { sheetHead } from "../sheets";
import { ruleChip } from "../components";
import { IC } from "../icons";

export function findGame(id: string): { m: Match; g: Game } | null {
  for (const m of store.s.matches) {
    const g = m.games.find((x) => x.id === id);
    if (g) return { m, g };
  }
  return null;
}

function sideLabel(m: Match, ids: string[]): string {
  const S = store.s;
  const same = (side: string[]) => ids.length && ids.length === side.length && ids.every((id) => side.includes(id));
  if (same(m.teams.a)) return teamName(S, "a");
  if (same(m.teams.b)) return teamName(S, "b");
  return ids.map((id) => (getP(S, m, id)?.name || "?").split(" ")[0]).join(" & ");
}

function sideColor(m: Match, ids: string[], fallback: Side): string {
  const S = store.s;
  const same = (side: string[]) => ids.length && ids.length === side.length && ids.every((id) => side.includes(id));
  if (same(m.teams.a)) return teamColor(S, "a");
  if (same(m.teams.b)) return teamColor(S, "b");
  return fallback === "a" ? "#C9A04B" : "#84191F";
}

function ruleOf(m: Match, g: Game): string {
  if (g.type === "tavla") return "21.4";
  if (m.kind === "volleyball") return "18.2";
  if (m.kind === "footvolley") return "19.5";
  if (m.kind === "tabletennis") return "20.3";
  return "";
}

function body(id: string): string {
  const f = findGame(id);
  if (!f) return sheetHead(t("scoreboard")) + '<p class="muted">' + esc(t("notFound")) + "</p>";
  const { m, g } = f;
  const st = replay(g);
  const panel = (x: Side) => {
    const ids = x === "a" ? g.a : g.b;
    const col = sideColor(m, ids, x);
    const won = st.setsWon[x === "a" ? 0 : 1];
    const pts = st.cur[x === "a" ? 0 : 1];
    const serving = st.server === x;
    const isWin = st.done && st.win === x;
    const big = g.type === "sets" ? pts : st.sets.length ? st.sets[0][x === "a" ? 0 : 1] : pts;
    return '<button type="button" class="sb-side ' + x + (isWin ? " win" : "") + '" data-a="pt" data-id="' + esc(g.id) + '" data-side="' + x + '"' + (st.done ? " disabled" : "") +
      ' style="--sc:' + col + ";--on:" + onColor(col) + '" aria-label="' + esc(t("pointFor", { n: sideLabel(m, ids) })) + '">' +
      '<span class="sb-name">' + esc(sideLabel(m, ids)) + (serving ? '<span class="sb-serve" title="' + esc(t("serving")) + '">●</span>' : "") + "</span>" +
      '<span class="sb-big" aria-live="polite">' + big + "</span>" +
      (g.type === "sets" && g.cfg.bestOf > 1 ? '<span class="sb-sets">' + esc(t("setsWonN", { n: won })) + "</span>" : "") +
      (isWin ? '<span class="sb-win">' + IC.trophy + esc(t("winner")) + "</span>" : "") + "</button>";
  };
  let h = '<div data-sb="' + esc(g.id) + '">' + sheetHead(g.label || t("scoreboard"));
  const rule = ruleOf(m, g);
  const cfgTxt = g.type === "sets" ? t("cfgSets", { to: g.cfg.to, last: g.cfg.last, bo: g.cfg.bestOf }) : g.type === "tavla" ? t("cfgTavla", { to: g.cfg.to }) : "";
  h += '<p class="small muted tight">' + esc(cfgTxt) + " " + ruleChip(rule) + "</p>";
  if (!st.done && st.point) h += '<p class="sb-alert">' + esc(t(g.type === "sets" && st.setsWon[st.point === "a" ? 0 : 1] + 1 >= Math.ceil(g.cfg.bestOf / 2) ? "matchPoint" : g.type === "sets" ? "setPoint" : "gamePoint", { n: sideLabel(m, st.point === "a" ? g.a : g.b) })) + "</p>";
  h += '<div class="sb">' + panel("a") + panel("b") + "</div>";
  if (g.type === "tavla" && !st.done) {
    h += '<div class="row nowrap mt-s"><button type="button" class="btn sm grow" data-a="pt" data-id="' + esc(g.id) + '" data-side="a" data-n="2">' + esc(t("marsFor", { n: sideLabel(m, g.a) })) + '</button><button type="button" class="btn sm grow" data-a="pt" data-id="' + esc(g.id) + '" data-side="b" data-n="2">' + esc(t("marsFor", { n: sideLabel(m, g.b) })) + "</button></div>";
  }
  if (g.type === "sets" && (st.sets.length || st.cur[0] || st.cur[1])) {
    h += '<div class="sb-hist">' + st.sets.map((x, i) => '<span class="sb-set"><small>' + esc(t("setN", { n: i + 1 })) + "</small>" + x[0] + "–" + x[1] + "</span>").join("") +
      (!st.done ? '<span class="sb-set cur"><small>' + esc(t("setN", { n: st.sets.length + 1 })) + "</small>" + st.cur[0] + "–" + st.cur[1] + "</span>" : "") + "</div>";
  }
  h += '<div class="row nowrap mt"><button type="button" class="btn grow" data-a="ptUndo" data-id="' + esc(g.id) + '"' + (g.pts.length || g.win ? "" : " disabled") + ">" + IC.undo + esc(t("undo")) + "</button>" +
    (st.done ? '<button type="button" class="btn primary grow" data-a="closeModal">' + IC.check + esc(t("done")) + "</button>" : '<button type="button" class="btn grow" data-a="ptServe" data-id="' + esc(g.id) + '"' + (g.pts.length || !g.cfg.serve ? " disabled" : "") + ">" + esc(t("swapServe")) + "</button>") + "</div>";
  if (!st.done) h += '<details class="mt"><summary class="small">' + esc(t("endManually")) + '</summary><div class="row mt-s"><button type="button" class="btn sm" data-a="ptEnd" data-id="' + esc(g.id) + '" data-w="a">' + esc(t("winnerIs", { n: sideLabel(m, g.a) })) + '</button><button type="button" class="btn sm" data-a="ptEnd" data-id="' + esc(g.id) + '" data-w="b">' + esc(t("winnerIs", { n: sideLabel(m, g.b) })) + "</button></div></details>";
  return h + "</div>";
}

export function openScoreboard(id: string): void {
  showModal(body(id), "sheet-title", "score");
}

export function refreshScoreboard(id: string): void {
  updateModal(body(id));
}
