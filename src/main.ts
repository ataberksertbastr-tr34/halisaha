/** Uygulama girişi: veriyi yükler, olayları bağlar, ilk ekranı çizer. */
import "./styles/main.css";
import { setLang, t } from "./i18n";
import { replaceState, setPersister, setRenderer, store, ui } from "./app/store";
import { syncFromLocation } from "./app/router";
import { dispatch, needsConfirm } from "./app/actions";
import { onEnter, onField } from "./app/handlers";
import { migrate } from "./domain/migrate";
import { readLegacyLocal, writeLocal } from "./data/local";
import { renderApp } from "./ui/shell";
import { closeModal, handlePopForModal, isModalOpen } from "./ui/modal";
import { runToastAction } from "./ui/toast";
import { applyFilter } from "./ui/components";
import type { FilterKey } from "./app/store";

function boot(): void {
  let s;
  try {
    s = migrate(readLegacyLocal());
  } catch {
    s = migrate(null);
  }
  replaceState(s);
  setLang(store.s.settings.lang);
  setPersister(writeLocal);
  setRenderer(renderApp);
  syncFromLocation();
  bindEvents();
  renderApp();
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

boot();
