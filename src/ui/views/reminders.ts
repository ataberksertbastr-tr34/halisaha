/**
 * Organizatör hatırlatmaları (Ayarlar): haftalık maç günlerine göre telefonun takvimine eklenen
 * tekrarlı hatırlatmalar. Uygulama kapalıyken de bildirim gelsin diye telefonun kendi takvimi kullanılır.
 */
import { DAYS, lang, t, type MsgKey } from "../../i18n";
import { store } from "../../app/store";
import { esc } from "../../domain/text";
import { orgReminders, remGoogleUrl, type OrgReminder } from "../../domain/reminders";
import { showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

/** Takvim kaydından uygulamaya dönülebilsin diye uygulamanın adresi. */
export function appUrl(): string {
  return location.origin + location.pathname;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "Her Cumartesi 12:00" */
function every(r: OrgReminder): string {
  return t("remEvery", { d: DAYS[lang()][r.start.getDay()], t: p2(r.start.getHours()) + ":" + p2(r.start.getMinutes()) });
}

export function remindersSection(): string {
  const s = store.s.settings;
  return '<section class="section" aria-labelledby="h-rem"><h2 id="h-rem">' + esc(t("remTitle")) + '</h2><p class="small muted tight">' + esc(t("remIntro")) + "</p>" +
    '<div class="grid2"><label class="fld">' + esc(t("remInvite")) + '<select data-f="s.inviteDays">' + [1, 2, 3, 4, 5, 6].map((n) => '<option value="' + n + '"' + (s.inviteDays === n ? " selected" : "") + ">" + esc(t("reserveDaysN", { n })) + "</option>").join("") + "</select></label>" +
    '<label class="fld">' + esc(t("remAt")) + '<input type="time" data-f="s.remindAt" value="' + esc(s.remindAt) + '"></label></div>' +
    '<button type="button" class="btn block mt-s" data-a="remOpen">' + IC.calendar + esc(t("remAdd")) + "</button></section>";
}

export function openRemindersSheet(): void {
  const list = orgReminders(store.s, new Date(), appUrl());
  let h = sheetHead(t("remTitle"));
  if (!list.length) {
    showModal(h + '<p class="muted">' + esc(t("remNoSlots")) + "</p>");
    return;
  }
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    tz = "";
  }
  h += '<p class="small muted tight">' + esc(t("remHint")) + "</p>";
  h += '<button type="button" class="btn primary block" data-a="remIcs">' + IC.download + esc(t("remIcs")) + "</button>";
  const slots = new Map<string, OrgReminder[]>();
  for (const r of list) {
    const k = r.slot.d + "|" + r.slot.t;
    slots.set(k, [...(slots.get(k) || []), r]);
  }
  for (const rs of slots.values()) {
    const sl = rs[0].slot;
    h += "<h3>" + esc(t("remFor", { m: DAYS[lang()][sl.d] + " " + sl.t })) + '</h3><ul class="llist">';
    for (const r of rs) {
      const label = t(("remL_" + r.kind) as MsgKey);
      h += '<li class="lrow"><div class="pname"><strong>' + esc(label) + '</strong><span class="meta">' + esc(every(r)) + "</span></div>" +
        '<a class="btn xs" href="' + esc(remGoogleUrl(r, tz)) + '" target="_blank" rel="noopener" aria-label="' + esc(t("googleCal") + ": " + label + ", " + every(r)) + '">' + esc(t("googleCal")) + "</a></li>";
    }
    h += "</ul>";
  }
  showModal(h + '<p class="small muted mt">' + esc(t("remNote")) + "</p>");
}
