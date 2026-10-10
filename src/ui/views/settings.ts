/** Ayarlar sekmesi: sahalar, genel ayarlar, maç günleri, yedekleme. */
import { DAYS, money, t } from "../../i18n";
import { store } from "../../app/store";
import { esc, trSort } from "../../domain/text";
import { mapsUrl } from "../../domain/fields";
import { fieldOptions, subHeader } from "../components";
import { isIOS, isStandalone, pwa } from "../../pwa/register";
import { IC } from "../icons";
import { backupSection } from "./backup";
import { templatesSection } from "./templates";
import { BIB_COLORS, teamColor, teamName } from "../../domain/teamstyle";
import { L } from "../../domain/kinds";
import type { Side } from "../../domain/types";

export function viewSettings(): string {
  const S = store.s;
  const s = S.settings;
  const dayOpts = (sel: number | "") => '<option value="">—</option>' + DAYS[s.lang].map((d, i) => '<option value="' + i + '"' + (String(sel) === String(i) ? " selected" : "") + ">" + esc(d) + "</option>").join("");
  let h = subHeader(t("tabSettings"), "more") + '<section class="section" aria-labelledby="h-fields"><h2 id="h-fields">' + esc(t("fields")) + "</h2>";
  if (!S.fields.length) h += '<p class="muted small">' + esc(t("noFields")) + "</p>";
  else {
    h += '<div class="flist">';
    S.fields.slice().sort(trSort).forEach((f) => {
      const map = mapsUrl(f);
      h += '<div class="frow"><div class="pname"><strong>' + esc(f.name) + (f.id === s.defaultFieldId ? ' <span class="tag">' + esc(t("defaultField")) + "</span>" : "") + '</strong><span class="meta">' + esc([f.address, Number(f.price) ? money(f.price) : ""].filter(Boolean).join(", ") || t("locNone")) + "</span></div>" +
        (map ? '<a class="btn xs" href="' + esc(map) + '" target="_blank" rel="noopener">' + esc(t("openMap")) + "</a>" : "") + '<button type="button" class="btn xs" data-a="editField" data-id="' + esc(f.id) + '">' + esc(t("edit")) + "</button></div>";
    });
    h += "</div>";
  }
  h += '<button type="button" class="btn mt" data-a="newField">+ ' + esc(t("addField")) + "</button></section>";

  const fmtOpts = [4, 5, 6, 7, 8, 9, 10].map((n) => '<option value="' + n + '"' + (s.format === n ? " selected" : "") + ">" + n + "+1</option>").join("");
  h += '<section class="section" aria-labelledby="h-gen"><h2 id="h-gen">' + esc(t("settingsTitle")) + '</h2><div class="grid2 stack">' +
    '<label class="fld">' + esc(t("defaultField")) + '<select data-f="s.defaultFieldId">' + fieldOptions(s.defaultFieldId) + "</select></label>" +
    '<label class="fld">' + esc(t("defaultPrice")) + '<input type="number" min="0" inputmode="decimal" data-f="s.price" value="' + esc(s.price) + '"></label>' +
    '<label class="fld">' + esc(t("iban")) + '<input type="text" data-f="s.iban" value="' + esc(s.iban) + '" placeholder="TR00 0000 0000 0000 0000 0000 00" autocomplete="off"></label>' +
    '<label class="fld">' + esc(t("ibanName")) + '<input type="text" data-f="s.ibanName" value="' + esc(s.ibanName) + '" autocomplete="off"></label>' +
    '<label class="fld">' + esc(t("format")) + '<select data-f="s.format">' + fmtOpts + "</select></label>" +
    '<label class="fld">' + esc(t("language")) + '<select data-f="s.lang"><option value="tr"' + (s.lang === "tr" ? " selected" : "") + ' lang="tr">Türkçe</option><option value="en"' + (s.lang === "en" ? " selected" : "") + ' lang="en">English</option></select></label>' +
    '<label class="fld">' + esc(t("theme")) + '<select data-f="s.theme">' + (["system", "light", "dark"] as const).map((v) => '<option value="' + v + '"' + (s.theme === v ? " selected" : "") + ">" + esc(t(v === "system" ? "themeSystem" : v === "light" ? "themeLight" : "themeDark")) + "</option>").join("") + "</select></label>" +
    "</div><h3>" + esc(t("slots")) + "</h3>";
  [0, 1].forEach((i) => {
    const sl = s.slots[i] || { d: "", t: "21:00" };
    h += '<div class="grid2 mb"><label class="fld">' + esc(t("slot")) + " " + (i + 1) + '<select data-f="slot.' + i + '.d">' + dayOpts(sl.d) + "</select></label>" +
      '<label class="fld">' + esc(t("time")) + '<input type="time" data-f="slot.' + i + '.t" value="' + esc(sl.t) + '"></label></div>';
  });
  const tgl = (k: "gkFree" | "round" | "autoSchedule", label: string) => '<button type="button" class="toggle' + (s[k] ? " on" : "") + '" data-a="tglSet" data-k="' + k + '" aria-pressed="' + s[k] + '">' + esc(label) + "</button>";
  const tgr = (k: "debtBlock" | "noShowPenalty", label: string) => '<button type="button" class="toggle' + (s[k] ? " on" : "") + '" data-a="tglSet" data-k="' + k + '" aria-pressed="' + s[k] + '">' + esc(label) + "</button>";
  h += '<div class="toggles mt">' + tgl("autoSchedule", t("autoSchedule")) + tgl("gkFree", t("gkFree")) + tgl("round", t("round")) + tgr("noShowPenalty", t("noShowPenalty")) + tgr("debtBlock", t("debtBlock")) + "</div>";
  h += '<label class="fld mt">' + esc(t("reserveDays")) + '<select data-f="reserveDays">' + [0, 1, 2, 3, 4, 5, 7].map((n) => '<option value="' + n + '"' + (s.reserveDays === n ? " selected" : "") + ">" + esc(n ? t("reserveDaysN", { n }) : t("reserveOff")) + "</option>").join("") + "</select></label></section>";
  const tg = (k: "avoidRepeat" | "perf", label: string) => '<button type="button" class="toggle' + (s[k] ? " on" : "") + '" data-a="tglSet" data-k="' + k + '" aria-pressed="' + s[k] + '">' + esc(label) + "</button>";
  h += '<section class="section" aria-labelledby="h-tb"><h2 id="h-tb">' + esc(t("teamOptions")) + '</h2><div class="toggles">' + tg("avoidRepeat", t("avoidRepeat")) + tg("perf", t("perfOn")) + "</div></section>";
  h += teamLooksSection();
  h += templatesSection();
  h += backupSection();
  h += appSection();
  return h;
}

