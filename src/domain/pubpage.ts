/**
 * Oyuncu durum sayfası (salt okunur): yaklaşan etkinliklerin kadrosu, yedek sırası ve paylaşılmış
 * takımlar. Organizatör Ayarlar'dan açarsa kendi Firebase projesinde herkesin okuyabildiği tek bir
 * belgeye yazılır; oyuncular tahmin edilemeyen bir bağlantıyla görür. Yalnızca WhatsApp grubunda
 * zaten paylaşılan bilgiler yer alır: telefon, IBAN, seviye, borç, disiplin ve misafiri getiren yazılmaz.
 */
import type { Lang } from "../i18n";
import type { Match, State } from "./types";
import { addDays, matchStart } from "./dates";
import { capOf, getP, isGuest, lineup } from "./lineup";
import { eventTitle, isFootball, kindOf, L } from "./kinds";
import { fieldOf, mapsUrl } from "./fields";
import { lockAt } from "./roster";
import { teamColor, teamName } from "./teamstyle";
import { teamsSig } from "./todo";

/** Sayfada gösterilen etkinlik sayısı ve ne kadar ileriye bakılacağı. */
export const PUB_EVENTS = 3;
export const PUB_DAYS = 14;

export interface PubName {
  n: string;
  /** Misafir */
  g?: 1;
}

export interface PubTeam {
  name: string;
  color: string;
  ids: PubName[];
}

export interface PubEvent {
  /** Etkinlik türünün emojisi */
  icon: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  map: string;
  /** Kontenjan (0 = sınırsız) */
  cap: number;
  /** Kadronun kesinleşme anı (ms; yoksa 0) ve kuralı */
  lockAt: number;
  lockRule: string;
  playing: PubName[];
  wait: PubName[];
  maybe: number;
  /** Organizatör takımları paylaştıysa (paylaşıldığı gibi) */
  teams?: { a: PubTeam; b: PubTeam };
}

export interface PubPage {
  v: 1;
  lang: Lang;
  events: PubEvent[];
}

/** Rastgele, tahmin edilemeyen sayfa kimliği (24 karakter). */
export function newPubId(rnd: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(rnd(24), (b) => abc[b % abc.length]).join("");
}

/** Sayfa kimliği geçerli mi (bağlantıdan okunurken ve kurallarda aynı biçim). */
export const validPubId = (id: string): boolean => /^[a-z0-9]{20,40}$/.test(id);

function names(s: State, m: Match, ids: string[]): PubName[] {
  return ids.map((id) => {
    const n = getP(s, m, id)?.name || "";
    return isGuest(s, id) ? { n, g: 1 as const } : { n };
  }).filter((x) => x.n);
}

/** Takımlar yalnızca organizatör paylaştıysa ve paylaşıldığı gibi duruyorsa yayınlanır. */
function sharedTeams(s: State, m: Match): PubEvent["teams"] {
  if (!m.sent.teams || !m.teams.a.length || !m.teams.b.length) return undefined;
  if (m.sent.teamsSig !== teamsSig(m)) return undefined;
  const side = (k: "a" | "b"): PubTeam => ({ name: teamName(s, k), color: teamColor(s, k), ids: names(s, m, m.teams[k]) });
  return { a: side("a"), b: side("b") };
}

function eventOf(s: State, m: Match): PubEvent {
  const { playing, wait } = lineup(s, m);
  const f = fieldOf(s, m);
  const fb = isFootball(m);
  const e: PubEvent = {
    icon: kindOf(m).emoji,
    title: fb && !m.title ? L(kindOf(m).name) : eventTitle(m),
    date: m.date,
    time: m.time,
    venue: f ? f.name : "",
    map: mapsUrl(f),
    cap: capOf(s, m),
    lockAt: lockAt(m)?.getTime() || 0,
    lockRule: fb ? "1.4" : "15.3",
    playing: names(s, m, playing),
    wait: names(s, m, wait),
    maybe: Object.keys(m.att).filter((id) => m.att[id] === "maybe" && getP(s, m, id)).length,
  };
  const teams = sharedTeams(s, m);
  if (teams) e.teams = teams;
  return e;
}

/** Yayınlanacak sayfa: bugünden itibaren 14 gün içindeki ilk üç açık etkinlik. */
export function pubSnapshot(s: State, now: Date, today: string): PubPage {
  const until = addDays(today, PUB_DAYS);
  const events = s.matches
    .filter((m) => m.status === "open" && m.date >= today && m.date <= until && matchStart(m.date, m.time).getTime() > now.getTime() - 3 * 60 * 60 * 1000)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, PUB_EVENTS)
    .map((m) => eventOf(s, m));
  return { v: 1, lang: s.settings.lang, events };
}
