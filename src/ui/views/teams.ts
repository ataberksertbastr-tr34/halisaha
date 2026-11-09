/**
 * Takımlar sekmesi, etkinlik türüne göre:
 *  - Halı saha: otomatik/elle kurulum, sürükle-bırak saha, kilitler (Kural 3.1–3.4)
 *  - Paintball, airsoft, voleybol, diğer: iki takım
 *  - Ayak tenisi (ve masa tenisi çiftleri): tekli/çiftli/üçlü takım kurası (19.1, 20.6)
 *  - Masa tenisi: kazanan kalır masa sırası (20.7)
 *  - Kıraathane: masa ve eş kurası (21.1)
 */
import { t } from "../../i18n";
import { isOpen, store, today, ui } from "../../app/store";
import type { Match } from "../../domain/types";
import { POSITIONS } from "../../domain/types";
import { esc, norm, pips, trSort } from "../../domain/text";
import { active, cleanTeams, currentMatch, getP } from "../../domain/lineup";
import { teamSum } from "../../domain/teams";
import { strengthFn } from "../../domain/elo";
import { agreeValue, isCup, isFootball, kindOf, L } from "../../domain/kinds";
import { champion, entrants, playable, resolveBracket, roundKey, type BMatch } from "../../domain/bracket";
import { TABLE_GAMES, partners, syncQueue, tableGame } from "../../domain/draw";
import { teamName } from "../../domain/teamstyle";
import { emptyState, filterBar, kindIcon, matchChips, posBadge, posShort, ruleChip, shareButtons } from "../components";
import { pitchSVG } from "../pitch";
import { IC } from "../icons";
import { gameRow } from "./results";
import { scoreLine } from "../../domain/scoring";

