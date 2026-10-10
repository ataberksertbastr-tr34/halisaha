/**
 * Etkinlik sekmesi: etkinlik kartı, hazırlık ve ön anlaşmalar, katılım
 * listesi, misafir, ulaşım, sonuç ve geçmiş. Halı saha maçı ve diğer tüm
 * etkinlik türleri (Kısım 3) aynı ekranı kullanır; bölümler türe göre değişir.
 */
import { money, t, type MsgKey } from "../../i18n";
import { store, today, ui } from "../../app/store";
import type { Att, Match } from "../../domain/types";
import { esc, norm, pips, trSort } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { dirUrl, fieldOf, mapsUrl, telHref } from "../../domain/fields";
import { capOf, currentMatch, isGuest, lineup, penalized } from "../../domain/lineup";
import { estShare } from "../../domain/money";
import { debtMap } from "../../domain/ledger";
import { dayName } from "../../domain/messages";
import { copyCandidates, isLocked, lockAt, lockHours, noShowLastTime, reliability } from "../../domain/roster";
import { checkProgress, eventTitle, isFootball, kindOf, L, pendingAgreements } from "../../domain/kinds";
import { joinBlock, statusMap } from "../../domain/discipline";
import { teamName } from "../../domain/teamstyle";
import { emptyState, fieldOptions, filterBar, kindIcon, matchChips, posBadge, posOptions, ruleChip, shareButtons } from "../components";
import { IC } from "../icons";
import { prepBlock } from "./prep";
import { carsBlock } from "./cars";
import { resultBlock } from "./results";

const ATT_KEYS: Att[] = ["in", "maybe", "out", "late"];
const ATT_SYM: Record<Att, string> = { in: "✓", maybe: "?", out: "✕", late: "!" };

export function viewMatch(): string {
  const S = store.s;
  if (!S.players.length) return emptyState(t("bulkHint"), { a: "tab", v: "players", label: t("goPlayers") }, t("noPlayersYet"));
  const m = currentMatch(S, ui.matchId, today());
  if (!m) return matchChips("") + emptyState(t("noEvent"), { a: "newEvent", label: t("createEvent") }) + historyBlock();
  return matchChips(m.id) + matchCard(m) + prepBlock(m) + attendanceBlock(m) + (isFootball(m) ? "" : carsBlock(m)) + resultBlock(m) + historyBlock();
}

