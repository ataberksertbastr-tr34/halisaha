/**
 * Ödemeler sekmesi, üç bölüm:
 *  - Maç: maç bazlı ödeme takibi, muafiyet, hatırlatma
 *  - Kişiler: biriken borçlar, avanslar, kişi bazlı hesap defteri
 *  - Kasa: kasa durumu, aylık özet, organizatör giderleri
 */
import { MONTHS, money, t, type MsgKey } from "../../i18n";
import { store, today, ui } from "../../app/store";
import type { ExpenseCat, Match } from "../../domain/types";
import { esc, norm } from "../../domain/text";
import { ddmm, monthKey, parseISO } from "../../domain/dates";
import { currentMatch, getMatch, getP, lineup } from "../../domain/lineup";
import { billOf, isFree } from "../../domain/money";
import { accounts, cashAt, debts, extraStatus, monthSummary, months, type Account } from "../../domain/ledger";
import { eventTitle, isFootball } from "../../domain/kinds";
import { dayName, waPersonal } from "../../domain/messages";
import { emptyState, eventOption, ruleChip, shareButtons } from "../components";
import { showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

export const EXP_CATS: [ExpenseCat, MsgKey][] = [["ball", "expBall"], ["bib", "expBib"], ["water", "expWater"], ["other", "expOther"]];

type UIPay = "match" | "people" | "cash";

function subTabs(): string {
  const items: [UIPay, MsgKey][] = [["match", "paySubMatch"], ["people", "paySubPeople"], ["cash", "paySubCash"]];
  return '<div class="subtabs" role="tablist">' + items.map(([k, l]) =>
    '<button type="button" role="tab" class="subtab' + (ui.payTab === k ? " on" : "") + '" aria-selected="' + (ui.payTab === k) + '" data-a="payTab" data-v="' + k + '">' + esc(t(l)) + "</button>").join("") + "</div>";
}

export function viewPay(): string {
  const body = ui.payTab === "people" ? peopleView() : ui.payTab === "cash" ? cashView() : matchPayView();
  return subTabs() + body;
}

function personBtn(id: string, name: string): string {
  return '<button type="button" class="plink" data-a="ledger" data-id="' + esc(id) + '">' + esc(name) + "</button>";
}

/* ---------- Maç ---------- */
function matchPayView(): string {
  const S = store.s;
  const list = S.matches.filter((m) => m.status !== "cancelled").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (!list.length) return emptyState(t("noPayMatch"), { a: "newEvent", label: t("createEvent") });
  let m = getMatch(S, ui.payId);
  if (!m || m.status === "cancelled") m = currentMatch(S, ui.matchId, today()) || list[0];
  const mm: Match = m;
  const { payers, share: sh } = billOf(S, mm);
  const acc = accounts(S, today());
  const chargeOf = (id: string) => acc.get(id)?.charges.find((c) => c.mid === mm.id && !c.cid);
  const collected = payers.reduce((tot, id) => tot + (chargeOf(id)?.paid || 0), 0);
  const expected = payers.length * sh;
  let h = '<section class="section"><label class="fld">' + esc(t("matchSel")) + '<select data-f="payId">' +
    list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === mm.id ? " selected" : "") + ">" + esc(eventOption(x)) + (x.status === "played" ? " (" + esc(t("played")) + ")" : "") + "</option>").join("") + "</select></label>";
  h += '<div class="money-sum"><div class="count"><b>' + esc(money(sh)) + "</b><span>" + esc(t("perPerson")) + '</span></div><div class="count"><b>' + esc(money(collected)) + "</b><span>" + esc(t("collected")) + '</span></div><div class="count"><b>' + esc(money(Math.max(0, expected - collected))) + "</b><span>" + esc(t("outstanding")) + "</span></div></div>";
  h += '<p class="small muted tight">' + esc(isFootball(mm) ? t("priceLbl") : t("totalCost")) + ": " + esc(money(Number(mm.price) || 0)) + ". " + esc(t("payers")) + ": " + payers.length + (isFootball(mm) ? "" : " " + ruleChip("15.4")) + "</p>";
  if (S.settings.iban) h += '<div class="iban"><code>' + esc(S.settings.iban) + '</code><button type="button" class="btn xs" data-a="copyIban">' + esc(t("copyIban")) + "</button></div>";
  h += '<div class="row nowrap mb">' + shareButtons("pay", t("payReminder"), mm.id) + '<button type="button" class="btn side" data-a="allPaid" data-id="' + esc(mm.id) + '">' + esc(t("allPaid")) + "</button></div>";
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
    h += '<div class="payrow"><div class="pname">' + personBtn(id, p.name) + (isLate ? ' <span class="tag wait">' + esc(t("late")) + "</span>" : "") + '<span class="sublinks">' + links + "</span></div>" + right + "</div>";
  });
  if (late.length) h += '<p class="small muted mt-s">' + esc(t("exemptHint")) + "</p>";
  h += "</section>";
  return h + extrasSection(mm, payers) + debtsSection();
}

