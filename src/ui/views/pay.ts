/** Ödemeler sekmesi: maç bazlı ödeme takibi, muafiyet, biriken borçlar. */
import { money, t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import { esc } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { currentMatch, getMatch, getP, lineup } from "../../domain/lineup";
import { billOf, isFree } from "../../domain/money";
import { accounts, debts } from "../../domain/ledger";
import { dayName, waPersonal } from "../../domain/messages";
import { emptyState, shareButtons } from "../components";

export function viewPay(): string {
  const S = store.s;
  const list = S.matches.filter((m) => m.status !== "cancelled").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!list.length) return emptyState(t("noPayMatch"), { a: "newMatch", label: t("createMatch") });
  let m = getMatch(S, ui.payId);
  if (!m || m.status === "cancelled") m = currentMatch(S, ui.matchId, today()) || list[0];
  const mm = m;
  const { payers, share: sh } = billOf(S, mm);
  const acc = accounts(S, today());
  const chargeOf = (id: string) => acc.get(id)?.charges.find((c) => c.mid === mm.id);
  const collected = payers.reduce((tot, id) => tot + (chargeOf(id)?.paid || 0), 0);
  const expected = payers.length * sh;
  let h = '<section class="section"><label class="fld">' + esc(t("matchSel")) + '<select data-f="payId">' +
    list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === mm.id ? " selected" : "") + ">" + esc(dayName(x.date)) + " " + esc(ddmm(x.date)) + " " + esc(x.time) + (x.status === "played" ? " (" + esc(t("played")) + ")" : "") + "</option>").join("") + "</select></label>";
  h += '<div class="money-sum"><div class="count"><b>' + esc(money(sh)) + "</b><span>" + esc(t("perPerson")) + '</span></div><div class="count"><b>' + esc(money(collected)) + "</b><span>" + esc(t("collected")) + '</span></div><div class="count"><b>' + esc(money(Math.max(0, expected - collected))) + "</b><span>" + esc(t("outstanding")) + "</span></div></div>";
  h += '<p class="small muted tight">' + esc(t("priceLbl")) + ": " + esc(money(Number(mm.price) || 0)) + ". " + esc(t("payers")) + ": " + payers.length + "</p>";
  if (S.settings.iban) h += '<div class="iban"><code>' + esc(S.settings.iban) + '</code><button type="button" class="btn xs" data-a="copyIban">' + esc(t("copyIban")) + "</button></div>";
  h += '<div class="row nowrap mb">' + shareButtons("pay", t("payReminder"), mm.id) + '<button type="button" class="btn grow" data-a="allPaid" data-id="' + esc(mm.id) + '">' + esc(t("allPaid")) + "</button></div>";
  const { playing } = lineup(S, mm);
  const late = Object.keys(mm.att).filter((id) => mm.att[id] === "late" && getP(S, mm, id));
  const rows = [...new Set([...playing, ...late, ...payers])];
  rows.forEach((id) => {
    const p = getP(S, mm, id);
    if (!p) return;
    const isPayer = payers.includes(id);
    const free = isFree(S, mm, id), ex = !!mm.exempt[id], isLate = mm.att[id] === "late";
    const c = chargeOf(id);
    const st = c?.status || "unpaid";
    let right: string;
    if (!isPayer) right = '<span class="muted small">' + esc(ex ? t("exempt") : free ? t("free") : "—") + "</span>";
    else {
      const label = st === "paid" ? t("paid") : st === "partial" ? t("partial") : t("unpaid");
      right = '<span class="amount">' + esc(money(sh)) + '</span><button type="button" class="paybtn' + (st === "paid" ? " paid" : st === "partial" ? " part" : "") + '" data-a="paid" data-mid="' + esc(mm.id) + '" data-id="' + esc(id) + '" aria-pressed="' + (st === "paid") + '" aria-label="' + esc(p.name + ": " + label) + '">' + esc(label) + "</button>";
    }
    let links = "";
    if (!free || ex) links += '<button type="button" class="linkbtn" data-a="exempt" data-mid="' + esc(mm.id) + '" data-id="' + esc(id) + '">' + esc(ex ? t("unexempt") : t("makeExempt")) + "</button>";
    if (st === "partial" && c) links += '<span class="small muted">' + esc(t("paidPart", { p: money(c.paid), a: money(c.amount) })) + "</span>";
    const phone = (p as { phone?: string }).phone;
    if (isPayer && st !== "paid" && phone) {
      const owed = acc.get(id)?.owed || 0;
      const u = waPersonal(S, phone, p.name, owed > 0 ? owed : sh - (c?.paid || 0));
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