function posCounts(m: Match, ids: string[]): string {
  const c: Record<string, number> = {};
  ids.forEach((id) => {
    const k = getP(store.s, m, id)?.pos || "";
    if (k) c[k] = (c[k] || 0) + 1;
  });
  return POSITIONS.filter((k) => c[k]).map((k) => c[k] + " " + t(posShort(k))).join(", ");
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString(store.s.settings.lang === "en" ? "en-GB" : "tr-TR");

export function viewTeams(): string {
  const S = store.s;
  const m = currentMatch(S, ui.matchId, today());
  if (!m) return matchChips("") + emptyState(t("noEvent"), { a: "newEvent", label: t("createEvent") });
  let h = matchChips(m.id);
  const k = kindOf(m);
  const ids = active(S, m);
  if (ids.length < 2) return h + emptyState(t("needPlayers"), { a: "tab", v: "match", label: t("tabMatch") }) + (k.teams === "pitch" || k.teams === "two" ? rulesSection(m) : "");
  if (k.teams === "tables") return h + tablesView(m);
  const cup = isCup(m);
  if (k.teams === "queue" && agreeValue(m, "mode") !== "double") return h + (cup ? cupView(m) : queueView(m));
  if (k.teams === "draw" || k.teams === "queue") return h + drawView(m, cup) + (cup ? cupView(m) : "");
  return h + twoTeamsView(m);
}

/* ---------- iki takım (halı saha sahası ile) ---------- */
function twoTeamsView(m: Match): string {
  const S = store.s;
  const fb = isFootball(m);
  const un = cleanTeams(S, m);
  const built = m.teams.a.length || m.teams.b.length;
  const has = built || m.manualTeams;
  const A = teamName(S, "a"), B = teamName(S, "b");
  let h = '<section class="section"><div class="row nowrap">' +
    '<button type="button" class="btn ' + (built ? "" : "primary ") + 'grow" data-a="gen">' + IC.shuffle + esc(built ? t("reshuffle") : t("buildTeams")) + "</button>" +
    '<button type="button" class="btn grow" data-a="manual">' + esc(t("manual")) + "</button>" +
    "</div>" + (built ? '<div class="row nowrap mt-s">' + shareButtons("teams", t("shareTeams")) + "</div>" : "");
  if (m.kind === "volleyball") h += '<p class="small muted mt-s m0">' + esc(t("volleyTeamsHint", { n: agreeValue(m, "size") || "6" })) + " " + ruleChip("18.1") + "</p>";
  if (!has) return h + '<p class="muted small mt">' + esc(fb ? t("tip") : t("tipEvent")) + " " + ruleChip("3.1") + "</p></section>" + rulesSection(m);
  h += "</section>";
  if (un.length) {
    h += '<section class="section" aria-labelledby="h-un"><h2 id="h-un">' + esc(t("unassignedN", { n: un.length })) + "</h2>" + filterBar("team", false, fb) + '<ul class="plist" id="list-team">';
    un.map((id) => getP(S, m, id)!).sort(trSort).forEach((p) => {
      h += '<li class="prow" data-n="' + esc(norm(p.name)) + '" data-p="' + esc(p.pos || "") + '"><div class="pmain"><div class="pname"><strong>' + esc(p.name) + '</strong><span class="meta"><span class="pips">' + pips(p.rating) + "</span>" + (fb ? posBadge(p) : "") + "</span></div>" +
        '<button type="button" class="btn sm bibA" data-a="addTo" data-team="a" data-id="' + esc(p.id) + '">' + esc(A) + '</button><button type="button" class="btn sm bibB" data-a="addTo" data-team="b" data-id="' + esc(p.id) + '">' + esc(B) + "</button></div></li>";
    });
    h += '</ul><p class="none-msg" id="none-team" hidden>' + esc(t("noResults")) + "</p></section>";
  }
  const str = strengthFn(S, m);
  h += '<section class="section">' + (fb ? '<div class="pitch-wrap">' + pitchSVG(m, ui.swapPick) + "</div>" + (ui.swapPick ? '<p class="pickhint" role="status">' + esc(t("pickSwap", { n: getP(S, m, ui.swapPick)?.name || "" })) + "</p>" : "") : "");
  const col = (ids: string[], cls: "a" | "b", name: string) => {
    const other = cls === "a" ? B : A;
    let c = '<div class="team ' + cls + '"><div class="team-head"><b>' + esc(name) + "</b><span>" + esc(t("teamMeta", { n: ids.length, s: fmt1(teamSum(S, m, ids)) })) + "</span>" + (fb ? "<span>" + esc(posCounts(m, ids)) + "</span>" : "") + "</div>";
    ids.forEach((id) => {
      const p = getP(S, m, id)!;
      const locked = m.locks[id] === cls;
      c += '<div class="tprow"><button type="button" class="tp" data-a="move" data-id="' + esc(id) + '" aria-label="' + esc(p.name + " → " + other) + '"><span class="nm">' + esc(p.name) + '</span><span class="sw">' + (fb && p.pos ? esc(t(posShort(p.pos))) + " " : "") + esc(fmt1(str(id))) + "</span></button>" +
        '<button type="button" class="tx lockbtn' + (locked ? " on" : "") + '" data-a="lock" data-id="' + esc(id) + '" data-team="' + cls + '" aria-pressed="' + locked + '" aria-label="' + esc(locked ? t("unlock", { n: p.name }) : t("lockTo", { n: p.name, t: name })) + '">' + (locked ? IC.lock : IC.unlock) + "</button>" +
        '<button type="button" class="tx" data-a="unassign" data-id="' + esc(id) + '" aria-label="' + esc(t("remove") + " " + p.name) + '">' + IC.close + "</button></div>";
    });
    return c + "</div>";
  };
  h += '<div class="teams">' + col(m.teams.a, "a", A) + col(m.teams.b, "b", B) + "</div>";
  h += '<p class="diff">' + esc(t("strengthDiff")) + ": " + esc(fmt1(Math.abs(teamSum(S, m, m.teams.a) - teamSum(S, m, m.teams.b)))) + '</p><p class="small muted center mt-s">' + esc(fb ? t("dragHint") : t("tapHint")) + "</p></section>";
  return h + rulesSection(m);
}

/** "Bu ikisi aynı takımda olsun / olmasın" kuralları. */
function rulesSection(m: Match): string {
  const S = store.s;
  const name = (id: string) => S.players.find((p) => p.id === id)?.name || getP(S, m, id)?.name || "?";
  const list = S.players.filter((p) => p.active !== false).slice().sort(trSort);
  const opts = (sel: number) => list.map((p, i) => '<option value="' + esc(p.id) + '"' + (i === sel ? " selected" : "") + ">" + esc(p.name) + "</option>").join("");
  let h = '<section class="section"><details data-keep="rules"' + (isOpen("rules", S.pairRules.length > 0) ? " open" : "") + "><summary><h2 class=\"inline\">" + esc(t("pairRules")) + (S.pairRules.length ? " (" + S.pairRules.length + ")" : "") + "</h2></summary>" +
    '<p class="small muted">' + esc(t("pairHint")) + "</p>";
  if (!S.pairRules.length) h += '<p class="muted small">' + esc(t("noRules")) + "</p>";
  else {
    h += '<ul class="llist">';
    S.pairRules.forEach((r) => {
      h += '<li class="lrow"><div class="pname"><strong>' + esc(name(r.a)) + " · " + esc(name(r.b)) + '</strong><span class="meta">' + esc(r.together ? t("together") : t("apart")) + "</span></div>" +
        '<button type="button" class="tx" data-a="delRule" data-id="' + esc(r.id) + '" aria-label="' + esc(t("del")) + '">' + IC.close + "</button></li>";
    });
    h += "</ul>";
  }
  h += '<div class="grid2 mt-s"><label class="fld">1<select id="rule-a">' + opts(0) + '</select></label><label class="fld">2<select id="rule-b">' + opts(1) + "</select></label></div>" +
    '<div class="seg2 mt-s" role="radiogroup" aria-label="' + esc(t("pairRules")) + '">' +
    '<button type="button" role="radio" class="' + (ui.ruleTogether ? "on" : "") + '" aria-checked="' + ui.ruleTogether + '" data-a="ruleMode" data-v="1">' + esc(t("together")) + "</button>" +
    '<button type="button" role="radio" class="' + (!ui.ruleTogether ? "on" : "") + '" aria-checked="' + !ui.ruleTogether + '" data-a="ruleMode" data-v="0">' + esc(t("apart")) + "</button></div>" +
    '<button type="button" class="btn block mt-s" data-a="addRule">' + IC.plus + esc(t("addRule")) + "</button></details></section>";
  return h;
}

/* ---------- takım kurası (ayak tenisi, masa tenisi çiftleri) ---------- */
function drawView(m: Match, cup = false): string {
  const S = store.s;
  const name = (id: string) => getP(S, m, id)?.name || "?";
  const size = m.kind === "tabletennis" ? 2 : Number(agreeValue(m, "fmt")) || 2;
  const d = m.draw && m.draw.game === "teams" ? m.draw : null;
  const fmtName = m.kind === "tabletennis" ? t("ttDoubles") : size === 1 ? t("fvSingles") : size === 2 ? t("fvDoubles") : t("fvTriples");
  let h = '<section class="section"><div class="sec-head">' + kindIcon(m).replace("<svg", '<svg class="h2i"') + "<h2>" + esc(t("teamDraw")) + "</h2></div>" +
    '<p class="small muted tight">' + esc(t("teamDrawHint", { f: fmtName, n: size })) + " " + ruleChip(m.kind === "tabletennis" ? "20.6" : "19.1") + "</p>" +
    '<button type="button" class="btn ' + (d ? "" : "primary ") + 'block" data-a="drawTeams" data-n="' + size + '">' + IC.shuffle + esc(d ? t("redraw") : t("drawNow")) + "</button>";
  if (d) {
    const full = d.groups.filter((g) => g.length === d.size);
    h += '<div class="dgroups mt">';
    d.groups.forEach((g, i) => {
      const isFull = g.length === d.size;
      h += '<div class="dgroup' + (isFull ? "" : " rest") + '"><span class="dg-n">' + esc(isFull ? t("teamN", { n: i + 1 }) : t("waitlist")) + '</span><span class="dg-m">' + esc(g.map(name).join(" · ")) + "</span></div>";
    });
    h += "</div>";
    if (full.length >= 2 && !cup) h += '<button type="button" class="btn primary block mt" data-a="newGamePick">' + IC.scoreboard + esc(t("newGame")) + "</button>";
  }
  h += "</section>";
  if (m.games.length && !cup) h += '<section class="section"><h2>' + esc(t("results")) + '</h2><ul class="games">' + m.games.slice().reverse().map((g) => gameRow(m, g)).join("") + "</ul></section>";
  return h;
}

/* ---------- turnuva: eleme tablosu (Kural 20.1) ---------- */

/** Turnuvaya girecek taraflar: teklerde katılımcılar, çiftlerde/ayak tenisinde kura takımları. */
export function cupSides(m: Match): string[][] {
  const singles = m.kind === "tabletennis" && agreeValue(m, "mode") !== "double";
  if (singles) return active(store.s, m).map((id) => [id]);
  const d = m.draw && m.draw.game === "teams" ? m.draw : null;
  return d ? d.groups.filter((g) => g.length === d.size) : [];
}

function sideTxt(m: Match, ids: string[] | null): string {
  if (!ids) return "";
  return ids.map((id) => (getP(store.s, m, id)?.name || "?").split(" ")[0]).join(" & ");
}

export function roundLabel(total: number, r: number): string {
  const k = roundKey(total, r);
  return k.k === "final" ? t("rFinal") : k.k === "semi" ? t("rSemi") : k.k === "quarter" ? t("rQuarter") : k.k === "last16" ? t("rLast16") : t("rN", { n: k.n });
}

function cupMatch(m: Match, bm: BMatch, total: number): string {
  const gm = bm.gid ? m.games.find((g) => g.id === bm.gid) : null;
  const score = gm ? scoreLine(gm) : "";
  const side = (x: "a" | "b") => {
    const ids = x === "a" ? bm.a : bm.b;
    const won = bm.win === x;
    const lost = !!bm.win && !won;
    return '<span class="cm-side' + (won ? " won" : "") + (lost ? " lost" : "") + '">' + (ids ? esc(sideTxt(m, ids)) : '<i class="muted">' + esc(bm.bye ? t("cupBye") : t("cupTbd")) + "</i>") + (won ? IC.check : "") + "</span>";
  };
  const ready = !!bm.a && !!bm.b;
  let status = "";
  if (bm.bye) status = t("cupByeLine");
  else if (bm.win) status = score ? score : t("cupDecided");
  else if (gm) status = t("live") + (score ? " · " + score : "");
  else if (ready) status = t("cupPlay");
  else status = t("cupWaiting");
  const label = roundLabel(total, bm.r) + (total - bm.r > 1 ? " · " + (bm.i + 1) : "");
  const cls = "cmatch" + (bm.win ? " done" : ready ? " ready" : " wait") + (gm && !bm.win ? " live" : "");
  if (ready && !bm.bye) {
    return '<li class="' + cls + '"><button type="button" class="cm-btn" data-a="cupPlay" data-r="' + bm.r + '" data-i="' + bm.i + '" aria-label="' + esc(label + ": " + sideTxt(m, bm.a) + " – " + sideTxt(m, bm.b)) + '"><span class="cm-l">' + esc(label) + "</span>" + side("a") + side("b") + '<span class="cm-st">' + esc(status) + "</span></button></li>";
  }
  return '<li class="' + cls + '"><div class="cm-btn"><span class="cm-l">' + esc(label) + "</span>" + side("a") + side("b") + '<span class="cm-st">' + esc(status) + "</span></div></li>";
}

function cupView(m: Match): string {
  const sides = cupSides(m);
  const bo = Number(agreeValue(m, "bo")) || 3;
  let h = '<section class="section cup" aria-labelledby="h-cup"><div class="sec-head">' + IC.trophy.replace("<svg", '<svg class="h2i"') + '<h2 id="h-cup">' + esc(t("cupTitle")) + "</h2>" + ruleChip("20.1") + "</div>";
  h += '<p class="small muted tight">' + esc(m.kind === "tabletennis" ? t("cupHintTT", { bo }) : t("cupHint")) + "</p>";
  if (!m.bracket || !m.bracket.seeds.length) {
    if (sides.length < 2) return h + '<p class="muted small m0">' + esc(m.kind === "tabletennis" && agreeValue(m, "mode") !== "double" ? t("needPlayers") : t("cupNeedDraw")) + "</p></section>";
    return h + '<button type="button" class="btn primary block" data-a="cupStart">' + IC.shuffle + esc(t("cupStart", { n: sides.length })) + "</button></section>";
  }
  const rounds = resolveBracket(m.bracket, m.games);
  const champ = champion(rounds);
  const total = rounds.length;
  if (champ) {
    h += '<div class="champ"><span class="champ-ic">' + IC.trophy + '</span><div class="minw0"><span class="champ-k">' + esc(t("cupChampion")) + '</span><b class="champ-n">' + esc(sideTxt(m, champ)) + "</b></div></div>";
  } else {
    const next = playable(rounds);
    h += '<p class="cup-meta">' + esc(t("cupMeta", { n: entrants(m.bracket), r: total, p: next.length })) + "</p>";
  }
  rounds.forEach((ms, r) => {
    h += '<h3 class="cup-r">' + esc(roundLabel(total, r)) + '</h3><ul class="cmatches">' + ms.map((bm) => cupMatch(m, bm, total)).join("") + "</ul>";
  });
  const stale = sides.length !== entrants(m.bracket);
  if (stale) h += '<p class="warnline small mt-s">' + esc(t("cupStale")) + "</p>";
  h += '<div class="row nowrap mt">' + '<button type="button" class="btn primary grow" data-a="cupShare">' + IC.share + esc(t("cupShare")) + "</button>" +
    '<button type="button" class="btn side" data-a="cupStart" data-confirm="1">' + IC.shuffle + esc(t("cupRedraw")) + "</button></div>";
  return h + "</section>";
}

/* ---------- masa sırası: kazanan kalır (masa tenisi) ---------- */
function queueView(m: Match): string {
  const S = store.s;
  const name = (id: string) => getP(S, m, id)?.name || "?";
  const ids = active(S, m);
  const max = Number(agreeValue(m, "queue"));
  let h = '<section class="section"><div class="sec-head">' + IC.queue.replace("<svg", '<svg class="h2i"') + "<h2>" + esc(t("queueTitle")) + "</h2></div>" +
    '<p class="small muted tight">' + esc(max ? t("queueHint", { n: max }) : t("queueHintFree")) + " " + ruleChip("20.7") + "</p>";
  if (!m.queue) return h + '<button type="button" class="btn primary block" data-a="queueStart">' + IC.shuffle + esc(t("queueStart")) + "</button></section>";
  const q = syncQueue(m.queue, ids);
  const [x, y] = q.table;
  if (x && y) {
    const champ = q.streak > 0 ? x : "";
    h += '<div class="qtable"><div class="qt-p' + (champ === x ? " champ" : "") + '"><b>' + esc(name(x)) + "</b>" + (champ === x ? '<span class="tag gold">' + esc(t("streakN", { n: q.streak })) + "</span>" : "") + "</div>" +
      '<span class="qt-vs">' + esc(t("vs")) + '</span><div class="qt-p"><b>' + esc(name(y)) + "</b></div></div>" +
      '<div class="row nowrap mt-s"><button type="button" class="btn grow" data-a="queueWin" data-id="' + esc(x) + '">' + esc(t("wonShort", { n: name(x).split(" ")[0] })) + '</button><button type="button" class="btn grow" data-a="queueWin" data-id="' + esc(y) + '">' + esc(t("wonShort", { n: name(y).split(" ")[0] })) + "</button></div>" +
      '<button type="button" class="btn primary block mt-s" data-a="newGame" data-mode="queue">' + IC.scoreboard + esc(t("scoreTable")) + "</button>";
  } else h += '<p class="muted small">' + esc(t("queueNeedTwo")) + "</p>";
  if (q.order.length) h += "<h3>" + esc(t("queueNext")) + '</h3><ol class="qorder">' + q.order.map((id) => "<li>" + esc(name(id)) + "</li>").join("") + "</ol>";
  h += '<button type="button" class="btn ghost block mt-s" data-a="queueStart" data-confirm="1">' + IC.shuffle + esc(t("queueReset")) + "</button></section>";
  if (m.games.length) h += '<section class="section"><h2>' + esc(t("results")) + '</h2><ul class="games">' + m.games.slice().reverse().map((g) => gameRow(m, g)).join("") + "</ul></section>";
  return h;
}

/* ---------- masa kurası (kıraathane) ---------- */
function tablesView(m: Match): string {
  const S = store.s;
  const name = (id: string) => getP(S, m, id)?.name || "?";
  const d = m.draw && m.draw.game !== "teams" ? m.draw : null;
  const game = tableGame(ui.drawGame) || TABLE_GAMES[0];
  let h = '<section class="section"><div class="sec-head">' + IC.dice.replace("<svg", '<svg class="h2i"') + "<h2>" + esc(t("tableDraw")) + "</h2></div>" +
    '<p class="small muted tight">' + esc(t("tableDrawHint")) + " " + ruleChip("21.1") + "</p>" +
    '<div class="phchips">' + TABLE_GAMES.map((g) => '<button type="button" class="fchip' + (g.id === game.id ? " on" : "") + '" data-a="drawGame" data-v="' + g.id + '" aria-pressed="' + (g.id === game.id) + '">' + esc(g.name) + " · " + g.size + "</button>").join("") + "</div>" +
    (game.pairs ? '<button type="button" class="toggle mt-s' + (ui.drawPairs ? " on" : "") + '" data-a="drawPairs" aria-pressed="' + ui.drawPairs + '">' + esc(t("pairsMode")) + "</button>" : "") +
    '<button type="button" class="btn primary block mt" data-a="drawTables">' + IC.shuffle + esc(d ? t("redraw") : t("drawNow")) + "</button>";
  if (d) {
    const g = tableGame(d.game);
    h += '<div class="dgroups mt">';
    d.groups.forEach((grp, i) => {
      const full = grp.length === d.size;
      let members = grp.map(name).join(" · ");
      if (d.pairs && grp.length === 4) {
        const [p1, p2] = partners(grp);
        members = p1.map(name).join(" & ") + "  ⟷  " + p2.map(name).join(" & ");
      }
      h += '<div class="dgroup' + (full ? "" : " rest") + '"><span class="dg-n">' + esc(t("tableN", { n: i + 1 }) + " · " + (g?.name || d.game)) + (full ? "" : " · " + esc(t("incomplete"))) + '</span><span class="dg-m">' + esc(members) + "</span></div>";
    });
    h += '</div><p class="small muted mt-s m0">' + esc(t("tableRulesHint")) + " " + ruleChip("21.2") + "</p>";
    h += '<button type="button" class="btn block mt" data-a="tab" data-v="match">' + IC.trophy + esc(t("tablesToResults")) + "</button>";
  }
  void L;
  return h + "</section>";
}
