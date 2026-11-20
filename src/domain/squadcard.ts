/**
 * Kadro görseli (paylaşılabilir PNG) için içerik: tarih, saat, saha, numaralı kadro, boş yerler,
 * yedek sırası ve kesinleşme durumu (Kural 1.3, 1.4, 15.3). Çizim src/ui/squadImage.ts'te; burada
 * yalnızca ne yazılacağı belirlenir. Yalnızca WhatsApp grubunda zaten paylaşılan bilgiler yer alır:
 * telefon, IBAN, seviye, borç ve disiplin yazılmaz.
 */
import { lang, MONTHS, t } from "../i18n";
import type { Match, State } from "./types";
import { capOf, getP, isGK, isGuest, lineup } from "./lineup";
import { fieldOf } from "./fields";
import { eventTitle, isFootball, kindOf, L } from "./kinds";
import { isLocked, lockAt } from "./roster";
import { dayName, dayShort } from "./messages";
import { iso } from "./dates";

export interface CardName {
  n: string;
  /** Kaleci (yalnızca halı saha) */
  gk?: true;
  /** Misafir (Kural 1.8) */
  guest?: true;
}

export interface SquadCard {
  /** Küçük üst satır: "HALI SAHA · 7+1" ya da etkinlikte "KADRO" */
  kicker: string;
  /** Büyük başlık: "KADRO" ya da etkinliğin adı */
  title: string;
  day: string;
  /** "15 Ekim" */
  date: string;
  time: string;
  venue: string;
  /** Kontenjan (0 = sınırsız) */
  cap: number;
  /** "12/16" ya da "12 kişi" */
  count: string;
  /** "4 kişi eksik" / "Kadro tam" (kontenjan yoksa boş) */
  status: string;
  full: boolean;
  locked: boolean;
  /** Kesinleşme satırı (kesinleşme yoksa boş) */
  lockLine: string;
  playing: CardName[];
  /** Kontenjana kadar kalan boş yer */
  open: number;
  wait: CardName[];
  maybe: number;
  /** Paylaşılan dosyanın adı */
  file: string;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** Görsele yazılacak adlar: yalnızca ad, kaleci (halı saha) ve misafir işareti. */
export function cardNames(s: State, m: Match, ids: string[], fb: boolean): CardName[] {
  const out: CardName[] = [];
  for (const id of ids) {
    const p = getP(s, m, id);
    if (!p || !p.name) continue;
    const c: CardName = { n: p.name };
    if (fb && isGK(p)) c.gk = true;
    if (isGuest(s, id)) c.guest = true;
    out.push(c);
  }
  return out;
}

/** "15 Ekim" */
export function longDate(date: string): string {
  const [, mo, d] = date.split("-").map(Number);
  return d + " " + MONTHS[lang()][mo - 1];
}

function lockLineOf(m: Match, now: Date, fb: boolean): { locked: boolean; line: string } {
  const r = fb ? "1.4" : "15.3";
  const at = lockAt(m);
  if (!at) return { locked: false, line: "" };
  if (isLocked(m, now)) return { locked: true, line: t("imgLocked", { r }) };
  const when = dayShort(iso(at)) + " " + p2(at.getHours()) + ":" + p2(at.getMinutes());
  return { locked: false, line: t("imgLockAt", { d: when, r }) };
}

export function squadCard(s: State, m: Match, now: Date): SquadCard {
  const fb = isFootball(m);
  const k = kindOf(m);
  const { playing, wait } = lineup(s, m);
  const cap = capOf(s, m);
  const f = fieldOf(s, m);
  const lk = lockLineOf(m, now, fb);
  const n = playing.length;
  const full = !!cap && n >= cap;
  return {
    kicker: fb ? L(k.name) + " · " + (m.format || s.settings.format) + "+1" : t("imgSquad"),
    title: fb && !m.title ? t("imgSquad") : eventTitle(m),
    day: dayName(m.date),
    date: longDate(m.date),
    time: m.time,
    venue: f ? f.name : "",
    cap,
    count: cap ? n + "/" + cap : t("peopleN", { n }),
    status: !cap ? "" : full ? t("imgFull") : t("imgMissing", { n: cap - n }),
    full,
    locked: lk.locked,
    lockLine: lk.line,
    playing: cardNames(s, m, playing, fb),
    open: cap ? Math.max(0, cap - n) : 0,
    wait: cardNames(s, m, wait, fb),
    maybe: Object.keys(m.att).filter((id) => m.att[id] === "maybe" && getP(s, m, id)).length,
    file: t("imgFile") + "-" + m.date + ".png",
  };
}

/** Görseldeki satır sayısı ve sütun düzeni: kadro + boş yerler, iki sütun, önce sol sütun dolar. */
export function gridOf(card: SquadCard): { slots: number; rows: number } {
  const slots = card.playing.length + card.open;
  return { slots, rows: Math.ceil(slots / 2) };
}
