/** Görünümlerin paylaştığı küçük HTML parçaları. */
import { t, type MsgKey } from "../i18n";
import { store, ui, type FilterKey } from "../app/store";
import type { Field, Match, Person } from "../domain/types";
import { POSITIONS } from "../domain/types";
import { esc, norm, trSort } from "../domain/text";
import { ddmm } from "../domain/dates";
import { dirUrl, mapsUrl, telHref } from "../domain/fields";
import { dayName } from "../domain/messages";
import { openMatches } from "../domain/lineup";
import { eventTitle, isFootball, kindOf, L } from "../domain/kinds";
import { IC, type IconKey } from "./icons";

/** Etkinlik türünün ikonu. */
export function kindIcon(m: Pick<Match, "kind"> | null | undefined): string {
  return IC[(kindOf(m).icon as IconKey) || "ball"] || IC.ball;
}

/** Kural numarası rozeti: dokununca kurallarda o maddeye gider. */
export function ruleChip(rule: string): string {
  if (!rule) return "";
  return '<button type="button" class="rchip" data-a="nav" data-v="rules" data-id="' + esc(rule) + '" aria-label="' + esc(t("ruleN", { n: rule })) + '">' + esc(rule) + "</button>";
}

export const posKey = (p: string) => ("pos" + p) as MsgKey;
export const posShort = (p: string) => ("s" + p) as MsgKey;

export function posBadge(p: Person | null | undefined): string {
  return p && p.pos ? '<span class="pos pos-' + p.pos + '" title="' + esc(t(posKey(p.pos))) + '">' + esc(t(posShort(p.pos))) + "</span>" : "";
}

export function posOptions(sel: string): string {
  return '<option value="">' + esc(t("posNone")) + "</option>" + POSITIONS.map((p) => '<option value="' + p + '"' + (sel === p ? " selected" : "") + ">" + esc(t(posKey(p))) + "</option>").join("");
}

function fchip(key: FilterKey, type: "pos" | "st", v: string, label: string): string {
  const on = (ui.f[key][type] || "") === v;
  return '<button type="button" class="fchip' + (on ? " on" : "") + '" data-a="flt" data-k="' + key + '" data-t="' + type + '" data-v="' + v + '" aria-pressed="' + on + '">' + esc(label) + "</button>";
}

/** Arama kutusu + mevki (ve isteğe bağlı durum) filtreleri; liste kaydırılırken üstte yapışık kalır. */
export function filterBar(key: FilterKey, withStatus: boolean, withPos = true): string {
  const f = ui.f[key];
  let h = '<div class="finder"><div class="search">' + IC.search +
    '<input type="search" id="q-' + key + '" data-q="' + key + '" placeholder="' + esc(t("search")) + '" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search" aria-label="' + esc(t("search")) + '">' +
    '<button type="button" class="clr" data-a="clearQ" data-k="' + key + '" aria-label="' + esc(t("close")) + '"' + (f.q ? "" : " hidden") + ">" + IC.close + "</button></div>";
  h += '<div class="filters">';
  if (withStatus) {
    const st: [string, MsgKey][] = [["", "all"], ["in", "statusIn"], ["maybe", "maybe"], ["none", "statusNone"], ["out", "statusOut"]];
    h += st.map(([v, l]) => fchip(key, "st", v, t(l))).join("") + (withPos ? '<span class="fsep" aria-hidden="true"></span>' : "");
  }
  if (withPos) h += fchip(key, "pos", "", t("allPos")) + POSITIONS.map((p) => fchip(key, "pos", p, t(posKey(p)))).join("");
  return h + "</div></div>";
}

/** Filtreyi yeniden çizmeden uygular (yazarken klavye kapanmasın diye). */
export function applyFilter(key: FilterKey): void {
  const box = document.getElementById("list-" + key);
  if (!box) return;
  const f = ui.f[key];
  const q = norm(f.q);
  let shown = 0;
  box.querySelectorAll<HTMLElement>("[data-n]").forEach((r) => {
    const ok = (!q || (r.dataset.n || "").indexOf(q) >= 0) && (!f.pos || r.dataset.p === f.pos) && (!f.st || r.dataset.s === f.st);
    r.hidden = !ok;
    if (ok) shown++;
  });
  const none = document.getElementById("none-" + key);
  if (none) none.hidden = shown > 0;
  document.querySelectorAll<HTMLElement>('[data-a="flt"][data-k="' + key + '"]').forEach((c) => {
    const on = ((f as unknown as Record<string, string>)[c.dataset.t || ""] || "") === c.dataset.v;
    c.classList.toggle("on", on);
    c.setAttribute("aria-pressed", String(on));
  });
  const clr = document.querySelector<HTMLElement>('[data-a="clearQ"][data-k="' + key + '"]');
  if (clr) clr.hidden = !f.q;
}

