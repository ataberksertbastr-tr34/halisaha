/**
 * Ekranın üstündeki kalıcı uyarı şeritleri (yeni sürüm, yedek hatırlatması …).
 * Her sağlayıcı ya HTML ya da boş metin döndürür.
 */
import { storageMode } from "../data/persist";
import { route, type RouteName } from "../app/router";

type Provider = () => string;
const providers: { p: Provider; only?: RouteName[] }[] = [];

/**
 * Şerit ekler. only verilirse yalnızca o sayfalarda görünür: maçla ilgili iş şeritleri (saha
 * rezervasyonu, sonuç) Etkinlik'te iş listesinin yanında durur, Kurallar ya da Ayarlar'da
 * ekranın üstünü kaplamaz. Güncelleme, eşitleme, depolama ve yedek uyarıları her sayfada.
 */
export function addBanner(p: Provider, only?: RouteName[]): void {
  providers.push({ p, only });
}

export function renderBanners(): void {
  if (storageMode() === "blocked") return;
  const el = document.getElementById("banner");
  if (!el) return;
  const here = route().name;
  const html = providers.filter((x) => !x.only || x.only.includes(here)).map((x) => x.p()).filter(Boolean).join("");
  if (el.innerHTML !== html) el.innerHTML = html;
}

export function bannerHTML(opts: { icon: string; title: string; text?: string; actions: string; tone?: "info" | "warn" }): string {
  return '<div class="banner ' + (opts.tone || "info") + '" role="status"><div class="banner-ic" aria-hidden="true">' + opts.icon + '</div><div class="banner-tx"><strong>' + opts.title + "</strong>" +
    (opts.text ? "<span>" + opts.text + "</span>" : "") + '</div><div class="banner-acts">' + opts.actions + "</div></div>";
}
