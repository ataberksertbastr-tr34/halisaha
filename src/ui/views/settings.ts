/** Ayarlar sekmesi: sahalar, genel ayarlar, maç günleri, yedekleme. */
import { DAYS, money, t } from "../../i18n";
import { store } from "../../app/store";
import { esc, trSort } from "../../domain/text";
import { mapsUrl } from "../../domain/fields";
import { fieldOptions } from "../components";

export function viewSettings(): string {
  const S = store.s;
  const s = S.settings;
  const dayOpts = (sel: number | "") => '<option value="">—</option>' + DAYS[s.lang].map((d, i) => '<option value="' + i + '"' + (String(sel) === String(i) ? " selected" : "") + ">" + esc(d) + "</option>").join("");
  let h = '<section class="section" aria-labelledby="h-fields"><h2 id="h-fields">' + esc(t("fields")) + "</h2>";
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
  h += '<div class="row mt"><button type="button" class="toggle' + (s.gkFree ? " on" : "") + '" data-a="tglSet" data-k="gkFree" aria-pressed="' + s.gkFree + '">' + esc(t("gkFree")) + "</button>" +
    '<button type="button" class="toggle' + (s.round ? " on" : "") + '" data-a="tglSet" data-k="round" aria-pressed="' + s.round + '">' + esc(t("round")) + "</button></div></section>";
  h += '<section class="section" aria-labelledby="h-bk"><h2 id="h-bk">' + esc(t("backup")) + '</h2><div class="row"><button type="button" class="btn" data-a="export">' + esc(t("exportData")) + '</button><button type="button" class="btn" data-a="importOpen">' + esc(t("importData")) + '</button><button type="button" class="btn danger" data-a="reset" data-confirm="1">' + esc(t("resetAll")) + "</button></div></section>";
  return h;
}
