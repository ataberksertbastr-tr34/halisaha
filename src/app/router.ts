/**
 * Hash tabanlı yönlendirme (#/mac, #/takimlar …). GitHub Pages'te sunucu
 * ayarı gerektirmez; Android geri tuşu alt sayfalardan geri döner.
 */
export type Tab = "match" | "teams" | "pay" | "players" | "settings";
export const TABS: Tab[] = ["match", "teams", "pay", "players", "settings"];

export interface Route {
  name: Tab;
  arg?: string;
}

export function parseHash(h: string = location.hash): Route {
  const parts = h.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const name = parts[0] as Tab;
  if (TABS.includes(name)) return { name, arg: parts[1] };
  return { name: "match" };
}

export function hashOf(r: Route): string {
  return "#/" + r.name + (r.arg ? "/" + encodeURIComponent(r.arg) : "");
}

let current: Route = { name: "match" };
export const route = (): Route => current;

/** Sekme geçişi geçmişe yeni kayıt eklemez (geri tuşu uygulamadan çıkar), alt sayfalar ekler. */
export function go(r: Route, push = false): void {
  current = r;
  const h = hashOf(r);
  if (location.hash !== h) {
    if (push) history.pushState(null, "", h);
    else history.replaceState(null, "", h);
  }
}

export function syncFromLocation(): Route {
  current = parseHash();
  return current;
}
