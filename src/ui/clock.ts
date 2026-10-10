/**
 * Maç saati (Kural 4.1): toplam 60 dk; 2 × 30 anlaşmasında 30. dakikada devre
 * arası (en fazla 5 dk) hatırlatılır ve saat durur. Kaleci değişimi 10
 * dakikada bir anlaşıldıysa (Kural 3.5) her 10 dakikada hatırlatır.
 * Saat maç kaydında tutulur (başlangıç anı + birikmiş süre), uygulama kapanıp
 * açılsa da doğru süreyi gösterir.
 */
import { t } from "../i18n";
import type { Match } from "../domain/types";
import { esc } from "../domain/text";
import { agreeValue } from "../domain/kinds";
import { getMatch } from "../domain/lineup";
import { store } from "../app/store";
import { ruleChip } from "./components";
import { toast } from "./toast";
import { IC } from "./icons";

export const MATCH_MS = 60 * 60 * 1000;
export const HALF_MS = 30 * 60 * 1000;

export function elapsed(m: Pick<Match, "clock">, now = Date.now()): number {
  const c = m.clock;
  if (!c) return 0;
  return Math.max(0, c.acc + (c.start ? now - c.start : 0));
}

export const running = (m: Pick<Match, "clock">): boolean => !!m.clock?.start;

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function phase(m: Match, ms: number): string {
  const halves = agreeValue(m, "dur") !== "60";
  if (ms >= MATCH_MS) return t("clockFull");
  if (!halves) return t("clockSingle");
  return ms < HALF_MS ? t("clockHalf1") : t("clockHalf2");
}

export function clockHTML(m: Match): string {
  if (m.status !== "open") return "";
  const ms = elapsed(m);
  const run = running(m);
  return '<div class="clock' + (run ? " run" : "") + '" id="clock" data-mid="' + esc(m.id) + '"><div class="clk-main"><span class="clk-ic">' + IC.timer + '</span><b class="clk-t" id="clock-t">' + fmt(Math.min(ms, MATCH_MS)) + '</b><span class="clk-ph" id="clock-ph">' + esc(phase(m, ms)) + "</span></div>" +
    '<div class="clk-acts"><button type="button" class="btn sm' + (run ? "" : " primary") + '" data-a="clock" data-v="' + (run ? "pause" : "start") + '">' + (run ? IC.pause : IC.play) + esc(run ? t("clockPause") : ms ? t("clockResume") : t("clockStart")) + "</button>" +
    (ms ? '<button type="button" class="btn sm ghost" data-a="clock" data-v="reset" data-confirm="1">' + esc(t("clockReset")) + "</button>" : "") + ruleChip("4.1") + "</div></div>";
}

const fired = new Set<string>();

/** Her saniye çalışır: ekrandaki saati günceller, devre arası ve kaleci değişimini hatırlatır. */
export function tickClock(onAutoPause: (m: Match) => void): void {
  const el = document.getElementById("clock");
  if (!el) return;
  const m = getMatch(store.s, el.dataset.mid);
  if (!m || !running(m)) return;
  const ms = elapsed(m);
  const tEl = document.getElementById("clock-t"), pEl = document.getElementById("clock-ph");
  if (tEl) tEl.textContent = fmt(Math.min(ms, MATCH_MS));
  if (pEl) pEl.textContent = phase(m, ms);
  const halves = agreeValue(m, "dur") !== "60";
  const key = (k: string) => m.id + ":" + k + ":" + (m.clock?.acc || 0);
  if (halves && ms >= HALF_MS && (m.clock!.acc < HALF_MS) && !fired.has(key("half"))) {
    fired.add(key("half"));
    buzz();
    toast(t("clockHalfTime"), undefined, 8000);
    onAutoPause(m);
    return;
  }
  if (ms >= MATCH_MS && !fired.has(m.id + ":end")) {
    fired.add(m.id + ":end");
    buzz();
    toast(t("clockEnd"), undefined, 8000);
    onAutoPause(m);
    return;
  }
  if (agreeValue(m, "gk") === "10m") {
    const min = Math.floor(ms / 60000);
    if (min > 0 && min % 10 === 0 && min < 60 && !fired.has(m.id + ":gk:" + min)) {
      fired.add(m.id + ":gk:" + min);
      buzz();
      toast(t("clockKeeper"), undefined, 6000);
    }
  }
}

function buzz(): void {
  try {
    navigator.vibrate?.([200, 120, 200]);
  } catch {
    /* titreşim yok */
  }
}
