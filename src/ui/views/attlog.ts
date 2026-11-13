/**
 * Katılım günlüğü sayfası ve "haber saati" sorusu (Kural 1.4–1.5, 15.3): kim ne zaman
 * yazıldı, çıktı, yedekten girdi; geç iptalde oyuncunun haber verdiği an.
 */
import { t } from "../../i18n";
import { store } from "../../app/store";
import type { Match } from "../../domain/types";
import { esc } from "../../domain/text";
import { ddmm } from "../../domain/dates";
import { getP } from "../../domain/lineup";
import { eventTitle, isFootball } from "../../domain/kinds";
import { dayName } from "../../domain/messages";
import { lockAt } from "../../domain/roster";
import { lastEntry, LOG_DAYS, logLines, stamp } from "../../domain/attlog";
import { showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

/** "Salı 13.10 21:00" (etkinlikte adıyla). */
export function logTitle(m: Match): string {
  return (isFootball(m) && !m.title ? "" : eventTitle(m) + " · ") + dayName(m.date) + " " + ddmm(m.date) + " " + m.time;
}

export function openLogSheet(m: Match): void {
  const S = store.s;
  const lines = logLines(S, m, Date.now()).reverse();
  let h = sheetHead(t("attLog")) + '<p class="small muted tight">' + esc(logTitle(m)) + "</p>";
  if (!lines.length) h += '<p class="muted">' + esc(t("attLogEmpty")) + "</p>";
  else {
    h += '<ul class="llist loglist">';
    lines.forEach((l) => {
      if (!l.e) {
        h += '<li class="logmark">' + IC.lock + "<span>" + esc(l.text) + " · " + esc(l.when) + "</span></li>";
        return;
      }
      // Geç iptalde haber saati sonradan da girilebilir (hâlâ geç iptal görünüyorsa)
      const canSaid = l.e.ev === "late" && m.status === "open" && m.att[l.e.pid] === "late" && lastEntry(m, l.e.pid) === l.e;
      h += '<li class="lrow"><div class="pname"><strong>' + esc(l.who) + '</strong><span class="meta">' + esc(l.text) + (l.said ? " · " + esc(l.said) : "") + "</span></div>" +
        '<span class="logwhen">' + esc(l.when) + "</span>" +
        (canSaid ? '<button type="button" class="btn xs" data-a="saidOpen" data-mid="' + esc(m.id) + '" data-id="' + esc(l.e.pid) + '" data-s="out">' + esc(t("saidAsk")) + "</button>" : "") + "</li>";
    });
    h += "</ul>";
  }
  h += '<p class="small muted mt-s">' + esc(t("attLogHint", { n: LOG_DAYS })) + "</p>";
  if (lines.length) h += '<div class="row mt"><button type="button" class="btn primary grow" data-a="shareLog" data-id="' + esc(m.id) + '">' + IC.share + esc(t("logShare")) + "</button></div>";
  showModal(h);
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** <input type="datetime-local"> değeri (yerel saat). */
export function localInput(ms: number): string {
  const d = new Date(ms);
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + "T" + p2(d.getHours()) + ":" + p2(d.getMinutes());
}

/**
 * Geç iptal sayılan oyuncu ne zaman haber verdi? Kesinleşmeden önce haber verdiyse geç iptal
 * sayılmaz. tapped: organizatörün dokunduğu yanıt (geç iptal sayılmazsa ona dönülür).
 */
export function openSaidSheet(m: Match, pid: string, tapped: string): void {
  const name = getP(store.s, m, pid)?.name || "";
  const lock = lockAt(m);
  const now = Date.now();
  showModal(sheetHead(t("saidTitle", { n: name })) +
    (lock ? '<p class="small muted tight">' + esc(t("saidHint", { d: stamp(lock.getTime()), r: isFootball(m) ? "1.4" : "15.3" })) + "</p>" : "") +
    '<label class="fld">' + esc(t("saidWhen")) + '<input type="datetime-local" id="said-at" value="' + localInput(now) + '" max="' + localInput(now) + '"></label>' +
    '<div class="row mt"><button type="button" class="btn primary grow" data-a="saidSave" data-mid="' + esc(m.id) + '" data-id="' + esc(pid) + '" data-s="' + esc(tapped) + '">' + esc(t("save")) + "</button></div>");
}
