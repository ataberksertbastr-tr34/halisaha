/** "Daha" sekmesi: İstatistikler, Kurallar, Disiplin, Duyurular, Ayarlar ve uygulama durumu. */
import { t, type MsgKey } from "../../i18n";
import { esc } from "../../domain/text";
import { getMeta } from "../../data/persist";
import { isStandalone, pwa } from "../../pwa/register";
import { lastBackupText } from "./backup";
import { IC } from "../icons";
import { store } from "../../app/store";
import { statusMap } from "../../domain/discipline";

const ITEMS: [string, keyof typeof IC, MsgKey, MsgKey][] = [
  ["stats", "chart", "statsTitle", "moreStats"],
  ["rules", "book", "rulesTitle", "moreRules"],
  ["discipline", "gavel", "discTitle", "moreDisc"],
  ["announce", "megaphone", "annTitle", "moreAnn"],
  ["settings", "settings", "tabSettings", "moreSettings"],
];

export function viewMore(): string {
  let h = '<h1 class="pagetitle">' + esc(t("moreTitle")) + '</h1><section class="section navlist">';
  const st = statusMap(store.s);
  const flagged = Object.values(st).filter((x) => x.banned || x.expelled || x.warnings > 0).length;
  ITEMS.forEach(([route, icon, title, sub]) => {
    const badge = route === "discipline" && flagged ? '<span class="tag wait">' + flagged + "</span>" : "";
    h += '<button type="button" class="navrow" data-a="nav" data-v="' + route + '"><span class="navic">' + IC[icon] + '</span><span class="pname"><strong>' + esc(t(title)) + badge + '</strong><span class="meta">' + esc(t(sub)) + "</span></span>" + IC.chevron + "</button>";
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
