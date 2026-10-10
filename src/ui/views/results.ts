/**
 * Sonuç bölümü, etkinlik türüne göre:
 *  - Halı saha: skor, maç saati (Kural 4.1, 3.5), goller ve maçın oyuncusu
 *  - Paintball / airsoft / diğer: raunt sayacı
 *  - Voleybol / ayak tenisi / masa tenisi: set ve sayı tutulan oyunlar
 *  - Kıraathane: masa sonuçları ve tavla skoru
 * Hepsinde: habersiz gelmeyenler (1.6), kural ihlali kaydı, günün oyuncusu.
 */
import { t } from "../../i18n";
import { isOpen, store, today } from "../../app/store";
import type { Game, Match } from "../../domain/types";
import { esc } from "../../domain/text";
import { active, getP, lineup } from "../../domain/lineup";
import { agreeValue, isFootball, kindOf } from "../../domain/kinds";
import { gamesTally, replay, scoreLine } from "../../domain/scoring";
import { partners, tableGame } from "../../domain/draw";
import { teamName } from "../../domain/teamstyle";
import { ruleChip } from "../components";
import { IC } from "../icons";
import { clockHTML } from "../clock";

export function resultBlock(m: Match): string {
  const k = kindOf(m);
  let h = '<section class="section" aria-labelledby="h-res"><h2 id="h-res">' + esc(isFootball(m) ? t("result") : t("eventDay")) + "</h2>";
  if (k.score === "goals") h += footballScore(m);
  else if (k.score === "rounds") h += roundsScore(m);
  else if (k.score === "sets") h += setsScore(m);
  else h += tablesScore(m);
  h += noShowBlock(m);
  if (!isFootball(m)) h += mvpBlock(m);
  h += '<button type="button" class="btn block mt" data-a="discNew" data-mid="' + esc(m.id) + '">' + IC.gavel + esc(t("discRecord")) + "</button>";
  h += '<button type="button" class="btn primary block mt" data-a="finish">' + esc(isFootball(m) ? t("finish") : t("finishEvent")) + "</button>" +
    '<div class="row center mt"><button type="button" class="btn danger sm" data-a="cancelMatch">' + esc(isFootball(m) ? t("cancelMatch") : t("cancelEvent")) + '</button><button type="button" class="btn danger sm" data-a="delMatch">' + esc(isFootball(m) ? t("deleteMatch") : t("deleteEvent")) + "</button></div></section>";
  return h;
}

/* ---------- halı saha ---------- */
function footballScore(m: Match): string {
  const S = store.s;
  let h = clockHTML(m);
  h += '<div class="scorebox"><span class="sw sw-a" aria-hidden="true"></span>' +
    '<input type="number" id="scA" min="0" inputmode="numeric" aria-label="' + esc(teamName(S, "a")) + '" value="' + (m.score ? m.score.a : "") + '"><span class="score" aria-hidden="true">–</span>' +
    '<input type="number" id="scB" min="0" inputmode="numeric" aria-label="' + esc(teamName(S, "b")) + '" value="' + (m.score ? m.score.b : "") + '"><span class="sw sw-b" aria-hidden="true"></span></div>';
  return h + goalsBlock(m);
}

/** Gol kaydı ve maçın oyuncusu; takımlar kurulduysa takım takım. */
function goalsBlock(m: Match): string {
  const S = store.s;
  const playing = active(S, m);
  if (!playing.length) return "";
  const inA = new Set(m.teams.a), inB = new Set(m.teams.b);
  const groups: [string, string, string[]][] = [];
  if (inA.size || inB.size) {
    groups.push(["a", teamName(S, "a"), playing.filter((id) => inA.has(id))]);
    groups.push(["b", teamName(S, "b"), playing.filter((id) => inB.has(id))]);
    const rest = playing.filter((id) => !inA.has(id) && !inB.has(id));
    if (rest.length) groups.push(["", t("noTeam"), rest]);
  } else groups.push(["", "", playing]);
  const sum = (ids: string[]) => ids.reduce((x, id) => x + (m.goals[id] || 0), 0);
  const ga = sum(m.teams.a), gb = sum(m.teams.b);
  const anyGoals = Object.keys(m.goals).length > 0;
  let h = '<details class="goals mt" data-keep="goals-' + esc(m.id) + '"' + (isOpen("goals-" + m.id, anyGoals || !!m.mvp || m.date <= today()) ? " open" : "") + "><summary>" + IC.ball + esc(t("goalsTitle")) + "</summary>" +
    '<p class="small muted">' + esc(t("goalsHint")) + "</p>";
  groups.forEach(([side, title, ids]) => {
    if (!ids.length) return;
    if (title) h += '<div class="ghead ' + side + '">' + esc(title) + (side ? " · " + esc(t("goalsN", { n: sum(ids) })) : "") + "</div>";
    h += '<ul class="glist">';
    ids.forEach((id) => {
      const p = getP(S, m, id);
      if (!p) return;
      const g = m.goals[id] || 0, mvp = m.mvp === id;
      h += '<li class="grow-row"><span class="gname">' + esc(p.name) + "</span>" +
        '<button type="button" class="iconbtn star' + (mvp ? " on" : "") + '" data-a="mvp" data-id="' + esc(id) + '" aria-pressed="' + mvp + '" aria-label="' + esc(t("mvp") + ": " + p.name) + '">' + (mvp ? IC.starFill : IC.star) + "</button>" +
        '<button type="button" class="iconbtn" data-a="goal" data-id="' + esc(id) + '" data-d="-1" aria-label="' + esc(t("removeGoal", { n: p.name })) + '"' + (g ? "" : " disabled") + ">" + IC.minus + "</button>" +
        '<b class="gcount" aria-live="polite">' + g + "</b>" +
        '<button type="button" class="iconbtn plus" data-a="goal" data-id="' + esc(id) + '" data-d="1" aria-label="' + esc(t("addGoal", { n: p.name })) + '">' + IC.plus + "</button></li>";
    });
    h += "</ul>";
  });
  if (anyGoals && (m.teams.a.length || m.teams.b.length)) {
    h += '<p class="small muted m0">' + esc(t("goalSum", { ta: teamName(S, "a"), a: ga, tb: teamName(S, "b"), b: gb })) + (m.score && (m.score.a !== ga || m.score.b !== gb) ? " " + esc(t("goalMismatch")) : "") + "</p>";
  }
  return h + "</details>";
}

