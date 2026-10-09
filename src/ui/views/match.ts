/** Maç sekmesi: maç bilgileri, katılım listesi, misafir, sonuç ve geçmiş. */
import { money, t, type MsgKey } from "../../i18n";
import { store, today, ui } from "../../app/store";
import type { Att, Match } from "../../domain/types";
import { esc, norm, pips, trSort } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { fieldOf } from "../../domain/fields";
import { currentMatch, isGuest, lineup } from "../../domain/lineup";
import { debtMap, estShare } from "../../domain/money";
import { dayName } from "../../domain/messages";
import { emptyState, fieldCard, fieldOptions, filterBar, matchChips, posBadge, posOptions } from "../components";

const ATT_KEYS: Att[] = ["in", "maybe", "out", "late"];
const ATT_SYM: Record<Att, string> = { in: "✓", maybe: "?", out: "✕", late: "!" };

export function viewMatch(): string {
  const S = store.s;
  if (!S.players.length) return emptyState(t("bulkHint"), { a: "tab", v: "players", label: t("goPlayers") }, t("noPlayersYet"));
  const m = currentMatch(S, ui.matchId, today());
  if (!m) return emptyState(t("noMatch"), { a: "newMatch", label: t("createMatch") }) + historyBlock();
  return matchChips(m.id) + detailsBlock(m) + attendanceBlock(m) + resultBlock(m) + historyBlock();
}

function detailsBlock(m: Match): string {
  const S = store.s;
  const f = fieldOf(S, m);
  const fmt = m.format || S.settings.format;
  return '<section class="section" aria-labelledby="h-info"><h2 id="h-info">' + esc(t("matchInfo")) + '</h2><div class="grid2">' +
    '<label class="fld">' + esc(t("date")) + '<input type="date" data-f="m.date" value="' + esc(m.date) + '"></label>' +
    '<label class="fld">' + esc(t("time")) + '<input type="time" data-f="m.time" value="' + esc(m.time) + '"></label>' +
    '<label class="fld full">' + esc(t("field")) + '<select data-f="m.fieldId">' + fieldOptions(m.fieldId) + "</select></label>" +
    "</div>" + fieldCard(f, true) +
    '<div class="grid2 mt">' +
    '<label class="fld">' + esc(t("price")) + '<input type="number" inputmode="decimal" min="0" data-f="m.price" value="' + esc(m.price) + '"></label>' +
    '<label class="fld">' + esc(t("format")) + '<select data-f="m.format">' + [4, 5, 6, 7, 8, 9, 10].map((n) => '<option value="' + n + '"' + (fmt === n ? " selected" : "") + ">" + n + "+1</option>").join("") + "</select></label>" +
    '</div><p class="small muted mt-s">' + esc(t("perPerson")) + ": ~" + esc(money(estShare(S, m))) + "</p></section>";
}

