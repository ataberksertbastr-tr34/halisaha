/**
 * Borçlulara sırayla hatırlatma (Kural 2.4): biriken borç listesindeki herkes için sırayla
 * WhatsApp mesajı açılır; organizatör gönderip geri dönünce sıradaki kişi hazır bekler.
 */
import { money, t } from "../../i18n";
import { store, today, ui } from "../../app/store";
import { esc } from "../../domain/text";
import { debts } from "../../domain/ledger";
import { isModalOpen, showModal, updateModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

/** Sıradaki borçluyu gösterir; borcu kapananlar atlanır, sıra bitince özet çıkar. */
export function openRemindSheet(): void {
  const q = ui.remind;
  if (!q) return;
  const S = store.s;
  const map = new Map(debts(S, today()).map((d) => [d.id, d]));
  while (q.i < q.ids.length && !map.has(q.ids[q.i])) q.i++;
  let h = sheetHead(t("remindAllTitle"));
  const d = map.get(q.ids[q.i]);
  if (!d) {
    h += '<p class="rq-done">' + IC.check + "<span>" + esc(t("remindDone", { n: q.sent })) + '</span></p><button type="button" class="btn primary block" data-a="closeModal">' + esc(t("close")) + "</button>";
  } else {
    const host = d.host ? S.players.find((p) => p.id === d.host) : null;
    const phone = d.phone || host?.phone || "";
    const meta = [t("unpaidN", { n: d.n }), host ? t("guestOf", { n: host.name }) : "", phone ? "" : t("remindNoPhone")].filter(Boolean).join(" · ");
    h += '<p class="small muted tight" id="rq-step">' + esc(t("remindStep", { i: q.i + 1, n: q.ids.length })) + "</p>" +
      '<div class="rq-card"><div class="pname"><strong>' + esc(d.name) + '</strong><span class="meta">' + esc(meta) + '</span></div><span class="amount neg">' + esc(money(d.total)) + "</span></div>" +
      '<div class="stackf mt"><button type="button" class="btn primary block" data-a="remindSend" data-k="short">' + IC.whatsapp + esc(t("remindShortMsg")) + "</button>" +
      '<button type="button" class="btn block" data-a="remindSend" data-k="statement">' + IC.list + esc(t("statementSend")) + "</button>" +
      '<button type="button" class="btn block ghost" data-a="remindSkip">' + esc(t("remindSkip")) + "</button></div>";
  }
  if (isModalOpen()) updateModal(h);
  else showModal(h);
}
