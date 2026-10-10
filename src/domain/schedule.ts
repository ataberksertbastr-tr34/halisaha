/** Maç planlama: haftalık günlere göre sıradaki maç; diğer etkinliklerin oluşturulması. */
import type { Kind, Match, State } from "./types";
import { addDays, iso, matchStart, parseISO } from "./dates";
import { applyFixed } from "./roster";
import { getField } from "./fields";
import { blankMatch } from "./schema";
import { inheritAgreements, isFootball, kindDef } from "./kinds";

export function activeSlots(s: State) {
  return s.settings.slots.filter((x) => x && x.d !== "" && x.d != null);
}

/** afterISO'dan sonraki (14 gün içindeki) ilk maç günü. */
export function nextSlot(s: State, afterISO: string): { date: string; time: string } {
  const slots = activeSlots(s);
  const start = parseISO(afterISO);
  for (let i = 1; i <= 14; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const hit = slots.find((x) => Number(x.d) === d.getDay());
    if (hit) return { date: iso(d), time: hit.t || "21:00" };
  }
  return { date: addDays(afterISO, 1), time: "21:00" };
}

function footballMatch(s: State, date: string, time: string, extra: Partial<Match> = {}): Match {
  const f = getField(s, s.settings.defaultFieldId);
  return blankMatch("football", date, time, {
    fieldId: f ? f.id : "", price: (f && Number(f.price)) || Number(s.settings.price) || 0, format: s.settings.format,
    agree: inheritAgreements(s, "football"), ...extra,
  });
}

/** Yeni maç kaydı: varsayılan saha ve ücretiyle, son maçtan (ya da bugünden) sonraki ilk maç gününe. */
export function makeMatch(s: State, today: string): Match {
  const all = s.matches.filter(isFootball).sort((a, b) => a.date.localeCompare(b.date));
  const last = all.length ? all[all.length - 1].date : null;
  const yesterday = addDays(today, -1);
  const ns = nextSlot(s, last && last > yesterday ? last : yesterday);
  return footballMatch(s, ns.date, ns.time);
}

/** Sıradaki cumartesi (bugün cumartesiyse bir sonraki). */
export function nextSaturday(today: string): string {
  const d = parseISO(today).getDay();
  return addDays(today, ((6 - d + 7) % 7) || 7);
}

/**
 * Yeni etkinlik (Kural 15.2): türün varsayılan kontenjanı, kesinleşme süresi ve
 * saatiyle sıradaki cumartesiye; ön anlaşmalar aynı türdeki son etkinlikten.
 */
export function makeEvent(s: State, kind: Kind, today: string): Match {
  if (kind === "football") return makeMatch(s, today);
  const d = kindDef(kind);
  const prev = s.matches.filter((m) => m.kind === kind).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  return blankMatch(kind, nextSaturday(today), prev?.time || d.time, {
    cap: prev ? prev.cap : d.cap, lockH: prev ? prev.lockH : d.lockH,
    fieldId: prev?.fieldId && getField(s, prev.fieldId) ? prev.fieldId : "", price: prev ? prev.price : 0,
    format: s.settings.format, agree: inheritAgreements(s, kind),
  });
}

export const UPCOMING = 4;

export const slotKey = (date: string, time: string): string => date + " " + time;

/** Bugünden itibaren haftalık günlere düşen sıradaki n maç zamanı (bugünün saati geçmişse bugün sayılmaz). */
export function upcomingSlots(s: State, now: Date, n = UPCOMING): { date: string; time: string }[] {
  const slots = activeSlots(s);
  if (!slots.length) return [];
  const out: { date: string; time: string }[] = [];
  const start = iso(now);
  for (let i = 0; i < 7 * n + 7 && out.length < n; i++) {
    const date = addDays(start, i);
    const day = parseISO(date).getDay();
    slots
      .filter((x) => Number(x.d) === day)
      .map((x) => x.t || "21:00")
      .sort()
      .forEach((time) => {
        if (out.length < n && matchStart(date, time) > now) out.push({ date, time });
      });
  }
  return out;
}

/**
 * Önümüzdeki n maç günü için maç yoksa oluşturur (otomatik planlama).
 * Aynı gün ve saatte maç varsa (iptal edilmiş olsa bile) ya da organizatör
 * o maçı silmişse/tarihini değiştirmişse yeniden oluşturmaz.
 */
export function ensureUpcoming(s: State, now: Date, n = UPCOMING): Match[] {
  if (!s.settings.autoSchedule) return [];
  const have = new Set(s.matches.filter(isFootball).map((m) => slotKey(m.date, m.time)));
  const skipped = new Set(s.skipped);
  const created: Match[] = [];
  for (const { date, time } of upcomingSlots(s, now, n)) {
    const key = slotKey(date, time);
    if (have.has(key) || skipped.has(key)) continue;
    const m = footballMatch(s, date, time, { auto: true });
    applyFixed(s, m);
    s.matches.push(m);
    created.push(m);
  }
  return created;
}

/** Silinen ya da taşınan otomatik maçın zamanını hatırlar (tekrar oluşturulmasın). */
export function rememberSkip(s: State, m: Match): void {
  if (!m.auto) return;
  const key = slotKey(m.date, m.time);
  if (!s.skipped.includes(key)) s.skipped.push(key);
  // Liste sonsuza büyümesin: geçmiş tarihler atılır
  const cutoff = addDays(iso(new Date()), -60);
  s.skipped = s.skipped.filter((k) => k.slice(0, 10) >= cutoff);
}

/** Saha/tesis rezerve edilmemiş ve yaklaşan etkinlikler (hatırlatma için). */
export function needsReservation(s: State, now: Date): Match[] {
  const days = s.settings.reserveDays;
  if (!days) return [];
  const limit = now.getTime() + days * 24 * 60 * 60 * 1000;
  return s.matches
    .filter((m) => m.status === "open" && !m.reserved)
    .filter((m) => {
      const t = matchStart(m.date, m.time).getTime();
      return t > now.getTime() && t <= limit;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