/* ---------- raunt (paintball, airsoft, diğer) ---------- */
function roundsScore(m: Match): string {
  const S = store.s;
  const sc = m.score || { a: 0, b: 0 };
  const side = (x: "a" | "b") =>
    '<div class="rpanel ' + x + '"><div class="rp-name">' + esc(teamName(S, x)) + '</div><b class="rp-num" aria-live="polite">' + sc[x] + "</b>" +
    '<div class="rp-btns"><button type="button" class="iconbtn" data-a="round" data-side="' + x + '" data-d="-1" aria-label="' + esc(t("roundMinus", { t: teamName(S, x) })) + '"' + (sc[x] ? "" : " disabled") + ">" + IC.minus + "</button>" +
    '<button type="button" class="btn sm primary" data-a="round" data-side="' + x + '" data-d="1">' + IC.plus + esc(t("roundWon")) + "</button></div></div>";
  return '<p class="small muted tight">' + esc(t(m.kind === "other" ? "scoreHint" : "roundsHint")) + "</p><div class=\"rounds\">" + side("a") + side("b") + "</div>";
}

/* ---------- set/sayı oyunları ---------- */
function sideNames(m: Match, ids: string[]): string {
  const S = store.s;
  if (ids.length && ids.length === m.teams.a.length && ids.every((id) => m.teams.a.includes(id))) return teamName(S, "a");
  if (ids.length && ids.length === m.teams.b.length && ids.every((id) => m.teams.b.includes(id))) return teamName(S, "b");
  return ids.map((id) => (getP(S, m, id)?.name || "?").split(" ")[0]).join(" & ");
}

export function gameRow(m: Match, g: Game): string {
  const st = replay(g);
  const win = st.win === "a" ? sideNames(m, g.a) : st.win === "b" ? sideNames(m, g.b) : "";
  const status = st.done ? (win ? t("winnerIs", { n: win }) : t("drawn")) : t("live");
  return '<li class="game' + (st.done ? " done" : " live") + '"><button type="button" class="game-btn" data-a="score" data-id="' + esc(g.id) + '">' +
    '<span class="g-label">' + esc(g.label) + '</span><span class="g-sides"><b class="' + (st.win === "a" ? "w" : "") + '">' + esc(sideNames(m, g.a)) + '</b> <span class="muted">–</span> <b class="' + (st.win === "b" ? "w" : "") + '">' + esc(sideNames(m, g.b)) + "</b></span>" +
    '<span class="g-score">' + esc(scoreLine(g)) + '</span><span class="g-st">' + esc(status) + "</span></button>" +
    '<button type="button" class="tx" data-a="delGame" data-id="' + esc(g.id) + '" aria-label="' + esc(t("del")) + '">' + IC.close + "</button></li>";
}

