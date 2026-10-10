/**
 * Duyurular: grupta paylaşılacak hazır metinler.
 *  - Uygulamaya geçiş (Kural 14.3) ve test/geri bildirim (14.4)
 *  - Kural değişikliği (12.2)
 *  - İptal duyurusu (1.9)
 *  - Altın kurallar ve grup iletişimi hatırlatması (Bölüm 13)
 * Metinler paylaşmadan önce düzenlenebilir.
 */
import { lang, t } from "../../i18n";
import { store } from "../../app/store";
import { esc } from "../../domain/text";
import { openMatches } from "../../domain/lineup";
import { msgCancel } from "../../domain/messages";
import { eventOption, ruleChip, subHeader } from "../components";
import { ruleBook } from "./rules";
import { stripMd } from "../../domain/rules";
import { IC } from "../icons";

const MOVE_ITEMS = ["roster", "teams", "payments", "announce", "discipline"] as const;
type MoveItem = (typeof MOVE_ITEMS)[number];
const MOVE_TXT: Record<MoveItem, { tr: string; en: string }> = {
  roster: { tr: "Kadro kaydı ve yedek listesi", en: "Squad sign-ups and waitlist" },
  teams: { tr: "Takımlar ve kura", en: "Teams and draws" },
  payments: { tr: "Ödeme takibi ve borçlar", en: "Payment tracking and debts" },
  announce: { tr: "Maç ve etkinlik duyuruları", en: "Match and event announcements" },
  discipline: { tr: "Disiplin kayıtları", en: "Discipline records" },
};
const sel: Record<MoveItem, boolean> = { roster: true, teams: true, payments: true, announce: true, discipline: false };
let cancelId = "";
let ruleId = "";
let ruleText = "";

const L2 = (x: { tr: string; en: string }) => x[lang()] || x.tr;

export function moveText(): string {
  const items = MOVE_ITEMS.filter((k) => sel[k]).map((k) => "• " + L2(MOVE_TXT[k]));
  if (lang() === "en") {
    return "📲 Moving to the Predators app\n\nFrom now on these are handled in the app:\n" + items.join("\n") +
      "\n\nThe app's record counts from this announcement on; references to the WhatsApp group in our rules cover the app for these (Rule 14.3).\n\nIf you spot a bug or have a suggestion, tell the organiser (Rule 14.4).";
  }
  return "📲 Predators uygulamasına geçiyoruz\n\nBundan sonra şu işlemler uygulamadan yürütülecek:\n" + items.join("\n") +
    "\n\nBu duyurudan sonra bu işlemlerde uygulamadaki kayıt esas alınır; yönetmelikte WhatsApp grubuna yapılan atıflar bu işlemler için uygulamayı da kapsar (Kural 14.3).\n\nFark ettiğiniz hatalar ve önerileriniz için bana yazın (Kural 14.4).";
}

export function ruleChangeText(): string {
  const b = ruleBook();
  let it = null;
  for (const s of b.sections) for (const x of s.items) if (x.id === ruleId) it = x;
  const head = it ? (lang() === "en" ? "Rule " : "Kural ") + it.id + " – " + it.title : "";
  const change = ruleText.trim() || (it ? stripMd(it.text) : "");
  if (lang() === "en") return "📣 Rule change" + (head ? "\n\n" + head : "") + (change ? "\n" + change : "") + "\n\nThe change applies from the first match after this announcement (Rule 12.2).";
  return "📣 Kural değişikliği" + (head ? "\n\n" + head : "") + (change ? "\n" + change : "") + "\n\nDeğişiklik bu duyurudan sonraki ilk maçtan itibaren geçerlidir (Kural 12.2).";
}

