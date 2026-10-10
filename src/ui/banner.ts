/**
 * Ekranın üstündeki kalıcı uyarı şeritleri (yeni sürüm, yedek hatırlatması …).
 * Her sağlayıcı ya HTML ya da boş metin döndürür.
 */
type Provider = () => string;
const providers: Provider[] = [];

export function addBanner(p: Provider): void {
  providers.push(p);
}

export function renderBanners(): void {
  const el = document.getElementById("banner");
  if (!el) return;
  const html = providers.map((p) => p()).filter(Boolean).join("");
  if (el.innerHTML !== html) el.innerHTML = html;
}

export function bannerHTML(opts: { icon: string; title: string; text?: string; actions: string; tone?: "info" | "warn" }): string {
  return '<div class="banner ' + (opts.tone || "info") + '" role="status"><div class="banner-ic" aria-hidden="true">' + opts.icon + '</div><div class="banner-tx"><strong>' + opts.title + "</strong>" +
    (opts.text ? "<span>" + opts.text + "</span>" : "") + '</div><div class="banner-acts">' + opts.actions + "</div></div>";
}
