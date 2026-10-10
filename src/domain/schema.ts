import type { Kind, Match, State, Settings } from "./types";
import { uid } from "./text";

/** Güncel veri şeması sürümü. Değiştiğinde migrate.ts'e adım + test eklenmeli. */
export const SCHEMA_VERSION = 5;

export function defaultSettings(): Settings {
  return {
    defaultFieldId: "", price: 3000, iban: "", ibanName: "",
    slots: [{ d: 2, t: "21:00" }, { d: 4, t: "21:00" }],
    format: 7, gkFree: true, round: true, lang: "tr", theme: "system",
    templates: {}, autoSchedule: true, avoidRepeat: true, perf: true, reserveDays: 2,
    teamA: { name: "", color: "" }, teamB: { name: "", color: "" },
    debtBlock: true, noShowPenalty: true,
  };
}

export function defaults(): State {
  return {
    v: SCHEMA_VERSION, updatedAt: 0, settings: defaultSettings(), fields: [], players: [], matches: [],
    payments: [], expenses: [], pairRules: [], skipped: [], charges: [], discipline: [],
  };
}

/** Boş etkinlik kaydı (tüm alanlar varsayılanla). */
export function blankMatch(kind: Kind, date: string, time: string, extra: Partial<Match> = {}): Match {
  return {
    id: uid(), kind, title: "", cap: 0, lockH: 24, date, time, fieldId: "", price: 0, format: 7,
    status: "open", att: {}, order: [], guests: [], exempt: {}, teams: { a: [], b: [] }, score: null,
    locks: {}, goals: {}, mvp: "", noshow: {}, reserved: false,
    removed: {}, checks: {}, agree: {}, note: "", cars: [], games: [], injured: {}, sheets: [],
    ...extra,
  };
}
