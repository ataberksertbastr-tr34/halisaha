/**
 * Kıraathane puan cetveli (Kural 21.1–21.2): masa masa, el el puan.
 * Usul (düşük/yüksek kazanır, başlangıç puanı) oyun başlamadan masada
 * netleşir; cetvel açıkken yazılan her el anında kaydedilir.
 */
import { t } from "../../i18n";
import { store } from "../../app/store";
import { esc } from "../../domain/text";
import { getMatch, getP } from "../../domain/lineup";
import { leaders, sheetFor, totals } from "../../domain/sheet";
import { tableGame } from "../../domain/draw";
import type { Match, Sheet } from "../../domain/types";
import { showModal, updateModal } from "../modal";
import { sheetHead } from "../sheets";
import { ruleChip } from "../components";
import { IC } from "../icons";

let cur: { mid: string; t: number } | null = null;

export function sheetTarget(): { m: Match; sh: Sheet } | null {
  if (!cur) return null;
  const m = getMatch(store.s, cur.mid);
  if (!m || !m.draw) return null;
  const sh = sheetFor(m.sheets, m.draw, cur.t);
  return sh ? { m, sh } : null;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString(store.s.settings.lang === "en" ? "en-GB" : "tr-TR"));

function body(): string {
  const x = sheetTarget();
  if (!x) return sheetHead(t("sheetTitle")) + '<p class="muted">' + esc(t("notFound")) + "</p>";
  const { m, sh } = x;
  const name = (ids: string[]) => ids.map((id) => (getP(store.s, m, id)?.name || "?").split(" ")[0]).join(" & ");
  const tot = totals(sh);
  const lead = new Set(leaders(sh));
  const game = tableGame(sh.game)?.name || sh.game;
  let h = sheetHead(t("tableN", { n: sh.t + 1 }) + " · " + game);
  h += '<p class="small muted tight">' + esc(t("sheetHint")) + " " + ruleChip("21.2") + "</p>";
  // Usul: masada netleşir (21.2), oyun bitene kadar değişmez
  const locked = sh.rows.length > 0;
  h += '<div class="sh-opts"><div class="seg2" role="radiogroup" aria-label="' + esc(t("sheetMode")) + '">' +
    '<button type="button" role="radio" class="' + (sh.low ? "" : "on") + '" aria-checked="' + !sh.low + '" data-a="sheetLow" data-v="0"' + (locked ? " disabled" : "") + ">" + esc(t("sheetHigh")) + "</button>" +
    '<button type="button" role="radio" class="' + (sh.low ? "on" : "") + '" aria-checked="' + sh.low + '" data-a="sheetLow" data-v="1"' + (locked ? " disabled" : "") + ">" + esc(t("sheetLowWins")) + "</button></div>" +
    '<label class="fld sh-start">' + esc(t("sheetStart")) + '<input type="text" inputmode="decimal" data-f="sheet.start" value="' + esc(fmt(sh.start)) + '"' + (locked ? " disabled" : "") + "></label></div>";
  if (locked) h += '<p class="small muted m0">' + esc(t("sheetLocked")) + "</p>";
  // Cetvel
  h += '<div class="sh-wrap"><table class="sht"><thead><tr><th scope="col" class="sh-n">' + esc(t("sheetHand")) + "</th>" +
    sh.seats.map((s, i) => '<th scope="col" class="' + (lead.has(i) ? "lead" : "") + '">' + esc(name(s)) + "</th>").join("") + '<th scope="col" class="sh-x"><span class="visually-hidden">' + esc(t("del")) + "</span></th></tr></thead><tbody>";
  sh.rows.forEach((r, ri) => {
    h += '<tr><th scope="row" class="sh-n">' + (ri + 1) + "</th>" + sh.seats.map((_, i) => "<td>" + esc(fmt(Number(r[i]) || 0)) + "</td>").join("") +
      '<td class="sh-x">' + (sh.done ? "" : '<button type="button" class="tx" data-a="sheetDel" data-confirm="1" data-i="' + ri + '" aria-label="' + esc(t("sheetDelHand", { n: ri + 1 })) + '">' + IC.close + "</button>") + "</td></tr>";
  });
  if (!sh.done) {
    h += '<tr class="sh-new"><th scope="row" class="sh-n">' + (sh.rows.length + 1) + "</th>" +
      sh.seats.map((s, i) => '<td><input type="text" inputmode="decimal" class="sh-in" id="sh-in-' + i + '" data-i="' + i + '" aria-label="' + esc(t("sheetScoreFor", { n: name(s) })) + '" autocomplete="off" enterkeyhint="' + (i === sh.seats.length - 1 ? "done" : "next") + '"></td>').join("") + "<td></td></tr>";
  }
  h += '</tbody><tfoot><tr><th scope="row" class="sh-n">' + esc(t("sheetTotal")) + "</th>" + tot.map((v, i) => '<td class="' + (lead.has(i) ? "lead" : "") + '">' + esc(fmt(v)) + "</td>").join("") + "<td></td></tr></tfoot></table></div>";
  if (lead.size) {
    const names = [...lead].map((i) => name(sh.seats[i])).join(", ");
    h += '<p class="sh-lead">' + IC.trophy + "<span>" + esc((sh.done ? t("sheetWinner") : t("sheetLeader")) + ": " + names) + "</span></p>";
  }
  if (!sh.done) {
    h += '<div class="row nowrap mt-s"><button type="button" class="btn primary grow" data-a="sheetAdd">' + IC.plus + esc(t("sheetAdd")) + "</button>" +
      '<button type="button" class="btn side" data-a="sheetFinish"' + (sh.rows.length ? "" : " disabled") + ">" + IC.check + esc(t("sheetFinish")) + "</button></div>";
    h += '<p class="small muted mt-s m0">' + esc(t("sheetMinus")) + "</p>";
  } else {
    h += '<div class="row nowrap mt-s"><button type="button" class="btn primary grow" data-a="closeModal">' + IC.check + esc(t("done")) + '</button><button type="button" class="btn side" data-a="sheetReopen">' + esc(t("reopen")) + "</button></div>";
  }
  return h;
}

export function openSheet(mid: string, table: number): void {
  cur = { mid, t: table };
  showModal(body(), "sheet-title", "tally");
}

export function refreshSheet(focusFirst = false): void {
  updateModal(body());
  if (focusFirst) document.getElementById("sh-in-0")?.focus({ preventScroll: true });
}