/** Etkinliğe bağlı ek harcamalar ve zarar bedelleri (Kural 15.4, 10.5). */
function extrasSection(m: Match, payers: string[]): string {
  const S = store.s;
  const acc = accounts(S, today());
  const list = S.charges.filter((x) => x.mid === m.id);
  const total = list.reduce((t0, x) => t0 + x.amount, 0);
  let h = '<section class="section" aria-labelledby="h-extra"><details data-keep="extra-' + esc(m.id) + '"' + (list.length ? " open" : "") + '><summary><h2 id="h-extra" class="inline">' + esc(t("extrasN")) + (list.length ? " · " + esc(money(total)) : "") + "</h2></summary>" +
    '<p class="small muted tight">' + esc(t("extraHint")) + " " + ruleChip("15.4") + "</p>";
  if (list.length) {
    h += '<ul class="llist">';
    list.forEach((x) => {
      const who = getP(S, m, x.pid)?.name || S.players.find((p) => p.id === x.pid)?.name || "?";
      const c = extraStatus(S, x, today(), acc);
      const paid = c?.status === "paid";
      h += '<li class="lrow"><div class="pname"><strong>' + esc(who) + '</strong><span class="meta">' + esc(x.note || t("extraCharge")) + (x.rule ? " · " + esc(t("ruleN", { n: x.rule })) : "") + "</span></div>" +
        '<span class="amount">' + esc(money(x.amount)) + '</span><button type="button" class="paybtn' + (paid ? " paid" : c?.status === "partial" ? " part" : "") + '" data-a="extraPaid" data-id="' + esc(x.id) + '" aria-pressed="' + paid + '">' + esc(paid ? t("paid") : t("unpaid")) + "</button>" +
        '<button type="button" class="tx" data-a="delExtra" data-id="' + esc(x.id) + '" aria-label="' + esc(t("del")) + '">' + IC.close + "</button></li>";
    });
    h += "</ul>";
  }
  const people = [...new Set([...payers, ...lineup(S, m).playing])].map((id) => ({ id, name: getP(S, m, id)?.name || "" })).filter((x) => x.name).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  h += '<div class="grid2 mt-s"><label class="fld">' + esc(t("extraFor")) + '<select id="xc-who"><option value="__all">' + esc(t("extraAll")) + "</option>" + people.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>").join("") + "</select></label>" +
    '<label class="fld">' + esc(t("extraAmount")) + '<input type="number" id="xc-amount" inputmode="decimal" min="0" step="any"></label>' +
    '<label class="fld full">' + esc(t("extraNote")) + '<input type="text" id="xc-note" autocomplete="off" placeholder="' + esc(t("extraNoteHint")) + '"></label></div>' +
    '<button type="button" class="btn block mt-s" data-a="addExtra" data-id="' + esc(m.id) + '">' + IC.plus + esc(t("extraAdd")) + "</button>";
  return h + "</details></section>";
}