function attendanceBlock(m: Match): string {
  const S = store.s;
  const { playing, wait } = lineup(S, m);
  const st = (id: string) => m.att[id] || "";
  const dm = debtMap(S, today());
  const people = [...S.players.filter((p) => p.active !== false), ...m.guests];
  let nMaybe = 0, nNone = 0;
  people.forEach((p) => {
    const s = st(p.id);
    if (s === "maybe") nMaybe++;
    else if (!s) nNone++;
  });
  const rank = (id: string) => {
    const s = st(id);
    return s === "in" ? 0 : s === "maybe" ? 1 : !s ? 2 : s === "late" ? 3 : 4;
  };
  people.sort((a, b) => rank(a.id) - rank(b.id) || (rank(a.id) === 0 ? m.order.indexOf(a.id) - m.order.indexOf(b.id) : trSort(a, b)));

  const count = (n: number, k: MsgKey) => '<div class="count"><b>' + n + "</b><span>" + esc(t(k)) + "</span></div>";
  let h = '<section class="section" aria-label="' + esc(t("statusIn")) + '"><div class="counts">' +
    count(playing.length, "in") + count(nMaybe, "maybe") + count(wait.length, "waitlist") + count(nNone, "noReply") + "</div>";
  h += '<div class="row"><button type="button" class="btn primary grow" data-a="msg" data-k="invite">' + esc(t("inviteMsg")) + '</button><button type="button" class="btn grow" data-a="goTeams">' + esc(t("buildTeams")) + "</button></div>";
  h += filterBar("att", true);
  h += '<ul class="plist" id="list-att">';
  people.forEach((p) => {
    const s = st(p.id), g = isGuest(S, p.id);
    const pos = playing.indexOf(p.id), w = wait.indexOf(p.id);
    h += '<li class="prow" data-n="' + esc(norm(p.name)) + '" data-p="' + esc(p.pos || "") + '" data-s="' + (s === "late" ? "out" : s || "none") + '" data-id="' + esc(p.id) + '"><div class="pmain">' +
      '<span class="num">' + (pos >= 0 ? pos + 1 : "") + '</span><div class="pname"><strong>' + esc(p.name) + '</strong><span class="meta"><span class="pips" aria-label="' + esc(t("rating")) + " " + (p.rating || 3) + '">' + pips(p.rating) + "</span>" + posBadge(p) +
      (g ? ' <span class="tag">' + esc(t("guest")) + "</span>" : "") + (w >= 0 ? ' <span class="tag wait">' + esc(t("waitlist")) + " " + (w + 1) + "</span>" : "") + (dm[p.id] ? ' <span class="tag debt">' + esc(t("debtTag")) + "</span>" : "") + "</span></div>" +
      '<div class="seg" role="group" aria-label="' + esc(p.name) + '">' +
      ATT_KEYS.map((k) => '<button type="button" data-a="att" data-id="' + esc(p.id) + '" data-s="' + k + '" class="' + (s === k ? "on-" + k : "") + '" aria-pressed="' + (s === k) + '" aria-label="' + esc(t(k)) + '" title="' + esc(t(k)) + '">' + ATT_SYM[k] + "</button>").join("") +
      "</div>" + (g ? '<button type="button" class="tx" data-a="rmGuest" data-id="' + esc(p.id) + '" aria-label="' + esc(t("remove") + " " + p.name) + '">✕</button>' : "") + "</div></li>";
  });
  h += '</ul><p class="none-msg" id="none-att" hidden>' + esc(t("noResults")) + "</p>";
  h += '<p class="legend">' + esc(t("legend")) + "<br>" + esc(t("enterHint")) + "</p>";
  h += '<h3>' + esc(t("addGuest")) + '</h3><div class="row guest-row"><input type="text" id="guestName" placeholder="' + esc(t("guestName")) + '" aria-label="' + esc(t("guestName")) + '" autocomplete="off" enterkeyhint="done">' +
    '<select id="guestPos" aria-label="' + esc(t("position")) + '">' + posOptions("") + "</select>" +
    '<select id="guestRate" aria-label="' + esc(t("rating")) + '">' + [1, 2, 3, 4, 5].map((r) => '<option value="' + r + '"' + (r === 3 ? " selected" : "") + ">" + r + "/5</option>").join("") + "</select>" +
    '<button type="button" class="btn" data-a="addGuest">' + esc(t("add")) + "</button></div></section>";
  return h;
}

function resultBlock(m: Match): string {
  return '<section class="section" aria-labelledby="h-res"><h2 id="h-res">' + esc(t("result")) + '</h2><div class="scorebox"><span class="sw sw-a" aria-hidden="true"></span>' +
    '<input type="number" id="scA" min="0" inputmode="numeric" aria-label="' + esc(t("teamA")) + '" value="' + (m.score ? m.score.a : "") + '"><span class="score" aria-hidden="true">–</span>' +
    '<input type="number" id="scB" min="0" inputmode="numeric" aria-label="' + esc(t("teamB")) + '" value="' + (m.score ? m.score.b : "") + '"><span class="sw sw-b" aria-hidden="true"></span></div>' +
    '<button type="button" class="btn primary block" data-a="finish">' + esc(t("finish")) + "</button>" +
    '<div class="row center mt"><button type="button" class="btn danger sm" data-a="cancelMatch" data-confirm="1">' + esc(t("cancelMatch")) + '</button><button type="button" class="btn danger sm" data-a="delMatch" data-confirm="1">' + esc(t("deleteMatch")) + "</button></div></section>";
}

export function historyBlock(): string {
  const S = store.s;
  const past = S.matches.filter((m) => m.status !== "open").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!past.length) return "";
  let h = '<section class="section" aria-labelledby="h-hist"><h2 id="h-hist">' + esc(t("history")) + "</h2>";
  past.slice(0, 30).forEach((m) => {
    const res = m.status === "cancelled" ? '<span class="muted">' + esc(t("cancelled")) + "</span>" : '<span class="score">' + (m.score ? m.score.a + " – " + m.score.b : "") + "</span>";
    let sub = "";
    if (m.status === "played" && m.score) sub = m.score.a !== m.score.b ? t("dessert", { t: m.score.a < m.score.b ? t("teamA") : t("teamB") }) : t("draw");
    const f = fieldOf(S, m);
    h += '<div class="hist"><div class="minw0"><strong>' + esc(dayName(m.date)) + " " + esc(ddmm(m.date)) + '</strong> <span class="muted small">' + esc(m.time) + (f ? ", " + esc(f.name) : "") + "</span>" + (sub ? '<div class="small muted">' + esc(sub) + "</div>" : "") +
      '</div><div class="row nowrap">' + res + '<button type="button" class="btn xs ghost" data-a="reopen" data-id="' + esc(m.id) + '">' + esc(t("reopen")) + "</button></div></div>";
  });
  return h + "</section>";
}
