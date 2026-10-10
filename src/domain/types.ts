import type { Lang } from "../i18n";

export type Pos = "" | "GK" | "DEF" | "MID" | "FWD";

/**
 * Etkinlik türü (Yönetmelik Kısım 1 ve 3). Halı saha maçı "football";
 * eski verideki tüm maçlar halı sahadır.
 */
export type Kind = "football" | "paintball" | "airsoft" | "volleyball" | "footvolley" | "tabletennis" | "kiraathane" | "other";
export const KINDS: Kind[] = ["football", "paintball", "airsoft", "volleyball", "footvolley", "tabletennis", "kiraathane", "other"];
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
export type TemplateKey = "invite" | "squad" | "teams" | "pay" | "personalPay" | "promoted" | "brief" | "cars" | "cancel";

/** Takım adı ve yelek rengi (Kural 3.3). */
export interface TeamStyle {
  name: string;
  color: string;
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
  /** Takım adları ve yelek renkleri ("" = varsayılan) */
  teamA: TeamStyle;
  teamB: TeamStyle;
  /** Kural 2.4: borcu olan kadroya yazılamaz (organizatör yine de ekleyebilir) */
  debtBlock: boolean;
  /** Kural 1.6: habersiz gelmeyen bir sonraki maçta yedeğin sonuna yazılır */
  noShowPenalty: boolean;
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

/** Araç paylaşımı (Kural 15.8): yakıt ve geçiş ücreti araçtakiler arasında eşit bölünür. */
export interface Car {
  id: string;
  /** Sürücü (oyuncu/misafir id) */
  driver: string;
  seats: number;
  pax: string[];
  fuel: number;
  toll: number;
}

/**
 * Skor tutulan oyun: voleybol, ayak tenisi, masa tenisi (set/sayı), tavla
 * (mars 2 sayı), raunt ya da masa sonucu. Durum sayı kayıtlarından (pts)
 * yeniden hesaplanır; "Geri al" son kaydı siler.
 */
export type GameType = "sets" | "tavla" | "rounds" | "result";
export interface GameCfg {
  /** Set sayı hedefi */
  to: number;
  /** Son (karar) setin sayı hedefi */
  last: number;
  /** Kaç sette biter (3 → 2 set alan kazanır) */
  bestOf: number;
  /** En az 2 sayı fark */
  by2: boolean;
  /** Servis kuralı: rally (sayıyı alan servis atar), tt (masa tenisi: 2'şer, 10-10'dan sonra 1'er) */
  serve: "" | "rally" | "tt";
}
export interface Game {
  id: string;
  type: GameType;
  label: string;
  a: string[];
  b: string[];
  cfg: GameCfg;
  /** "a", "b" ya da ağırlıklı "a2" (tavlada mars) */
  pts: string[];
  /** İlk servis */
  first: "a" | "b";
  /** Elle bitirilen ya da sonucu doğrudan girilen oyun */
  win?: "a" | "b" | "d";
  done: boolean;
  at: string;
}

/** Kura: kıraathane masaları, ayak tenisi takımları, masa tenisi çiftleri (Kural 19.1, 20.6, 21.1). */
export interface Draw {
  game: string;
  size: number;
  pairs: boolean;
  groups: string[][];
}

/** Masa sırası: kazanan kalır, en fazla N maç üst üste (Kural 20.7). */
export interface Queue {
  order: string[];
  table: string[];
  streak: number;
}

/**
 * Turnuva (eleme) tablosu (Kural 20.1 "turnuvalarda 5 oyunda 3"; ayak tenisi,
 * masa tenisi teklerde ve çiftlerde). Yalnızca ilk tur yuvaları ve maç
 * kararları saklanır; sonraki turlar kararlardan her seferinde türetilir.
 */
export interface Bracket {
  /** İlk tur yuvaları (2'nin kuvveti uzunluğunda, ardışık ikililer eşleşir); null = bay */
  seeds: (string[] | null)[];
  /** "tur-sıra" → karar. key tarafların imzasıdır; eşleşme değişirse karar geçersiz sayılır. */
  picks: Record<string, { key: string; gid?: string; win?: Side }>;
}

/** Kıraathane puan cetveli (Kural 21.1–21.2): masa masa, el el puan. */
export interface Sheet {
  id: string;
  /** Kuradaki masa sırası */
  t: number;
  /** Masadaki grubun imzası (kura yeniden çekilirse cetvel o masaya ait sayılmaz) */
  key: string;
  game: string;
  /** Düşük toplam kazanır (101 gibi) */
  low: boolean;
  /** Başlangıç puanı (puanlı okeyde 20 gibi) */
  start: number;
  /** Taraflar: eşli oyunda iki eş, aksi halde tek tek oyuncular */
  seats: string[][];
  /** El el puanlar: rows[el][taraf] */
  rows: number[][];
  done: boolean;
  /** Bitince yazılan masa sonucu (oyun kaydı) */
  gid?: string;
}

export interface Match {
  id: string;
  /** Etkinlik türü (eski veri: halı saha) */
  kind: Kind;
  /** Etkinlik adı (ör. "Şile Paintball"); boşsa türün adı */
  title: string;
  /** Kontenjan: halı sahada formattan, diğerlerinde bu alandan (0 = sınırsız) */
  cap: number;
  /** Kadronun kesinleşmesi: başlangıçtan kaç saat önce (Kural 1.4, 15.3) */
  lockH: number;
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
  /** Oyundan alınanlar → kural no (alkol 15.7, maske 16.2 …); payını öder, takıma/oyuna girmez */
  removed: Record<string, string>;
  /** Hazırlık listesi (tür bazında) */
  checks: Record<string, boolean>;
  /** Ön anlaşmalar (Kural 4.1, 6.2, 7.6, 11.1, 16.6, 17.5, 18.2, 19.1, 20.1, 21.2 …) */
  agree: Record<string, string>;
  /** Etkinlik notu (brifing mesajına eklenir) */
  note: string;
  cars: Car[];
  games: Game[];
  draw?: Draw;
  queue?: Queue;
  /** Maç saati (Kural 4.1): çalışıyorsa başlangıç anı, birikmiş süre (ms) */
  clock?: { start: number; acc: number };
  /** Sakatlananlar (Kural 8.3, 15.6) */
  injured: Record<string, boolean>;
  /** Turnuva tablosu (Kural 20.1) */
  bracket?: Bracket;
  /** Kıraathane puan cetvelleri (Kural 21.1–21.2) */
  sheets: Sheet[];
  /** Üç korner bir penaltı (Kural 7.6): tarafların üst üste korner serisi */
  corners?: Score;
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
  /** Ek borca (ExtraCharge) yazılan ödeme */
  cid?: string;
  note?: string;
}

/**
 * Kişiye yazılan ek borç: etkinlikte kişisel harcama (ek boya/mermi, Kural 15.4),
 * tesise verilen zarar (Kural 10.5) ya da organizatörün yazdığı başka bir kalem.
 */
export interface ExtraCharge {
  id: string;
  pid: string;
  amount: number;
  at: string;
  note: string;
  /** Etkinlik (varsa vadesi etkinlik tarihidir) */
  mid?: string;
  /** İlgili kural ("10.5" gibi) */
  rule?: string;
}

/** Disiplin yaptırımı (Kural 9.3 ve Ek: Yaptırımlar Özet Tablosu). */
export type Sanction = "warn" | "bench" | "ban" | "expel" | "kindBan" | "dropDay" | "dropGame" | "remove" | "damage";
export interface Infraction {
  id: string;
  pid: string;
  at: string;
  /** İhlal türü (katalog anahtarı) */
  type: string;
  /** Kural numarası */
  rule: string;
  sanction: Sanction;
  /** İhlalin olduğu etkinlik */
  mid?: string;
  /** "Bir maç kadroya alınmaz" cezasının uygulanacağı maç */
  target?: string;
  /** Tür yasağı (Kural 17.4: airsoft) */
  kind?: Kind;
  /** Zarar bedeli kaydı */
  cid?: string;
  /** Kural 9.3 kademesi: 1 uyarı, 2 bir maç kadroya alınmaz, 3 davet edilmez */
  step?: number;
  note: string;
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
  /** Kişiye yazılan ek borçlar */
  charges: ExtraCharge[];
  /** Disiplin kayıtları */
  discipline: Infraction[];
}
