import type { Lang } from "../i18n";

export type Pos = "" | "GK" | "DEF" | "MID" | "FWD";
export const POSITIONS: Exclude<Pos, "">[] = ["GK", "DEF", "MID", "FWD"];

/** Katılım: Var / Belki / Yok / Geç iptal. Yanıt yoksa anahtar hiç yoktur. */
export type Att = "in" | "maybe" | "out" | "late";
export type Side = "a" | "b";
export type MatchStatus = "open" | "played" | "cancelled";
export type Theme = "system" | "light" | "dark";

export interface Slot {
  /** Haftanın günü (0 = Pazar); "" = kullanılmıyor */
  d: number | "";
  t: string;
}

export interface Settings {
  defaultFieldId: string;
  price: number;
  iban: string;
  ibanName: string;
  slots: Slot[];
  format: number;
  gkFree: boolean;
  round: boolean;
  lang: Lang;
  theme: Theme;
}

export interface Field {
  id: string;
  name: string;
  address: string;
  link: string;
  phone: string;
  price: number;
  lat: number | null;
  lng: number | null;
}

export interface Person {
  id: string;
  name: string;
  rating: number;
  pos: Pos;
}

export interface Player extends Person {
  phone: string;
  active: boolean;
}

export type Guest = Person;

export interface Score {
  a: number;
  b: number;
}

export interface Match {
  id: string;
  date: string;
  time: string;
  fieldId: string;
  /** Silinmiş sahanın adı (eski veriyle uyum) */
  field?: string;
  price: number;
  format: number;
  status: MatchStatus;
  att: Record<string, Att>;
  /** "Var" diyenlerin yazılma sırası (kadro + yedek) */
  order: string[];
  guests: Guest[];
  paid: Record<string, boolean>;
  exempt: Record<string, boolean>;
  teams: { a: string[]; b: string[] };
  manualTeams?: boolean;
  score: Score | null;
}

export interface State {
  v: number;
  updatedAt: number;
  settings: Settings;
  fields: Field[];
  players: Player[];
  matches: Match[];
}
