/** Uygulama girişi: veriyi yükler, olayları bağlar, ilk ekranı çizer. */
import "./styles/main.css";
import { setLang, t } from "./i18n";
import { applyExternal, commit, replaceState, setChangeHook, setLockHook, setPersister, setRenderer, store, storeVersion, ui } from "./app/store";
import { ensureUpcoming, needsReservation } from "./domain/schedule";
import { fieldOf, telHref } from "./domain/fields";
import { dayName } from "./domain/messages";
import { ddmm } from "./domain/dates";
import { syncFromLocation } from "./app/router";
import { dispatch, needsConfirm } from "./app/actions";
import { importFromFile, onEnter, onField, pitchHandlers } from "./app/handlers";
import { bindPitchDrag } from "./ui/pitchDrag";
import { flush, getMeta, listenOtherTabs, loadState, lockedSnapshot, onSaveError, requestPersistence, saveState } from "./data/persist";
import { DAY, hasData, reminderDue, daysSince } from "./data/backup";
import { initSync, onSyncChange, syncChanged, syncView } from "./sync";
import { refreshSyncSection, syncBanner } from "./ui/views/sync";
import "./app/syncActions";
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
import { updateTemplatePreview } from "./ui/views/templates";
import { onEventField } from "./app/eventHandlers";
import { elapsed, tickClock } from "./ui/clock";

/** Arama kutusu: yazarken yeniden çiz, imleci koru (kurallar, disiplin). */
function liveSearch(id: string, set: (q: string) => void, q: string): void {
  set(q);
  const input = document.getElementById(id) as HTMLInputElement | null;
  const pos = input?.selectionStart ?? q.length;
  renderApp();
  const again = document.getElementById(id) as HTMLInputElement | null;
  if (again) {
    again.focus({ preventScroll: true });
    again.setSelectionRange(pos, pos);
  }
}
import type { FilterKey } from "./app/store";

async function boot(): Promise<void> {
  const s = await loadState();
  replaceState(s);
  setLang(store.s.settings.lang);
  setPersister((st) => {
    saveState(st);
    if (!getMeta().persisted && hasData(st)) requestPersistence();
  });
  setLockHook(lockedSnapshot);
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
  setupSync();
  setupPWA();
  setupBackupReminder();
  setupReservationReminder();
  autoSchedule();
  renderApp();
  // Uygulama ertesi gün öne geldiğinde yeni maç günlerini planla, hatırlatmaları tazele
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      autoSchedule();
      renderApp();
    }
  });
  if (hasData(store.s)) requestPersistence().then(() => undefined);
}

/** Cihazlar arası eşitleme (Firebase). Giriş yapılmamışsa hiçbir şey yüklenmez. */
function setupSync(): void {
  setChangeHook(syncChanged);
  initSync({
    getState: () => store.s,
    version: storeVersion,
    apply: (next) => {
      if (isModalOpen()) return false;
      applyExternal(next, t("syncPulled"));
      autoSchedule();
      return true;
    },
    lock: lockedSnapshot,
    hasData,
    lang: () => store.s.settings.lang,
  });
  addBanner(syncBanner);
  onSyncChange(() => {
    refreshSyncSection();
    refreshHeroStatus();
    renderBanners();
  });
}

function autoSchedule(): void {
  if (ensureUpcoming(store.s, new Date()).length) commit(true);
}

function setupReservationReminder(): void {
  addBanner(() => {
    const m = needsReservation(store.s, new Date())[0];
    if (!m) return "";
    const f = fieldOf(store.s, m);
    const tel = telHref(f?.phone);
    return bannerHTML({
      icon: IC.alert, tone: "warn", title: esc(t("reserveTitle")), text: esc(t("reserveText", { d: dayName(m.date) + " " + ddmm(m.date) + " " + m.time + (f ? ", " + f.name : "") })),
      actions: (tel ? '<a class="btn sm" href="tel:' + esc(tel) + '">' + IC.phone + esc(t("call")) + "</a>" : "") + '<button type="button" class="btn sm primary" data-a="reserve" data-id="' + esc(m.id) + '">' + esc(t("reservedDone")) + "</button>",
    });
  });
}

function setupBackupReminder(): void {
  addBanner(() => {
    const meta = getMeta();
    const now = Date.now();
    // Eşitleme çalışıyorsa veri bulutta da durur: hatırlatma ayda bire iner.
    const sv = syncView();
    const synced = !!sv.user && now - sv.status.lastSyncAt < 7 * DAY;
    if (!reminderDue(meta, now, hasData(store.s), synced ? 30 : undefined)) return "";
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
    if (el.id === "tpl-text") return updateTemplatePreview();
    if (el.id === "q-rules") return liveSearch("q-rules", (q) => (ui.ruleQ = q), el.value);
    if (el.id === "q-disc") return liveSearch("q-disc", (q) => (ui.discQ = q), el.value);
    if (el.dataset && el.dataset.f === "ann.ruleText") return void onEventField(el);
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
  // <details data-keep> açık/kapalı durumunu hatırla (toggle olayı kabarcıklanmaz → yakalama)
  document.addEventListener(
    "toggle",
    (e) => {
      const d = e.target as HTMLDetailsElement;
      if (d.dataset && d.dataset.keep) ui.open[d.dataset.keep] = d.open;
    },
    true,
  );
  window.addEventListener("popstate", () => {
    if (handlePopForModal()) return;
    syncFromLocation();
    renderApp();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderApp());
  bindPitchDrag(pitchHandlers);
  // Maç saati: ekrandaki süreyi her saniye günceller; devre arasında ve sonunda durdurur (Kural 4.1).
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    tickClock((m) => {
      if (!m.clock) return;
      m.clock = { start: 0, acc: elapsed(m) };
      commit();
    });
  }, 1000);
}

boot().catch((e) => {
  console.error(e);
  document.getElementById("view")!.textContent = "Uygulama açılamadı. Sayfayı yenile.";
});
