/** Uygulama kabuğu: üst bölüm (sıradaki maç), alt sekme çubuğu ve görünüm seçimi. */
import { t, type MsgKey } from "../i18n";
import { store, today, ui, type FilterKey } from "../app/store";
import { route, type Tab } from "../app/router";
import { esc } from "../domain/text";
import { ddmm } from "../domain/dates";
import { fieldOf } from "../domain/fields";
import { capOf, currentMatch, lineup } from "../domain/lineup";
import { dayName } from "../domain/messages";
import { applyFilter } from "./components";
import { IC } from "./icons";
import { viewMatch } from "./views/match";
import { viewTeams } from "./views/teams";
import { viewPay } from "./views/pay";
import { viewPlayers } from "./views/players";
import { viewSettings } from "./views/settings";

const VIEWS: Record<Tab, () => string> = { match: viewMatch, teams: viewTeams, pay: viewPay, players: viewPlayers, settings: viewSettings };

const TAB_ITEMS: [Tab, MsgKey, keyof typeof IC][] = [
  ["match", "tabMatch", "match"], ["teams", "tabTeams", "teams"], ["pay", "tabPay", "pay"], ["players", "tabPlayers", "players"], ["settings", "tabSettings", "settings"],
];

export function applyTheme(): void {
  const th = store.s.settings.theme;
  const root = document.documentElement;
  if (th === "light" || th === "dark") root.dataset.theme = th;
  else delete root.dataset.theme;
  const dark = th === "dark" || (th === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((mt) => {
    mt.content = dark ? "#0C1812" : "#1E6A42";
    mt.removeAttribute("media");
  });
}

export function renderApp(): void {
  document.documentElement.lang = store.s.settings.lang;
  document.title = t("appName");
  applyTheme();
  renderHero();
  renderTabs();
  const r = route();
  const view = document.getElementById("view")!;
  view.innerHTML = (VIEWS[r.name] || viewMatch)();
  (Object.keys(ui.f) as FilterKey[]).forEach(applyFilter);
  if (ui.refocus) {
    const el = document.getElementById(ui.refocus);
    if (el) el.focus({ preventScroll: true });
    ui.refocus = null;
  }
}

function renderHero(): void {
  const S = store.s;
  const m = currentMatch(S, ui.matchId, today());
  let h = '<div class="hero-in"><div class="brand"><span class="brand-name">' + esc(t("appName")) + '</span><span class="sync" id="sync">' + esc(t("syncLocal")) + "</span></div>";
  if (m) {
    const { playing } = lineup(S, m);
    const c = capOf(S, m);
    const left = c - playing.length;
    const f = fieldOf(S, m);
    h += '<div class="hero-main"><div class="minw0"><div class="hero-kicker">' + esc(t("nextMatch")) + "</div>" +
      '<div class="hero-day">' + esc(dayName(m.date)) + " " + esc(m.time) + "</div>" +
      '<div class="hero-sub">' + esc(ddmm(m.date)) + (f ? ", " + esc(f.name) : "") + "</div></div>" +
      '<div class="hero-count"><b>' + playing.length + "/" + c + "</b><span>" + esc(left > 0 ? t("spotsLeft", { n: left }) : t("fullSquad")) + "</span></div></div>";
  } else h += '<div class="hero-empty">' + esc(t("noMatch")) + "</div>";
  document.getElementById("hero")!.innerHTML = h + "</div>";
}

function renderTabs(): void {
  const cur = route().name;
  document.getElementById("tabs")!.innerHTML = '<div class="tabs-in">' + TAB_ITEMS.map(([k, l, ic]) =>
    '<button type="button" class="tab' + (cur === k ? " on" : "") + '" data-a="tab" data-v="' + k + '"' + (cur === k ? ' aria-current="page"' : "") + '><span class="ti">' + IC[ic] + "</span><span>" + esc(t(l)) + "</span></button>").join("") + "</div>";
}
