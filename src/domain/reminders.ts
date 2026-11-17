/**
 * Organizatör hatırlatmaları: haftalık maç günlerine göre, telefonun takvimine eklenen tekrarlı
 * kayıtlar (uygulama kapalıyken de bildirim gelsin diye). Her maç günü için beş hatırlatma:
 * davet, saha teyidi, kadro kesinleşmeden önce, maç bitince sonuç, ertesi gün ödeme takibi.
 * Takvim dosyası (.ics, yerel "yüzen" saat + haftalık tekrar) ve Google Takvim bağlantısı üretilir.
 */
import { DAYS, lang, t } from "../i18n";
import type { State } from "./types";
import { icsEscape, icsFold, icsTime, MATCH_MINUTES } from "./calendar";
import { activeSlots } from "./schedule";

export type RemKind = "invite" | "field" | "lock" | "result" | "pay";
export const REM_KINDS: RemKind[] = ["invite", "field", "lock", "result", "pay"];

/** Kadro kesinleşmeden kaç dakika önce hatırlatılır (eksikleri tamamlamaya vakit kalsın). */
export const LOCK_HEADS_UP_MIN = 120;
/** Maç bittikten kaç dakika sonra "sonucu gir" hatırlatılır. */
export const RESULT_AFTER_MIN = 30;
/** Hatırlatma kaydının takvimdeki süresi (dk). */
export const REM_MINUTES = 15;

export interface OrgReminder {
  kind: RemKind;
  /** Hangi maç günü için (haftanın günü 0 = Pazar, saat) */
  slot: { d: number; t: string };
  /** İlk hatırlatma anı (yerel); her hafta aynı gün ve saatte tekrarlar */
  start: Date;
  title: string;
  description: string;
}

const p2 = (n: number) => String(n).padStart(2, "0");
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Yerel ("yüzen") takvim zamanı: 20261017T120000 */
export function icsLocal(d: Date): string {
  return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "T" + p2(d.getHours()) + p2(d.getMinutes()) + "00";
}

/** now'dan sonraki ilk (gün, saat) anı. */
function nextAt(now: Date, day: number, hm: string): Date {
  const [h, mi] = hm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h || 0, mi || 0, 0, 0);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

const hm = (d: Date) => p2(d.getHours()) + ":" + p2(d.getMinutes());

/**
 * Ayarlardaki haftalık maç günlerinden hatırlatmalar. Maçın bir sonraki anı (M) baz alınır:
 *  - davet: M'den inviteDays gün önce, hatırlatma saatinde
 *  - saha: M'den reserveDays (kapalıysa 2) gün önce, hatırlatma saatinde
 *  - kesinleşme: kadro kesinleşmeden (M − 24 saat, Kural 1.4) 2 saat önce
 *  - sonuç: maç bitiminden (M + 60 dk, Kural 4.1) 30 dk sonra
 *  - ödeme: M'den bir gün sonra, hatırlatma saatinde
 * Geçmişte kalan ilk an bir hafta ileri alınır (tekrar haftalık olduğu için fark etmez).
 */
export function orgReminders(s: State, now: Date, appUrl = ""): OrgReminder[] {
  const st = s.settings;
  const out: OrgReminder[] = [];
  const seen = new Set<string>();
  for (const sl of activeSlots(s)) {
    const d = Number(sl.d), time = sl.t || "21:00";
    if (seen.has(d + "|" + time)) continue;
    seen.add(d + "|" + time);
    const M = nextAt(now, d, time);
    const match = DAYS[lang()][d] + " " + time;
    const atDay = (days: number): Date => {
      const x = new Date(M);
      x.setDate(x.getDate() + days);
      const [h, mi] = (st.remindAt || "12:00").split(":").map(Number);
      x.setHours(h || 0, mi || 0, 0, 0);
      return x;
    };
    const mins = (n: number) => new Date(M.getTime() + n * 60 * 1000);
    const lock = mins(-24 * 60);
    const times: Record<RemKind, Date> = {
      invite: atDay(-(st.inviteDays || 3)),
      field: atDay(-(st.reserveDays || 2)),
      lock: mins(-24 * 60 - LOCK_HEADS_UP_MIN),
      result: mins(MATCH_MINUTES + RESULT_AFTER_MIN),
      pay: atDay(1),
    };
    for (const kind of REM_KINDS) {
      let start = times[kind];
      while (start.getTime() <= now.getTime()) start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7, start.getHours(), start.getMinutes());
      const title = t(("remT_" + kind) as "remT_invite", { m: match, k: hm(lock) });
      const description = t(("remD_" + kind) as "remD_invite") + (appUrl ? "\n" + appUrl : "");
      out.push({ kind, slot: { d, t: time }, start, title, description });
    }
  }
  return out;
}

/** Takvimde aynı hatırlatma yeniden eklenince ikilenmesin diye sabit kimlik. */
export function remUid(r: OrgReminder): string {
  return "hatirlatma-" + r.kind + "-" + r.slot.d + "-" + r.slot.t.replace(":", "") + "@halisaha";
}

const rrule = (r: OrgReminder) => "FREQ=WEEKLY;BYDAY=" + BYDAY[r.start.getDay()];
const endOf = (r: OrgReminder) => new Date(r.start.getTime() + REM_MINUTES * 60 * 1000);

/** Haftalık tekrarlı hatırlatmaların takvim dosyası; bildirim kaydın başlangıcında çalar. */
export function remindersICS(list: OrgReminder[], now: Date = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hali Saha Organizatoru//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const r of list) {
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + remUid(r),
      "DTSTAMP:" + icsTime(now),
      "DTSTART:" + icsLocal(r.start),
      "DTEND:" + icsLocal(endOf(r)),
      "RRULE:" + rrule(r),
      "SUMMARY:" + icsEscape(r.title),
      "DESCRIPTION:" + icsEscape(r.description),
      "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(r.title), "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/** Google Takvim'de haftalık tekrarlı kayıt açan bağlantı (cihazın saat diliminde). */
export function remGoogleUrl(r: OrgReminder, tz = ""): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: r.title,
    dates: icsLocal(r.start) + "/" + icsLocal(endOf(r)),
    details: r.description,
    recur: "RRULE:" + rrule(r),
  });
  if (tz) q.set("ctz", tz);
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
