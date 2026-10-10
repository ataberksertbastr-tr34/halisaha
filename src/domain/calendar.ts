/** Takvim: .ics dosyası (RFC 5545) ve Google Takvim bağlantısı. Maç süresi 60 dk (Kural 4.1). */
import type { Match, State } from "./types";
import { matchStart } from "./dates";
import { fieldOf, mapsUrl } from "./fields";
import { eventTitle, isFootball, kindOf } from "./kinds";

export const MATCH_MINUTES = 60;

const p2 = (n: number) => String(n).padStart(2, "0");

/** UTC zaman damgası: 20261013T180000Z */
export function icsTime(d: Date): string {
  return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + "T" + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + "Z";
}

/** Metin değerlerinde özel karakterleri kaçırır. */
export function icsEscape(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 75 baytı aşan satırları katlar (UTF-8 karakterlerini bölmeden). */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = parts.length ? 74 : 75;
    if (enc.encode(cur + ch).length > limit) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export interface EventInfo {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  location: string;
  description: string;
  url: string;
}

/** Takvim kaydı. Halı sahada 60 dk (Kural 4.1); diğer etkinliklerde türün tipik süresi. */
export function eventOf(s: State, m: Match, title: string): EventInfo {
  const f = fieldOf(s, m);
  const fb = isFootball(m);
  const k = kindOf(m);
  const start = matchStart(m.date, m.time);
  const end = new Date(start.getTime() + (fb ? MATCH_MINUTES : k.minutes) * 60 * 1000);
  const url = mapsUrl(f);
  const location = f ? [f.name, f.address].filter(Boolean).join(", ") : "";
  const description = [fb ? (m.format || s.settings.format) + "+1" : "", m.note || "", url].filter(Boolean).join("\n");
  const name = fb && !m.title ? title : k.emoji + " " + eventTitle(m);
  return { uid: m.id + "@halisaha", start, end, title: f ? name + " – " + f.name : name, location, description, url };
}

export function buildICS(events: EventInfo[], now: Date = new Date(), alarmMinutes = 120): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hali Saha Organizatoru//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + e.uid,
      "DTSTAMP:" + icsTime(now),
      "DTSTART:" + icsTime(e.start),
      "DTEND:" + icsTime(e.end),
      "SUMMARY:" + icsEscape(e.title),
    );
    if (e.location) lines.push("LOCATION:" + icsEscape(e.location));
    if (e.description) lines.push("DESCRIPTION:" + icsEscape(e.description));
    if (e.url) lines.push("URL:" + e.url);
    if (alarmMinutes > 0) lines.push("BEGIN:VALARM", "TRIGGER:-PT" + alarmMinutes + "M", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(e.title), "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(e: EventInfo): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: icsTime(e.start) + "/" + icsTime(e.end),
    location: e.location,
    details: e.description,
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
