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

function itemHTML(it: RuleItem, q: string, focus: string): string {
  const golden = it.id.startsWith("A");
  const label = golden ? t("goldenRule") + " " + it.id.slice(1) : t("ruleN", { n: it.id });
  return '<li class="rule' + (focus === it.id ? " focus" : "") + '" id="rule-' + esc(it.id) + '" data-n="' + esc(norm(it.id + " " + it.title + " " + it.text)) + '">' +
    '<div class="rule-tx"><span class="rnum">' + esc(golden ? it.id.slice(1) : it.id) + "</span><div>" + (it.title ? "<strong>" + rich(it.title, q) + "</strong> " : "") + "<span>" + rich(it.text, q) + "</span></div></div>" +
    '<button type="button" class="iconbtn" data-a="shareRule" data-id="' + esc(it.id) + '" aria-label="' + esc(t("shareRule", { n: label })) + '">' + IC.share + "</button></li>";
}

export function viewRules(): string {
  const b = ruleBook();
  const q = ui.ruleQ;
  const focus = route().arg || "";
  let h = subHeader(t("rulesTitle"), "more");
  if (t("rulesTr")) h += '<p class="small muted">' + esc(t("rulesTr")) + "</p>";
  h += '<div class="finder rfinder"><div class="search">' + IC.search + '<input type="search" id="q-rules" placeholder="' + esc(t("rulesSearch")) + '" value="' + esc(q) + '" autocomplete="off" enterkeyhint="search" aria-label="' + esc(t("rulesSearch")) + '">' +
    '<button type="button" class="clr" data-a="clearRuleQ" aria-label="' + esc(t("close")) + '"' + (q ? "" : " hidden") + ">" + IC.close + "</button></div>" +
    (q ? "" : '<div class="filters" role="navigation" aria-label="' + esc(t("jumpTo")) + '">' + b.sections.map((s) => '<a class="fchip" href="#/rules/s' + s.num + '">' + s.num + "</a>").join("") + "</div>") + "</div>";
  let shown = 0;
  const golden = b.golden.filter((g) => matchesRule(g, q));
  if (golden.length) {
    shown += golden.length;
    h += '<section class="section" id="rule-sA"><div class="row nowrap"><h2 class="grow">' + esc(b.goldenTitle) + "</h2>" + (q ? "" : '<button type="button" class="btn sm" data-a="shareGolden">' + IC.share + esc(t("share")) + "</button>") + '</div><ul class="rules golden">' + golden.map((g) => itemHTML(g, q, focus)).join("") + "</ul></section>";
  }
  b.sections.forEach((s) => {
    const items = s.items.filter((it) => matchesRule(it, q));
    if (!items.length) return;
    shown += items.length;
    h += '<section class="section" id="rule-s' + s.num + '"><h2>' + esc(s.num + ". " + s.title) + '</h2><ul class="rules">' + items.map((it) => itemHTML(it, q, focus)).join("") + "</ul></section>";
  });
  if (!shown) h += '<section class="section empty"><p>' + esc(t("noRuleMatch")) + "</p></section>";
  return h;
}
