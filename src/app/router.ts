/**
 * Hash tabanlı yönlendirme (#/match, #/stats …). GitHub Pages'te sunucu
 * ayarı gerektirmez. Sekme geçişleri geçmişe kayıt eklemez; alt sayfalar
 * (İstatistikler, Kurallar, Ayarlar, Oyuncu kartı) ekler, böylece Android
 * geri tuşu alt sayfadan geri döner.
 */
export type Tab = "match" | "teams" | "pay" | "players" | "more";
export type RouteName = Tab | "settings" | "stats" | "rules" | "player" | "discipline" | "announce";
export const TABS: Tab[] = ["match", "teams", "pay", "players", "more"];
const ALL: RouteName[] = [...TABS, "settings", "stats", "rules", "player", "discipline", "announce"];

export interface Route {
  name: RouteName;
  arg?: string;
}

/** Alt sayfanın bağlı olduğu sekme (alt çubukta seçili görünür). */
export function tabOf(r: Route): Tab {
  if (r.name === "player") return "players";
  if (r.name === "settings" || r.name === "stats" || r.name === "rules" || r.name === "discipline" || r.name === "announce") return "more";
  return r.name;
}

export function parseHash(h: string = location.hash): Route {
  const parts = h.replace(/^#\/?/, "").split("/").filter(Boolean).map((x) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  });
  const name = parts[0] as RouteName;
  if (ALL.includes(name)) return { name, arg: parts[1] };
  return { name: "match" };
}

export function hashOf(r: Route): string {
  return "#/" + r.name + (r.arg ? "/" + encodeURIComponent(r.arg) : "");
}

let current: Route = { name: "match" };
export const route = (): Route => current;

/** push=true: geçmişe yeni kayıt (alt sayfa); aksi halde yerine yazar (sekme). */
export function go(r: Route, push = false): void {
  current = r;
  const h = hashOf(r);
  if (location.hash !== h) {
    if (push) history.pushState({ sub: true }, "", h);
    else history.replaceState(null, "", h);
  }
}

/** Alt sayfadan geri: geçmişte bizim kaydımız varsa geri git, yoksa bağlı sekmeye. */
export function back(fallback: Route, rerender: () => void): void {
  if (history.state && (history.state as { sub?: boolean }).sub) history.back();
  else {
    go(fallback);
    rerender();
  }
}

export function syncFromLocation(): Route {
  current = parseHash();
  return current;
}
