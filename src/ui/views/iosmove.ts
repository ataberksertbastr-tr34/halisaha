/**
 * iPhone/iPad: ana ekrana eklenen uygulama Safari'deki verileri görmez (depolamaları ayrıdır).
 *  - Safari'de, verisi olan cihazda: kurmadan önce yedeği paylaşması ya da eşitlemeye girmesi söylenir.
 *  - Ana ekrandaki uygulama boşsa: Safari'deki yedeği buraya yüklemesi ya da giriş yapması söylenir.
 * Her şerit bir kez kapatılabilir (Safari ile ana ekrandaki uygulamanın depolaması ayrı olduğundan
 * kapatma da her birinde ayrı tutulur).
 */
import { t } from "../../i18n";
import { store } from "../../app/store";
import { route } from "../../app/router";
import { esc } from "../../domain/text";
import { isIOS, isStandalone } from "../../pwa/register";
import { syncView } from "../../sync";
import { bannerHTML } from "../banner";
import { IC } from "../icons";

const DISMISS_KEY = "halisaha.iosMove";

function dismissed(): boolean {
  try {
    return !!localStorage.getItem(DISMISS_KEY);
  } catch {
    return false;
  }
}

export function dismissIosMove(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* depolama kapalı */
  }
}

/**
 * Şerit gösteriliyor mu: Safari'de veri varken ya da ana ekrandaki uygulama boşken. Gösterilirken
 * eşitleme daveti ayrıca çıkmaz (bu şerit giriş yapmayı da önerir).
 */
export function iosMoveShowing(): boolean {
  if (!isIOS() || dismissed() || route().name === "settings") return false;
  const empty = store.s.players.length === 0;
  return isStandalone() ? empty : !empty;
}

export function iosMoveBanner(): string {
  if (!iosMoveShowing()) return "";
  const v = syncView();
  const ok = '<button type="button" class="btn sm ghost" data-a="iosMoveDismiss">' + esc(t("gotIt")) + "</button>";
  const signIn = v.configured && !v.user ? '<button type="button" class="btn sm" data-a="nav" data-v="settings">' + esc(t("signIn")) + "</button>" : "";
  if (!isStandalone()) {
    // Safari: veri varken, ana ekrana eklemeden önce
    const synced = !!v.user;
    return bannerHTML({
      icon: IC.install, tone: "warn", title: esc(t("iosMoveTitle")),
      text: esc(t(synced ? "iosMoveSynced" : "iosMoveText")),
      actions: (synced ? "" : '<button type="button" class="btn sm primary" data-a="shareBackup">' + esc(t("shareBackup")) + "</button>" + signIn) + ok,
    });
  }
  // Ana ekrandaki uygulama boş: Safari'deki veriyi getir
  return bannerHTML({
    icon: IC.upload, title: esc(t("iosEmptyTitle")), text: esc(t("iosEmptyText")),
    actions: '<button type="button" class="btn sm primary" data-a="importOpen">' + esc(t("importData")) + "</button>" + signIn + ok,
  });
}
