/** Oyuncu kartı: maç, G/B/M, gol, katılım, güvenilirlik, performans, ödeme geçmişi, son maçlar. */
import { money, t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import { route } from "../../app/router";
import { esc, pips } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { playerCard } from "../../domain/stats";
import { reliability } from "../../domain/roster";
import { perfRatings } from "../../domain/elo";
import { accounts } from "../../domain/ledger";
import { dayName } from "../../domain/messages";
import { posBadge, subHeader } from "../components";
import { IC } from "../icons";

function tile(label: string, value: string, cls = ""): string {
  return '<div class="tile"><b class="' + cls + '">' + esc(value) + "</b><span>" + esc(label) + "</span></div>";
}

export function viewPlayer(): string {
  const S = store.s;
  const id = route().arg || "";
  const p = S.players.find((x) => x.id === id);
  if (!p) return subHeader(t("playerCard"), "players") + '<section class="section empty"><p>' + esc(t("notFound")) + "</p></section>";
  const card = playerCard(S, id, "");
  const r = card.row;
  const rel = reliability(S)[id];
  const perf = S.settings.perf ? perfRatings(S)[id] : undefined;
  const acc = accounts(S, today()).get(id);
  let h = subHeader(t("playerCard"), "players");
  h += '<section class="section pcard"><div class="pc-head"><div class="minw0"><h2 class="pc-name">' + esc(p.name) + "</h2>" +
    '<div class="meta"><span class="pips">' + pips(p.rating) + "</span>" + posBadge(p) + (p.fixed ? ' <span class="tag fix">' + esc(t("fixedTag")) + "</span>" : "") + (p.active === false ? ' <span class="tag">' + esc(t("passiveTag")) + "</span>" : "") + "</div></div>" +
    '<button type="button" class="btn sm" data-a="editFromCard" data-id="' + esc(id) + '">' + esc(t("edit")) + "</button></div>";
  h += '<div class="tiles">' +
    tile(t("cardMatches"), String(r?.played || 0)) +
    tile(t("cardWdl"), r ? r.w + " / " + r.d + " / " + r.l : "0 / 0 / 0") +
    tile(t("cardGoals"), String(r?.goals || 0)) +
    tile(t("cardRate"), "%" + Math.round((r?.rate || 0) * 100)) +
    tile(t("cardMvp"), String(r?.mvp || 0)) +
    tile(t("cardRel"), rel ? "%" + rel.score : "—", rel && rel.score < 80 ? "neg" : "") +
    (perf ? tile(t("cardPerf"), perf.perf.toLocaleString(S.settings.lang === "en" ? "en-GB" : "tr-TR") + " (" + p.rating + ")") : "") +
    tile(t("cardBalance"), acc ? (acc.owed > 0 ? "−" + money(acc.owed) : acc.credit > 0 ? "+" + money(acc.credit) : money(0)) : money(0), acc && acc.owed > 0 ? "neg" : acc && acc.credit > 0 ? "pos" : "") +
    "</div>";
  if (rel && (rel.late || rel.noshow)) h += '<p class="small muted m0">' + esc(t("relMeta", { s: rel.score, l: rel.late, x: rel.noshow })) + "</p>";
  h += "</section>";
  if (card.recent.length) {
    h += '<section class="section" aria-labelledby="h-recent"><h2 id="h-recent">' + esc(t("recentMatches")) + '</h2><ul class="llist">';
    card.recent.forEach((x) => {
      const res = x.result === "w" ? t("resultW") : x.result === "d" ? t("resultD") : x.result === "l" ? t("resultL") : "";
      const extra = [x.goals ? t("goalsShort", { n: x.goals }) : "", x.mvp ? "★ " + t("mvp") : "", x.noshow ? t("noshowLast") : ""].filter(Boolean).join(" · ");
      h += '<li class="lrow"><span class="res res-' + (x.result || "n") + '" aria-label="' + esc(res) + '">' + esc(res || "–") + '</span><div class="pname"><strong>' + esc(dayName(x.m.date) + " " + ddmm(x.m.date)) + "</strong>" +
        '<span class="meta">' + esc((x.m.score ? x.m.score.a + " – " + x.m.score.b : "") + (x.side ? " · " + (x.side === "a" ? t("teamA") : t("teamB")) : "") + (extra ? " · " + extra : "")) + "</span></div></li>";
    });
    h += "</ul></section>";
  }
  h += '<section class="section" aria-labelledby="h-payh"><h2 id="h-payh">' + esc(t("payHistory")) + "</h2>";
  if (acc && acc.payments.length) {
    h += '<ul class="llist">' + acc.payments.slice().reverse().slice(0, 6).map((pm) => '<li class="lrow"><div class="pname"><strong>' + esc(ddmm(pm.at) + "." + pm.at.slice(0, 4)) + '</strong><span class="meta">' + esc(pm.note || "") + '</span></div><span class="amount pos">' + (pm.amount < 0 ? "−" : "+") + esc(money(Math.abs(pm.amount))) + "</span></li>").join("") + "</ul>";
  } else h += '<p class="muted small">' + esc(t("noAccounts")) + "</p>";
  h += '<button type="button" class="btn block mt-s" data-a="ledger" data-id="' + esc(id) + '">' + IC.wallet + esc(t("openLedger")) + "</button></section>";
  void ui;
  return h;
}
