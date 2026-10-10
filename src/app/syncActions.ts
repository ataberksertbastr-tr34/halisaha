/** Eşitleme düğmeleri: giriş/çıkış, şifre, elle eşitleme, Firebase yapılandırması. */
import { registerActions } from "./actions";
import { t, type MsgKey } from "../i18n";
import { render } from "./store";
import { toast } from "../ui/toast";
import { renderBanners } from "../ui/banner";
import { dismissSyncBanner } from "../ui/views/sync";
import { clearConfig, resetPassword, saveConfigText, setPassword, signInEmail, signInGoogle, signOutSync, signUpEmail, syncNow } from "../sync";

const val = (id: string): string => ((document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value || "").trim();

/** Giriş hatasını kullanıcıya bildirir (iptal sessiz geçer). */
function fail(e: unknown): void {
  const key = e instanceof Error ? e.message : "unknown";
  if (key === "cancelled") return;
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
  syncCfgSave: () => {
    if (saveConfigText(val("sync-cfg"))) {
      toast(t("syncCfgOk"));
      render();
    } else toast(t("syncCfgBad"), undefined, 4000);
  },
  syncCfgClear: () => {
    clearConfig();
    render();
  },
  syncDismiss: () => {
    dismissSyncBanner();
    renderBanners();
  },
});
