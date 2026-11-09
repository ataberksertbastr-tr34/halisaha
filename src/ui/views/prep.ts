/** Hazırlık listesi ve ön anlaşmalar (türün kurallarına göre). */
import { t } from "../../i18n";
import { isOpen, store } from "../../app/store";
import type { Match } from "../../domain/types";
import { esc } from "../../domain/text";
import { agreeValue, checkProgress, isFootball, kindOf, L, pendingAgreements } from "../../domain/kinds";
import { ruleChip, shareButtons } from "../components";
import { IC } from "../icons";

export function prepBlock(m: Match): string {
  const k = kindOf(m);
  const prog = checkProgress(m);
  const pending = pendingAgreements(m);
  const key = "prep-" + m.id;
  const all = prog.done === prog.total && !pending.length;
  // Halı sahada liste kapalı başlar (her hafta aynı); etkinliklerde eksik varsa açık.
  const openDefault = !all && m.status === "open" && !isFootball(m);
  let h = '<section class="section prep" aria-labelledby="h-prep"><details data-keep="' + esc(key) + '"' + (isOpen(key, openDefault) ? " open" : "") + "><summary>" +
    '<span class="prep-sum"><span class="navic sm">' + IC.list + '</span><span class="minw0"><h2 id="h-prep" class="inline">' + esc(t("prepTitle")) + "</h2>" +
    '<span class="meta">' + esc(t("prepMeta", { d: prog.done, n: prog.total })) + (pending.length ? " · " + esc(t("pendingN", { n: pending.length })) : "") + "</span></span>" +
    '<span class="ring' + (all ? " full" : "") + '" style="--p:' + Math.round((prog.done / Math.max(1, prog.total)) * 100) + '" aria-hidden="true"></span></span></summary>';
  // Hazırlık listesi
  h += '<ul class="checks">';
  h += checkRow("reserved", m.reserved, t("reservedCheck"), "", "reserve", m.id);
  for (const c of k.checks) h += checkRow(c.key, !!m.checks[c.key], L(c), c.rule, "check", m.id);
  h += "</ul>";
  // Ön anlaşmalar
  if (k.agree.length) {
    h += '<h3 class="row nowrap">' + IC.handshake.replace("<svg", '<svg class="h3i"') + "<span>" + esc(t("agreeTitle")) + "</span></h3>" +
      '<p class="small muted tight">' + esc(t("agreeHint")) + "</p><div class=\"agrees\">";
    for (const a of k.agree) {
      const v = agreeValue(m, a.key);
      h += '<label class="agree' + (v ? "" : " pending") + '"><span class="ag-l"><span>' + esc(L(a)) + "</span>" + ruleChip(a.rule) + "</span>" +
        '<select data-f="m.agree" data-k="' + esc(a.key) + '" aria-label="' + esc(L(a)) + '">' +
        (v ? "" : '<option value="" selected>' + esc(t("notAgreed")) + "</option>") +
        a.opts.map((o) => '<option value="' + esc(o.v) + '"' + (o.v === v ? " selected" : "") + ">" + esc(L(o)) + "</option>").join("") + "</select></label>";
    }
    h += "</div>";
  }
  h += '<div class="row nowrap mt">' + shareButtons("brief", t("briefShare")) + "</div>";
  return h + "</details></section>";
}

export function checkRow(key: string, on: boolean, label: string, rule: string, action: string, mid: string): string {
  return '<li class="crow"><button type="button" class="cbox' + (on ? " on" : "") + '" data-a="' + action + '" data-id="' + esc(mid) + '" data-k="' + esc(key) + '" role="checkbox" aria-checked="' + on + '">' +
    '<span class="tick" aria-hidden="true">' + (on ? IC.check : "") + '</span><span class="cl">' + esc(label) + "</span></button>" + ruleChip(rule) + "</li>";
}

export function prepHeroChip(m: Match): string {
  const p = checkProgress(m);
  const pend = pendingAgreements(m).length;
  if (p.done === p.total && !pend) return '<span class="hero-chip">' + IC.check + esc(t("prepReady")) + "</span>";
  void store;
  return '<span class="hero-chip' + (pend ? " warn" : "") + '">' + IC.list + esc(t("prepMeta", { d: p.done, n: p.total })) + "</span>";
}
