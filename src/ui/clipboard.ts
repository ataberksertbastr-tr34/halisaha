/** Panoya kopyalama (eski tarayıcılar için yedek yöntemle). */
import { t } from "../i18n";
import { toast } from "./toast";

export async function copyText(text: string, okMsg = t("copied")): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
    return true;
  } catch {
    /* aşağıdaki yönteme düş */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
    if (ok) toast(okMsg);
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