function debtsSection(): string {
  const S = store.s;
  const dl = debts(S, today());
  let h = '<section class="section" aria-labelledby="h-debts"><h2 id="h-debts">' + esc(t("debts")) + "</h2>";
  if (!dl.length) h += '<p class="muted m0">' + esc(t("noDebts")) + "</p>";
  dl.forEach((d) => {
    const host = d.host ? S.players.find((p) => p.id === d.host) : null;
    const phone = d.phone || host?.phone || "";
    const u = phone ? waPersonal(S, phone, host && !d.phone ? host.name : d.name, d.total) : "";
    h += '<div class="payrow"><div class="pname">' + personBtn(d.id, d.name) + '<span class="sublinks"><span class="small muted">' + esc(t("unpaidN", { n: d.n }) + (host ? " · " + t("guestOf", { n: host.name }) : "")) + "</span>" + (u ? '<a class="linkbtn" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t("remind")) + "</a>" : "") +
      '</span></div><span class="amount">' + esc(money(d.total)) + '</span><button type="button" class="btn sm" data-a="settle" data-id="' + esc(d.id) + '">' + esc(t("settle")) + "</button></div>";
  });
  return h + "</section>";
}

/* ---------- Kişiler ---------- */
function balanceLabel(a: Account): { text: string; cls: string } {
  if (a.owed > 0.004) return { text: t("owesAmt", { a: money(a.owed) }), cls: "neg" };
  if (a.credit > 0.004) return { text: t("creditAmt", { a: money(a.credit) }), cls: "pos" };
  return { text: t("settledAcc"), cls: "" };
}

function peopleView(): string {
  const S = store.s;
  const acc = [...accounts(S, today()).values()];
  if (!acc.length) return '<section class="section"><p class="muted m0">' + esc(t("noAccounts")) + "</p></section>";
  const owed = acc.reduce((tot, a) => tot + a.owed, 0);
  const credit = acc.reduce((tot, a) => tot + a.credit, 0);
  acc.sort((a, b) => b.owed - a.owed || b.credit - a.credit || a.name.localeCompare(b.name, "tr"));
  let h = '<section class="section"><div class="money-sum two"><div class="count"><b class="neg">' + esc(money(owed)) + "</b><span>" + esc(t("totalOwed")) + '</span></div><div class="count"><b class="pos">' + esc(money(credit)) + "</b><span>" + esc(t("creditors")) + "</span></div></div>";
  h += '<div class="search">' + IC.search + '<input type="search" id="q-people" data-q="people" placeholder="' + esc(t("searchPeople")) + '" value="' + esc(ui.f.people.q) + '" autocomplete="off" aria-label="' + esc(t("searchPeople")) + '"><button type="button" class="clr" data-a="clearQ" data-k="people" aria-label="' + esc(t("close")) + '"' + (ui.f.people.q ? "" : " hidden") + ">" + IC.close + "</button></div>";
  h += '<ul class="plist" id="list-people">';
  acc.forEach((a) => {
    const b = balanceLabel(a);
    h += '<li class="prow" data-n="' + esc(norm(a.name)) + '" data-p=""><button type="button" class="acctrow" data-a="ledger" data-id="' + esc(a.id) + '"><span class="pname"><strong>' + esc(a.name) + (a.guest ? ' <span class="tag">' + esc(t("guest")) + "</span>" : "") + "</strong>" +
      '<span class="meta">' + esc(t("gamesN", { n: a.charges.length }) + " · " + t("paymentRow") + " " + money(a.paidTotal)) + '</span></span><span class="bal ' + b.cls + '">' + esc(b.text) + "</span>" + IC.chevron + "</button></li>";
  });
  return h + '</ul><p class="none-msg" id="none-people" hidden>' + esc(t("noResults")) + "</p></section>";
}

/** Kişinin hesap defteri: bakiye, ödeme alma, hareketler. */
export function openLedger(id: string): void {
  const S = store.s;
  const a = accounts(S, today()).get(id);
  const name = a?.name || getP(S, null, id)?.name || "?";
  const b = a ? balanceLabel(a) : { text: t("settledAcc"), cls: "" };
  const phone = a?.phone || (a?.host ? S.players.find((p) => p.id === a.host)?.phone : "") || "";
  const u = a && a.owed > 0 && phone ? waPersonal(S, phone, name, a.owed) : "";
  let h = sheetHead(t("ledger") + ": " + name) + '<div class="ledger-bal ' + b.cls + '">' + esc(b.text) + "</div>";
  h += '<div class="paybox"><div class="grid2"><label class="fld">' + esc(t("amount")) + '<input type="number" id="lp-amount" inputmode="decimal" min="0" step="any" value="' + (a && a.owed > 0 ? a.owed : "") + '"></label>' +
    '<label class="fld">' + esc(t("date")) + '<input type="date" id="lp-date" value="' + today() + '"></label>' +
    '<label class="fld full">' + esc(t("note")) + '<input type="text" id="lp-note" autocomplete="off"></label></div>' +
    '<div class="row mt-s"><button type="button" class="btn primary grow" data-a="takePayment" data-id="' + esc(id) + '">' + IC.check + esc(t("takePayment")) + "</button>" +
    (u ? '<a class="btn grow" href="' + esc(u) + '" target="_blank" rel="noopener">' + IC.whatsapp + esc(t("remindShort")) + "</a>" : "") + "</div>" +
    (a && a.credit > 0.004 ? '<button type="button" class="linkbtn mt-s" data-a="refund" data-id="' + esc(id) + '">' + esc(t("refund")) + " (" + esc(money(a.credit)) + ")</button>" : "") +
    '<p class="small muted mt-s m0">' + esc(t("ledgerHint")) + "</p></div>";
  type Row = { at: string; html: string };
  const rows: Row[] = [];
  a?.charges.forEach((c) => {
    const st = c.status === "paid" ? '<span class="tag ok">' + esc(t("paid")) + "</span>" : c.status === "partial" ? '<span class="tag wait">' + esc(t("partialPaid", { p: money(c.paid) })) + "</span>" : c.due ? '<span class="tag debt">' + esc(t("unpaid")) + "</span>" : "";
    const cm = c.mid ? getMatch(S, c.mid) : null;
    const d = dayName(c.date).slice(0, 3) + " " + ddmm(c.date);
    const title = c.cid ? (c.note || t("extraCharge")) + " · " + d : cm && !isFootball(cm) ? t("eventShareRow", { d, e: eventTitle(cm) }) : t("chargeRow", { d });
    rows.push({ at: c.date + "1", html: '<li class="lrow"><div class="pname"><strong>' + esc(title) + "</strong>" + st + '</div><span class="amount neg">−' + esc(money(c.amount)) + "</span></li>" });
  });
  a?.payments.forEach((p) => {
    const m = p.mid ? getMatch(S, p.mid) : null;
    const sub = [ddmm(p.at), m ? dayName(m.date).slice(0, 3) + " " + ddmm(m.date) : "", p.note || ""].filter(Boolean).join(" · ");
    rows.push({ at: p.at + "2", html: '<li class="lrow"><div class="pname"><strong>' + esc(p.amount < 0 ? t("refundNote") : t("paymentRow")) + '</strong><span class="meta">' + esc(sub) + '</span></div><span class="amount pos">' + (p.amount < 0 ? "−" : "+") + esc(money(Math.abs(p.amount))) + "</span>" +
      '<button type="button" class="tx" data-a="delPayment" data-id="' + esc(p.id) + '" data-pid="' + esc(id) + '" aria-label="' + esc(t("del")) + '">' + IC.close + "</button></li>" });
  });
  rows.sort((x, y) => y.at.localeCompare(x.at));
  h += rows.length ? '<ul class="llist">' + rows.map((r) => r.html).join("") + "</ul>" : '<p class="muted">' + esc(t("noAccounts")) + "</p>";
  showModal(h);
}

/* ---------- Kasa ---------- */
function monthName(mk: string): string {
  const d = parseISO(mk + "-01");
  return MONTHS[store.s.settings.lang][d.getMonth()] + " " + d.getFullYear();
}

function cashView(): string {
  const S = store.s;
  const cash = cashAt(S);
  const list = months(S, today());
  const mk = ui.month && list.includes(ui.month) ? ui.month : monthKey(today());
  const sum = monthSummary(S, mk);
  const inflow = S.payments.reduce((tot, p) => tot + p.amount, 0);
  const field = S.matches.filter((m) => m.status === "played").reduce((tot, m) => tot + (Number(m.price) || 0), 0);
  const exp = S.expenses.reduce((tot, e) => tot + e.amount, 0);
  let h = '<section class="section" aria-labelledby="h-cash"><h2 id="h-cash">' + esc(t("cashBox")) + '</h2><div class="cashbig ' + (cash < 0 ? "neg" : "pos") + '">' + esc(money(cash)) + "</div>" +
    '<p class="small muted center">' + esc(cash < 0 ? t("cashNeg", { a: money(-cash) }) : t("cashHint")) + "</p>" +
    '<div class="money-sum"><div class="count"><b>' + esc(money(inflow)) + "</b><span>" + esc(t("mCollected")) + '</span></div><div class="count"><b>' + esc(money(field)) + "</b><span>" + esc(t("mField")) + '</span></div><div class="count"><b>' + esc(money(exp)) + "</b><span>" + esc(t("mExpenses")) + "</span></div></div></section>";
  h += '<section class="section" aria-labelledby="h-month"><h2 id="h-month">' + esc(t("monthly")) + '</h2><label class="fld"><span class="visually-hidden">' + esc(t("monthly")) + '</span><select data-f="month">' +
    list.map((x) => '<option value="' + x + '"' + (x === mk ? " selected" : "") + ">" + esc(monthName(x)) + "</option>").join("") + "</select></label>" +
    '<dl class="kv">' +
    kv(t("mPlayed"), String(sum.played) + (sum.cancelled ? " (+" + sum.cancelled + " " + t("mCancelled").toLocaleLowerCase(S.settings.lang) + ")" : "")) +
    kv(t("mField"), money(sum.fieldCost)) + kv(t("mBilled"), money(sum.billed)) + (sum.extras ? kv(t("mExtras"), money(sum.extras)) : "") + kv(t("mCollected"), money(sum.collected)) + kv(t("mExpenses"), money(sum.expenses)) +
    kv(t("mCash"), money(sum.cash), sum.cash < 0 ? "neg" : "pos") + "</dl></section>";
  h += '<section class="section" aria-labelledby="h-exp"><h2 id="h-exp">' + esc(t("expenses")) + "</h2>" +
    '<div class="grid2"><label class="fld">' + esc(t("amount")) + '<input type="number" id="ex-amount" inputmode="decimal" min="0" step="any"></label>' +
    '<label class="fld">' + esc(t("category")) + '<select id="ex-cat">' + EXP_CATS.map(([k, l]) => '<option value="' + k + '">' + esc(t(l)) + "</option>").join("") + "</select></label>" +
    '<label class="fld">' + esc(t("date")) + '<input type="date" id="ex-date" value="' + today() + '"></label>' +
    '<label class="fld">' + esc(t("note")) + '<input type="text" id="ex-note" autocomplete="off"></label></div>' +
    '<button type="button" class="btn primary block mt-s" data-a="addExpense">' + IC.plus + esc(t("addExpense")) + "</button>";
  const items = S.expenses.slice().sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) h += '<p class="muted mt m0">' + esc(t("noExpenses")) + "</p>";
  else {
    h += '<ul class="llist mt">';
    items.forEach((e) => {
      const cat = EXP_CATS.find(([k]) => k === e.cat)?.[1] || "expOther";
      h += '<li class="lrow"><div class="pname"><strong>' + esc(t(cat)) + '</strong><span class="meta">' + esc([ddmm(e.at) + "." + e.at.slice(0, 4), e.note].filter(Boolean).join(" · ")) + '</span></div><span class="amount neg">−' + esc(money(e.amount)) + "</span>" +
        '<button type="button" class="tx" data-a="delExpense" data-id="' + esc(e.id) + '" aria-label="' + esc(t("del")) + '">' + IC.close + "</button></li>";
    });
    h += "</ul>";
  }
  return h + "</section>";
}

function kv(k: string, v: string, cls = ""): string {
  return "<div><dt>" + esc(k) + '</dt><dd class="' + cls + '">' + esc(v) + "</dd></div>";
}
