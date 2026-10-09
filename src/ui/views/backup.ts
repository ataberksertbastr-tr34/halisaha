/** Yedekleme bölümü ve ilgili alt sayfalar. */
import { t } from "../../i18n";
import { store } from "../../app/store";
import { esc } from "../../domain/text";
import { daysSince } from "../../data/backup";
import { getMeta, storageMode, type Meta } from "../../data/persist";
import type { Snapshot } from "../../data/db";
import type { State } from "../../domain/types";
import { showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

export function lastBackupText(meta: Meta, now = Date.now()): string {
  if (!meta.lastExportAt) return t("backupNever");
  const d = daysSince(meta.lastExportAt, now);
  return d === 0 ? t("backupToday") : t("backupAgo", { n: d });
}

export function backupSection(): string {
  const meta = getMeta();
  let h = '<section class="section" aria-labelledby="h-bk"><h2 id="h-bk">' + esc(t("backup")) + "</h2>";
  h += '<p class="muted small">' + esc(lastBackupText(meta)) + " " + esc(storageMode() === "local" ? t("storageLocal") : meta.persisted ? t("persistOn") : t("persistOff")) + "</p>";
  h += '<div class="row"><button type="button" class="btn primary grow" data-a="shareBackup">' + IC.share + esc(t("shareBackup")) + "</button>" +
    '<button type="button" class="btn grow" data-a="downloadBackup">' + IC.download + esc(t("downloadBackup")) + "</button>" +
    '<button type="button" class="btn grow" data-a="export">' + IC.copy + esc(t("exportData")) + "</button></div>";
  h += "<h3>" + esc(t("restoreSection")) + '</h3><div class="row"><button type="button" class="btn grow" data-a="importOpen">' + IC.upload + esc(t("importData")) + "</button>" +
    '<button type="button" class="btn grow" data-a="versions">' + esc(t("localVersions")) + "</button></div>";
  h += '<div class="row mt"><button type="button" class="btn danger" data-a="reset" data-confirm="1">' + esc(t("resetAll")) + "</button></div></section>";
  return h;
}

/** "Yedekten yükle": dosya seçme + yapıştırma alanı. */
export function openImportSheet(): void {
  showModal(sheetHead(t("importData")) +
    '<label class="btn block filebtn">' + IC.upload + esc(t("chooseFile")) + '<input type="file" id="importFile" accept=".json,application/json,text/plain" class="visually-hidden"></label>' +
    '<p class="small muted mt">' + esc(t("orPaste")) + "</p>" +
    '<textarea id="mtext" aria-label="' + esc(t("importData")) + '" placeholder="' + esc(t("importHint")) + '"></textarea>' +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="doImport">' + esc(t("load")) + "</button></div>");
}

/** Yüklemeden önce özet ve onay. */
export function openImportConfirm(next: State): void {
  const cur = store.s;
  showModal(sheetHead(t("importConfirm")) +
    '<p><strong>' + esc(t("importSummary", { p: next.players.length, m: next.matches.length })) + "</strong></p>" +
    '<p class="muted">' + esc(t("importReplace", { p: cur.players.length, m: cur.matches.length })) + "</p>" +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="confirmImport">' + esc(t("load")) + '</button><button type="button" class="btn grow" data-a="closeModal">' + esc(t("cancel")) + "</button></div>");
}

const REASONS: Record<string, Parameters<typeof t>[0]> = {
  "legacy-import": "reasonLegacy", "pre-migration": "reasonPreMig", "before-import": "reasonBeforeImport",
  "before-reset": "reasonBeforeReset", "before-restore": "reasonBeforeRestore", "before-delete": "reasonBeforeDelete",
};

function when(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(store.s.settings.lang === "en" ? "en-GB" : "tr-TR", { day: "2-digit", month: "short" }) + " " +
    d.toLocaleTimeString(store.s.settings.lang === "en" ? "en-GB" : "tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function openVersionsSheet(list: Snapshot[]): void {
  let h = sheetHead(t("localVersions")) + '<p class="small muted">' + esc(t("localVersionsHint")) + "</p>";
  if (!list.length) h += '<p class="muted">' + esc(t("noVersions")) + "</p>";
  else {
    h += '<ul class="vlist">';
    list.forEach((s, i) => {
      const reason = s.reason && REASONS[s.reason] ? t(REASONS[s.reason]) : "";
      h += '<li class="vrow"><div class="pname"><strong>' + esc(when(s.at)) + (i === 0 ? ' <span class="tag ok">' + esc(t("syncLocal")) + "</span>" : "") + "</strong>" +
        '<span class="meta">' + esc(t("versionSummary", { p: s.players, m: s.matches })) + (reason ? " · " + esc(reason) : "") + "</span></div>" +
        (i === 0 && !s.locked ? "" : '<button type="button" class="btn sm" data-a="restoreVersion" data-id="' + s.id + '">' + esc(t("restoreThis")) + "</button>") + "</li>";
    });
    h += "</ul>";
  }
  showModal(h);
}
