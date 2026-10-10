/** "Takvime ekle" sayfası: Google Takvim bağlantısı ve .ics dosyası. */
import { t } from "../../i18n";
import { store } from "../../app/store";
import type { Match } from "../../domain/types";
import { esc } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { eventOf, googleCalendarUrl } from "../../domain/calendar";
import { dayName } from "../../domain/messages";
import { showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

export function openCalendarSheet(m: Match): void {
  const e = eventOf(store.s, m, t("calEventTitle"));
  showModal(sheetHead(t("addCalendar") + ": " + dayName(m.date) + " " + ddmm(m.date)) +
    '<p class="small muted">' + esc(t("icsHint")) + "</p>" +
    '<div class="stackf"><a class="btn primary block" href="' + esc(googleCalendarUrl(e)) + '" target="_blank" rel="noopener">' + IC.calendar + esc(t("googleCal")) + "</a>" +
    '<button type="button" class="btn block" data-a="icsOne" data-id="' + esc(m.id) + '">' + IC.download + esc(t("icsFile")) + "</button>" +
    '<button type="button" class="btn block ghost" data-a="icsAll">' + IC.download + esc(t("icsAll")) + "</button></div>");
}
