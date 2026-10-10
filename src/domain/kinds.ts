/**
 * Etkinlik türleri (Yönetmelik Kısım 1 ve 3): her türün kontenjanı, kesinleşme
 * süresi, takım/skor düzeni, hazırlık listesi, ön anlaşmaları ve brifing
 * hatırlatmaları. Metinler yönetmelikteki madde numaralarıyla birlikte tutulur.
 */
import { lang } from "../i18n";
import type { Kind, Match, State } from "./types";

export interface Txt {
  tr: string;
  en: string;
}
export const L = (x: Txt): string => x[lang()] || x.tr;

export interface CheckItem extends Txt {
  key: string;
  rule: string;
}
export interface AgreeOpt extends Txt {
  v: string;
}
export interface AgreeItem extends Txt {
  key: string;
  rule: string;
  opts: AgreeOpt[];
  /** Varsayılan ("" = netleştirilmedi, maç öncesi karar gerekir) */
  def: string;
}
export interface Reminder extends Txt {
  rule: string;
}

/** Takımlar sekmesinin düzeni. */
export type TeamMode = "pitch" | "two" | "draw" | "queue" | "tables";
/** Sonuç bölümünün düzeni. */
export type ScoreMode = "goals" | "rounds" | "sets" | "tables";

export interface KindDef {
  id: Kind;
  icon: string;
  emoji: string;
  name: Txt;
  /** Kısa ad (çiplerde) */
  short: Txt;
  teams: TeamMode;
  score: ScoreMode;
  /** Varsayılan kontenjan (0 = sınırsız) */
  cap: number;
  /** Varsayılan kesinleşme (saat) */
  lockH: number;
  /** Takvimde süre (dk) */
  minutes: number;
  /** Varsayılan başlangıç saati */
  time: string;
  /** Fiziksel etkinlik (Kural 15.6 ısınma, 15.7 alkol) */
  physical: boolean;
  /** İlgili yönetmelik bölümleri */
  sections: string[];
  checks: CheckItem[];
  /** Kapanış listesi: etkinlik bitince (yelek, soyunma odası, ekipman, hesap …) */
  post: CheckItem[];
  agree: AgreeItem[];
  brief: Reminder[];
}

const yes: AgreeOpt = { v: "yes", tr: "Var", en: "Yes" };
const no: AgreeOpt = { v: "no", tr: "Yok", en: "No" };

/* ---------- ortak hazırlık maddeleri ---------- */
const C = {
  deposit: { key: "deposit", rule: "15.3", tr: "Tesis ön ödemesi yapıldı", en: "Venue deposit paid" },
  warmup: { key: "warmup", rule: "15.6", tr: "Isınma yapıldı", en: "Warm-up done" },
  sober: { key: "sober", rule: "15.7", tr: "Alkol kontrolü: herkes ayık", en: "Alcohol check: everyone sober" },
  travel: { key: "travel", rule: "15.8", tr: "Ulaşım ve araç paylaşımı planlandı", en: "Transport and car sharing planned" },
  rulesShared: { key: "rulesShared", rule: "15.10", tr: "Etkinlik kuralları grupta duyuruldu", en: "Event rules announced to the group" },
} satisfies Record<string, CheckItem>;

/* ---------- ortak hatırlatmalar (Kural 15) ---------- */
const R = {
  pay: { rule: "15.4", tr: "Ücret etkinlikten önce IBAN'a gönderilir; ek boya/mermi, yiyecek ve içecek gibi kişisel harcamalar herkesin kendisine aittir.", en: "The fee is sent to the IBAN before the event; personal extras (extra paint/ammo, food, drinks) are on each person." },
  facility: { rule: "15.5", tr: "Tesisin kuralları ve görevlilerin talimatları önce gelir.", en: "The venue's rules and staff instructions come first." },
  warmup: { rule: "15.6", tr: "Önce ısınma yapılır; sakatlanan oyunu bırakır ve organizatöre haber verir.", en: "Warm up first; anyone injured stops and tells the organiser." },
  sober: { rule: "15.7", tr: "Etkinlikten önce ve sırasında alkol yok; alkollü olduğu anlaşılan etkinliğe alınmaz ve payını öder.", en: "No alcohol before or during the event; anyone found drunk is not allowed to play and still pays." },
  travel: { rule: "15.8", tr: "Araç paylaşımında yakıt ve geçiş ücreti araçtakiler arasında eşit bölünür.", en: "When sharing cars, fuel and tolls are split equally among those in the car." },
  conduct: { rule: "15.9", tr: "Misafir, centilmenlik, küfür-kavga ve disiplin kuralları burada da geçerlidir.", en: "Guest, sportsmanship, swearing/fighting and discipline rules apply here too." },
} satisfies Record<string, Reminder>;

