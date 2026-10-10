/** Yeni etkinlik: tür seçimi (Kural 15.1) ve yeni oyun için taraf seçimi. */
import { t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import type { Match } from "../../domain/types";
import { KINDS } from "../../domain/types";
import { esc } from "../../domain/text";
import { KIND_DEFS, L } from "../../domain/kinds";
import { active, getP } from "../../domain/lineup";
import { showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC, type IconKey } from "../icons";

const SUB: Record<string, { tr: string; en: string }> = {
  football: { tr: "Haftalık maç · kadro, takımlar, saha ücreti", en: "Weekly match · squad, teams, field fee" },
  paintball: { tr: "Maske kuralı, brifing, raunt sayacı", en: "Mask rule, briefing, round counter" },
  airsoft: { tr: "Krono, göz koruması, vuruş beyanı", en: "Chrono, eye protection, hit calls" },
  volleyball: { tr: "25-25-15 set tabelası, servis takibi", en: "25-25-15 scoreboard, serve tracking" },
  footvolley: { tr: "Tekli/çiftli/üçlü kura, 15'lik setler", en: "Singles/doubles/triples draw, sets to 15" },
  tabletennis: { tr: "Kazanan kalır sırası, servis sırası", en: "Winner-stays queue, serve order" },
  kiraathane: { tr: "Okey, 101, tavla, batak · masa ve eş kurası", en: "Okey, 101, backgammon, batak · table draw" },
  other: { tr: "Bölüm 15 genel kurallarıyla", en: "With the general rules of Section 15" },
};

export function openNewEvent(): void {
  let h = sheetHead(t("newEventTitle")) + '<p class="small muted tight">' + esc(t("newEventHint")) + '</p><div class="kgrid">';
  for (const k of KINDS) {
    const d = KIND_DEFS[k];
    h += '<button type="button" class="kcard" data-a="createEvent" data-v="' + k + '"><span class="kc-ic">' + (IC[d.icon as IconKey] || IC.ball) + '</span><span class="kc-t">' + esc(L(d.name)) + '</span><span class="kc-s">' + esc(L(SUB[k])) + "</span></button>";
  }
  showModal(h + "</div>");
  void store;
  void today;
}

/** Yeni oyun: kura gruplarından ya da oyunculardan iki taraf seçilir. */
export function openGamePicker(m: Match): void {
  const S = store.s;
  const name = (id: string) => getP(S, m, id)?.name || "?";
  const groups: string[][] = m.draw && m.draw.game === "teams" ? m.draw.groups.filter((g) => g.length === m.draw!.size) : active(S, m).map((id) => [id]);
  if (ui.pickA >= groups.length) ui.pickA = 0;
  if (ui.pickB >= groups.length || ui.pickB === ui.pickA) ui.pickB = ui.pickA === 0 ? 1 : 0;
  const opts = (sel: number) => groups.map((g, i) => '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + esc((m.draw && m.draw.game === "teams" ? t("teamN", { n: i + 1 }) + ": " : "") + g.map(name).join(" & ")) + "</option>").join("");
  showModal(sheetHead(t("newGame")) +
    '<div class="stackf"><label class="fld">' + esc(t("sideA")) + '<select id="gp-a">' + opts(ui.pickA) + "</select></label>" +
    '<label class="fld">' + esc(t("sideB")) + '<select id="gp-b">' + opts(ui.pickB) + "</select></label>" +
    '<label class="fld">' + esc(t("gameLabel")) + '<input type="text" id="gp-label" value="' + esc(t("gameN", { n: m.games.length + 1 })) + '" autocomplete="off"></label>' +
    '<div class="seg2" role="radiogroup" aria-label="' + esc(t("firstServe")) + '"><button type="button" role="radio" class="on" aria-checked="true" data-a="gpServe" data-v="a">' + esc(t("firstServeA")) + '</button><button type="button" role="radio" aria-checked="false" data-a="gpServe" data-v="b">' + esc(t("firstServeB")) + "</button></div>" +
    '<button type="button" class="btn primary block" data-a="createGame">' + IC.scoreboard + esc(t("startGame")) + "</button></div>");
}
