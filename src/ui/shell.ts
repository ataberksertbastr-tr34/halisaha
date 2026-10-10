/** Uygulama kabuğu: üst bölüm (sıradaki maç), alt sekme çubuğu ve görünüm seçimi. */
import { t, type MsgKey } from "../i18n";
import { store, today, ui, type FilterKey } from "../app/store";
import { route, tabOf, type RouteName, type Tab } from "../app/router";
import { esc } from "../domain/text";
import { ddmm } from "../domain/dates";
import { fieldOf } from "../domain/fields";
import { capOf, currentMatch, lineup } from "../domain/lineup";
import { dayName } from "../domain/messages";
import { isLocked } from "../domain/roster";
import { eventTitle, isFootball, kindOf } from "../domain/kinds";
import { onColor, teamColor } from "../domain/teamstyle";
import { prepHeroChip } from "./views/prep";
import { viewDiscipline } from "./views/discipline";
import { viewAnnounce } from "./views/announce";
import type { IconKey } from "./icons";
import { applyFilter } from "./components";
import { renderBanners } from "./banner";
import { pwa } from "../pwa/register";
import { IC } from "./icons";
import { viewMatch } from "./views/match";
import { viewTeams } from "./views/teams";
import { viewPay } from "./views/pay";
import { viewPlayers } from "./views/players";
import { viewSettings } from "./views/settings";
import { viewMore } from "./views/more";
import { viewStats } from "./views/stats";
import { viewPlayer } from "./views/player";
import { viewRules } from "./views/rules";
import { syncChip } from "./views/sync";

const VIEWS: Partial<Record<RouteName, () => string>> = {
  match: viewMatch, teams: viewTeams, pay: viewPay, players: viewPlayers, more: viewMore,
  settings: viewSettings, stats: viewStats, player: viewPlayer, rules: viewRules, discipline: viewDiscipline, announce: viewAnnounce,
};

const TAB_ITEMS: [Tab, MsgKey, keyof typeof IC][] = [
  ["match", "tabMatch", "match"], ["teams", "tabTeams", "teams"], ["pay", "tabPay", "pay"], ["players", "tabPlayers", "players"], ["more", "tabMore", "more"],
];

export function applyTheme(): void {
  const th = store.s.settings.theme;
  const root = document.documentElement;
  if (th === "light" || th === "dark") root.dataset.theme = th;
  else delete root.dataset.theme;
  // Üst bölüm her iki temada da gece siyahı: tarayıcı çubuğu da öyle.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((mt) => {
    mt.content = "#13161C";
    mt.removeAttribute("media");
  });
  // Takım yelek renkleri (ayarlardan): düğmeler, saha, skor tabelası
  const S = store.s;
  const a = teamColor(S, "a"), b = teamColor(S, "b");
  root.style.setProperty("--bibA", a);
  root.style.setProperty("--bibB", b);
  root.style.setProperty("--on-bibA", onColor(a));
  root.style.setProperty("--on-bibB", onColor(b));
}

export function renderApp(): void {
  document.documentElement.lang = store.s.settings.lang;
  document.title = t("appName");
  applyTheme();
  renderHero();
  renderBanners();
  renderTabs();
  const r = route();
  const view = document.getElementById("view")!;
  view.innerHTML = (VIEWS[r.name] || viewMatch)();
  document.body.dataset.route = r.name;
  (Object.keys(ui.f) as FilterKey[]).forEach(applyFilter);
  if (r.name === "rules" && r.arg) document.getElementById("rule-" + r.arg)?.scrollIntoView({ block: /^(s|p|ek)/.test(r.arg) ? "start" : "center" });
  if (ui.refocus) {
    const el = document.getElementById(ui.refocus);
    if (el) el.focus({ preventScroll: true });
    ui.refocus = null;
  }
}

function renderHero(): void {
  const S = store.s;
  const m = currentMatch(S, ui.matchId, today());
  let h = '<div class="hero-in"><img class="hero-crest" src="brand/crest.webp" width="321" height="360" alt="" aria-hidden="true" decoding="async"><div class="brand"><span class="brand-name">Predators<small>' + esc(t("organizer")) + '</small></span><span class="brand-acts">' + heroStatus() + "</span></div>";
  if (m) {
    const fb = isFootball(m);
    const k = kindOf(m);
    const { playing } = lineup(S, m);
    const c = capOf(S, m);
    const left = c - playing.length;
    const f = fieldOf(S, m);
    const kicker = fb ? t("nextMatch") : eventTitle(m);
    h += '<div class="hero-main"><div class="minw0"><div class="hero-kicker">' + (IC[k.icon as IconKey] || IC.ball) + "<span>" + esc(kicker) + "</span></div>" +
      '<div class="hero-day">' + esc(dayName(m.date)) + " " + esc(m.time) + "</div>" +
      '<div class="hero-sub">' + esc(ddmm(m.date)) + (f ? ", " + esc(f.name) : "") + "</div>" +
      '<div class="hero-count"><b>' + playing.length + (c ? "/" + c : "") + "</b><span>" + esc(c ? (left > 0 ? t("spotsLeft", { n: left }) : t("fullSquad")) : t("going")) + "</span></div></div></div>";
    const chips: string[] = [];
    if (isLocked(m, new Date())) chips.push('<span class="hero-chip locked">' + IC.lock + esc(t("locked")) + "</span>");
    chips.push('<span class="hero-chip' + (m.reserved ? "" : " warn") + '">' + (m.reserved ? IC.check : IC.alert) + esc(m.reserved ? t("reserved") : t("notReserved")) + "</span>");
    if (!fb || kindOf(m).agree.length) chips.push(prepHeroChip(m));
    h += '<div class="hero-chips">' + chips.join("") + "</div>";
  } else h += '<div class="hero-empty">' + esc(t("noEvent")) + "</div>";
  document.getElementById("hero")!.innerHTML = h + "</div>";
}

/** Sağ üst köşe: çevrimdışı durumu ve (destekleniyorsa) "Yükle" düğmesi. */
export function heroStatus(): string {
  let h = syncChip();
  if (pwa.canInstall()) h += '<button type="button" class="herobtn" data-a="install">' + IC.install + esc(t("install")) + "</button>";
  return h;
}

export function refreshHeroStatus(): void {
  const el = document.querySelector("#hero .brand-acts");
  if (el) el.innerHTML = heroStatus();
}

function renderTabs(): void {
  const cur = tabOf(route());
  document.getElementById("tabs")!.innerHTML = '<div class="tabs-in">' + TAB_ITEMS.map(([k, l, ic]) =>
    '<button type="button" class="tab' + (cur === k ? " on" : "") + '" data-a="tab" data-v="' + k + '"' + (cur === k ? ' aria-current="page"' : "") + '><span class="ti">' + IC[ic] + "</span><span>" + esc(t(l)) + "</span></button>").join("") + "</div>";
}
