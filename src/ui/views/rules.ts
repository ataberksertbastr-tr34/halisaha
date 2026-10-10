/** Kurallar sayfası: KURALLAR.md'den, aranabilir, her madde numarasıyla paylaşılabilir. */
import rulesMd from "../../../KURALLAR.md?raw";
import { t } from "../../i18n";
import { ui } from "../../app/store";
import { route } from "../../app/router";
import { esc, norm } from "../../domain/text";
import { matchesRule, parseRules, type RuleBook, type RuleItem } from "../../domain/rules";
import { subHeader } from "../components";
import { IC } from "../icons";

let book: RuleBook | null = null;
export function ruleBook(): RuleBook {
  return (book = book || parseRules(rulesMd));
}

/** Metni kaçırır, **kalın** biçimini ve arama eşleşmelerini işaretler. */
function rich(text: string, q: string): string {
  let h = esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const words = norm(q).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return h;
  // Türkçe karakterden bağımsız vurgulama: normalize edilmiş metinde konumları bul
  const plain = h;
  const normed = norm(plain);
  if (normed.length !== plain.length) return h; // güvenli değilse vurgulama yapma
  const marks: [number, number][] = [];
  words.forEach((w) => {
    let i = normed.indexOf(w);
    while (i >= 0) {
      marks.push([i, i + w.length]);
      i = normed.indexOf(w, i + w.length);
    }
  });
  if (!marks.length) return h;
  marks.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [a, b] of marks) {
    if (a < pos) continue;
    // Etiket içine işaret koyma
    const before = plain.slice(0, a);
    if (before.lastIndexOf("<") > before.lastIndexOf(">")) continue;
    out += plain.slice(pos, a) + "<mark>" + plain.slice(a, b) + "</mark>";
    pos = b;
  }
  h = out + plain.slice(pos);
  return h;
}

/** "Kural 1.8" atıflarını ilgili maddeye bağlar (arama yokken). */
function linkRefs(h: string): string {
  return h.replace(/(Kural|Rule)\s+(\d+\.\d+)/g, '<a class="rref" href="#/rules/$2">$1 $2</a>');
}

function itemHTML(it: RuleItem, q: string, focus: string): string {
  const golden = it.id.startsWith("A");
  const label = golden ? t("goldenRule") + " " + it.id.slice(1) : t("ruleN", { n: it.id });
  const text = rich(it.text, q);
  return '<li class="rule' + (focus === it.id ? " focus" : "") + (it.flag ? " flag" : "") + '" id="rule-' + esc(it.id) + '" data-n="' + esc(norm(it.id + " " + it.title + " " + it.text)) + '">' +
    '<div class="rule-tx"><span class="rnum">' + esc(golden ? it.id.slice(1) : it.id) + "</span><div>" + (it.flag ? '<span class="rflag">' + IC.alert + esc(it.flag.toLocaleUpperCase("tr")) + "</span>" : "") +
    (it.title ? "<strong>" + rich(it.title, q) + "</strong> " : "") + "<span>" + (q ? text : linkRefs(text)) + "</span></div></div>" +
    '<button type="button" class="iconbtn" data-a="shareRule" data-id="' + esc(it.id) + '" aria-label="' + esc(t("shareRule", { n: label })) + '">' + IC.share + "</button></li>";
}

function sanctionsHTML(b: RuleBook, q: string): string {
  const n = norm(q);
  const rows = b.sanctions.filter((r) => !n || n.split(/\s+/).every((w) => norm(r.violation + " " + r.sanction + " " + r.rules.join(" ")).includes(w)) || r.rules.some((x) => x === n));
  if (!rows.length) return "";
  return '<section class="section" id="rule-ek" aria-labelledby="h-ek"><div class="sec-head">' + IC.gavel.replace("<svg", '<svg class="h2i"') + '<h2 id="h-ek">' + esc(b.appendixTitle) + "</h2></div>" +
    (b.appendixIntro && !q ? '<p class="small muted tight">' + esc(b.appendixIntro) + "</p>" : "") +
    '<div class="tablewrap"><table class="sanctions"><thead><tr><th scope="col">' + esc(t("colViolation")) + '</th><th scope="col">' + esc(t("colSanction")) + '</th><th scope="col" class="tr">' + esc(t("colRule")) + "</th></tr></thead><tbody>" +
    rows.map((r) => '<tr class="' + (r.severe ? "severe" : "") + '"><td>' + esc(r.violation) + "</td><td>" + esc(r.sanction) + '</td><td class="rn">' + r.rules.map((x) => '<a class="rref" href="#/rules/' + esc(x) + '">' + esc(x) + "</a>").join("<br>") + "</td></tr>").join("") +
    "</tbody></table></div></section>";
}

