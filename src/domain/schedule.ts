/** Maç planlama: haftalık günlere göre sıradaki maç. */
import type { Match, State } from "./types";
import { addDays, iso, parseISO } from "./dates";
import { getField } from "./fields";
import { uid } from "./text";

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

/** Yeni maç kaydı: varsayılan saha ve ücretiyle, son maçtan (ya da bugünden) sonraki ilk maç gününe. */
export function makeMatch(s: State, today: string): Match {
  const all = s.matches.slice().sort((a, b) => a.date.localeCompare(b.date));
  const last = all.length ? all[all.length - 1].date : null;
  const yesterday = addDays(today, -1);
  const ns = nextSlot(s, last && last > yesterday ? last : yesterday);
  const f = getField(s, s.settings.defaultFieldId);
  return {
    id: uid(), date: ns.date, time: ns.time, fieldId: f ? f.id : "",
    price: (f && Number(f.price)) || Number(s.settings.price) || 0, format: s.settings.format,
    status: "open", att: {}, order: [], guests: [], paid: {}, exempt: {}, teams: { a: [], b: [] }, score: null,
  };
}
