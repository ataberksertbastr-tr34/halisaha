/** Oyuncular sekmesi: ekleme, toplu ekleme, düzenleme, aktif/pasif, silme. */
import { money, t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import { esc, norm, pips, trSort } from "../../domain/text";
import { debtMap } from "../../domain/money";
import { computeStats } from "../../domain/stats";
import { filterBar, posBadge, posOptions } from "../components";

export function viewPlayers(): string {
  const S = store.s;
  let h = '<section class="section" aria-labelledby="h-add"><h2 id="h-add">' + esc(t("addPlayer")) + '</h2><div class="row add-row">' +
    '<input type="text" id="newName" placeholder="' + esc(t("name")) + '" aria-label="' + esc(t("name")) + '" autocomplete="off" enterkeyhint="done">' +
    '<select id="newPos" aria-label="' + esc(t("position")) + '">' + posOptions("") + "</select>" +
    '<select id="newRate" aria-label="' + esc(t("rating")) + '">' + [1, 2, 3, 4, 5].map((r) => '<option value="' + r + '"' + (r === 3 ? " selected" : "") + ">" + esc(t("rating")) + " " + r + "</option>").join("") + "</select>" +
    '<button type="button" class="btn primary" data-a="addPlayer">' + esc(t("add")) + "</button></div>" +
    '<details class="mt"><summary>' + esc(t("bulkAdd")) + '</summary><p class="small muted">' + esc(t("bulkHint")) + '</p><textarea id="bulk" aria-label="' + esc(t("bulkAdd")) + '"></textarea><button type="button" class="btn mt-s" data-a="bulkAdd">' + esc(t("addAll")) + "</button></details></section>";
  if (!S.players.length) return h;
  const dm = debtMap(S, today()), stats = computeStats(S);
  const list = S.players.slice().sort((a, b) => Number(a.active === false) - Number(b.active === false) || trSort(a, b));
  h += '<section class="section" aria-labelledby="h-roster"><h2 id="h-roster">' + esc(t("roster")) + " (" + S.players.filter((p) => p.active !== false).length + ")</h2>" + filterBar("roster", false) + '<ul class="plist" id="list-roster">';
  list.forEach((p) => {
    const s = stats[p.id] || { p: 0, w: 0, d: 0, l: 0 };
    let meta = t("gamesN", { n: s.p });
    if (s.w || s.d || s.l) meta += ", " + t("wdl", { w: s.w, d: s.d, l: s.l });
    if (dm[p.id]) meta += ", " + t("owes", { a: money(dm[p.id]) });
    const open = ui.editId === p.id;
    h += '<li class="prow' + (p.active === false ? " passive" : "") + '" data-n="' + esc(norm(p.name)) + '" data-p="' + esc(p.pos || "") + '"><div class="pmain"><div class="pname"><strong>' + esc(p.name) + '</strong><span class="meta"><span class="pips">' + pips(p.rating) + "</span>" + posBadge(p) +
      (p.active === false ? ' <span class="tag">' + esc(t("passiveTag")) + "</span>" : "") + " " + esc(meta) + "</span></div>" +
      '<button type="button" class="btn sm' + (open ? " primary" : "") + '" data-a="editP" data-id="' + esc(p.id) + '" aria-expanded="' + open + '">' + esc(open ? t("done") : t("edit")) + "</button></div>";
    if (open) {
      const r = p.rating || 3;
      h += '<div class="editor"><label class="fld">' + esc(t("name")) + '<input type="text" data-f="p.name" data-id="' + esc(p.id) + '" value="' + esc(p.name) + '"></label>' +
        '<div class="grid2"><label class="fld">' + esc(t("position")) + '<select data-f="p.pos" data-id="' + esc(p.id) + '">' + posOptions(p.pos || "") + "</select></label>" +
        '<label class="fld">' + esc(t("phone")) + '<input type="tel" data-f="p.phone" data-id="' + esc(p.id) + '" value="' + esc(p.phone || "") + '" placeholder="05xx xxx xx xx" autocomplete="off"></label></div>' +
        '<div><div class="lbl">' + esc(t("rating")) + '</div><div class="seg rate" role="group" aria-label="' + esc(t("rating")) + '">' +
        [1, 2, 3, 4, 5].map((v) => '<button type="button" data-a="rate" data-id="' + esc(p.id) + '" data-v="' + v + '" class="' + (r === v ? "on" : "") + '" aria-pressed="' + (r === v) + '">' + v + "</button>").join("") + "</div></div>" +
        '<div class="row"><button type="button" class="btn sm" data-a="active" data-id="' + esc(p.id) + '">' + esc(p.active === false ? t("active") : t("passive")) + '</button><button type="button" class="btn sm danger" data-a="delPlayer" data-id="' + esc(p.id) + '">' + esc(t("del")) + "</button></div></div>";
    }
    h += "</li>";
  });
  return h + '</ul><p class="none-msg" id="none-roster" hidden>' + esc(t("noResults")) + "</p></section>";
}
