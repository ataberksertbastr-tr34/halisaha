/** Mesaj şablonları: Ayarlar bölümü, düzenleme sayfası ve canlı önizleme. */
import { lang, t, type MsgKey } from "../../i18n";
import { store, today, ui } from "../../app/store";
import type { Match, TemplateKey } from "../../domain/types";
import { esc } from "../../domain/text";
import { currentMatch, lineup } from "../../domain/lineup";
import { makeMatch } from "../../domain/schedule";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, render, TEMPLATE_KEYS, templateOf } from "../../domain/templates";
import { matchVars, msgInvite, msgPay, msgSquad, msgTeams, personalPayText, promotedText } from "../../domain/messages";
import { showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

export const TPL_NAMES: Record<TemplateKey, MsgKey> = {
  invite: "tplInvite", squad: "tplSquad", teams: "tplTeams", pay: "tplPay", personalPay: "tplPersonalPay", promoted: "tplPromoted",
};

/** Mesaj başlığı + metni (paylaşım ve önizleme için). */
export function buildMessage(k: string, m: Match): { title: string; text: string } {
  const S = store.s;
  switch (k) {
    case "teams":
      return { title: t("shareTeams"), text: msgTeams(S, m) };
    case "pay":
      return { title: t("payReminder"), text: msgPay(S, m, today()) };
    case "squad":
      return { title: t("tplSquad"), text: msgSquad(S, m) };
    default:
      return { title: t("inviteMsg"), text: msgInvite(S, m) };
  }
}

export function templatesSection(): string {
  const custom = store.s.settings.templates;
  let h = '<section class="section" aria-labelledby="h-tpl"><h2 id="h-tpl">' + esc(t("templates")) + '</h2><p class="small muted">' + esc(t("templatesHint")) + '</p><div class="flist">';
  TEMPLATE_KEYS.forEach((k) => {
    h += '<div class="frow"><div class="pname"><strong>' + esc(t(TPL_NAMES[k])) + (custom[k] ? ' <span class="tag fix">' + esc(t("custom")) + "</span>" : "") + "</strong></div>" +
      '<button type="button" class="btn xs" data-a="tplEdit" data-k="' + k + '">' + esc(t("edit")) + "</button></div>";
  });
  return h + "</div></section>";
}

function previewMatch(): Match {
  return currentMatch(store.s, ui.matchId, today()) || makeMatch(store.s, today());
}

/** Şablon metnini örnek veriyle doldurur. */
export function previewOf(k: TemplateKey, tplText: string): string {
  const S = store.s;
  const m = previewMatch();
  const saved = S.settings.templates[k];
  S.settings.templates[k] = tplText;
  try {
    if (k === "personalPay") return personalPayText(S, t("sampleName"), 215);
    if (k === "promoted") {
      const id = lineup(S, m).playing[0];
      return id ? promotedText(S, m, id) : render(tplText, { ...matchVars(S, m), ad: t("sampleName") });
    }
    return buildMessage(k, m).text;
  } finally {
    if (saved === undefined) delete S.settings.templates[k];
    else S.settings.templates[k] = saved;
  }
}

export function openTemplateSheet(k: TemplateKey): void {
  const text = templateOf(store.s.settings.templates, k, lang());
  showModal(sheetHead(t(TPL_NAMES[k])) +
    '<textarea id="tpl-text" data-k="' + k + '" aria-label="' + esc(t(TPL_NAMES[k])) + '" spellcheck="false">' + esc(text) + "</textarea>" +
    '<p class="small muted mt-s">' + esc(t("placeholders")) + '</p><div class="phchips">' +
    PLACEHOLDERS[k].map((p) => '<button type="button" class="fchip" data-a="tplIns" data-v="' + p + '">{' + p + "}</button>").join("") + "</div>" +
    "<h3>" + esc(t("preview")) + '</h3><pre class="preview" id="tpl-preview">' + esc(previewOf(k, text)) + "</pre>" +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="tplSave" data-k="' + k + '">' + esc(t("save")) + "</button>" +
    '<button type="button" class="btn grow" data-a="tplReset" data-k="' + k + '"' + (store.s.settings.templates[k] ? "" : " disabled") + ">" + esc(t("resetDefault")) + "</button></div>");
}

export function updateTemplatePreview(): void {
  const ta = document.getElementById("tpl-text") as HTMLTextAreaElement | null;
  const out = document.getElementById("tpl-preview");
  if (ta && out) out.textContent = previewOf(ta.dataset.k as TemplateKey, ta.value);
}

/** Mesajı paylaşmadan önce görmek/düzeltmek için. */
export function openShareSheet(title: string, text: string): void {
  showModal(sheetHead(title) +
    '<textarea id="mtext" aria-label="' + esc(title) + '">' + esc(text) + "</textarea>" +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="shareSheet">' + IC.share + esc(t("share")) + "</button>" +
    '<button type="button" class="btn grow" data-a="copy">' + IC.copy + esc(t("copy")) + "</button></div>");
}

export function isDefaultTemplate(k: TemplateKey, text: string): boolean {
  return text.trim() === DEFAULT_TEMPLATES[lang()][k].trim() || !text.trim();
}
