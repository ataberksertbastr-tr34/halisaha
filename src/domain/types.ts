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

/** Düzenlenebilir mesaj şablonları */
export type TemplateKey = "invite" | "squad" | "teams" | "pay" | "personalPay" | "promoted";

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
  /** Kullanıcının değiştirdiği şablonlar (boşsa varsayılan) */
  templates: Partial<Record<TemplateKey, string>>;
  /** Haftalık günlere göre ileriye 4 maçı otomatik oluştur */
  autoSchedule: boolean;
  /** Takım kurarken geçen maçın takımlarını tekrar etme */
  avoidRepeat: boolean;
  /** Maç sonuçlarından performans puanı (Elo) hesapla ve seviyeyle harmanla */
  perf: boolean;
  /** Saha rezerve edilmediyse maçtan kaç gün önce uyarılsın */
  reserveDays: number;
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
  /** Sabit oyuncu: her yeni maça otomatik "Var" yazılır */
  fixed: boolean;
}

export interface Guest extends Person {
  /** Misafiri getiren oyuncu (Kural 1.8: ödemesinden o sorumlu) */
  host?: string;
}

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
  exempt: Record<string, boolean>;
  teams: { a: string[]; b: string[] };
  manualTeams?: boolean;
  score: Score | null;
  /** Takıma kilitli oyuncular */
  locks: Record<string, Side>;
  /** Gol sayıları (oyuncu id → gol) */
  goals: Record<string, number>;
  /** Maçın oyuncusu ("" = seçilmedi) */
  mvp: string;
  /** Habersiz gelmeyenler (Kural 1.6) */
  noshow: Record<string, boolean>;
  /** Saha rezerve edildi mi */
  reserved: boolean;
  /** Otomatik planlamayla oluşturuldu */
  auto?: boolean;
  /** Maç bitince donan ödeme listesi ve pay (ayar değişse de geçmiş bozulmasın) */
  bill?: { payers: string[]; share: number };
}

/** Hesap defteri: alınan her ödeme bir kayıttır. mid varsa o maçın payına sayılır, yoksa en eski borçlara. */
export interface Payment {
  id: string;
  /** Oyuncu ya da misafir id */
  pid: string;
  amount: number;
  /** YYYY-AA-GG */
  at: string;
  mid?: string;
  note?: string;
}

export type ExpenseCat = "ball" | "bib" | "water" | "other";
export interface Expense {
  id: string;
  at: string;
  amount: number;
  cat: ExpenseCat;
  note: string;
}

/** "Bu ikisi aynı takımda olsun / olmasın" kuralı */
export interface PairRule {
  id: string;
  a: string;
  b: string;
  together: boolean;
}

export interface State {
  v: number;
  updatedAt: number;
  settings: Settings;
  fields: Field[];
  players: Player[];
  matches: Match[];
  payments: Payment[];
  expenses: Expense[];
  pairRules: PairRule[];
  /** Silinen otomatik maçlar ("tarih saat"), tekrar oluşturulmasın */
  skipped: string[];
}
