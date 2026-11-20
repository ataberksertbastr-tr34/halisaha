/**
 * Takım görseli ve maç afişi içerikleri. Yalnızca WhatsApp grubunda zaten paylaşılan bilgiler:
 * tarih, saat, saha, takım adı ve rengi, oyuncu adları (kaleci ve misafir işaretli). Seviye,
 * telefon, IBAN, borç ve disiplin yazılmaz. Çizimler src/ui/teamImage.ts ve posterImage.ts'te.
 */
import { t } from "../i18n";
import type { Match, Side, State } from "./types";
import { fieldOf } from "./fields";
import { eventTitle, isFootball, kindOf, L } from "./kinds";
import { dayName } from "./messages";
import { cardNames, longDate, type CardName } from "./squadcard";
import { teamColor, teamName } from "./teamstyle";

export interface TeamSide {
  name: string;
  color: string;
  players: CardName[];
}

export interface TeamCard {
  kicker: string;
  title: string;
  day: string;
  date: string;
  time: string;
  venue: string;
  a: TeamSide;
  b: TeamSide;
  /** İki takımda da oyuncu var mı (görsel ancak o zaman anlamlı) */
  ready: boolean;
  foot: string;
  file: string;
}

function kickerOf(s: State, m: Match): string {
  return isFootball(m) ? L(kindOf(m).name) + " · " + (m.format || s.settings.format) + "+1" : eventTitle(m);
}

export function teamCard(s: State, m: Match): TeamCard {
  const fb = isFootball(m);
  const f = fieldOf(s, m);
  const side = (k: Side): TeamSide => ({ name: teamName(s, k), color: teamColor(s, k), players: cardNames(s, m, m.teams[k], fb) });
  const a = side("a"), b = side("b");
  return {
    kicker: kickerOf(s, m),
    title: t("imgTeams"),
    day: dayName(m.date),
    date: longDate(m.date),
    time: m.time,
    venue: f ? f.name : "",
    a,
    b,
    ready: a.players.length > 0 && b.players.length > 0,
    foot: t("imgTeamsFoot"),
    file: t("imgTeamsFile") + "-" + m.date + ".png",
  };
}

export interface PosterCard {
  /** Slogan: iki satır ve vurgulu son satır */
  lines: [string, string];
  hit: string;
  day: string;
  date: string;
  time: string;
  venue: string;
  file: string;
}

/** Maç afişi (halı saha): logo, gece ışıklı saha, slogan; tarih ve saat maçtan gelir. */
export function posterCard(s: State, m: Match): PosterCard {
  const f = fieldOf(s, m);
  return {
    lines: [t("posterL1"), t("posterL2")],
    hit: t("posterHit"),
    day: dayName(m.date),
    date: longDate(m.date),
    time: m.time,
    venue: f ? f.name : "",
    file: t("posterFile") + "-" + m.date + ".png",
  };
}