export function groupRulesText(): string {
  const b = ruleBook();
  const sec = b.sections.find((s) => s.num === "13");
  const pick = ["13.2", "13.3", "13.4", "13.5", "13.6", "13.7"];
  const lines = sec ? sec.items.filter((x) => pick.includes(x.id)).map((x) => "• " + x.title + " (" + x.id + ")") : [];
  const g = b.goldenGroups[1];
  const gold = g ? g.items.map((x) => "⭐ " + stripMd(x.text)).join("\n") : "";
  if (lang() === "en") return "💬 Group reminder\n\n" + gold + "\n\n" + lines.join("\n") + "\n\nMessages that break these rules are deleted and the step-by-step sanction applies (Rule 13.9).";
  return "💬 Grup hatırlatması\n\n" + gold + "\n\n" + lines.join("\n") + "\n\nBu bölüme aykırı mesajlar silinir ve kademeli yaptırım uygulanır (Kural 13.9).";
}

function card(id: string, icon: string, title: string, rule: string, body: string, text: string): string {
  return '<section class="section ann" aria-labelledby="h-' + id + '"><div class="sec-head">' + icon.replace("<svg", '<svg class="h2i"') + '<h2 id="h-' + id + '">' + esc(title) + "</h2>" + ruleChip(rule) + "</div>" + body +
    '<textarea id="ann-' + id + '" class="ann-text" aria-label="' + esc(title) + '">' + esc(text) + "</textarea>" +
    '<div class="row nowrap mt-s"><button type="button" class="btn primary grow" data-a="shareArea" data-v="ann-' + id + '">' + IC.share + esc(t("share")) + '</button><button type="button" class="btn side" data-a="copyArea" data-v="ann-' + id + '">' + IC.copy + esc(t("copy")) + "</button></div></section>";
}

export function viewAnnounce(): string {
  const S = store.s;
  let h = subHeader(t("annTitle"), "more") + '<p class="small muted">' + esc(t("annHint")) + "</p>";
  // Uygulamaya geçiş
  const checks = '<div class="phchips mb">' + MOVE_ITEMS.map((k) => '<button type="button" class="fchip' + (sel[k] ? " on" : "") + '" data-a="annMove" data-v="' + k + '" aria-pressed="' + sel[k] + '">' + esc(L2(MOVE_TXT[k])) + "</button>").join("") + "</div>";
  h += card("move", IC.install, t("annMove"), "14.3", checks, moveText());
  // İptal
  const open = openMatches(S);
  if (!open.find((m) => m.id === cancelId)) cancelId = open[0]?.id || "";
  const cm = open.find((m) => m.id === cancelId);
  const pick = open.length ? '<label class="fld mb"><span class="visually-hidden">' + esc(t("matchSel")) + '</span><select data-f="ann.cancel">' + open.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === cancelId ? " selected" : "") + ">" + esc(eventOption(m)) + "</option>").join("") + "</select></label>" : '<p class="muted small">' + esc(t("noEvent")) + "</p>";
  h += card("cancel", IC.alert, t("annCancel"), "1.9", pick, cm ? msgCancel(S, cm) : "");
  // Kural değişikliği
  const b = ruleBook();
  if (!ruleId) ruleId = "2.4";
  const ropts = b.sections.map((s) => '<optgroup label="' + esc(s.num + ". " + s.title) + '">' + s.items.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === ruleId ? " selected" : "") + ">" + esc(x.id + " " + x.title) + "</option>").join("") + "</optgroup>").join("");
  const rbody = '<label class="fld mb">' + esc(t("annRule")) + '<select data-f="ann.rule">' + ropts + "</select></label>" +
    '<label class="fld mb">' + esc(t("annRuleNew")) + '<input type="text" data-f="ann.ruleText" value="' + esc(ruleText) + '" placeholder="' + esc(t("annRuleNewHint")) + '" autocomplete="off"></label>';
  h += card("rule", IC.book, t("annRuleChange"), "12.2", rbody, ruleChangeText());
  // Grup kuralları
  h += card("group", IC.megaphone, t("annGroup"), "13.9", "", groupRulesText());
  return h;
}

export function annToggle(k: string): void {
  if (k in sel) sel[k as MoveItem] = !sel[k as MoveItem];
}
export function annSet(k: "cancel" | "rule" | "ruleText", v: string): void {
  if (k === "cancel") cancelId = v;
  if (k === "rule") ruleId = v;
  if (k === "ruleText") ruleText = v;
}
