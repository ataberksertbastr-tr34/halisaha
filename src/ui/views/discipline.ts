/**
 * Disiplin sayfası ve ihlal kaydı (Bölüm 9, 13.9, Ek: Yaptırımlar Özet Tablosu).
 * Kayıt penceresi yönetmeliğin öngördüğü yaptırımı önerir; son karar
 * organizatöründür (Kural 12.1).
 */
import { t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import type { Infraction, Match, Sanction } from "../../domain/types";
import { esc, norm, trSort } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { getMatch, getP, openMatches } from "../../domain/lineup";
import { L } from "../../domain/kinds";
import { SANCTION_TXT, VIOLATIONS, benchTarget, sanctionText, statusMap, suggest, violation } from "../../domain/discipline";
import { eventOption, ruleChip, subHeader } from "../components";
import { showModal, updateModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

/* ---------- sayfa ---------- */
export function viewDiscipline(): string {
  const S = store.s;
  const st = statusMap(S);
  const ids = Object.keys(st);
  const n = (f: (x: (typeof st)[string]) => boolean) => ids.filter((id) => f(st[id])).length;
  const openIds = new Set(openMatches(S).map((m) => m.id));
  let h = subHeader(t("discTitle"), "more");
  h += '<section class="section"><div class="dsum">' +
    dtile(t("discWarned"), n((x) => x.warnings > 0 && !x.banned)) +
    dtile(t("discBenched"), n((x) => x.bench.some((b) => openIds.has(b)))) +
    dtile(t("discBanned"), n((x) => x.banned && !x.expelled)) +
    dtile(t("discExpelled"), n((x) => x.expelled)) + "</div>" +
    '<p class="small muted tight">' + esc(t("discHint")) + " " + ruleChip("9.3") + "</p>" +
    '<div class="row nowrap"><button type="button" class="btn primary grow" data-a="discNew">' + IC.gavel + esc(t("discRecord")) + '</button><button type="button" class="btn side" data-a="nav" data-v="rules" data-id="ek">' + IC.book + esc(t("sanctionTable")) + "</button></div></section>";
  const list = S.discipline.slice().sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  h += '<section class="section" aria-labelledby="h-dlist"><h2 id="h-dlist">' + esc(t("discLog")) + "</h2>";
  if (!list.length) return h + '<p class="muted m0">' + esc(t("discEmpty")) + "</p></section>";
  h += '<div class="search">' + IC.search + '<input type="search" id="q-disc" placeholder="' + esc(t("searchPeople")) + '" value="' + esc(ui.discQ) + '" autocomplete="off" aria-label="' + esc(t("searchPeople")) + '"></div><ul class="llist mt-s" id="list-disc">';
  const q = norm(ui.discQ);
  list.forEach((r) => {
    const who = getP(S, getMatch(S, r.mid), r.pid)?.name || whoName(r.pid);
    if (q && !norm(who + " " + L(violation(r.type))).includes(q)) return;
    h += recordRow(r, who, true);
  });
  return h + "</ul></section>";
}

function whoName(pid: string): string {
  for (const m of store.s.matches) {
    const g = m.guests.find((x) => x.id === pid);
    if (g) return g.name;
  }
  return "?";
}

function dtile(label: string, n: number): string {
  return '<div class="count"><b>' + n + "</b><span>" + esc(label) + "</span></div>";
}

const SEVERE = new Set<Sanction>(["ban", "expel", "kindBan", "dropDay", "remove"]);

/** Kayıt satırı (disiplin sayfası ve oyuncu kartı). */
export function recordRow(r: Infraction, who: string, withName: boolean): string {
  const S = store.s;
  const m = getMatch(S, r.mid);
  const target = getMatch(S, r.target);
  const stepTxt = r.step && r.sanction !== "warn" && r.sanction !== "bench" && r.sanction !== "ban" ? " + " + L(SANCTION_TXT[r.step === 1 ? "warn" : r.step === 2 ? "bench" : "ban"]) : "";
  const meta = [ddmm(r.at) + "." + r.at.slice(0, 4), m ? eventOption(m) : "", target ? t("benchFor", { e: eventOption(target) }) : "", r.note].filter(Boolean).join(" · ");
  return '<li class="lrow drow"><span class="dic' + (SEVERE.has(r.sanction) || r.step === 3 ? " sev" : "") + '">' + IC.gavel + '</span><div class="pname">' +
    (withName ? '<button type="button" class="plink strong" data-a="nav" data-v="player" data-id="' + esc(r.pid) + '">' + esc(who) + "</button>" : "") +
    '<span class="dline"><strong>' + esc(L(violation(r.type))) + "</strong> " + ruleChip(r.rule) + "</span>" +
    '<span class="tag ' + (SEVERE.has(r.sanction) || r.step === 3 ? "ban" : "wait") + '">' + esc(sanctionText(r) + stepTxt) + "</span>" +
    '<span class="meta">' + esc(meta) + "</span></div>" +
    '<button type="button" class="tx" data-a="discDel" data-id="' + esc(r.id) + '" data-confirm="1" aria-label="' + esc(t("pardon")) + '" title="' + esc(t("pardon")) + '">' + IC.close + "</button></li>";
}

/* ---------- kayıt penceresi ---------- */
interface Draft {
  pid: string;
  type: string;
  mid: string;
  sanction: Sanction | "";
  target: string;
  amount: string;
  note: string;
}
let draft: Draft = { pid: "", type: "swear", mid: "", sanction: "", target: "", amount: "", note: "" };

export function discDraft(): Draft {
  return draft;
}

function people(m: Match | null): { id: string; name: string }[] {
  const S = store.s;
  const list = S.players.map((p) => ({ id: p.id, name: p.name }));
  if (m) m.guests.forEach((g) => list.push({ id: g.id, name: g.name + " (" + t("guest") + ")" }));
  return list.sort(trSort);
}

function body(): string {
  const S = store.s;
  const m = getMatch(S, draft.mid);
  const v = violation(draft.type);
  const sug = draft.pid ? suggest(S, draft.pid, draft.type, m) : null;
  const sanction = (draft.sanction || sug?.sanction || "warn") as Sanction;
  const step = !draft.sanction || draft.sanction === sug?.sanction ? sug?.step : undefined;
  const isBench = sanction === "bench" || step === 2;
  const events = [...openMatches(S), ...S.matches.filter((x) => x.status === "played").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 8)];
  const tgt = getMatch(S, draft.target) || benchTarget(S, today(), draft.mid);
  let h = sheetHead(t("discRecord")) + '<div class="stackf">';
  h += '<label class="fld">' + esc(t("discWho")) + '<select data-f="disc.pid"><option value="">—</option>' + people(m).map((p) => '<option value="' + esc(p.id) + '"' + (p.id === draft.pid ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select></label>";
  h += '<label class="fld">' + esc(t("discWhat")) + '<select data-f="disc.type">' + VIOLATIONS.map((x) => '<option value="' + x.key + '"' + (x.key === draft.type ? " selected" : "") + ">" + esc((x.ruleByKind?.[m?.kind || "football"] || x.rule) + " · " + L(x)) + "</option>").join("") + "</select></label>";
  h += '<label class="fld">' + esc(t("discWhere")) + '<select data-f="disc.mid"><option value="">' + esc(t("discNoEvent")) + "</option>" + events.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === draft.mid ? " selected" : "") + ">" + esc(eventOption(x)) + "</option>").join("") + "</select></label>";
  if (v.event && !m) h += '<p class="small warnline">' + esc(t("discNeedsEvent")) + "</p>";
  if (sug) {
    h += '<div class="dsug"><span class="small muted">' + esc(t("discSuggested")) + " " + ruleChip(sug.rule) + "</span><strong>" + esc(sanctionText({ sanction: sug.sanction, kind: v.kind }) + (sug.step && sug.sanction !== "warn" && sug.sanction !== "bench" && sug.sanction !== "ban" ? " + " + L(SANCTION_TXT[sug.step === 1 ? "warn" : sug.step === 2 ? "bench" : "ban"]) : "")) + "</strong>" +
      (sug.step ? '<span class="small muted">' + esc(t("discStep", { n: sug.step })) + "</span>" : "") + "</div>";
  }
  h += '<label class="fld">' + esc(t("discSanction")) + '<select data-f="disc.sanction">' + (Object.keys(SANCTION_TXT) as Sanction[]).map((k) => '<option value="' + k + '"' + (k === sanction ? " selected" : "") + ">" + esc(sanctionText({ sanction: k, kind: v.kind })) + "</option>").join("") + "</select></label>";
  if (isBench) h += '<label class="fld">' + esc(t("discBenchFor")) + '<select data-f="disc.target">' + openMatches(S).filter((x) => x.id !== draft.mid).map((x) => '<option value="' + esc(x.id) + '"' + (tgt && x.id === tgt.id ? " selected" : "") + ">" + esc(eventOption(x)) + "</option>").join("") + "</select></label>";
  if (sanction === "damage") h += '<label class="fld">' + esc(t("discAmount")) + '<input type="number" inputmode="decimal" min="0" id="disc-amount" value="' + esc(draft.amount) + '"></label>';
  h += '<label class="fld">' + esc(t("note")) + '<input type="text" id="disc-note" value="' + esc(draft.note) + '" autocomplete="off"></label>';
  h += '<button type="button" class="btn primary block" data-a="discSave"' + (draft.pid ? "" : " disabled") + ">" + IC.check + esc(t("save")) + "</button></div>";
  return h;
}

export function openDiscDialog(pid = "", mid = ""): void {
  draft = { pid, type: draft.type || "swear", mid, sanction: "", target: "", amount: "", note: "" };
  showModal(body(), "sheet-title", "disc");
}

export function refreshDiscDialog(): void {
  const a = document.getElementById("disc-amount") as HTMLInputElement | null;
  const n = document.getElementById("disc-note") as HTMLInputElement | null;
  if (a) draft.amount = a.value;
  if (n) draft.note = n.value;
  updateModal(body());
}

/** Oyuncu kartı: disiplin geçmişi. */
export function playerDiscipline(pid: string): string {
  const S = store.s;
  const st = statusMap(S)[pid];
  let h = '<section class="section" aria-labelledby="h-pdisc"><div class="row nowrap"><h2 id="h-pdisc" class="grow">' + esc(t("discTitle")) + '</h2><button type="button" class="btn sm" data-a="discNew" data-id="' + esc(pid) + '">' + IC.gavel + esc(t("discRecordShort")) + "</button></div>";
  if (!st || !st.records.length) return h + '<p class="muted small m0">' + esc(t("discClean")) + "</p></section>";
  const badges: string[] = [];
  if (st.expelled) badges.push('<span class="tag ban">' + esc(t("block_expel")) + "</span>");
  else if (st.banned) badges.push('<span class="tag ban">' + esc(t("block_ban")) + "</span>");
  st.kinds.forEach((k) => badges.push('<span class="tag ban">' + esc(sanctionText({ sanction: "kindBan", kind: k })) + "</span>"));
  if (st.bench.some((b) => getMatch(S, b)?.status === "open")) badges.push('<span class="tag wait">' + esc(t("block_bench")) + "</span>");
  if (st.warnings) badges.push('<span class="tag wait">' + esc(t("warnN", { n: st.warnings })) + "</span>");
  if (badges.length) h += '<div class="row">' + badges.join("") + "</div>";
  return h + '<ul class="llist mt-s">' + st.records.map((r) => recordRow(r, "", false)).join("") + "</ul></section>";
}
