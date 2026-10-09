import type { State, Settings } from "./types";

/** Güncel veri şeması sürümü. Değiştiğinde migrate.ts'e adım + test eklenmeli. */
export const SCHEMA_VERSION = 2;

export function defaultSettings(): Settings {
  return {
    defaultFieldId: "", price: 3000, iban: "", ibanName: "",
    slots: [{ d: 2, t: "21:00" }, { d: 4, t: "21:00" }],
    format: 7, gkFree: true, round: true, lang: "tr", theme: "system",
  };
}

export function defaults(): State {
  return { v: SCHEMA_VERSION, updatedAt: 0, settings: defaultSettings(), fields: [], players: [], matches: [] };
}
