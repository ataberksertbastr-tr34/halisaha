/**
 * Düzenlenebilir mesaj şablonları.
 *
 * Şablonda {yer_tutucu} yazılır. Kural: bir satırdaki tüm yer tutucular boşsa
 * satır düşer (ör. saha seçilmemişse "📍 {saha}"); bir paragraftaki (boş satırla
 * ayrılan blok) tüm yer tutucular boşsa paragraf tümüyle düşer
 * (ör. "Ödemeyenler:\n{odemeyenler}" herkes ödediyse).
 */
import type { Lang } from "../i18n";
import type { TemplateKey } from "./types";

export const TEMPLATE_KEYS: TemplateKey[] = ["invite", "squad", "teams", "brief", "pay", "personalPay", "promoted", "cars", "cancel"];

/**
 * Halı saha şablonları (düzenlenebilir). Davet, kadro, takımlar, ödeme ve yedek
 * mesajları eski uygulamanınkiyle birebir aynıdır; grup alışkanlığı bozulmaz.
 */
export const DEFAULT_TEMPLATES: Record<Lang, Record<TemplateKey, string>> = {
  tr: {
    invite:
      "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n👥 {format} ({sayi}/{kontenjan})\n💰 Kişi başı ~{pay}\n\n{liste}\n\n⏳ Yedek: {yedek}\n🤔 Belki: {belki}\n\nGelecek olan ismini listeye yazsın. Kadro maçtan 24 saat önce kesinleşir; geç iptal eden kendi payını öder.",
    squad:
      "✅ Kadro kesinleşti – {gun} {tarih} {saat}\n📍 {saha}\n🗺️ {harita}\n\n{kadro}\n\n⏳ Yedek: {yedek}\n\nBundan sonra çekilen, yerine kimse bulunamazsa payını öder (Kural 1.5). İyi maçlar!",
    teams: "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n\n{renka} {takima}\n{sarilar}\n\n{renkb} {takimb}\n{turuncular}\n\n{kapanis}",
    brief: "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n\n📋 Sahada hatırlatma\n{kurallar}\n\n🤝 Maç öncesi anlaşmalar\n{anlasmalar}\n\n📝 {not}",
    pay: "💸 Saha ücreti – {gun} {tarih}\nKişi başı: {pay}\n\n{iban}\n\nÖdemeyenler:\n{odemeyenler}\n\n{kapanis}",
    personalPay: "Selam {ad}, organizasyonlardan kalan borcun {tutar}.\n{iban}\nTeşekkürler!",
    promoted: "Selam {ad}, {gun} {tarih} {saat} maçında yer açıldı, kadrodasın! ⚽\n📍 {saha}\nGelemeyeceksen hemen haber ver lütfen.",
    cars: "🚗 Araç paylaşımı – {gun} {tarih} {saat}\n📍 {saha}\n\n{araclar}\n\n🙋 Araçsız: {bosta}\n\nYakıt ve geçiş ücreti araçtakiler arasında eşit bölünür (Kural 15.8).",
    cancel: "❌ İPTAL – {gun} {tarih} {saat} maçı\n📍 {saha}\n\nİptal edilen maç için ücret alınmaz (Kural 1.9).",
  },
  en: {
    invite:
      "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n👥 {format} ({sayi}/{kontenjan})\n💰 Per person ~{pay}\n\n{liste}\n\n⏳ Waitlist: {yedek}\n🤔 Maybe: {belki}\n\nIf you're coming, add your name to the list. The squad is fixed 24 hours before kick-off; late cancellations pay their share.",
    squad:
      "✅ Squad confirmed – {gun} {tarih} {saat}\n📍 {saha}\n🗺️ {harita}\n\n{kadro}\n\n⏳ Waitlist: {yedek}\n\nFrom now on, anyone who drops out pays their share unless someone replaces them. Have a good game!",
    teams: "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n\n{renka} {takima}\n{sarilar}\n\n{renkb} {takimb}\n{turuncular}\n\n{kapanis}",
    brief: "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n\n📋 On the pitch\n{kurallar}\n\n🤝 Agreed before kick-off\n{anlasmalar}\n\n📝 {not}",
    pay: "💸 Field fee – {gun} {tarih}\nPer person: {pay}\n\n{iban}\n\nNot paid yet:\n{odemeyenler}\n\n{kapanis}",
    personalPay: "Hi {ad}, you owe {tutar} for our games and events.\n{iban}\nThanks!",
    promoted: "Hi {ad}, a spot opened up for {gun} {tarih} {saat} – you're in! ⚽\n📍 {saha}\nIf you can't make it, let me know right away.",
    cars: "🚗 Car sharing – {gun} {tarih} {saat}\n📍 {saha}\n\n{araclar}\n\n🙋 Still need a ride: {bosta}\n\nFuel and tolls are split equally among those in the car (Rule 15.8).",
    cancel: "❌ CANCELLED – {gun} {tarih} {saat} match\n📍 {saha}\n\nNo fee is charged for a cancelled match (Rule 1.9).",
  },
};

