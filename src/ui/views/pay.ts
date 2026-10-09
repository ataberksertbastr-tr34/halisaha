/** Ödemeler sekmesi: maç bazlı ödeme takibi, muafiyet, biriken borçlar. */
import { money, t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import { esc } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { currentMatch, getMatch, getP, lineup } from "../../domain/lineup";
import { debtMap, debts, isFree, payersOf, shareOf } from "../../domain/money";
import { dayName, waPersonal } from "../../domain/messages";
import { emptyState } from "../components";

export function viewPay(): string {
  const S = store.s;
  const list = S.matches.filter((m) => m.status !== "cancelled").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!list.length) return emptyState(t("noPayMatch"), { a: "newMatch", label: t("createMatch") });
  let m = getMatch(S, ui.payId);
  if (!m || m.status === "cancelled") m = currentMatch(S, ui.matchId, today()) || list[0];
  const payers = payersOf(S, m), sh = shareOf(S, m);
  const paidN = payers.filter((id) => m!.paid[id]).length;
  const dm = debtMap(S, today());
  let h = '<section class="section"><label class="fld">' + esc(t("matchSel")) + '<select data-f="payId">' +
    list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === m!.id ? " selected" : "") + ">" + esc(dayName(x.date)) + " " + esc(ddmm(x.date)) + " " + esc(x.time) + (x.status === "played" ? " (" + esc(t("played")) + ")" : "") + "</option>").join("") + "</select></label>";
  h += '<div class="money-sum"><div class="count"><b>' + esc(money(sh)) + "</b><span>" + esc(t("perPerson")) + '</span></div><div class="count"><b>' + esc(money(paidN * sh)) + "</b><span>" + esc(t("collected")) + '</span></div><div class="count"><b>' + esc(money((payers.length - paidN) * sh)) + "</b><span>" + esc(t("outstanding")) + "</span></div></div>";
  h += '<p class="small muted tight">' + esc(t("priceLbl")) + ": " + esc(money(Number(m.price) || 0)) + ". " + esc(t("payers")) + ": " + payers.length + "</p>";
  if (S.settings.iban) h += '<div class="iban"><code>' + esc(S.settings.iban) + '</code><button type="button" class="btn xs" data-a="copyIban">' + esc(t("copyIban")) + "</button></div>";
  h += '<div class="row mb"><button type="button" class="btn primary grow" data-a="msg" data-k="pay" data-id="' + esc(m.id) + '">' + esc(t("payReminder")) + '</button><button type="button" class="btn grow" data-a="allPaid" data-id="' + esc(m.id) + '">' + esc(t("allPaid")) + "</button></div>";
  const { playing } = lineup(S, m);
  const late = Object.keys(m.att).filter((id) => m!.att[id] === "late" && getP(S, m, id));
  playing.concat(late).forEach((id) => {
    const p = getP(S, m, id)!;
    const free = isFree(S, m!, id), ex = !!m!.exempt[id], isLate = m!.att[id] === "late", paid = !!m!.paid[id];
    let right: string;
    if (free) right = '<span class="muted small">' + esc(t("free")) + "</span>";
    else if (ex) right = '<span class="muted small">' + esc(t("exempt")) + "</span>";
    else right = '<span class="amount">' + esc(money(sh)) + '</span><button type="button" class="paybtn' + (paid ? " paid" : "") + '" data-a="paid" data-mid="' + esc(m!.id) + '" data-id="' + esc(id) + '" aria-pressed="' + paid + '" aria-label="' + esc(p.name + ": " + (paid ? t("paid") : t("unpaid"))) + '">' + esc(paid ? t("paid") : t("unpaid")) + "</button>";
    let links = "";
    if (!free) links += '<button type="button" class="linkbtn" data-a="exempt" data-mid="' + esc(m!.id) + '" data-id="' + esc(id) + '">' + esc(ex ? t("unexempt") : t("makeExempt")) + "</button>";
    const phone = (p as { phone?: string }).phone;
    if (!free && !ex && !paid && phone) {
      const u = waPersonal(S, phone, p.name, dm[id] || sh);
      if (u) links += '<a class="linkbtn" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t("remind")) + "</a>";
    }
    h += '<div class="payrow"><div class="pname"><strong>' + esc(p.name) + (isLate ? ' <span class="tag wait">' + esc(t("late")) + "</span>" : "") + '</strong><span class="sublinks">' + links + "</span></div>" + right + "</div>";
  });
  if (late.length) h += '<p class="small muted mt-s">' + esc(t("exemptHint")) + "</p>";
  h += "</section>";
  const dl = debts(S, today());
  h += '<section class="section" aria-labelledby="h-debts"><h2 id="h-debts">' + esc(t("debts")) + "</h2>";
  if (!dl.length) h += '<p class="muted m0">' + esc(t("noDebts")) + "</p>";
  dl.forEach((d) => {
    const u = d.phone ? waPersonal(S, d.phone, d.name, d.total) : "";
    h += '<div class="payrow"><div class="pname"><strong>' + esc(d.name) + '</strong><span class="sublinks"><span class="small muted">' + esc(t("unpaidN", { n: d.n })) + "</span>" + (u ? '<a class="linkbtn" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t("remind")) + "</a>" : "") +
      '</span></div><span class="amount">' + esc(money(d.total)) + '</span><button type="button" class="btn sm" data-a="settle" data-id="' + esc(d.id) + '">' + esc(t("settle")) + "</button></div>";
  });
  return h + "</section>";
}