/** Takım adları ve yelek renkleri (Kural 3.3). */
function teamLooksSection(): string {
  const S = store.s;
  const row = (side: Side) => {
    const ts = side === "a" ? S.settings.teamA : S.settings.teamB;
    const col = teamColor(S, side);
    return '<div class="teamlook"><span class="bibdot" style="background:' + esc(col) + '" aria-hidden="true"></span><div class="grid2 grow">' +
      '<label class="fld">' + esc(t(side === "a" ? "teamNameA" : "teamNameB")) + '<input type="text" maxlength="24" data-f="team.' + side + '.name" value="' + esc(ts.name) + '" placeholder="' + esc(teamName({ ...S, settings: { ...S.settings, teamA: { ...S.settings.teamA, name: "" }, teamB: { ...S.settings.teamB, name: "" } } }, side)) + '" autocomplete="off"></label>' +
      '<label class="fld">' + esc(t("teamColor")) + '<select data-f="team.' + side + '.color">' + BIB_COLORS.map((b) => '<option value="' + b.hex + '"' + (b.hex === col ? " selected" : "") + ">" + b.emoji + " " + esc(L(b)) + "</option>").join("") + "</select></label></div></div>";
  };
  return '<section class="section" aria-labelledby="h-looks"><h2 id="h-looks">' + esc(t("teamLooks")) + '</h2><p class="small muted tight">' + esc(t("teamNameHint")) + "</p>" + row("a") + row("b") + "</section>";
}

function appSection(): string {
  let body: string;
  if (isStandalone()) body = '<p class="muted m0">' + esc(t("installedOk")) + "</p>";
  else if (pwa.canInstall()) body = '<p class="muted">' + esc(t("installHint")) + '</p><button type="button" class="btn primary" data-a="install">' + IC.install + esc(t("installApp")) + "</button>";
  else if (isIOS()) body = '<p class="muted">' + esc(t("installHint")) + '</p><p class="m0">' + esc(t("iosInstall")) + "</p>";
  else body = '<p class="muted m0">' + esc(t("installHint")) + "</p>";
  return '<section class="section" aria-labelledby="h-app"><h2 id="h-app">' + esc(t("appSection")) + "</h2>" + body +
    '<p class="small muted mt">' + esc(t("version")) + " " + esc(__APP_VERSION__) + "</p></section>";
}