/**
 * Diğer etkinliklerin şablonları (paintball, airsoft, voleybol…): başlık, ikon
 * ve kural numaraları türe göre gelir (Kural 15.2, 15.3).
 */
export const EVENT_TEMPLATES: Record<Lang, Record<TemplateKey, string>> = {
  tr: {
    invite:
      "{ikon} {baslik} · {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n👥 {kisi}\n💰 Kişi başı ~{pay}\n📝 {not}\n\n{liste}\n\n⏳ Yedek: {yedek}\n🤔 Belki: {belki}\n\nGelecek olan ismini listeye yazsın.\n{kesinlesme}",
    squad:
      "✅ Katılım kesinleşti – {baslik} · {gun} {tarih} {saat}\n📍 {saha}\n🗺️ {harita}\n\n{kadro}\n\n⏳ Yedek: {yedek}\n\nBundan sonra çekilen, yerine kimse bulunamazsa payını öder (Kural 15.3). İyi eğlenceler!",
    teams: "{ikon} {baslik} · {gun} {tarih} – {saat}\n📍 {saha}\n\n{renka} {takima}\n{sarilar}\n\n{renkb} {takimb}\n{turuncular}\n\n{kapanis}",
    brief: "{ikon} {baslik} · {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n\n📋 Kurallar\n{kurallar}\n\n🤝 Ön anlaşmalar\n{anlasmalar}\n\n📝 {not}\n\n{kesinlesme}",
    pay: "💸 {ucret} – {gun} {tarih}\nKişi başı: {pay}\n\n{iban}\n\nÖdemeyenler:\n{odemeyenler}\n\n{kapanis}",
    personalPay: "Selam {ad}, organizasyonlardan kalan borcun {tutar}.\n{iban}\nTeşekkürler!",
    promoted: "Selam {ad}, {gun} {tarih} {saat} {baslik} listesinde yer açıldı, katılımcılar arasındasın! {ikon}\n📍 {saha}\nGelemeyeceksen hemen haber ver lütfen.",
    cars: "🚗 Araç paylaşımı – {baslik} · {gun} {tarih} {saat}\n📍 {saha}\n\n{araclar}\n\n🙋 Araçsız: {bosta}\n\nYakıt ve geçiş ücreti araçtakiler arasında eşit bölünür (Kural 15.8).",
    cancel: "❌ İPTAL – {baslik} · {gun} {tarih} {saat}\n📍 {saha}\n\nİptal edilen etkinlik için ücret alınmaz (Kural 1.9, 15.9).",
  },
  en: {
    invite:
      "{ikon} {baslik} · {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n👥 {kisi}\n💰 Per person ~{pay}\n📝 {not}\n\n{liste}\n\n⏳ Waitlist: {yedek}\n🤔 Maybe: {belki}\n\nIf you're coming, add your name to the list.\n{kesinlesme}",
    squad:
      "✅ Sign-ups locked – {baslik} · {gun} {tarih} {saat}\n📍 {saha}\n🗺️ {harita}\n\n{kadro}\n\n⏳ Waitlist: {yedek}\n\nFrom now on, anyone who drops out pays their share unless someone replaces them (Rule 15.3). Have fun!",
    teams: "{ikon} {baslik} · {gun} {tarih} – {saat}\n📍 {saha}\n\n{renka} {takima}\n{sarilar}\n\n{renkb} {takimb}\n{turuncular}\n\n{kapanis}",
    brief: "{ikon} {baslik} · {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n\n📋 Rules\n{kurallar}\n\n🤝 Agreed in advance\n{anlasmalar}\n\n📝 {not}\n\n{kesinlesme}",
    pay: "💸 {ucret} – {gun} {tarih}\nPer person: {pay}\n\n{iban}\n\nNot paid yet:\n{odemeyenler}\n\n{kapanis}",
    personalPay: "Hi {ad}, you owe {tutar} for our games and events.\n{iban}\nThanks!",
    promoted: "Hi {ad}, a spot opened up for {baslik} on {gun} {tarih} {saat} – you're in! {ikon}\n📍 {saha}\nIf you can't make it, let me know right away.",
    cars: "🚗 Car sharing – {baslik} · {gun} {tarih} {saat}\n📍 {saha}\n\n{araclar}\n\n🙋 Still need a ride: {bosta}\n\nFuel and tolls are split equally among those in the car (Rule 15.8).",
    cancel: "❌ CANCELLED – {baslik} · {gun} {tarih} {saat}\n📍 {saha}\n\nNo fee is charged for a cancelled event (Rule 1.9, 15.9).",
  },
};

