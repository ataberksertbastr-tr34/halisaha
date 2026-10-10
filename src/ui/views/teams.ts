/** Takımlar sekmesi: otomatik/elle kurulum, saha çizimi, takım listeleri. */
import { t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import type { Match } from "../../domain/types";
import { POSITIONS } from "../../domain/types";
import { esc, norm, pips, trSort } from "../../domain/text";
import { cleanTeams, currentMatch, getP, lineup } from "../../domain/lineup";
import { teamSum } from "../../domain/teams";
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

export function viewTeams(): string {
  const S = store.s;
  const m = currentMatch(S, ui.matchId, today());
  if (!m) return emptyState(t("noMatch"), { a: "newMatch", label: t("createMatch") });
  let h = matchChips(m.id);
  const { playing } = lineup(S, m);
  if (playing.length < 2) return h + emptyState(t("needPlayers"), { a: "tab", v: "match", label: t("tabMatch") });
  const un = cleanTeams(S, m);
  const built = m.teams.a.length || m.teams.b.length;
  const has = built || m.manualTeams;
  h += '<section class="section"><div class="row nowrap">' +
    '<button type="button" class="btn ' + (built ? "" : "primary ") + 'grow" data-a="gen">' + esc(built ? t("reshuffle") : t("buildTeams")) + "</button>" +
    '<button type="button" class="btn grow" data-a="manual">' + esc(t("manual")) + "</button>" +
    "</div>" + (built ? '<div class="row nowrap mt-s">' + shareButtons("teams", t("shareTeams")) + "</div>" : "");
  if (!has) return h + '<p class="muted small mt">' + esc(t("tip")) + "</p></section>";
  h += "</section>";
  if (un.length) {
    h += '<section class="section" aria-labelledby="h-un"><h2 id="h-un">' + esc(t("unassignedN", { n: un.length })) + "</h2>" + filterBar("team", false) + '<ul class="plist" id="list-team">';
    un.map((id) => getP(S, m, id)!).sort(trSort).forEach((p) => {
      h += '<li class="prow" data-n="' + esc(norm(p.name)) + '" data-p="' + esc(p.pos || "") + '"><div class="pmain"><div class="pname"><strong>' + esc(p.name) + '</strong><span class="meta"><span class="pips">' + pips(p.rating) + "</span>" + posBadge(p) + "</span></div>" +
        '<button type="button" class="btn sm bibA" data-a="addTo" data-team="a" data-id="' + esc(p.id) + '">' + esc(t("teamA")) + '</button><button type="button" class="btn sm bibB" data-a="addTo" data-team="b" data-id="' + esc(p.id) + '">' + esc(t("teamB")) + "</button></div></li>";
    });
    h += '</ul><p class="none-msg" id="none-team" hidden>' + esc(t("noResults")) + "</p></section>";
  }
  h += '<section class="section"><div class="pitch-wrap">' + pitchSVG(m) + "</div>";
  const col = (ids: string[], cls: "a" | "b", name: string) => {
    let c = '<div class="team ' + cls + '"><div class="team-head"><b>' + esc(name) + "</b><span>" + esc(t("teamMeta", { n: ids.length, s: teamSum(S, m, ids) })) + "</span><span>" + esc(posCounts(m, ids)) + "</span></div>";
    ids.forEach((id) => {
      const p = getP(S, m, id)!;
      c += '<div class="tprow"><button type="button" class="tp" data-a="move" data-id="' + esc(id) + '"><span class="nm">' + esc(p.name) + '</span><span class="sw">' + (p.pos ? esc(t(posShort(p.pos))) + " " : "") + (p.rating || 3) + "</span></button>" +
        '<button type="button" class="tx" data-a="unassign" data-id="' + esc(id) + '" aria-label="' + esc(t("remove") + " " + p.name) + '">' + IC.close + "</button></div>";
    });
    return c + "</div>";
  };
  h += '<div class="teams">' + col(m.teams.a, "a", t("teamA")) + col(m.teams.b, "b", t("teamB")) + "</div>";
  h += '<p class="diff">' + esc(t("strengthDiff")) + ": " + Math.abs(teamSum(S, m, m.teams.a) - teamSum(S, m, m.teams.b)) + '</p><p class="small muted center mt-s">' + esc(t("tapToMove")) + "</p></section>";
  return h;
}
