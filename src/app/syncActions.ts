/** Eşitleme düğmeleri: giriş/çıkış, şifre, elle eşitleme, Firebase yapılandırması. */
import { registerActions } from "./actions";
import { t, type MsgKey } from "../i18n";
import { toast } from "../ui/toast";
import { renderBanners } from "../ui/banner";
import { forceUpdate } from "../pwa/register";
import { flush } from "../data/persist";
import { dismissSyncBanner } from "../ui/views/sync";
import { clearConfig, dismissLost, publishNow, pubView, resetPassword, saveConfigText, setPassword, signInEmail, signInGoogle, signOutSync, signUpEmail, syncNow, syncView, unpublish } from "../sync";
import { commit, store } from "./store";
import { newPubId } from "../domain/pubpage";
import { pubLink } from "../ui/views/pubpage";
import { shareText } from "../ui/share";

const val = (id: string): string => ((document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value || "").trim();

/** Giriş hatasını kullanıcıya bildirir (pencere kapandıysa "iptal edildi" der; sessiz kalmaz). */
function fail(e: unknown): void {
  const key = e instanceof Error ? e.message : "unknown";
  toast(t(("authErr_" + key) as MsgKey) || t("authErr_unknown"), undefined, 5000);
}

function emailForm(): { email: string; pw: string } | null {
  const email = val("sync-email");
  const pw = (document.getElementById("sync-pw") as HTMLInputElement | null)?.value || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    toast(t("authErr_badEmail"));
    document.getElementById("sync-email")?.focus();
    return null;
  }
  if (pw.length < 6) {
    toast(t("authErr_weakPassword"));
    document.getElementById("sync-pw")?.focus();
    return null;
  }
  return { email, pw };
}

registerActions({
  syncGoogle: () => {
    signInGoogle().catch(fail);
  },
  syncEmailIn: () => {
    const f = emailForm();
    if (f) signInEmail(f.email, f.pw).catch(fail);
  },
  syncEmailUp: () => {
    const f = emailForm();
    if (f) signUpEmail(f.email, f.pw).catch(fail);
  },
  syncReset: () => {
    const email = val("sync-email");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast(t("authErr_badEmail"));
      document.getElementById("sync-email")?.focus();
      return;
    }
    resetPassword(email).then(() => toast(t("resetSent"), undefined, 5000), fail);
  },
  syncSetPw: () => {
    const pw = (document.getElementById("sync-newpw") as HTMLInputElement | null)?.value || "";
    if (pw.length < 6) {
      toast(t("authErr_weakPassword"));
      return;
    }
    setPassword(pw).then(() => toast(t("pwSet"), undefined, 5000), fail);
  },
  syncOut: () => {
    signOutSync().catch(fail);
  },
  syncNow: () => {
    void syncNow();
  },
  // Yapılandırma değişince Firebase baştan başlamalı: kayıttan sonra sayfa yenilenir.
  syncCfgSave: () => {
    if (saveConfigText(val("sync-cfg"))) {
      toast(t("syncCfgOk"));
      setTimeout(() => location.reload(), 600);
    } else toast(t("syncCfgBad"), undefined, 4000);
  },
  syncCfgClear: () => {
    signOutSync()
      .catch(() => undefined)
      .finally(() => {
        clearConfig();
        location.reload();
      });
  },
  // "Başka cihaz daha yeni sürümde": yeni sürümü indirip uygular (yalnızca yeniden yüklemek eski sürümü açar)
  syncReload: () => {
    toast(t("updating"));
    forceUpdate(flush);
  },
  syncDismiss: () => {
    dismissSyncBanner();
    renderBanners();
  },
  // "Oturum kapandı" uyarısı: bu cihazda eşitleme kapalı kalsın (davet şeridi de bir daha çıkmasın).
  syncLostDismiss: () => {
    dismissSyncBanner();
    dismissLost();
  },
});

/* ---------- Oyuncu durum sayfası ---------- */
registerActions({
  /** Sayfayı açar: tahmin edilemeyen yeni bir kimlik alır ve hemen yayınlar. */
  pubOn: () => {
    if (!syncView().user) return toast(t("pubNeedSync"));
    store.s.settings.pubId = newPubId();
    commit();
    void publishNow(true).then(() => {
      const st = pubView();
      toast(st.state === "ok" ? t("pubOnDone") : st.state === "rules" ? t("pubRules") : t("pubError"), undefined, st.state === "ok" ? undefined : 8000);
    });
  },
  pubShare: () => {
    const id = store.s.settings.pubId;
    if (id) void shareText(t("pubShareText", { l: pubLink(id) }));
  },
  pubRetry: () => void publishNow(true),
  /** Sayfayı kapatır: buluttaki belge silinir, bağlantı artık çalışmaz. */
  pubOff: () => {
    const id = store.s.settings.pubId;
    if (!id) return;
    void unpublish(id).then((ok) => {
      store.s.settings.pubId = "";
      commit();
      toast(ok ? t("pubOffDone") : t("pubOffLocal"), undefined, ok ? undefined : 8000);
    });
  },
});