export const KIND_DEFS: Record<Kind, KindDef> = {
  football: {
    id: "football", icon: "ball", emoji: "⚽", name: { tr: "Halı saha maçı", en: "Five-a-side match" }, short: { tr: "Maç", en: "Match" },
    teams: "pitch", score: "goals", cap: 0, lockH: 24, minutes: 60, time: "21:00", physical: true, sections: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    checks: [
      { key: "bibs", rule: "3.3", tr: "Yelekler ve top hazır", en: "Bibs and ball ready" },
      { key: "gear", rule: "4.3", tr: "Ekipman hatırlatıldı: çivili krampon, saat, yüzük, kolye yok", en: "Gear reminder sent: no studs, watches, rings or necklaces" },
    ],
    post: [
      { key: "post.bibs", rule: "3.3", tr: "Yelekler oyunculardan geri toplandı", en: "Bibs collected back from players" },
      { key: "post.balls", rule: "5.6", tr: "Toplar eksiksiz toplandı", en: "All balls collected" },
      { key: "post.room", rule: "10.1", tr: "Soyunma odası temiz bırakıldı", en: "Changing room left clean" },
      { key: "post.paid", rule: "2.3", tr: "Saha ücretleri IBAN'a geldi", en: "Field fees received on the IBAN" },
    ],
    agree: [
      { key: "dur", rule: "4.1", tr: "Maç süresi", en: "Duration", def: "2x30", opts: [{ v: "2x30", tr: "2 × 30 dk (devre arası en fazla 5 dk)", en: "2 × 30 min (max 5 min half-time)" }, { v: "60", tr: "Tek devre 60 dk", en: "Single 60 min half" }] },
      { key: "gk", rule: "3.5", tr: "Kaleci", en: "Goalkeeper", def: "fixed", opts: [{ v: "fixed", tr: "Sabit kaleciler", en: "Regular keepers" }, { v: "10m", tr: "10 dakikada bir değişim", en: "Rotate every 10 minutes" }, { v: "2g", tr: "2 golde bir değişim", en: "Rotate every 2 goals" }] },
      { key: "degaj", rule: "6.2", tr: "Degaj", en: "Goal throw", def: "half", opts: [{ v: "half", tr: "Kendi yarı alanında yere değmeli", en: "Must bounce in own half" }, { v: "venue", tr: "Sahanın kuralı geçerli", en: "Venue rule applies" }] },
      { key: "fk", rule: "7.3", tr: "Serbest vuruş", en: "Free kicks", def: "direct", opts: [{ v: "direct", tr: "Direkt", en: "Direct" }, { v: "indirect", tr: "Endirekt", en: "Indirect" }] },
      { key: "corners", rule: "7.6", tr: "Üç korner bir penaltı", en: "Three corners = one penalty", def: "no", opts: [{ v: "no", tr: "Uygulanmaz", en: "Not used" }, { v: "yes", tr: "Uygulanır", en: "Used" }] },
      { key: "dessert", rule: "11.1", tr: "Tatlı iddiası", en: "Dessert bet", def: "yes", opts: [{ v: "yes", tr: "Kaybeden tatlıyı alır", en: "Losers buy dessert" }, { v: "no", tr: "Yok", en: "No" }] },
    ],
    brief: [
      { rule: "1.7", tr: "Maça tam vaktinde başlanır; maç kimseyi beklemez.", en: "Kick-off is on time; the match waits for no one." },
      { rule: "2.3", tr: "Saha ücreti maça çıkmadan önce IBAN'a gönderilir.", en: "The field fee goes to the IBAN before the match." },
      { rule: "4.3", tr: "Çivili krampon yok; halı saha ayakkabısı ya da altı düz spor ayakkabı.", en: "No studs; turf or flat-soled shoes only." },
      { rule: "4.4", tr: "Saat, yüzük, kolye gibi aksesuarlarla sahaya çıkılmaz.", en: "No watches, rings or necklaces on the pitch." },
      { rule: "7.1", tr: "Kayarak müdahale yok.", en: "No slide tackles." },
      { rule: "8.1", tr: "Hakem yok: faulü yapan kabul eder, tartışma uzatılmaz.", en: "No referee: own up to your fouls, keep arguments short." },
    ],
  },
  paintball: {
    id: "paintball", icon: "splat", emoji: "🎯", name: { tr: "Paintball", en: "Paintball" }, short: { tr: "Paintball", en: "Paintball" },
    teams: "two", score: "rounds", cap: 12, lockH: 48, minutes: 180, time: "11:00", physical: true, sections: ["15", "16"],
    checks: [
      C.deposit,
      { key: "brief", rule: "16.1", tr: "Güvenlik brifingine herkes katıldı", en: "Everyone attended the safety briefing" },
      { key: "masks", rule: "16.2", tr: "Maskeler kontrol edildi", en: "Masks checked" },
      { key: "safe", rule: "16.3", tr: "Güvenli alan: namlu tıkacı takılı, emniyet kapalı", en: "Safe zone: barrel plugs on, safety engaged" },
      { key: "outfit", rule: "16.8", tr: "Kıyafet duyuruldu: uzun kollu, kalın, kapalı ayakkabı", en: "Dress code sent: long sleeves, thick clothes, closed shoes" },
      C.warmup, C.sober, C.travel,
    ],
    post: [
      { key: "post.gear", rule: "16.1", tr: "Kiralık ekipman ve maskeler tesise teslim edildi", en: "Rented gear and masks returned to the venue" },
      { key: "post.plugs", rule: "16.3", tr: "Silahlarda namlu tıkacı takılı, emniyet kapalı", en: "Barrel plugs on, markers on safe" },
      { key: "post.extras", rule: "15.4", tr: "Ek boya ve kişisel harcamalar kapandı", en: "Extra paint and personal costs settled" },
      { key: "post.paid", rule: "15.4", tr: "Paylar IBAN'a geldi", en: "Shares received on the IBAN" },
    ],
    agree: [
      { key: "range", rule: "16.6", tr: "Yakın mesafe", en: "Minimum distance", def: "5", opts: [{ v: "5", tr: "5 metre", en: "5 metres" }, { v: "venue", tr: "Tesisin belirlediği mesafe", en: "Venue's distance" }] },
      { key: "gunhit", rule: "16.4", tr: "Silaha isabet", en: "Hit on the marker", def: "venue", opts: [{ v: "venue", tr: "Tesisin kuralı", en: "Venue rule" }, { v: "hit", tr: "Vuruş sayılır", en: "Counts as a hit" }, { v: "nohit", tr: "Sayılmaz", en: "Doesn't count" }] },
    ],
    brief: [
      { rule: "16.1", tr: "Yalnızca tesisin verdiği ya da onayladığı ekipmanla oynanır; oyun öncesi güvenlik brifingine herkes katılır.", en: "Only venue-approved gear; everyone attends the safety briefing." },
      { rule: "16.2", tr: "MASKE oyun alanında hiçbir koşulda çıkarılmaz. Buğulanan ya da kırılan maskede yere çök, yüzünü kapat, \"Maske!\" diye seslen.", en: "MASKS never come off on the field. If yours fogs or breaks: crouch, cover your face, shout \"Mask!\"." },
      { rule: "16.3", tr: "Güvenli alanda namlu tıkacı takılı, emniyet kapalı; silah maskesiz kimseye doğrultulmaz.", en: "In the safe zone: barrel plug on, safety on; never point a marker at anyone without a mask." },
      { rule: "16.4", tr: "Patlayıp iz bırakan top vuruştur: elini kaldır, \"Vuruldum!\" de, alanı terk et.", en: "A ball that breaks and marks is a hit: raise your hand, shout \"Hit!\", leave the field." },
      { rule: "16.5", tr: "Boya izini silmek hiledir: o oyundan çıkarılır.", en: "Wiping paint is cheating: out of that game." },
      { rule: "16.6", tr: "Yakın mesafede ateş edilmez, \"Teslim ol!\" çağrısı yapılır.", en: "No shooting at close range: call \"Surrender!\" instead." },
      { rule: "16.7", tr: "Vurulana ve alandan çıkana ateş yok; kör atış yok.", en: "Never shoot players who are hit or leaving; no blind fire." },
      { rule: "16.8", tr: "Uzun kollu kalın kıyafet, bileği koruyan kapalı ayakkabı; eldiven ve boyunluk önerilir.", en: "Long sleeves, thick clothes, ankle-supporting closed shoes; gloves and neck guard recommended." },
      R.sober, R.pay, R.facility,
    ],
  },
  airsoft: {
    id: "airsoft", icon: "crosshair", emoji: "🪖", name: { tr: "Airsoft", en: "Airsoft" }, short: { tr: "Airsoft", en: "Airsoft" },
    teams: "two", score: "rounds", cap: 16, lockH: 48, minutes: 240, time: "10:00", physical: true, sections: ["15", "17"],
    checks: [
      C.deposit,
      { key: "chrono", rule: "17.1", tr: "Tüm replikalar krono ölçümünden geçti", en: "All replicas passed the chrono" },
      { key: "eyes", rule: "17.2", tr: "Tam kapalı göz korumaları kontrol edildi", en: "Full-seal eye protection checked" },
      { key: "safe", rule: "17.3", tr: "Güvenli alan: şarjör çıkarıldı, hazne boşaltıldı, emniyet", en: "Safe zone: mags out, chambers cleared, safety on" },
      { key: "carry", rule: "17.4", tr: "Taşıma kuralı hatırlatıldı: replikalar çanta/kılıfta", en: "Transport rule reminded: replicas stay bagged" },
      { key: "pyro", rule: "17.8", tr: "Pirotekni izinleri tesisle netleştirildi", en: "Pyro permissions agreed with the venue" },
      { key: "outfit", rule: "17.9", tr: "Kıyafet duyuruldu: uzun kollu, eldiven, bot", en: "Dress code sent: long sleeves, gloves, boots" },
      C.warmup, C.sober, C.travel,
    ],
    post: [
      { key: "post.bagged", rule: "17.4", tr: "Replikalar çantada/kılıfta, şarjörler çıkarıldı", en: "Replicas bagged, magazines out" },
      { key: "post.gear", rule: "17.1", tr: "Kiralık ekipman tesise teslim edildi", en: "Rented gear returned to the venue" },
      { key: "post.extras", rule: "15.4", tr: "Ek mermi ve kişisel harcamalar kapandı", en: "Extra ammo and personal costs settled" },
      { key: "post.paid", rule: "15.4", tr: "Paylar IBAN'a geldi", en: "Shares received on the IBAN" },
    ],
    agree: [
      { key: "ricochet", rule: "17.5", tr: "Seken mermi", en: "Ricochets", def: "", opts: [{ v: "no", tr: "Vuruş sayılmaz", en: "Don't count" }, { v: "yes", tr: "Vuruş sayılır", en: "Count as hits" }] },
      { key: "replica", rule: "17.5", tr: "Replikaya isabet", en: "Hit on the replica", def: "", opts: [{ v: "no", tr: "Sayılmaz", en: "Doesn't count" }, { v: "yes", tr: "Vuruş sayılır", en: "Counts as a hit" }] },
      { key: "rag", rule: "17.5", tr: "Kırmızı bez", en: "Dead rag", def: "yes", opts: [{ v: "yes", tr: "Vurulan kırmızı bezi çıkarır", en: "Hit players show a red rag" }, { v: "no", tr: "Kullanılmıyor", en: "Not used" }] },
      { key: "surrender", rule: "17.7", tr: "Yakın mesafede \"Teslim ol!\"", en: "Close-range \"Surrender!\"", def: "", opts: [{ v: "yes", tr: "Tesis izin veriyor", en: "Venue allows it" }, { v: "no", tr: "İzin yok", en: "Not allowed" }] },
    ],
    brief: [
      { rule: "17.1", tr: "Yalnızca tesiste oynanır; tüm replikalar oyundan önce kronodan geçer, sınırı aşan kullanılmaz.", en: "Venue only; every replica is chronographed first, over-limit replicas are not used." },
      { rule: "17.2", tr: "GÖZ KORUMASI oyun alanında hiçbir koşulda çıkarılmaz; alt maske önerilir.", en: "EYE PROTECTION never comes off on the field; a lower face mask is recommended." },
      { rule: "17.3", tr: "Güvenli alana girmeden şarjör çıkarılır, hazne boşaltılır, emniyet alınır.", en: "Before the safe zone: mag out, chamber cleared, safety on." },
      { rule: "17.4", tr: "Replikalar tesis dışında, otoparkta ve yolda çantadan çıkarılmaz; ihlal eden airsofta bir daha davet edilmez.", en: "Replicas stay bagged outside the venue, in the car park and on the road; breaking this means no more airsoft invites." },
      { rule: "17.5", tr: "Vuruş beyana dayanır: elini kaldır, \"Hit!\" ya da \"Vuruldum!\" de, alandan ayrıl.", en: "Hits are honour-based: raise your hand, shout \"Hit!\", leave the field." },
      { rule: "17.6", tr: "Vuruş saklamak en ağır centilmenlik ihlalidir: o oyundan çıkarılır.", en: "Hiding hits is the worst foul: out of that game." },
      { rule: "17.7", tr: "Asgari atış mesafelerine uyulur; kör atış yok, vurulana ateş yok.", en: "Respect minimum engagement distances; no blind fire, never shoot hit players." },
      { rule: "17.9", tr: "Uzun kollu kalın kıyafet, eldiven, bileği destekleyen bot.", en: "Long sleeves, gloves, ankle-supporting boots." },
      R.sober, R.pay, R.facility,
    ],
  },
  volleyball: {
    id: "volleyball", icon: "volley", emoji: "🏐", name: { tr: "Voleybol", en: "Volleyball" }, short: { tr: "Voleybol", en: "Volleyball" },
    teams: "two", score: "sets", cap: 12, lockH: 24, minutes: 120, time: "20:00", physical: true, sections: ["15", "18"],
    checks: [
      { key: "ball", rule: "18.1", tr: "Top ve file hazır", en: "Ball and net ready" },
      { key: "shoes", rule: "18.7", tr: "Salon ayakkabısı hatırlatıldı; yüzük, saat, kolye yok", en: "Indoor shoes reminder sent; no rings, watches, necklaces" },
      C.warmup, C.sober,
    ],
    post: [
      { key: "post.net", rule: "18.1", tr: "Top ve file toplandı", en: "Ball and net packed away" },
      { key: "post.room", rule: "10.1", tr: "Salon ve soyunma odası temiz bırakıldı", en: "Hall and changing room left clean" },
      { key: "post.paid", rule: "15.4", tr: "Paylar IBAN'a geldi", en: "Shares received on the IBAN" },
    ],
    agree: [
      { key: "fmt", rule: "18.2", tr: "Format", en: "Format", def: "bo3", opts: [{ v: "bo3", tr: "3 set: 25 – 25 – 15", en: "Best of 3: 25 – 25 – 15" }, { v: "bo3s", tr: "3 set: 21 – 21 – 15 (süre kısıtlı)", en: "Best of 3: 21 – 21 – 15 (short)" }, { v: "bo1", tr: "Tek set 25 (süre kısıtlı)", en: "Single set to 25 (short)" }] },
      { key: "size", rule: "18.1", tr: "Takım", en: "Team size", def: "6", opts: [{ v: "4", tr: "4 kişilik", en: "4 a side" }, { v: "5", tr: "5 kişilik", en: "5 a side" }, { v: "6", tr: "6 kişilik", en: "6 a side" }] },
    ],
    brief: [
      { rule: "18.1", tr: "Takımları organizatör kurar; yedekler set aralarında sırayla oyuna girer.", en: "The organiser picks teams; subs rotate in between sets." },
      { rule: "18.2", tr: "Her ralli bir sayıdır; setler 25 sayıya, karar seti 15'e oynanır, en az 2 sayı farkla kazanılır.", en: "Rally scoring; sets to 25, deciding set to 15, win by 2." },
      { rule: "18.3", tr: "Servisi rakipten alan takım saat yönünde döner.", en: "Win the serve back, rotate clockwise." },
      { rule: "18.4", tr: "En fazla üç temas; aynı oyuncu üst üste iki kez dokunamaz.", en: "Max three touches; no double touches." },
      { rule: "18.5", tr: "Fileye temas ve orta çizgiyi tamamen geçmek faul; çizgiye değen top içeri.", en: "Touching the net or fully crossing the centre line is a fault; line balls are in." },
      { rule: "18.7", tr: "Salon ayakkabısı; yüzük, saat ve kolye çıkarılır.", en: "Indoor shoes; take off rings, watches, necklaces." },
      R.warmup, R.sober,
    ],
  },
  footvolley: {
    id: "footvolley", icon: "footvolley", emoji: "🦶", name: { tr: "Ayak tenisi", en: "Footvolley" }, short: { tr: "Ayak tenisi", en: "Footvolley" },
    teams: "draw", score: "sets", cap: 8, lockH: 24, minutes: 120, time: "18:00", physical: true, sections: ["15", "19"],
    checks: [
      { key: "ball", rule: "19.1", tr: "Top, file ve saha hazır", en: "Ball, net and court ready" },
      C.warmup, C.sober,
    ],
    post: [
      { key: "post.net", rule: "19.1", tr: "Top ve file toplandı", en: "Ball and net packed away" },
      { key: "post.paid", rule: "15.4", tr: "Paylar IBAN'a geldi", en: "Shares received on the IBAN" },
    ],
    agree: [
      { key: "org", rule: "19.1", tr: "Düzen", en: "Format", def: "free", opts: [{ v: "free", tr: "Serbest maçlar", en: "Open matches" }, { v: "cup", tr: "Turnuva · eleme", en: "Knockout tournament" }] },
      { key: "fmt", rule: "19.1", tr: "Format", en: "Format", def: "2", opts: [{ v: "1", tr: "Tekli", en: "Singles" }, { v: "2", tr: "Çiftli", en: "Doubles" }, { v: "3", tr: "Üçlü", en: "Triples" }] },
      { key: "sets", rule: "19.5", tr: "Set", en: "Sets", def: "bo3", opts: [{ v: "bo3", tr: "3 set, 15 sayı", en: "Best of 3, to 15" }, { v: "bo1", tr: "Tek set 15", en: "Single set to 15" }] },
    ],
    brief: [
      { rule: "19.2", tr: "Servis arka çizginin gerisinden ayakla; fileye değip geçen servis tekrar atılır.", en: "Serve with the foot from behind the baseline; net-cord serves are replayed." },
      { rule: "19.3", tr: "Top kendi sahanda en fazla bir kez sekebilir; en fazla üç temas.", en: "One bounce per side at most; max three touches." },
      { rule: "19.4", tr: "Elle ve kolla oynanmaz; ayak, diz, göğüs ve kafa serbest.", en: "No hands or arms; feet, knees, chest and head are fine." },
      { rule: "19.5", tr: "Her ralli bir sayı; setler 15'e, en az 2 farkla; 3 sette 2 alan kazanır.", en: "Rally scoring; sets to 15, win by 2; best of 3." },
      { rule: "19.7", tr: "Hakem yoksa beyan esastır; anlaşılamayan sayı tekrar oynanır.", en: "No referee: honour calls; disputed points are replayed." },
      R.warmup, R.sober,
    ],
  },
  tabletennis: {
    id: "tabletennis", icon: "paddle", emoji: "🏓", name: { tr: "Masa tenisi", en: "Table tennis" }, short: { tr: "Masa tenisi", en: "Table tennis" },
    teams: "queue", score: "sets", cap: 8, lockH: 24, minutes: 120, time: "20:00", physical: false, sections: ["15", "20"],
    checks: [
      { key: "gear", rule: "20.8", tr: "Raket ve top hazır; masaya oturulmaz, raket fırlatılmaz hatırlatıldı", en: "Bats and balls ready; no sitting on the table, no throwing bats" },
    ],
    post: [
      { key: "post.gear", rule: "20.8", tr: "Raket ve toplar toplandı, masa sağlam", en: "Bats and balls packed, table undamaged" },
      { key: "post.paid", rule: "15.4", tr: "Masa ücreti payları IBAN'a geldi", en: "Table fee shares received on the IBAN" },
    ],
    agree: [
      { key: "org", rule: "20.1", tr: "Düzen", en: "Format", def: "queue", opts: [{ v: "queue", tr: "Kazanan kalır (20.7)", en: "Winner stays (20.7)" }, { v: "cup", tr: "Turnuva · eleme (20.1)", en: "Knockout tournament (20.1)" }] },
      { key: "bo", rule: "20.1", tr: "Maç", en: "Match", def: "3", opts: [{ v: "3", tr: "3 oyunda 2", en: "Best of 3" }, { v: "5", tr: "5 oyunda 3 (turnuva)", en: "Best of 5 (tournament)" }] },
      { key: "queue", rule: "20.7", tr: "Masa sırası", en: "Table queue", def: "3", opts: [{ v: "3", tr: "Kazanan kalır, en fazla 3 maç", en: "Winner stays, max 3" }, { v: "2", tr: "Kazanan kalır, en fazla 2 maç", en: "Winner stays, max 2" }, { v: "0", tr: "Kazanan kalır, sınırsız", en: "Winner stays, no limit" }] },
      { key: "mode", rule: "20.6", tr: "Oynanış", en: "Play", def: "single", opts: [{ v: "single", tr: "Tekler", en: "Singles" }, { v: "double", tr: "Çiftler", en: "Doubles" }] },
    ],
    brief: [
      { rule: "20.1", tr: "Oyunlar 11 sayıya, en az 2 farkla; maçı 3 oyunda 2 alan kazanır.", en: "Games to 11, win by 2; best of 3." },
      { rule: "20.2", tr: "Servis: top açık avuçtan en az 16 cm dikey atılır, önce kendi sahana seker.", en: "Serve: toss at least 16 cm from an open palm; bounce on your side first." },
      { rule: "20.3", tr: "Herkes art arda 2 servis atar; 10-10'dan sonra servis her sayıda değişir.", en: "Two serves each; from 10-10 the serve alternates every point." },
      { rule: "20.7", tr: "Bekleyen çoksa kazanan kalır; aynı oyuncu en fazla 3 maç üst üste, sonra sıranın sonuna.", en: "Winner stays when busy; max 3 in a row, then back of the queue." },
      { rule: "20.8", tr: "Masaya oturulmaz, raket fırlatılmaz; ekipmana verilen zarar karşılanır.", en: "No sitting on the table or throwing bats; damage is paid for." },
    ],
  },
  kiraathane: {
    id: "kiraathane", icon: "dice", emoji: "🎲", name: { tr: "Kıraathane", en: "Games night" }, short: { tr: "Kıraathane", en: "Games night" },
    teams: "tables", score: "tables", cap: 8, lockH: 24, minutes: 180, time: "20:30", physical: false, sections: ["21"],
    checks: [
      { key: "games", rule: "21.1", tr: "Oynanacak oyunlar seçildi", en: "Games chosen" },
      { key: "rules", rule: "21.2", tr: "Puanlama, cezalar ve bitiş usulü masada netleşti", en: "Scoring, penalties and finish agreed at the table" },
      { key: "gamble", rule: "21.3", tr: "Kumar ve bahis yasağı hatırlatıldı", en: "No-gambling rule reminded" },
      { key: "bill", rule: "21.7", tr: "Hesap usulü konuşuldu", en: "Bill split agreed" },
      { key: "smoke", rule: "21.8", tr: "Sigara için açık alan belirlendi", en: "Outdoor smoking spot agreed" },
    ],
    post: [
      { key: "post.bill", rule: "21.7", tr: "Hesap masadan kalkmadan kapandı", en: "Bill settled before leaving the table" },
      { key: "post.tidy", rule: "21.8", tr: "Taşlar, kartlar ve tavla toplandı; masa düzenli", en: "Tiles, cards and backgammon packed; table tidy" },
    ],
    agree: [
      { key: "okey", rule: "21.2", tr: "Okeyde çifte gitme", en: "Okey: going pairs", def: "", opts: [yes, no] },
      { key: "batak", rule: "21.2", tr: "Batakta ihale", en: "Batak: bidding", def: "", opts: [yes, no] },
      { key: "tavla", rule: "21.4", tr: "Tavla", en: "Backgammon", def: "5", opts: [{ v: "5", tr: "5 sayı (mars 2 sayı)", en: "To 5 (gammon 2)" }, { v: "3", tr: "3 sayı (mars 2 sayı)", en: "To 3 (gammon 2)" }, { v: "7", tr: "7 sayı (mars 2 sayı)", en: "To 7 (gammon 2)" }] },
    ],
    brief: [
      { rule: "21.1", tr: "Okey, 101, tavla, batak, king ve pişti; masalar ve eşler kurayla belirlenir.", en: "Okey, 101, backgammon, batak, king, pişti; tables and partners by draw." },
      { rule: "21.2", tr: "Puanlama, cezalar ve bitiş usulü oyun başlamadan netleşir ve oyun bitene kadar değişmez.", en: "Scoring, penalties and finish are agreed before play and don't change mid-game." },
      { rule: "21.3", tr: "Para, bahis ya da değerli eşya üzerine oynanmaz.", en: "No playing for money, bets or valuables." },
      { rule: "21.4", tr: "Tavla 5 sayıya, mars 2 sayı; zar tavlanın içine atılır, elini pulden kaldıran hamlesini değiştiremez.", en: "Backgammon to 5, gammon counts 2; dice land in the board; touch-move applies." },
      { rule: "21.5", tr: "Seyirci konuşmaz, hamle söylemez.", en: "Spectators stay quiet and give no hints." },
      { rule: "21.6", tr: "Taş/kart saklamak, işaretleşmek, rakibin eline bakmak hiledir: oyundan çıkarılır.", en: "Hiding tiles/cards, signalling or peeking is cheating: out of the game." },
      { rule: "21.7", tr: "Masa/oyun ücreti eşit bölünür; herkes kendi yediğinin içtiğinin hesabını öder.", en: "Table fees are split equally; everyone pays for their own food and drinks." },
      { rule: "21.8", tr: "Oyun bitince masa toplanır; kapalı alanda sigara içilmez.", en: "Tidy up after the game; no smoking indoors." },
    ],
  },
  other: {
    id: "other", icon: "flag", emoji: "🎉", name: { tr: "Diğer etkinlik", en: "Other event" }, short: { tr: "Etkinlik", en: "Event" },
    teams: "two", score: "rounds", cap: 0, lockH: 24, minutes: 120, time: "20:00", physical: true, sections: ["15"],
    checks: [C.rulesShared, C.travel],
    post: [
      { key: "post.venue", rule: "15.5", tr: "Mekân ve ekipman düzgün teslim edildi", en: "Venue and gear handed back in good order" },
      { key: "post.paid", rule: "15.4", tr: "Paylar IBAN'a geldi", en: "Shares received on the IBAN" },
    ],
    agree: [],
    brief: [R.pay, R.facility, R.conduct, R.sober],
  },
};