const BASE = ["ikon", "baslik", "gun", "tarih", "saat", "saha", "harita"];

/** Her şablonda kullanılabilen yer tutucular (Ayarlar'da gösterilir). */
export const PLACEHOLDERS: Record<TemplateKey, string[]> = {
  invite: [...BASE, "kisi", "format", "sayi", "kontenjan", "pay", "liste", "yedek", "belki", "kesinlesme", "iban"],
  squad: [...BASE, "kisi", "kadro", "yedek", "pay", "kuralgec", "iyi", "iban"],
  teams: [...BASE, "renka", "takima", "sarilar", "renkb", "takimb", "turuncular", "anlasmalar", "kapanis"],
  brief: [...BASE, "kurallar", "anlasmalar", "not", "kesinlesme", "pay", "kisi"],
  pay: ["ucret", "baslik", "gun", "tarih", "saat", "pay", "iban", "odemeyenler", "kapanis"],
  personalPay: ["ad", "tutar", "iban"],
  promoted: ["ad", ...BASE],
  cars: [...BASE, "araclar", "bosta"],
  cancel: [...BASE, "not"],
};

/**
 * Kullanılacak şablon. Ayarlardan düzenlenen şablonlar halı saha maçları içindir
 * (kişisel borç mesajı her yerde); diğer etkinlikler türe göre hazır şablonu kullanır.
 */
export function templateOf(templates: Partial<Record<TemplateKey, string>>, key: TemplateKey, lang: Lang, football = true): string {
  const custom = templates[key];
  if ((football || key === "personalPay") && custom && custom.trim()) return custom;
  return (football ? DEFAULT_TEMPLATES : EVENT_TEMPLATES)[lang][key];
}

const PH = /\{([a-zçğıöşü_]+)\}/gi;

/** Şablonu doldurur; boş kalan satırları/paragrafları atar. */
export function render(tpl: string, vars: Record<string, string>): string {
  const val = (k: string) => vars[k.toLocaleLowerCase("tr")] ?? vars[k] ?? null;
  const paragraphs = String(tpl).replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const out: string[] = [];
  for (const para of paragraphs) {
    const keys = [...para.matchAll(PH)].map((m) => m[1]).filter((k) => val(k) !== null);
    if (keys.length && keys.every((k) => !String(val(k)).trim())) continue;
    const lines: string[] = [];
    for (const line of para.split("\n")) {
      const lk = [...line.matchAll(PH)].map((m) => m[1]).filter((k) => val(k) !== null);
      if (lk.length && lk.every((k) => !String(val(k)).trim())) continue;
      lines.push(line.replace(PH, (whole, k: string) => (val(k) !== null ? String(val(k)) : whole)));
    }
    const text = lines.join("\n").replace(/[ \t]+$/gm, "");
    if (text.trim()) out.push(text);
  }
  return out.join("\n\n").trim();
}
