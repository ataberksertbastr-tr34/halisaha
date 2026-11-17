/**
 * Ayarlar → Oyuncu sayfası: yaklaşan etkinliklerin kadrosunu ve yedek sırasını oyunculara salt
 * okunur bir bağlantıyla göstermek (domain/pubpage.ts). Eşitlemeye giriş gerekir: sayfa
 * organizatörün Firebase projesinde durur.
 */
import { t } from "../../i18n";
import { store } from "../../app/store";
import { esc } from "../../domain/text";
import { pubView, syncView } from "../../sync";
import { stamp } from "../../domain/attlog";
import { appUrl } from "./reminders";
import { IC } from "../icons";

export function pubLink(id: string): string {
  return new URL("durum.html", appUrl()).href + "#" + id;
}

export function pubSection(): string {
  const id = store.s.settings.pubId;
  const v = syncView();
  let h = '<section class="section" id="pub-sec" aria-labelledby="h-pub"><h2 id="h-pub">' + esc(t("pubTitle")) + '</h2><p class="small muted tight">' + esc(t("pubIntro")) + "</p>";
  if (!id) {
    h += '<p class="small muted">' + esc(t("pubWhat")) + "</p>";
    if (!v.user) return h + '<p class="small warnline m0">' + esc(t("pubNeedSync")) + "</p></section>";
    return h + '<button type="button" class="btn primary block" data-a="pubOn">' + IC.share + esc(t("pubOn")) + "</button></section>";
  }
  const st = pubView();
  const link = pubLink(id);
  const line = !v.user ? t("pubSignedOut") : st.state === "ok" ? t("pubOk", { d: stamp(st.at) }) : st.state === "rules" ? t("pubRules") : st.state === "error" ? t("pubError") : t("pubWaiting");
  h += '<p class="small ' + (st.state === "rules" || st.state === "error" || !v.user ? "warnline" : "muted") + '" id="pub-status" role="status">' + esc(line) + "</p>";
  h += '<div class="iban pub-link"><code>' + esc(link) + "</code></div>";
  h += '<div class="row nowrap mt-s"><button type="button" class="btn primary grow" data-a="pubShare">' + IC.whatsapp + esc(t("pubShare")) + "</button>" +
    '<a class="btn side" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(t("pubView")) + "</a></div>";
  if (st.state === "rules" || st.state === "error") h += '<button type="button" class="btn block mt-s" data-a="pubRetry">' + esc(t("retry")) + "</button>";
  h += '<button type="button" class="btn danger block mt-s" data-a="pubOff" data-confirm="1">' + esc(t("pubOff")) + "</button>";
  return h + "</section>";
}

/** Yayın durumu değişince (eşitleme bildirimi) yalnızca bu bölüm yenilenir. */
export function refreshPubSection(): void {
  const el = document.getElementById("pub-sec");
  if (el) el.outerHTML = pubSection();
}