/** "Per 16.10 11:00" */
function whenShort(d: Date): string {
  const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return dayName(iso).slice(0, 3) + " " + ddmm(iso) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/** Kompakt etkinlik kartı: özet + kısayollar; "Düzenle" ile tüm alanlar açılır. */
function matchCard(m: Match): string {
  const S = store.s;
  const k = kindOf(m);
  const fb = isFootball(m);
  const f = fieldOf(S, m);
  const fmt = m.format || S.settings.format;
  const open = ui.detailsOpen;
  const map = mapsUrl(f), dir = dirUrl(f), ph = telHref(f?.phone);
  const cap = capOf(S, m);
  const lock = lockAt(m);
  const meta: string[] = [];
  if (fb) meta.push(fmt + "+1");
  else meta.push(cap ? t("capN", { n: cap }) : t("capNone"));
  meta.push(money(Number(m.price) || 0));
  meta.push(t("perPerson") + " ~" + money(estShare(S, m)));
  let h = '<section class="section mcard" aria-labelledby="h-info"><div class="mc-head"><div class="minw0">' +
    '<p class="mc-title">' + kindIcon(m) + "<span>" + esc(fb ? t("matchInfo") : L(k.name)) + "</span></p>" +
    (fb ? "" : '<h2 id="h-info" class="mc-name">' + esc(eventTitle(m)) + "</h2>") +
    (fb ? '<h2 id="h-info" class="visually-hidden">' + esc(t("matchInfo")) + "</h2>" : "") +
    '<div class="mc-sum">' + IC.map + "<span>" + esc(f ? f.name : t("noField")) + "</span></div>" +
    '<div class="mc-meta">' + esc(meta.join(" · ")) + "</div>" +
    (!fb && lock ? '<div class="mc-meta">' + IC.lock.replace("<svg", '<svg class="mi"') + esc(t("lockLine", { d: whenShort(lock), h: lockHours(m) })) + " " + ruleChip("15.3") + "</div>" : "") +
    "</div>" +
    '<button type="button" class="btn sm" data-a="toggleDetails" aria-expanded="' + open + '" aria-controls="mc-edit">' + esc(open ? t("done") : t("edit")) + "</button></div>";
  const links: string[] = [];
  links.push('<button type="button" class="qbtn' + (m.reserved ? " done" : " warn") + '" data-a="reserve" data-id="' + esc(m.id) + '" aria-pressed="' + m.reserved + '">' + (m.reserved ? IC.check : IC.alert) + "<span>" + esc(m.reserved ? t("reserved") : t("notReserved")) + "</span></button>");
  if (ph) links.push('<a class="qbtn" href="tel:' + esc(ph) + '">' + IC.phone + "<span>" + esc(t("call")) + "</span></a>");
  links.push('<button type="button" class="qbtn" data-a="calendar" data-id="' + esc(m.id) + '">' + IC.calendar + "<span>" + esc(t("addCalendar")) + "</span></button>");
  if (map) links.push('<a class="qbtn" href="' + esc(map) + '" target="_blank" rel="noopener">' + IC.map + "<span>" + esc(t("openMap")) + "</span></a>");
  if (dir) links.push('<a class="qbtn" href="' + esc(dir) + '" target="_blank" rel="noopener">' + IC.nav + "<span>" + esc(t("directions")) + "</span></a>");
  links.push('<button type="button" class="qbtn" data-a="nav" data-v="rules" data-id="s' + esc(k.sections[0] === "1" ? "1" : k.sections[k.sections.length - 1]) + '">' + IC.book + "<span>" + esc(t("rulesTitle")) + "</span></button>");
  h += '<div class="qrow">' + links.join("") + "</div>";
  if (open) {
    h += '<div id="mc-edit" class="mc-edit"><div class="grid2">' +
      (fb ? "" : '<label class="fld full">' + esc(t("eventTitle")) + '<input type="text" data-f="m.title" value="' + esc(m.title) + '" placeholder="' + esc(L(k.name)) + '" autocomplete="off"></label>') +
      '<label class="fld">' + esc(t("date")) + '<input type="date" data-f="m.date" value="' + esc(m.date) + '"></label>' +
      '<label class="fld">' + esc(t("time")) + '<input type="time" data-f="m.time" value="' + esc(m.time) + '"></label>' +
      '<label class="fld full">' + esc(fb ? t("field") : t("venue")) + '<select data-f="m.fieldId">' + fieldOptions(m.fieldId) + "</select></label>" +
      '<label class="fld">' + esc(fb ? t("price") : t("eventPrice")) + '<input type="number" inputmode="decimal" min="0" data-f="m.price" value="' + esc(m.price) + '"></label>';
    if (fb) h += '<label class="fld">' + esc(t("format")) + '<select data-f="m.format">' + [4, 5, 6, 7, 8, 9, 10].map((n) => '<option value="' + n + '"' + (fmt === n ? " selected" : "") + ">" + n + "+1</option>").join("") + "</select></label>";
    else {
      h += '<label class="fld">' + esc(t("capacity")) + '<input type="number" inputmode="numeric" min="0" data-f="m.cap" value="' + esc(m.cap || "") + '" placeholder="' + esc(t("capNone")) + '"></label>' +
        '<label class="fld full">' + esc(t("lockTime")) + '<select data-f="m.lockH">' + [0, 12, 24, 48, 72, 96].map((n) => '<option value="' + n + '"' + (lockHours(m) === n ? " selected" : "") + ">" + esc(n ? t("lockHN", { n }) : t("lockNone")) + "</option>").join("") + "</select></label>";
    }
    h += '<label class="fld full">' + esc(t("eventNote")) + '<input type="text" data-f="m.note" value="' + esc(m.note) + '" placeholder="' + esc(t("eventNoteHint")) + '" autocomplete="off"></label>';
    h += "</div>" + (f && f.id ? '<button type="button" class="linkbtn mt-s" data-a="editField" data-id="' + esc(f.id) + '">' + esc(t("editField")) + "</button>" : "") + "</div>";
  }
  return h + "</section>";
}

function attendanceBlock(m: Match): string {
  const S = store.s;
  const fb = isFootball(m);
  const { playing, wait } = lineup(S, m);
  const st = (id: string) => m.att[id] || "";
  const dm = debtMap(S, today());
  const rel = reliability(S);
  const disc = statusMap(S);
  const noShowPrev = noShowLastTime(S, m);
  const hurt = injuredLastTime(m);
  const pen = penalized(S, m);
  // Davet edilmeyenler listede görünmez (yanıtı varsa görünür)
  const people = [...S.players.filter((p) => p.active !== false && (!!m.att[p.id] || !blockedHard(m, p.id, disc))), ...m.guests];
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
  const order = [...playing, ...wait];
  people.sort((a, b) => rank(a.id) - rank(b.id) || (rank(a.id) === 0 ? order.indexOf(a.id) - order.indexOf(b.id) : trSort(a, b)));
  const locked = isLocked(m, new Date());

  const count = (n: number, k: MsgKey) => '<div class="count"><b>' + n + "</b><span>" + esc(t(k)) + "</span></div>";
  let h = '<section class="section" aria-label="' + esc(t("statusIn")) + '"><div class="counts">' +
    count(playing.length, "in") + count(nMaybe, "maybe") + count(wait.length, "waitlist") + count(nNone, "noReply") + "</div>";
  if (locked) {
    h += '<div class="notice"><div class="notice-tx"><strong>' + IC.lock + esc(t("locked")) + "</strong><span>" + esc(fb ? t("lockedHint") : t("lockedHintEv", { h: lockHours(m) })) + "</span></div>" +
      '<div class="row nowrap">' + shareButtons("squad", t("squadMsg")) + "</div></div>";
  }
  h += '<div class="row nowrap">' + shareButtons("invite", t("inviteMsg")) + '<button type="button" class="btn side" data-a="goTeams">' + esc(kindOf(m).teams === "tables" ? t("drawTables") : t("buildTeams")) + "</button></div>";
  const cands = copyCandidates(S, m).length;
  if (cands) h += '<button type="button" class="btn block ghost mt-s" data-a="copyLastWeek">' + IC.copy + esc(fb ? t("copyLastWeek") : t("copyLastEvent")) + " (" + cands + ")</button>";
  h += filterBar("att", true, fb);
  h += '<ul class="plist" id="list-att">';
  people.forEach((p) => {
    const s = st(p.id), g = isGuest(S, p.id);
    const pos = playing.indexOf(p.id), w = wait.indexOf(p.id);
    const r = rel[p.id];
    const ds = disc[p.id];
    const block = joinBlock(S, m, p.id, dm[p.id] || 0, ds);
    const tags =
      (g ? ' <span class="tag">' + esc(t("guest")) + "</span>" : "") +
      ("fixed" in p && p.fixed && fb ? ' <span class="tag fix">' + esc(t("fixedTag")) + "</span>" : "") +
      (w >= 0 ? ' <span class="tag wait">' + esc(t("waitlist")) + " " + (w + 1) + "</span>" : "") +
      (m.removed[p.id] ? ' <span class="tag ban">' + esc(t("removedTag", { r: m.removed[p.id] })) + "</span>" : "") +
      (block && block.why !== "debt" ? ' <span class="tag ban">' + esc(t(("block_" + block.why) as MsgKey)) + "</span>" : "") +
      (dm[p.id] ? ' <span class="tag debt">' + esc(t("debtTag")) + "</span>" : "") +
      (pen.has(p.id) ? ' <span class="tag wait">' + esc(t("penaltyTag")) + "</span>" : noShowPrev.has(p.id) ? ' <span class="tag debt">' + esc(t("noshowLast")) + "</span>" : "") +
      (ds && ds.warnings && !block ? ' <span class="tag wait">' + esc(t("warnN", { n: ds.warnings })) + "</span>" : "") +
      (hurt.has(p.id) ? ' <span class="tag wait">✚ ' + esc(t("injuredTag")) + "</span>" : "") +
      (r && r.commits >= 3 && r.score < 80 ? ' <span class="tag wait">' + esc(t("relTag", { n: r.score })) + "</span>" : "");
    h += '<li class="prow" data-n="' + esc(norm(p.name)) + '" data-p="' + esc(p.pos || "") + '" data-s="' + (s === "late" ? "out" : s || "none") + '" data-id="' + esc(p.id) + '"><div class="pmain">' +
      '<span class="num">' + (pos >= 0 ? pos + 1 : "") + '</span><div class="pname"><strong>' + esc(p.name) + '</strong><span class="meta"><span class="pips" aria-label="' + esc(t("rating")) + " " + (p.rating || 3) + '">' + pips(p.rating) + "</span>" + (fb ? posBadge(p) : "") + tags + "</span></div>" +
      '<div class="seg" role="group" aria-label="' + esc(p.name) + '">' +
      ATT_KEYS.map((k) => '<button type="button" data-a="att" data-id="' + esc(p.id) + '" data-s="' + k + '" class="' + (s === k ? "on-" + k : "") + '" aria-pressed="' + (s === k) + '" aria-label="' + esc(t(k)) + '" title="' + esc(t(k)) + '">' + ATT_SYM[k] + "</button>").join("") +
      "</div>" + (g ? '<button type="button" class="tx" data-a="rmGuest" data-id="' + esc(p.id) + '" aria-label="' + esc(t("remove") + " " + p.name) + '">' + IC.close + "</button>" : "") + "</div></li>";
  });
  h += '</ul><p class="none-msg" id="none-att" hidden>' + esc(t("noResults")) + "</p>";
  h += '<p class="legend">' + esc(t("legend")) + "<br>" + esc(t("enterHint")) + "</p>";
  const hosts = S.players.filter((p) => p.active !== false).slice().sort(trSort);
  h += "<h3>" + esc(t("addGuest")) + " " + ruleChip("1.8") + '</h3><div class="row guest-row"><input type="text" id="guestName" placeholder="' + esc(t("guestName")) + '" aria-label="' + esc(t("guestName")) + '" autocomplete="off" enterkeyhint="done">' +
    (fb ? '<select id="guestPos" aria-label="' + esc(t("position")) + '">' + posOptions("") + "</select>" : "") +
    '<select id="guestRate" aria-label="' + esc(t("rating")) + '">' + [1, 2, 3, 4, 5].map((r) => '<option value="' + r + '"' + (r === 3 ? " selected" : "") + ">" + r + "/5</option>").join("") + "</select>" +
    '<select id="guestHost" aria-label="' + esc(t("host")) + '"><option value="">' + esc(t("hostNone")) + "</option>" + hosts.map((p) => '<option value="' + esc(p.id) + '">' + esc(t("host") + ": " + p.name) + "</option>").join("") + "</select>" +
    '<button type="button" class="btn" data-a="addGuest">' + esc(t("add")) + "</button></div></section>";
  return h;
}

/** Bir önceki oynanmış etkinlikte sakatlananlar (Kural 15.6: organizatör durumu sorar). */
function injuredLastTime(m: Match): Set<string> {
  const prev = store.s.matches.filter((x) => x.status === "played" && x.id !== m.id && (x.date + x.time) < (m.date + m.time)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const out = new Set<string>();
  for (const x of prev.slice(0, 1)) for (const id in x.injured || {}) out.add(id);
  return out;
}

/** İhraç/davet edilmeyen/tür yasaklı: listede gösterilmez. */
function blockedHard(m: Match, id: string, disc: ReturnType<typeof statusMap>): boolean {
  const ds = disc[id];
  return !!ds && (ds.expelled || ds.banned || ds.kinds.includes(m.kind));
}

export function historyBlock(): string {
  const S = store.s;
  const past = S.matches.filter((m) => m.status !== "open").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!past.length) return "";
  let h = '<section class="section" aria-labelledby="h-hist"><h2 id="h-hist">' + esc(t("history")) + "</h2>";
  past.slice(0, 30).forEach((m) => {
    const fb = isFootball(m);
    const res = m.status === "cancelled" ? '<span class="muted">' + esc(t("cancelled")) + "</span>" : '<span class="score">' + (m.score ? m.score.a + " – " + m.score.b : "") + "</span>";
    let sub = "";
    if (m.status === "played" && m.score && fb && (m.agree.dessert ?? "yes") === "yes") sub = m.score.a !== m.score.b ? t("dessert", { t: m.score.a < m.score.b ? teamName(S, "a") : teamName(S, "b") }) : t("draw");
    else if (m.status === "played" && m.score && fb) sub = m.score.a === m.score.b ? t("draw") : "";
    else if (m.status === "played" && !fb && m.games.length) sub = t("gamesPlayed", { n: m.games.filter((g) => g.done).length });
    const hurtN = Object.keys(m.injured || {}).length;
    if (hurtN) sub = (sub ? sub + " · " : "") + t("injuriesN", { n: hurtN });
    const f = fieldOf(S, m);
    h += '<div class="hist"><div class="minw0"><strong>' + (fb ? "" : kindIcon(m).replace("<svg", '<svg class="kic"')) + esc(dayName(m.date)) + " " + esc(ddmm(m.date)) + '</strong> <span class="muted small">' + esc(m.time) + (fb ? "" : " · " + esc(eventTitle(m))) + (f ? ", " + esc(f.name) : "") + "</span>" + (sub ? '<div class="small muted">' + esc(sub) + "</div>" : "") +
      '</div><div class="row nowrap">' + res + '<button type="button" class="btn xs ghost" data-a="reopen" data-id="' + esc(m.id) + '">' + esc(t("reopen")) + "</button></div></div>";
  });
  return h + "</section>";
}

/** Hazırlık durumu (hero rozeti için). */
export function prepSummary(m: Match): { done: number; total: number; pending: number } {
  const p = checkProgress(m);
  return { ...p, pending: pendingAgreements(m).length };
}
