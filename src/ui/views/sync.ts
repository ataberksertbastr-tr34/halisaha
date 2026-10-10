/** Ayarlar → Cihazlar arası eşitleme bölümü, üst köşedeki durum rozeti ve uyarı şeritleri. */
import { t, type MsgKey } from "../../i18n";
import { store } from "../../app/store";
import { esc } from "../../domain/text";
import { syncView, type SyncView } from "../../sync";
import { isIOS, isStandalone } from "../../pwa/register";
import { IC } from "../icons";
import { bannerHTML } from "../banner";

/** "az önce", "5 dk önce" … */
export function agoText(ts: number, now = Date.now()): string {
  if (!ts) return "";
  const m = Math.floor((now - ts) / 60000);
  if (m < 1) return t("syncJustNow");
  if (m < 60) return t("syncMinAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("syncHourAgo", { n: h });
  return t("syncDayAgo", { n: Math.floor(h / 24) });
}

function statusText(v: SyncView): string {
  if (v.loading && !v.user) return t("syncLoading");
  const st = v.status;
  let s = t(("syncSt_" + st.state) as MsgKey);
  if (st.state === "error" && st.error) s += " · " + t(("syncErr_" + st.error) as MsgKey);
  const parts = [s];
  if (st.lastSyncAt && v.user) parts.push(t("syncLast", { t: agoText(st.lastSyncAt) }));
  if (st.pending && st.state !== "syncing" && v.user) parts.push(t("syncPendingNote"));
  return parts.join(" · ");
}

/** Bölümün yapısını belirleyen durum; değişmedikçe yalnızca durum satırı güncellenir (yazılan alanlar silinmesin). */
export function syncShapeKey(v = syncView()): string {
  return [v.configured, v.builtIn, v.user?.uid || "", v.user?.hasPassword, v.loading && !v.user].join("|");
}

export function syncSection(): string {
  const v = syncView();
  let h = '<section class="section" id="sync-sec" data-shape="' + esc(syncShapeKey(v)) + '" aria-labelledby="h-sync"><h2 id="h-sync">' + esc(t("syncTitle")) + "</h2>";
  if (!v.configured) {
    h += '<p class="muted">' + esc(t("syncSetupNeeded")) + "</p>" +
      '<label class="fld">' + esc(t("syncPasteCfg")) + '<textarea id="sync-cfg" rows="4" spellcheck="false" autocomplete="off"></textarea></label>' +
      '<div class="row mt"><button type="button" class="btn grow" data-a="syncCfgSave">' + esc(t("syncCfgSave")) + "</button></div>";
    return h + "</section>";
  }
  h += '<p class="small muted" id="sync-status" role="status">' + esc(statusText(v)) + "</p>";
  if (!v.user) {
    h += '<p class="muted">' + esc(t("syncIntro")) + "</p>" +
      '<button type="button" class="btn block gbtn" data-a="syncGoogle"' + (v.loading ? " disabled" : "") + ">" + IC.google + esc(t("syncGoogle")) + "</button>";
    if (isIOS() && isStandalone()) h += '<p class="small muted mt">' + esc(t("syncIosHint")) + "</p>";
    h += '<details class="mt" data-keep="syncEmail"' + (isIOS() && isStandalone() ? " open" : "") + "><summary>" + esc(t("syncEmailToggle")) + "</summary>" +
      '<form class="syncform mt">' +
      '<label class="fld">' + esc(t("email")) + '<input type="email" id="sync-email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false"></label>' +
      '<label class="fld">' + esc(t("password")) + '<input type="password" id="sync-pw" autocomplete="current-password" minlength="6"></label>' +
      '<div class="row"><button type="button" class="btn primary grow" data-a="syncEmailIn">' + esc(t("signIn")) + "</button>" +
      '<button type="button" class="btn grow" data-a="syncEmailUp">' + esc(t("signUp")) + "</button></div>" +
      '<button type="button" class="btn ghost sm" data-a="syncReset">' + esc(t("forgotPw")) + "</button></form></details>";
  } else {
    h += '<p class="m0"><strong>' + esc(t("syncSignedIn", { e: v.user.email || v.user.name || "" })) + "</strong></p>" +
      '<div class="row mt"><button type="button" class="btn primary grow" data-a="syncNow">' + IC.cloud + esc(t("syncNowBtn")) + "</button>" +
      '<button type="button" class="btn grow" data-a="syncOut" data-confirm="1">' + esc(t("signOut")) + "</button></div>" +
      '<p class="small muted">' + esc(t("signOutNote")) + "</p>";
    if (!v.user.hasPassword && v.user.email) {
      h += '<details class="mt" data-keep="syncPw"><summary>' + esc(t("setPw")) + '</summary><p class="small muted">' + esc(t("setPwHint")) + "</p>" +
        '<form class="syncform"><input type="email" class="visually-hidden" tabindex="-1" aria-hidden="true" autocomplete="username" value="' + esc(v.user.email) + '">' +
        '<label class="fld">' + esc(t("newPw")) + '<input type="password" id="sync-newpw" autocomplete="new-password" minlength="6"></label>' +
        '<button type="button" class="btn" data-a="syncSetPw">' + esc(t("setPw")) + "</button></form></details>";
    }
  }
  if (!v.builtIn) h += '<div class="row mt"><button type="button" class="btn ghost sm" data-a="syncCfgClear" data-confirm="1">' + esc(t("syncCfgClear")) + "</button></div>";
  return h + "</section>";
}

/** Durum değişince: bölüm yapısı değiştiyse bölümü, yoksa yalnızca durum satırını yeniler. */
export function refreshSyncSection(): void {
  const sec = document.getElementById("sync-sec");
  if (!sec) return;
  const v = syncView();
  if (sec.dataset.shape !== syncShapeKey(v)) {
    sec.outerHTML = syncSection();
    return;
  }
  const p = document.getElementById("sync-status");
  if (p) p.textContent = statusText(v);
}

/** Üst köşedeki rozet: giriş yapılmışsa eşitleme durumu, değilse "Bu cihazda kayıtlı". */
export function syncChip(): string {
  const v = syncView();
  if (navigator.onLine === false) return '<span class="sync off" id="sync">' + esc(t("offline")) + "</span>";
  if (!v.user) return '<span class="sync" id="sync">' + esc(t("syncLocal")) + "</span>";
  const st = v.status.state;
  if (st === "error" || st === "needsUpdate") return '<span class="sync warn" id="sync">' + IC.alert + esc(t("syncHeroErr")) + "</span>";
  if (st === "syncing" || v.status.pending) return '<span class="sync" id="sync">' + IC.cloud + esc(t("syncHeroBusy")) + "</span>";
  return '<span class="sync on" id="sync">' + IC.cloudOk + esc(t("syncHeroOn")) + "</span>";
}

const DISMISS_KEY = "halisaha.sync.banner";
export function dismissSyncBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* depolama kapalı */
  }
}
function dismissed(): boolean {
  try {
    return !!localStorage.getItem(DISMISS_KEY);
  } catch {
    return false;
  }
}