export const kindDef = (k: Kind | undefined): KindDef => KIND_DEFS[k || "football"] || KIND_DEFS.football;
export const kindOf = (m: Pick<Match, "kind"> | null | undefined): KindDef => kindDef(m?.kind);
export const isFootball = (m: Pick<Match, "kind"> | null | undefined): boolean => !m || !m.kind || m.kind === "football";

/** Etkinliğin görünen adı: başlık ya da türün adı. */
export function eventTitle(m: Pick<Match, "kind" | "title">): string {
  return (m.title || "").trim() || L(kindDef(m.kind).name);
}

/** Ön anlaşmanın değeri (girilmediyse türün varsayılanı). */
export function agreeValue(m: Pick<Match, "kind" | "agree">, key: string): string {
  const v = m.agree?.[key];
  if (v != null) return v;
  return kindDef(m.kind).agree.find((a) => a.key === key)?.def ?? "";
}

/** Netleştirilmemiş ön anlaşmalar (Kural 17.5, 21.2 …: oyun öncesi karar gerekir). */
export function pendingAgreements(m: Pick<Match, "kind" | "agree">): AgreeItem[] {
  return kindDef(m.kind).agree.filter((a) => !agreeValue(m, a.key));
}

/** Kapanış listesi durumu: tamamlanan / toplam. */
export function postProgress(m: Pick<Match, "kind" | "checks">): { done: number; total: number } {
  const items = kindDef(m.kind).post;
  return { done: items.filter((c) => m.checks?.[c.key]).length, total: items.length };
}