function setsScore(m: Match): string {
  const S = store.s;
  let h = "";
  const k = kindOf(m);
  const ruleTxt = m.kind === "volleyball" ? "18.2" : m.kind === "footvolley" ? "19.5" : "20.1";
  h += '<p class="small muted tight">' + esc(t("setsHint")) + " " + ruleChip(ruleTxt) + "</p>";
  if (m.kind === "volleyball") {
    const tally = gamesTally(m);
    if (tally) h += '<div class="tally"><span>' + esc(teamName(S, "a")) + "</span><b>" + tally.a + " – " + tally.b + "</b><span>" + esc(teamName(S, "b")) + "</span></div>";
    if (m.teams.a.length && m.teams.b.length) h += '<button type="button" class="btn primary block" data-a="newGame" data-mode="teams">' + IC.scoreboard + esc(t("startMatchAB", { a: teamName(S, "a"), b: teamName(S, "b") })) + "</button>";
    else h += '<button type="button" class="btn block" data-a="goTeams">' + esc(t("buildTeamsFirst")) + "</button>";
  } else if (k.teams === "draw" || (m.kind === "tabletennis" && agreeValue(m, "mode") === "double")) {
    if (m.draw && m.draw.groups.filter((g) => g.length === m.draw!.size).length >= 2) h += '<button type="button" class="btn primary block" data-a="newGamePick">' + IC.scoreboard + esc(t("newGame")) + "</button>";
    else h += '<button type="button" class="btn block" data-a="goTeams">' + esc(t("drawFirst")) + "</button>";
  } else {
    // Masa tenisi tekler: masadaki iki kişi ya da seçilen iki oyuncu
    h += '<div class="row nowrap"><button type="button" class="btn primary grow" data-a="newGamePick">' + IC.scoreboard + esc(t("newGame")) + '</button><button type="button" class="btn side" data-a="goTeams">' + IC.queue + esc(t("queueTitle")) + "</button></div>";
  }
  const games = m.games.slice().reverse();
  if (games.length) h += '<ul class="games mt">' + games.map((g) => gameRow(m, g)).join("") + "</ul>";
  return h;
}

/* ---------- kıraathane ---------- */
function tablesScore(m: Match): string {
  const S = store.s;
  const name = (id: string) => getP(S, m, id)?.name || "?";
  let h = "";
  const d = m.draw;
  if (!d || !d.groups.length) return h + '<p class="muted small">' + esc(t("tablesNone")) + '</p><button type="button" class="btn block" data-a="goTeams">' + IC.dice + esc(t("drawTables")) + "</button>" + gamesList(m);
  const g = tableGame(d.game);
  d.groups.forEach((grp, i) => {
    const label = t("tableN", { n: i + 1 }) + " · " + (g?.name || d.game);
    const full = grp.length === d.size;
    h += '<div class="tcard"><div class="tc-head"><strong>' + esc(label) + "</strong>" + (full ? "" : '<span class="tag wait">' + esc(t("incomplete")) + "</span>") + "</div>";
    if (d.pairs && grp.length === 4) {
      const [p1, p2] = partners(grp);
      h += '<div class="tc-pairs"><span>' + esc(p1.map(name).join(" & ")) + '</span><span class="muted">' + esc(t("vs")) + "</span><span>" + esc(p2.map(name).join(" & ")) + "</span></div>";
      h += '<div class="row mt-s"><span class="small muted">' + esc(t("whoWon")) + '</span><button type="button" class="btn xs" data-a="tableWin" data-t="' + i + '" data-w="0">' + esc(p1.map((x) => name(x).split(" ")[0]).join(" & ")) + '</button><button type="button" class="btn xs" data-a="tableWin" data-t="' + i + '" data-w="1">' + esc(p2.map((x) => name(x).split(" ")[0]).join(" & ")) + "</button></div>";
    } else {
      h += '<div class="row mt-s"><span class="small muted">' + esc(t("whoWon")) + "</span>" + grp.map((id) => '<button type="button" class="btn xs" data-a="tableWin" data-t="' + i + '" data-id="' + esc(id) + '">' + esc(name(id)) + "</button>").join("") + "</div>";
      if (d.game === "tavla" && grp.length === 2) h += '<button type="button" class="btn sm block mt-s" data-a="newGame" data-mode="tavla" data-t="' + i + '">' + IC.scoreboard + esc(t("tavlaScore")) + "</button>";
    }
    h += "</div>";
  });
  return h + gamesList(m);
}

function gamesList(m: Match): string {
  if (!m.games.length) return "";
  return "<h3>" + esc(t("results")) + '</h3><ul class="games">' + m.games.slice().reverse().map((g) => gameRow(m, g)).join("") + "</ul>";
}

/* ---------- ortak ---------- */
function noShowBlock(m: Match): string {
  const S = store.s;
  const { playing } = lineup(S, m);
  if (!playing.length) return "";
  return "<h3>" + esc(t("noshowTitle")) + " " + ruleChip("1.6") + '</h3><p class="small muted">' + esc(t("noshowHint")) + '</p><div class="phchips">' +
    playing.map((id) => {
      const p = getP(S, m, id);
      const on = !!m.noshow[id];
      return '<button type="button" class="fchip' + (on ? " bad" : "") + '" data-a="noshow" data-id="' + esc(id) + '" aria-pressed="' + on + '">' + esc(p ? p.name : id) + "</button>";
    }).join("") + "</div>";
}

function mvpBlock(m: Match): string {
  const S = store.s;
  const ids = active(S, m);
  if (!ids.length) return "";
  return "<h3>" + IC.star.replace("<svg", '<svg class="h3i"') + " " + esc(t("dayMvp")) + '</h3><div class="phchips">' +
    ids.map((id) => {
      const on = m.mvp === id;
      return '<button type="button" class="fchip' + (on ? " on" : "") + '" data-a="mvp" data-id="' + esc(id) + '" aria-pressed="' + on + '">' + (on ? "★ " : "") + esc(getP(S, m, id)?.name || id) + "</button>";
    }).join("") + "</div>";
}