/** Üst şerit: giriş yapılmamış cihazda bir kez davet; eşitleme durduysa uyarı. */
export function syncBanner(): string {
  const v = syncView();
  if (!v.configured) return "";
  if (v.user) {
    if (v.status.state === "needsUpdate") return bannerHTML({ icon: IC.alert, tone: "warn", title: esc(t("syncBannerUpdate")), text: esc(t("syncSt_needsUpdate")), actions: "" });
    if (v.status.state === "error" && v.status.error === "auth") {
      return bannerHTML({ icon: IC.alert, tone: "warn", title: esc(t("syncBannerAuth")), text: esc(t("syncBannerAuthText")), actions: '<button type="button" class="btn sm primary" data-a="nav" data-v="settings">' + esc(t("tabSettings")) + "</button>" });
    }
    return "";
  }
  if (v.loading || dismissed()) return "";
  const empty = store.s.players.length === 0;
  return bannerHTML({
    icon: IC.cloud,
    title: esc(t(empty ? "syncBannerEmpty" : "syncBannerData")),
    text: esc(t(empty ? "syncBannerEmptyText" : "syncBannerDataText")),
    actions: '<button type="button" class="btn sm primary" data-a="syncGoogle">' + esc(t("signIn")) + '</button><button type="button" class="btn sm ghost" data-a="nav" data-v="settings">' + esc(t("tabSettings")) + "</button>" + '<button type="button" class="btn sm ghost" data-a="syncDismiss">' + esc(t("later")) + "</button>",
  });
}
