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

export const TEMPLATE_KEYS: TemplateKey[] = ["invite", "squad", "teams", "pay", "personalPay", "promoted"];

export const DEFAULT_TEMPLATES: Record<Lang, Record<TemplateKey, string>> = {
  tr: {
    invite:
      "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n👥 {format} ({sayi}/{kontenjan})\n💰 Kişi başı ~{pay}\n\n{liste}\n\n⏳ Yedek: {yedek}\n🤔 Belki: {belki}\n\nGelecek olan ismini listeye yazsın. Kadro maçtan 24 saat önce kesinleşir; geç iptal eden kendi payını öder.",
    squad:
      "✅ Kadro kesinleşti – {gun} {tarih} {saat}\n📍 {saha}\n🗺️ {harita}\n\n{kadro}\n\n⏳ Yedek: {yedek}\n\nBundan sonra çekilen, yerine kimse bulunamazsa payını öder (Kural 1.5). İyi maçlar!",
    teams: "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n\n🟡 Sarılar\n{sarilar}\n\n🟠 Turuncular\n{turuncular}\n\nKaybeden tatlıyı alır. İyi maçlar!",
    pay: "💸 Saha ücreti – {gun} {tarih}\nKişi başı: {pay}\n\n{iban}\n\nÖdemeyenler:\n{odemeyenler}\n\n{kapanis}",
    personalPay: "Selam {ad}, halı saha borcun {tutar}.\n{iban}\nTeşekkürler!",
    promoted: "Selam {ad}, {gun} {tarih} {saat} maçında yer açıldı, kadrodasın! ⚽\n📍 {saha}\nGelemeyeceksen hemen haber ver lütfen.",
  },
  en: {
    invite:
      "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n👥 {format} ({sayi}/{kontenjan})\n💰 Per person ~{pay}\n\n{liste}\n\n⏳ Waitlist: {yedek}\n🤔 Maybe: {belki}\n\nIf you're coming, add your name to the list. The squad is fixed 24 hours before kick-off; late cancellations pay their share.",
    squad:
      "✅ Squad confirmed – {gun} {tarih} {saat}\n📍 {saha}\n🗺️ {harita}\n\n{kadro}\n\n⏳ Waitlist: {yedek}\n\nFrom now on, anyone who drops out pays their share unless someone replaces them. Have a good game!",
    teams: "⚽ {gun} {tarih} – {saat}\n📍 {saha}\n🗺️ {harita}\n\n🟡 Yellows\n{sarilar}\n\n🟠 Oranges\n{turuncular}\n\nLosers buy dessert. Have a good game!",
    pay: "💸 Field fee – {gun} {tarih}\nPer person: {pay}\n\n{iban}\n\nNot paid yet:\n{odemeyenler}\n\n{kapanis}",
    personalPay: "Hi {ad}, you owe {tutar} for football.\n{iban}\nThanks!",
    promoted: "Hi {ad}, a spot opened up for {gun} {tarih} {saat} – you're in! ⚽\n📍 {saha}\nIf you can't make it, let me know right away.",
  },
};

/** Her şablonda kullanılabilen yer tutucular (Ayarlar'da gösterilir). */
export const PLACEHOLDERS: Record<TemplateKey, string[]> = {
  invite: ["gun", "tarih", "saat", "saha", "harita", "format", "sayi", "kontenjan", "pay", "liste", "yedek", "belki", "iban"],
  squad: ["gun", "tarih", "saat", "saha", "harita", "format", "sayi", "kadro", "yedek", "pay", "iban"],
  teams: ["gun", "tarih", "saat", "saha", "harita", "sarilar", "turuncular"],
  pay: ["gun", "tarih", "saat", "pay", "iban", "odemeyenler", "kapanis"],
  personalPay: ["ad", "tutar", "iban"],
  promoted: ["ad", "gun", "tarih", "saat", "saha", "harita"],
};

export function templateOf(templates: Partial<Record<TemplateKey, string>>, key: TemplateKey, lang: Lang): string {
  const custom = templates[key];
  return custom && custom.trim() ? custom : DEFAULT_TEMPLATES[lang][key];
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
