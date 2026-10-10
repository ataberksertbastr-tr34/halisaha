/** "Daha" sekmesi: İstatistikler, Kurallar, Ayarlar ve uygulama durumu. */
import { t, type MsgKey } from "../../i18n";
import { esc } from "../../domain/text";
import { getMeta } from "../../data/persist";
import { isStandalone, pwa } from "../../pwa/register";
import { lastBackupText } from "./backup";
import { IC } from "../icons";

const ITEMS: [string, keyof typeof IC, MsgKey, MsgKey][] = [
  ["stats", "chart", "statsTitle", "moreStats"],
  ["settings", "settings", "tabSettings", "moreSettings"],
];

export function viewMore(): string {
  let h = '<h1 class="pagetitle">' + esc(t("moreTitle")) + '</h1><section class="section navlist">';
  ITEMS.forEach(([route, icon, title, sub]) => {
    h += '<button type="button" class="navrow" data-a="nav" data-v="' + route + '"><span class="navic">' + IC[icon] + '</span><span class="pname"><strong>' + esc(t(title)) + '</strong><span class="meta">' + esc(t(sub)) + "</span></span>" + IC.chevron + "</button>";
  });
  h += "</section>";
  h += '<section class="section"><div class="row nowrap"><span class="navic">' + IC.download + '</span><div class="pname"><strong>' + esc(t("backup")) + '</strong><span class="meta">' + esc(lastBackupText(getMeta())) + "</span></div>" +
    '<button type="button" class="btn sm primary" data-a="shareBackup">' + esc(t("share")) + "</button></div></section>";
  if (!isStandalone() && pwa.canInstall()) {
    h += '<section class="section"><div class="row nowrap"><span class="navic">' + IC.install + '</span><div class="pname"><strong>' + esc(t("installApp")) + '</strong><span class="meta">' + esc(t("installHint")) + "</span></div>" +
      '<button type="button" class="btn sm primary" data-a="install">' + esc(t("install")) + "</button></div></section>";
  }
  return h;
}
