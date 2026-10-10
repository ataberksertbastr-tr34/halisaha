/** Alt sayfalar: mesaj metni / yedek metni, saha düzenleyici. */
import { t } from "../i18n";
import { store, ui } from "../app/store";
import { esc } from "../domain/text";
import { getField } from "../domain/fields";
import { showModal } from "./modal";
import { IC } from "./icons";

export function sheetHead(title: string): string {
  return '<div class="sheet-head"><h2 id="sheet-title">' + esc(title) + '</h2><button type="button" class="iconbtn" data-a="closeModal" aria-label="' + esc(t("close")) + '">' + IC.close + "</button></div>";
}

/** Paylaşılacak metni gösterir (share=true) ya da yedek yapıştırma alanı açar. */
export function openText(title: string, text: string, share: boolean, isBackup = false): void {
  showModal(sheetHead(title) +
    '<textarea id="mtext" aria-label="' + esc(title) + '"' + (share ? " readonly" : ' placeholder="' + esc(t("importHint")) + '" autofocus') + ">" + esc(text) + "</textarea>" +
    '<div class="row mt">' + (share
      ? '<button type="button" class="btn primary grow" data-a="copy"' + (isBackup ? ' data-backup="1"' : "") + ">" + esc(t("copy")) + "</button>" + (isBackup ? "" : '<a class="btn grow" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text) + '">' + esc(t("whatsapp")) + "</a>")
      : '<button type="button" class="btn primary grow" data-a="doImport">' + esc(t("load")) + "</button>") +
    "</div>");
}

export function openFieldEditor(id: string | null, target: "match" | "default" | null): void {
  const f = getField(store.s, id) || { id: "", name: "", address: "", link: "", phone: "", price: store.s.settings.price, lat: null, lng: null };
  ui.fieldTarget = target;
  const hasLoc = f.lat != null;
  showModal(sheetHead(id ? t("editField") : t("addField")) + '<div class="stackf">' +
    '<label class="fld">' + esc(t("fieldName")) + '<input type="text" id="fe-name" value="' + esc(f.name) + '" autocomplete="off"' + (id ? "" : " autofocus") + "></label>" +
    '<label class="fld">' + esc(t("address")) + '<input type="text" id="fe-address" value="' + esc(f.address || "") + '"></label>' +
    '<label class="fld">' + esc(t("mapsLink")) + '<input type="url" id="fe-link" inputmode="url" value="' + esc(f.link || "") + '" placeholder="https://maps.app.goo.gl/…"></label>' +
    '<p class="small muted tight">' + esc(t("mapsHint")) + "</p>" +
    '<div class="row"><button type="button" class="btn sm" data-a="geo">' + IC.map + " " + esc(t("useMyLoc")) + '</button><span class="small muted" id="fe-coords" aria-live="polite">' + esc(hasLoc ? f.lat + ", " + f.lng : t("locNone")) + "</span></div>" +
    '<input type="hidden" id="fe-lat" value="' + esc(hasLoc ? f.lat : "") + '"><input type="hidden" id="fe-lng" value="' + esc(hasLoc ? f.lng : "") + '">' +
    '<div class="grid2"><label class="fld">' + esc(t("phoneShort")) + '<input type="tel" id="fe-phone" value="' + esc(f.phone || "") + '"></label>' +
    '<label class="fld">' + esc(t("fieldPrice")) + '<input type="number" id="fe-price" min="0" inputmode="decimal" value="' + esc(f.price || "") + '"></label></div></div>' +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="saveField" data-id="' + esc(f.id) + '">' + esc(t("save")) + "</button>" +
    (f.id ? '<button type="button" class="btn danger" data-a="delField" data-id="' + esc(f.id) + '">' + esc(t("deleteField")) + "</button>" : "") + "</div>");
}