/** Turnuva düzeni seçildi mi (Kural 20.1; ayak tenisi ve masa tenisi). */
export const isCup = (m: Pick<Match, "kind" | "agree">): boolean => (m.kind === "tabletennis" || m.kind === "footvolley") && agreeValue(m, "org") === "cup";

/** Hazırlık durumu: tamamlanan / toplam (rezervasyon dahil). */
export function checkProgress(m: Pick<Match, "kind" | "checks" | "reserved">): { done: number; total: number } {
  const items = kindDef(m.kind).checks;
  const done = items.filter((c) => m.checks?.[c.key]).length + (m.reserved ? 1 : 0);
  return { done, total: items.length + 1 };
}

/**
 * Yeni etkinliğin ön anlaşmaları: aynı türdeki son etkinlikteki seçimler
 * (grup her seferinde baştan karar vermesin), yoksa türün varsayılanları.
 */
export function inheritAgreements(s: State, kind: Kind): Record<string, string> {
  const prev = s.matches.filter((m) => (m.kind || "football") === kind && m.agree && Object.keys(m.agree).length).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  const out: Record<string, string> = {};
  for (const a of kindDef(kind).agree) {
    const v = prev?.agree[a.key];
    if (v != null && a.opts.some((o) => o.v === v)) out[a.key] = v;
  }
  return out;
}

/** Seçeneğin görünen metni. */
export function agreeLabel(a: AgreeItem, v: string): string {
  const o = a.opts.find((x) => x.v === v);
  return o ? L(o) : "";
}
