/**
 * Banka bildiriminden ödeme: yapıştırma alanı ve önizleme (domain/bank.ts). Organizatör her
 * satırın kime ait olduğunu görür, gerekirse değiştirir; "Uygula" ile ödemeler deftere yazılır.
 */
import { money, t, type MsgKey } from "../../i18n";
import type { State } from "../../domain/types";
import { esc, trSort } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { accounts } from "../../domain/ledger";
import type { BankNote, BankRow } from "../../domain/bank";
import { showModal, updateModal } from "../modal";
import { sheetHead } from "../sheets";

export function openBankSheet(text: string): void {
  showModal(sheetHead(t("bankTitle")) +
    '<p class="small muted tight">' + esc(t("bankHint")) + "</p>" +
    '<textarea id="bank-text" aria-label="' + esc(t("bankTitle")) + '" placeholder="' + esc(t("bankPlaceholder")) + '"' + (text ? "" : " autofocus") + ">" + esc(text) + "</textarea>" +
    '<p class="small muted mt-s m0">' + esc(t("bankPrivacy")) + "</p>" +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="bankPreview">' + esc(t("pastePreview")) + "</button></div>");
}

const NOTE: Record<BankNote, MsgKey> = { match: "bankNoteMatch", alias: "bankNoteAlias", none: "bankNoteNone", ambiguous: "pasteNoteAmbiguous", out: "bankNoteOut", dup: "bankNoteDup" };

export function showBankPreview(s: State, rows: BankRow[], today: string): void {
  const acc = accounts(s, today);
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name || acc.get(id)?.name || id;
  const owed = (id: string) => acc.get(id)?.owed || 0;
  const people = [...s.players.map((p) => ({ id: p.id, name: p.name })), ...[...acc.values()].filter((a) => a.guest).map((a) => ({ id: a.id, name: a.name + " (" + t("guest") + ")" }))];
  // Borçlular önce (ödeme büyük olasılıkla onlardan), sonra herkes alfabetik
  const debtors = people.filter((p) => owed(p.id) > 0.004).sort(trSort);
  const others = people.filter((p) => owed(p.id) <= 0.004).sort(trSort);
  const opt = (id: string, label: string, sel: boolean) => '<option value="' + esc(id) + '"' + (sel ? " selected" : "") + ">" + esc(label) + "</option>";
  const sum = rows.filter((r) => r.apply).reduce((x, r) => x + r.amount, 0);
  let h = sheetHead(t("bankTitle")) + '<p class="small muted tight">' + esc(t("bankCheck", { n: rows.length, a: money(sum) })) + '</p><div class="stackf">';
  rows.forEach((r, i) => {
    const who = r.sender || r.raw.slice(0, 40);
    const extra = r.pid && owed(r.pid) > 0.004 ? t("bankOwes", { a: money(owed(r.pid)) }) : "";
    const meta = [ddmm(r.date), t(NOTE[r.note]), extra].filter(Boolean).join(" · ");
    const sel = r.apply ? r.pid : "";
    let o = opt("", t("pasteSkip"), !sel);
    const top = [r.pid, ...r.cands].filter(Boolean);
    if (top.length) o += '<optgroup label="' + esc(t("bankSuggested")) + '">' + top.map((id) => opt(id, nameOf(id), id === sel)).join("") + "</optgroup>";
    if (debtors.length) o += '<optgroup label="' + esc(t("debts")) + '">' + debtors.filter((p) => !top.includes(p.id)).map((p) => opt(p.id, p.name + " · " + money(owed(p.id)), false)).join("") + "</optgroup>";
    o += '<optgroup label="' + esc(t("bankEveryone")) + '">' + others.filter((p) => !top.includes(p.id)).map((p) => opt(p.id, p.name, false)).join("") + "</optgroup>";
    h += '<label class="fld bankrow"><span class="bk-head"><strong>' + esc(who) + '</strong><b class="bk-amt' + (r.out ? " neg" : "") + '">' + esc((r.out ? "−" : "") + money(r.amount)) + "</b></span>" +
      '<span class="small muted">' + esc(meta) + "</span>" +
      // Hesaptan çıkan para ödeme değildir: seçilemez
      '<select id="bk-' + i + '" aria-label="' + esc(who + " " + money(r.amount)) + '"' + (r.out ? " disabled" : "") + ">" + (r.out ? opt("", t("pasteSkip"), true) : o) + "</select></label>";
  });
  h += '</div><p class="small muted mt-s">' + esc(t("bankApplyHint")) + '</p><div class="row mt"><button type="button" class="btn primary grow" data-a="bankApply">' + esc(t("pasteApply")) + '</button><button type="button" class="btn" data-a="bankOpen">' + esc(t("pasteEdit")) + "</button></div>";
  updateModal(h);
}
