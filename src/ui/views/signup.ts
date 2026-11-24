/** WhatsApp davet listesini yapıştırma: metin alanı ve önizleme (domain/signup.ts). */
import { money, t, type MsgKey } from "../../i18n";
import type { Match, State } from "../../domain/types";
import { isLocked } from "../../domain/roster";
import { esc, norm, trSort } from "../../domain/text";
import { getP, lineup } from "../../domain/lineup";
import { liabilities, type Liability } from "../../domain/ledger";
import type { Act, PlanRow } from "../../domain/signup";
import { showModal, updateModal } from "../modal";
import { sheetHead } from "../sheets";
import { blockReason } from "../components";

/** Yapıştırma alanı (önceki metin "Metni düzenle" ile geri gelir). */
export function openPasteSheet(text: string): void {
  showModal(sheetHead(t("pasteTitle")) +
    '<p class="small muted tight">' + esc(t("pasteHint")) + "</p>" +
    '<textarea id="plist" aria-label="' + esc(t("pasteTitle")) + '" placeholder="1. …&#10;2. …&#10;⏳ ' + esc(t("waitlist")) + ': …"' + (text ? "" : " autofocus") + ">" + esc(text) + "</textarea>" +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="pastePreview">' + esc(t("pastePreview")) + "</button></div>");
}

const ACT_LABEL: Record<Act, MsgKey> = { in: "pasteIn", maybe: "pasteMaybe", skip: "pasteSkip", guest: "pasteGuest", player: "pastePlayer", out: "pasteOut" };

function note(m: Match, r: PlanRow, debts: Record<string, Liability>): string {
  switch (r.note) {
    case "already": return t("pasteNoteAlready", { s: t(m.att[r.id!] === "in" ? "in" : "maybe") });
    case "late": return t("pasteNoteLate");
    case "dup": return t("pasteNoteDup");
    case "none": return t("pasteNoteNone");
    case "ambiguous": return t("pasteNoteAmbiguous");
    case "blocked":
      return blockReason(r.block!, debts[r.id!]);
    case "guestPrev":
      return [r.block ? blockReason(r.block) : "", r.prevDebt ? t("guestPrevDebt", { a: money(r.prevDebt) }) + " · " + t("ruleN", { n: "1.8, 2.4" }) : ""].filter(Boolean).join("; ");
    default: return "";
  }
}

/** Kişi şu an oynayan kadroda mı (yedekte ya da Belki değil). */
function lineupHas(s: State, m: Match, id: string): boolean {
  return lineup(s, m).playing.includes(id);
}

/** Önizleme: her satırda listede yazılan ad, eşleşen kişi, neden ve seçilebilir iş. */
export function showPastePreview(s: State, m: Match, rows: PlanRow[], today: string, issues: string[] = []): void {
  const debts = liabilities(s, today);
  const opt = (v: string, label: string, sel: boolean) => '<option value="' + esc(v) + '"' + (sel ? " selected" : "") + ">" + esc(label) + "</option>";
  const players = s.players.filter((p) => p.active !== false).slice().sort(trSort);
  let h = sheetHead(t("pasteTitle"));
  // Yanlış etkinliğe yapıştırma ya da yanlış gün: uyarır, engellemez
  if (issues.length) h += '<div class="notice warn" role="alert" id="paste-date"><div class="notice-tx"><strong>' + esc(t("pasteDateTitle")) + "</strong>" + issues.map((x) => "<span>" + esc(x) + "</span>").join("") + "</div></div>";
  // Önce değişen: uygulamada yazılı ama listede adı olmayanlar (organizatör listeden silmiş); Yok yazılır, kesinleştiyse geç iptal
  const gone = rows.map((r, i) => ({ r, i })).filter((x) => x.r.note === "gone");
  if (gone.length) {
    const locked = isLocked(m, new Date());
    h += '<section class="paste-gone" aria-labelledby="h-gone"><h3 id="h-gone">' + esc(t("pasteGoneTitle")) + '</h3><p class="small muted tight">' + esc(t(locked ? "pasteGoneLocked" : "pasteGoneHint")) + '</p><div class="stackf">';
    gone.forEach(({ r, i }) => {
      const fixed = !!s.players.find((p) => p.id === r.id)?.fixed;
      const meta = [t(r.st === "maybe" ? "pasteWasMaybe" : "pasteWasIn"), fixed ? t("pasteFixed") : ""].filter(Boolean).join(" · ");
      const o = opt("out", t(locked && lineupHas(s, m, r.id!) ? "pasteOutLate" : "pasteOut"), r.act === "out") + opt("skip", t("pasteKeep"), r.act === "skip");
      h += '<label class="fld"><span><strong>' + esc(r.name) + '</strong> <span class="small muted">' + esc(meta) + "</span></span>" +
        '<select id="pr-' + i + '" aria-label="' + esc(r.name) + '">' + o + "</select></label>";
    });
    h += "</div></section>";
  }
  const found = rows.filter((r) => r.note !== "gone").length;
  h += '<p class="small muted tight">' + esc(t("pasteCheck", { n: found })) + '</p><div class="stackf">';
  rows.forEach((r, i) => {
    if (r.note === "gone") return;
    const who = r.id ? getP(s, m, r.id)?.name || r.name : r.name;
    const why = note(m, r, debts);
    // Yazılan ad yalnızca gerçekten farklıysa gösterilir ("ali a." → Ali Aslan; büyük/küçük ve Türkçe harf farkı sayılmaz)
    const typed = r.id && norm(who) !== norm(r.name) ? "“" + r.name + "”" : "";
    const meta = [typed, why].filter(Boolean).join(" · ");
    let o = "";
    if (r.id) {
      o += opt(r.st, t(ACT_LABEL[r.st]), r.act === r.st) + opt(r.st === "in" ? "maybe" : "in", t(r.st === "in" ? "pasteMaybe" : "pasteIn"), false) + opt("skip", t("pasteSkip"), r.act === "skip");
    } else {
      // Belirsiz: adaylardan biri seçilir; kayıtlı değil: misafir ya da yeni oyuncu; yazım hatasında kayıtlı oyunculardan biri
      const pick = r.cands.length ? r.cands.map((id) => ({ id, name: getP(s, m, id)?.name || id })) : players;
      o += opt("guest", t("pasteGuest"), r.act === "guest") + opt("player", t("pastePlayer"), r.act === "player") + opt("skip", t("pasteSkip"), r.act === "skip") +
        '<optgroup label="' + esc(t("pastePick")) + '">' + pick.map((p) => opt("p:" + p.id, p.name, false)).join("") + "</optgroup>";
    }
    h += '<label class="fld"><span><strong>' + esc(who) + "</strong>" + (meta ? ' <span class="small muted">' + esc(meta) + "</span>" : "") + "</span>" +
      '<select id="pr-' + i + '" aria-label="' + esc(who) + '">' + o + "</select></label>";
  });
  h += "</div>";
  h += '<div class="row mt"><button type="button" class="btn primary grow" data-a="pasteApply">' + esc(t("pasteApply")) + '</button><button type="button" class="btn" data-a="pasteList" data-v="edit">' + esc(t("pasteEdit")) + "</button></div>";
  updateModal(h);
}