export function viewRules(): string {
  const b = ruleBook();
  const q = ui.ruleQ;
  const focus = route().arg || "";
  let h = subHeader(t("rulesTitle"), "more");
  if (t("rulesTr")) h += '<p class="small muted">' + esc(t("rulesTr")) + "</p>";
  if (!q) {
    h += '<section class="section cover"><div class="rulecover"><img src="brand/crest.webp" width="321" height="360" alt="' + esc(t("crestAlt")) + '" decoding="async"><div class="minw0"><div class="kicker">PREDATORS</div><h2 class="cover-t">' + esc(b.title) + "</h2>" +
      (b.subtitle ? '<p class="small muted m0">' + esc(b.subtitle) + "</p>" : "") + "</div></div>" + (b.intro ? '<p class="cover-intro">' + esc(b.intro) + "</p>" : "") + "</section>";
  }
  const chips = ['<a class="fchip gold" href="#/rules/sA" aria-label="' + esc(b.goldenTitle) + '">★</a>', ...b.sections.map((s) => '<a class="fchip" href="#/rules/s' + s.num + '" aria-label="' + esc(s.num + ". " + s.title) + '">' + s.num + "</a>"), '<a class="fchip" href="#/rules/ek">' + esc(t("appendixShort")) + "</a>"];
  h += '<div class="finder rfinder"><div class="search">' + IC.search + '<input type="search" id="q-rules" placeholder="' + esc(t("rulesSearch")) + '" value="' + esc(q) + '" autocomplete="off" enterkeyhint="search" aria-label="' + esc(t("rulesSearch")) + '">' +
    '<button type="button" class="clr" data-a="clearRuleQ" aria-label="' + esc(t("close")) + '"' + (q ? "" : " hidden") + ">" + IC.close + "</button></div>" +
    (q ? "" : '<div class="filters" role="navigation" aria-label="' + esc(t("jumpTo")) + '">' + chips.join("") + "</div>") + "</div>";
  let shown = 0;
  // Altın kurallar (gruplu) ve notlar
  const groups = b.goldenGroups.map((g) => ({ title: g.title, items: g.items.filter((x) => matchesRule(x, q)) })).filter((g) => g.items.length);
  if (groups.length) {
    shown += groups.reduce((n, g) => n + g.items.length, 0);
    h += '<section class="section goldsec" id="rule-sA"><div class="row nowrap"><h2 class="grow">★ ' + esc(b.goldenTitle) + "</h2>" + (q ? "" : '<button type="button" class="btn sm" data-a="shareGolden">' + IC.share + esc(t("share")) + "</button>") + "</div>" +
      groups.map((g, i) => (g.title ? '<h3 class="ggroup' + (i ? " alt" : "") + '">' + esc(g.title) + "</h3>" : "") + '<ul class="rules golden">' + g.items.map((x) => itemHTML(x, q, focus)).join("") + "</ul>").join("") + "</section>";
  }
  if (!q && b.notes.length) h += '<div class="callout" role="note"><ul>' + b.notes.map((n) => "<li>" + linkRefs(rich(n, "")) + "</li>").join("") + "</ul></div>";
  // Kısımlar ve bölümler
  const parts = b.parts.length ? b.parts : [{ num: "", title: "" }];
  parts.forEach((p) => {
    const secs = b.sections.filter((s) => !p.num || s.part === p.num).map((s) => ({ s, items: s.items.filter((it) => matchesRule(it, q)) })).filter((x) => x.items.length);
    if (!secs.length) return;
    if (p.num) h += '<div class="partband" id="rule-p' + esc(p.num) + '"><small>' + esc(t("partN", { n: p.num })) + "</small><b>" + esc(p.title) + "</b></div>";
    secs.forEach(({ s, items }) => {
      shown += items.length;
      h += '<section class="section" id="rule-s' + s.num + '"><h2><span class="snum">' + esc(s.num) + "</span>" + esc(s.title) + '</h2><ul class="rules">' + items.map((it) => itemHTML(it, q, focus)).join("") + "</ul></section>";
    });
  });
  const sanc = sanctionsHTML(b, q);
  if (sanc) shown++;
  h += sanc;
  if (!shown) h += '<section class="section empty"><p>' + esc(t("noRuleMatch")) + "</p></section>";
  return h;
}
