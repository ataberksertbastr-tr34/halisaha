/** Uygulama girişi: veriyi yükler, olayları bağlar, ilk ekranı çizer. */
import "./styles/main.css";
import { setLang, t } from "./i18n";
import { replaceState, setPersister, setRenderer, store, ui } from "./app/store";
import { syncFromLocation } from "./app/router";
import { dispatch, needsConfirm } from "./app/actions";
import { importFromFile, onEnter, onField } from "./app/handlers";
import { flush, getMeta, listenOtherTabs, loadState, onSaveError, requestPersistence, saveState } from "./data/persist";
import { hasData, reminderDue, daysSince } from "./data/backup";
import { renderApp } from "./ui/shell";
import { closeModal, handlePopForModal, isModalOpen } from "./ui/modal";
import { runToastAction, toast } from "./ui/toast";
import { addBanner, bannerHTML, renderBanners } from "./ui/banner";
import { refreshHeroStatus } from "./ui/shell";
import { IC } from "./ui/icons";
import { registerActions } from "./app/actions";
import { applyUpdate, initPWA, promptInstall, pwa } from "./pwa/register";
import { esc } from "./domain/text";
import { applyFilter } from "./ui/components";
import type { FilterKey } from "./app/store";

async function boot(): Promise<void> {
  const s = await loadState();
  replaceState(s);
  setLang(store.s.settings.lang);
  setPersister((st) => {
    saveState(st);
    if (!getMeta().persisted && hasData(st)) requestPersistence();
  });
  onSaveError(() => toast(t("saveFailed")));
  listenOtherTabs((next) => {
    if (isModalOpen()) return;
    replaceState(next);
    renderApp();
    toast(t("otherTab"));
  });
  setRenderer(renderApp);
  syncFromLocation();
  bindEvents();
  setupPWA();
  setupBackupReminder();
  renderApp();
  if (hasData(store.s)) requestPersistence().then(() => undefined);
}

function setupBackupReminder(): void {
  addBanner(() => {
    const meta = getMeta();
    const now = Date.now();
    if (!reminderDue(meta, now, hasData(store.s))) return "";
    const text = meta.lastExportAt ? t("reminderText", { n: daysSince(meta.lastExportAt, now) }) : t("reminderNever");
    return bannerHTML({
      icon: IC.download, tone: "warn", title: esc(t("reminderTitle")), text: esc(text),
      actions: '<button type="button" class="btn sm primary" data-a="shareBackup">' + esc(t("shareBackup")) + '</button><button type="button" class="btn sm ghost" data-a="snoozeBackup">' + esc(t("later")) + "</button>",
    });
  });
}

function setupPWA(): void {
  addBanner(() =>
    pwa.updateReady()
      ? bannerHTML({ icon: IC.download, title: esc(t("updateReady")), text: esc(t("updateText")), actions: '<button type="button" class="btn sm primary" data-a="applyUpdate">' + esc(t("update")) + "</button>" })
      : "",
  );
  registerActions({
    applyUpdate: () => applyUpdate(flush),
    install: () => {
      promptInstall().catch(() => toast(t("installHint")));
    },
  });
  pwa.onChange(() => {
    renderBanners();
    refreshHeroStatus();
  });
  window.addEventListener("online", refreshHeroStatus);
  window.addEventListener("offline", refreshHeroStatus);
  initPWA();
}

function bindEvents(): void {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-toast-act]")) {
      runToastAction();
      return;
    }
    const b = target.closest<HTMLElement>("[data-a]");
    if (b) {
      if (needsConfirm(b, t("sure"))) return;
      dispatch(b.dataset.a!, b.dataset, b);
      return;
    }
    if (target.id === "modal") closeModal();
  });
  document.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === "importFile") return importFromFile(el);
    if (el.dataset && el.dataset.f) onField(el);
  });
  document.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    const k = el.dataset && (el.dataset.q as FilterKey | undefined);
    if (k) {
      ui.f[k].q = el.value;
      applyFilter(k);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isModalOpen()) closeModal();
    if (e.key === "Enter") onEnter(e);
  });
  window.addEventListener("popstate", () => {
    if (handlePopForModal()) return;
    syncFromLocation();
    renderApp();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderApp());
}

boot().catch((e) => {
  console.error(e);
  document.getElementById("view")!.textContent = "Uygulama açılamadı. Sayfayı yenile.";
});
