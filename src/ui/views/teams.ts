/** Takımlar sekmesi: otomatik/elle kurulum, sürükle-bırak saha, kilitler, eşleşme kuralları. */
import { t } from "../../i18n";
import { isOpen, store, today, ui } from "../../app/store";
import type { Match } from "../../domain/types";
import { POSITIONS } from "../../domain/types";
import { esc, norm, pips, trSort } from "../../domain/text";
import { cleanTeams, currentMatch, getP, lineup } from "../../domain/lineup";
import { teamSum } from "../../domain/teams";
import { strengthFn } from "../../domain/elo";
import { emptyState, filterBar, matchChips, posBadge, posShort, shareButtons } from "../components";
import { pitchSVG } from "../pitch";
import { IC } from "../icons";

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
  if (!m) return emptyState(t("noMatch"), { a: "newMatch", label: t("createMatch") });
  let h = matchChips(m.id);
  const { playing } = lineup(S, m);
  if (playing.length < 2) return h + emptyState(t("needPlayers"), { a: "tab", v: "match", label: t("tabMatch") }) + rulesSection(m);
  const un = cleanTeams(S, m);
  const built = m.teams.a.length || m.teams.b.length;
  const has = built || m.manualTeams;
  h += '<section class="section"><div class="row nowrap">' +
    '<button type="button" class="btn ' + (built ? "" : "primary ") + 'grow" data-a="gen">' + esc(built ? t("reshuffle") : t("buildTeams")) + "</button>" +
    '<button type="button" class="btn grow" data-a="manual">' + esc(t("manual")) + "</button>" +
    "</div>" + (built ? '<div class="row nowrap mt-s">' + shareButtons("teams", t("shareTeams")) + "</div>" : "");
  if (!has) return h + '<p class="muted small mt">' + esc(t("tip")) + "</p></section>" + rulesSection(m);
  h += "</section>";
  if (un.length) {
    h += '<section class="section" aria-labelledby="h-un"><h2 id="h-un">' + esc(t("unassignedN", { n: un.length })) + "</h2>" + filterBar("team", false) + '<ul class="plist" id="list-team">';
    un.map((id) => getP(S, m, id)!).sort(trSort).forEach((p) => {
      h += '<li class="prow" data-n="' + esc(norm(p.name)) + '" data-p="' + esc(p.pos || "") + '"><div class="pmain"><div class="pname"><strong>' + esc(p.name) + '</strong><span class="meta"><span class="pips">' + pips(p.rating) + "</span>" + posBadge(p) + "</span></div>" +
        '<button type="button" class="btn sm bibA" data-a="addTo" data-team="a" data-id="' + esc(p.id) + '">' + esc(t("teamA")) + '</button><button type="button" class="btn sm bibB" data-a="addTo" data-team="b" data-id="' + esc(p.id) + '">' + esc(t("teamB")) + "</button></div></li>";
    });
    h += '</ul><p class="none-msg" id="none-team" hidden>' + esc(t("noResults")) + "</p></section>";
  }
  const str = strengthFn(S, m);
  h += '<section class="section"><div class="pitch-wrap">' + pitchSVG(m, ui.swapPick) + "</div>" +
    (ui.swapPick ? '<p class="pickhint" role="status">' + esc(t("pickSwap", { n: getP(S, m, ui.swapPick)?.name || "" })) + "</p>" : "");
  const col = (ids: string[], cls: "a" | "b", name: string) => {
    const other = cls === "a" ? t("teamB") : t("teamA");
    let c = '<div class="team ' + cls + '"><div class="team-head"><b>' + esc(name) + "</b><span>" + esc(t("teamMeta", { n: ids.length, s: fmt1(teamSum(S, m, ids)) })) + "</span><span>" + esc(posCounts(m, ids)) + "</span></div>";
    ids.forEach((id) => {
      const p = getP(S, m, id)!;
      const locked = m.locks[id] === cls;
      c += '<div class="tprow"><button type="button" class="tp" data-a="move" data-id="' + esc(id) + '" aria-label="' + esc(p.name + " → " + other) + '"><span class="nm">' + esc(p.name) + '</span><span class="sw">' + (p.pos ? esc(t(posShort(p.pos))) + " " : "") + esc(fmt1(str(id))) + "</span></button>" +
        '<button type="button" class="tx lockbtn' + (locked ? " on" : "") + '" data-a="lock" data-id="' + esc(id) + '" data-team="' + cls + '" aria-pressed="' + locked + '" aria-label="' + esc(locked ? t("unlock", { n: p.name }) : t("lockTo", { n: p.name, t: name })) + '">' + (locked ? IC.lock : IC.unlock) + "</button>" +
        '<button type="button" class="tx" data-a="unassign" data-id="' + esc(id) + '" aria-label="' + esc(t("remove") + " " + p.name) + '">' + IC.close + "</button></div>";
    });
    return c + "</div>";
  };
  h += '<div class="teams">' + col(m.teams.a, "a", t("teamA")) + col(m.teams.b, "b", t("teamB")) + "</div>";
  h += '<p class="diff">' + esc(t("strengthDiff")) + ": " + esc(fmt1(Math.abs(teamSum(S, m, m.teams.a) - teamSum(S, m, m.teams.b)))) + '</p><p class="small muted center mt-s">' + esc(t("dragHint")) + "</p></section>";
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