export function matchLabel(m: Match): string {
  return dayName(m.date).slice(0, 3) + " " + ddmm(m.date);
}

/** Seçim listelerinde etkinlik adı: "Sal 13.10 21:00 · Paintball" */
export function eventOption(m: Match): string {
  return dayName(m.date) + " " + ddmm(m.date) + " " + m.time + (isFootball(m) && !m.title ? "" : " · " + eventTitle(m));
}

export function matchChips(selId: string): string {
  const list = openMatches(store.s);
  return '<div class="chips" role="group" aria-label="' + esc(t("matchSel")) + '">' + list.map((m) => {
    const label = matchLabel(m) + (isFootball(m) ? "" : " · " + (m.title || L(kindOf(m).short)));
    return '<button type="button" aria-pressed="' + (m.id === selId) + '" class="chip' + (m.id === selId ? " on" : "") + '" data-a="selMatch" data-id="' + esc(m.id) + '">' + (isFootball(m) ? "" : kindIcon(m)) + esc(label) + "</button>";
  }).join("") +
    '<button type="button" class="chip add" data-a="newEvent">+ ' + esc(t("newEvent")) + "</button></div>";
}

export function fieldCard(f: (Partial<Field> & { name: string }) | null, editable: boolean): string {
  if (!f) return "";
  const map = mapsUrl(f), dir = dirUrl(f), ph = telHref(f.phone);
  const loc = f.address || (f.lat != null ? f.lat + ", " + f.lng : t("locNone"));
  let h = '<div class="fieldcard"><strong>' + IC.map + " " + esc(f.name) + '</strong><div class="addr">' + esc(loc) + '</div><div class="row">';
  if (map) h += '<a class="btn sm" href="' + esc(map) + '" target="_blank" rel="noopener">' + esc(t("openMap")) + "</a>";
  if (dir) h += '<a class="btn sm" href="' + esc(dir) + '" target="_blank" rel="noopener">' + esc(t("directions")) + "</a>";
  if (ph) h += '<a class="btn sm" href="tel:' + esc(ph) + '">' + esc(t("call")) + "</a>";
  if (editable && f.id) h += '<button type="button" class="btn sm ghost" data-a="editField" data-id="' + esc(f.id) + '">' + esc(t("edit")) + "</button>";
  return h + "</div></div>";
}

export function fieldOptions(sel: string): string {
  return '<option value="">' + esc(t("noField")) + "</option>" +
    store.s.fields.slice().sort(trSort).map((f) => '<option value="' + esc(f.id) + '"' + (f.id === sel ? " selected" : "") + ">" + esc(f.name) + "</option>").join("") +
    '<option value="__new">' + esc(t("newFieldOpt")) + "</option>";
}

export function emptyState(msg: string, btn?: { a: string; label: string; v?: string }, title?: string): string {
  return '<div class="section empty">' + (title ? "<h2>" + esc(title) + "</h2>" : "") + "<p>" + esc(msg) + "</p>" +
    (btn ? '<button type="button" class="btn primary" data-a="' + btn.a + '"' + (btn.v ? ' data-v="' + btn.v + '"' : "") + ">" + esc(btn.label) + "</button>" : "") + "</div>";
}

/** Tek dokunuşla paylaş düğmesi + yanında "önizle ve düzenle" ikonu. */
export function shareButtons(k: string, label: string, mid?: string): string {
  const id = mid ? ' data-id="' + esc(mid) + '"' : "";
  return '<span class="split grow"><button type="button" class="btn primary grow" data-a="msg" data-k="' + k + '"' + id + ">" + IC.share + "<span>" + esc(label) + "</span></button>" +
    '<button type="button" class="btn primary iconpart" data-a="msgPreview" data-k="' + k + '"' + id + ' aria-label="' + esc(t("previewEdit") + ": " + label) + '" title="' + esc(t("previewEdit")) + '">' + IC.edit + "</button></span>";
}

/** Alt sayfa başlığı: geri düğmesi + başlık. */
export function subHeader(title: string, back: string): string {
  return '<div class="subhead"><button type="button" class="iconbtn" data-a="back" data-v="' + back + '" aria-label="' + esc(t("back")) + '">' + IC.back + '</button><h1 class="subtitle">' + esc(title) + "</h1></div>";
}
