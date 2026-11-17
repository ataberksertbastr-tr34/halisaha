/**
 * Oyuncu durum sayfası (durum.html#<kimlik>): organizatörün yayınladığı yaklaşan etkinliklerin
 * kadrosunu ve yedek sırasını salt okunur gösterir. Uygulamanın kendisini ve Firebase SDK'sını
 * yüklemez; tek belgeyi oturumsuz okur (firestore.rules: pub/{id} herkese açık okunur).
 * Dakikada bir ve sayfa öne gelince yenilenir.
 */
import "./pub.css";
import { activeConfig, EMULATOR, EMULATOR_HOST } from "../sync/config";
import { firestoreBase, readPub } from "../sync/firestore";
import { validPubId, type PubEvent, type PubName, type PubPage } from "../domain/pubpage";

type Lang = "tr" | "en";
const TXT = {
  tr: {
    sub: "Kadro durumu", loading: "Yükleniyor…", none: "Yaklaşan etkinlik yok.", closed: "Bu sayfa kapalı ya da bağlantı yanlış. Organizatöre sor.",
    offline: "İnternet yok; bağlantı gelince yenilenir.", error: "Sayfa yüklenemedi. Biraz sonra yeniden dene.", refresh: "Yenile",
    squad: "Kadro", wait: "Yedek sırası", maybe: "Belki: {n} kişi", teams: "Takımlar", map: "Haritada aç", guest: "misafir",
    locked: "Kadro kesinleşti", lockAt: "Kadro {d} kesinleşir", left: "{n} kişi eksik", full: "Kadro dolu", going: "{n} kişi",
    updated: "Güncellendi: {d}", how: "Yazılmak ya da çıkmak için organizatöre WhatsApp'tan yaz. Kesinleşmeden sonra çekilen, yerine kimse gelmezse payını öder (Kural {r}).",
    days: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
  },
  en: {
    sub: "Squad status", loading: "Loading…", none: "No upcoming events.", closed: "This page is closed or the link is wrong. Ask the organiser.",
    offline: "No internet; the page refreshes once you are back online.", error: "Could not load the page. Try again shortly.", refresh: "Refresh",
    squad: "Squad", wait: "Waitlist", maybe: "Maybe: {n}", teams: "Teams", map: "Open map", guest: "guest",
    locked: "Squad locked", lockAt: "Squad locks {d}", left: "{n} spots left", full: "Squad full", going: "{n} going",
    updated: "Updated: {d}", how: "To join or drop out, message the organiser on WhatsApp. Dropping out after the lock means paying your share unless someone replaces you (Rule {r}).",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
};

let lang: Lang = "tr";
const tx = (k: Exclude<keyof (typeof TXT)["tr"], "days">, v: Record<string, string | number> = {}) => {
  let s = TXT[lang][k];
  for (const x in v) s = s.split("{" + x + "}").join(String(v[x]));
  return s;
};

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const p2 = (n: number) => String(n).padStart(2, "0");

function day(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return TXT[lang].days[dt.getDay()] + " " + p2(d) + "." + p2(m);
}
function when(ms: number): string {
  const d = new Date(ms);
  return TXT[lang].days[d.getDay()].slice(0, 3) + " " + p2(d.getDate()) + "." + p2(d.getMonth() + 1) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
}
const safeUrl = (u: string) => (/^https:\/\//i.test(u) ? u : "");

function names(list: PubName[]): string {
  return list.map((x) => "<li>" + esc(x.n) + (x.g ? '<span class="pb-g">(' + esc(tx("guest")) + ")</span>" : "") + "</li>").join("");
}

function card(e: PubEvent, now: number): string {
  const locked = !!e.lockAt && now >= e.lockAt;
  const n = e.playing.length;
  const count = e.cap ? n + "/" + e.cap : String(n);
  const sub = e.cap ? (n >= e.cap ? tx("full") : tx("left", { n: e.cap - n })) : tx("going", { n });
  const map = safeUrl(e.map);
  let h = '<article class="pb-card"><h2>' + esc(e.icon + " " + e.title) + '</h2><div class="pb-when">' + esc(day(e.date) + " · " + e.time) + "</div>";
  if (e.venue) h += '<div class="pb-venue">' + esc(e.venue) + (map ? ' · <a href="' + esc(map) + '" target="_blank" rel="noopener">' + esc(tx("map")) + "</a>" : "") + "</div>";
  h += '<div class="pb-status"><span class="pb-count">' + esc(count) + '</span><span class="pb-sub">' + esc(sub) + "</span>" +
    (e.lockAt ? '<span class="pb-chip ' + (locked ? "lock" : "open") + '">' + esc(locked ? tx("locked") : tx("lockAt", { d: when(e.lockAt) })) + "</span>" : "") + "</div>";
  if (e.teams) {
    const team = (t: NonNullable<PubEvent["teams"]>["a"]) => '<div class="pb-team"><b><span class="pb-dot" style="background:' + esc(/^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#999") + '"></span>' + esc(t.name) + "</b><ul>" + t.ids.map((x) => "<li>" + esc(x.n) + "</li>").join("") + "</ul></div>";
    h += "<h3>" + esc(tx("teams")) + '</h3><div class="pb-teams">' + team(e.teams.a) + team(e.teams.b) + "</div>";
  }
  if (n) h += "<h3>" + esc(tx("squad")) + '</h3><ol class="pb-list">' + names(e.playing) + "</ol>";
  if (e.wait.length) h += "<h3>" + esc(tx("wait")) + '</h3><ol class="pb-list">' + names(e.wait) + "</ol>";
  if (e.maybe) h += '<p class="pb-sub">' + esc(tx("maybe", { n: e.maybe })) + "</p>";
  h += '<p class="pb-sub">' + esc(tx("how", { r: e.lockRule })) + "</p>";
  return h + "</article>";
}

const root = () => document.getElementById("pb")!;
function message(text: string): void {
  root().innerHTML = '<p class="pb-msg">' + esc(text) + '</p><p class="pb-foot"><button type="button" class="pb-btn" id="pb-refresh">' + esc(tx("refresh")) + "</button></p>";
}

let busy = false;
async function load(): Promise<void> {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const cfg = activeConfig();
  if (!validPubId(id) || !cfg) return message(tx("closed"));
  if (busy) return;
  busy = true;
  try {
    const doc = await readPub({ projectId: cfg.projectId, apiKey: EMULATOR ? undefined : cfg.apiKey, base: firestoreBase(EMULATOR ? EMULATOR_HOST : undefined) }, id);
    if (!doc) return message(tx("closed"));
    const page = JSON.parse(doc.data) as PubPage;
    lang = page.lang === "en" ? "en" : "tr";
    document.documentElement.lang = lang;
    document.getElementById("pb-sub")!.textContent = tx("sub");
    const now = Date.now();
    root().innerHTML = (page.events.length ? page.events.map((e) => card(e, now)).join("") : '<p class="pb-msg">' + esc(tx("none")) + "</p>") +
      '<p class="pb-foot">' + esc(tx("updated", { d: when(doc.at) })) + '<br><button type="button" class="pb-btn" id="pb-refresh">' + esc(tx("refresh")) + "</button></p>";
  } catch {
    message(navigator.onLine === false ? tx("offline") : tx("error"));
  } finally {
    busy = false;
  }
}

document.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("#pb-refresh")) void load();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void load();
});
window.addEventListener("online", () => void load());
window.addEventListener("hashchange", () => void load());
setInterval(() => {
  if (document.visibilityState === "visible") void load();
}, 60_000);
void load();
