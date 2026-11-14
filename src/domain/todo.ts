/**
 * Haftalık iş listesi: sıradaki etkinlik için organizatörün adımları (davet, kadro, saha,
 * takımlar, sonuç, ödemeler) ve önceki etkinliklerden kalan işler (girilmemiş sonuç, kapanmamış
 * ödemeler). Her adım durumunu ve tek dokunuşluk eylemini taşır; ekran yalnızca çizer.
 */
import { money, t } from "../i18n";
import type { Match, State } from "./types";
import { active, capOf, lineup } from "./lineup";
import { billOf } from "./money";
import { accounts, type Account } from "./ledger";
import { fieldOf } from "./fields";
import { agreeValue, isCup, isFootball, kindOf } from "./kinds";
import { isLocked } from "./roster";
import { addDays, ddmm, matchStart } from "./dates";
import { dayShort } from "./messages";
import { unfinished } from "./schedule";
import { stamp } from "./attlog";

export type StepKey = "invite" | "squad" | "field" | "teams" | "result" | "pay";
/** done: tamam; todo: şimdi yapılabilir; warn: gecikti / dikkat; later: zamanı gelmedi. */
export type StepState = "done" | "todo" | "warn" | "later";

export interface StepAct {
  /** Eylem adı (data-a) */
  a: string;
  label: string;
  /** Mesaj türü (data-k) */
  k?: string;
  /** Sekme ya da hedef (data-v) */
  v?: string;
}

export interface Step {
  key: StepKey;
  mid: string;
  title: string;
  text: string;
  state: StepState;
  act?: StepAct;
  /** Önceki etkinlikten kalan iş */
  past?: boolean;
}

/** Paylaşılan takımların imzası: sıra önemsiz, kimin hangi takımda olduğu önemli. */
export function teamsSig(m: Match): number {
  const str = [...m.teams.a].sort().join(",") + "|" + [...m.teams.b].sort().join(",");
  let h = 7;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return (h >>> 0) + 1;
}

/** Etkinliğin ödeme durumu: ödeyen sayısı, ödeyenler, kalan tutar. */
export function payProgress(s: State, m: Match, acc: Map<string, Account>): { n: number; paid: number; left: number } {
  const { payers, share } = billOf(s, m);
  let paid = 0, left = 0;
  for (const id of payers) {
    const c = acc.get(id)?.charges.find((x) => x.mid === m.id && !x.cid);
    if (c?.status === "paid") paid++;
    else left += Math.max(0, share - (c?.paid || 0));
  }
  return { n: payers.length, paid, left };
}

const short = (m: Match) => dayShort(m.date) + " " + ddmm(m.date);

function inviteStep(s: State, m: Match, now: Date): Step {
  const base = { key: "invite" as const, mid: m.id, title: t("todoInvite") };
  if (m.sent.invite) return { ...base, state: "done", text: t("todoSent", { d: stamp(m.sent.invite) }) };
  const cap = capOf(s, m);
  if (cap && lineup(s, m).playing.length >= cap) return { ...base, state: "done", text: t("todoInviteFull") };
  // Davet günü geldiyse (Ayarlar → Hatırlatmalar) uyarıya döner
  const due = matchStart(m.date, m.time);
  due.setDate(due.getDate() - (s.settings.inviteDays || 3));
  const [h, mi] = (s.settings.remindAt || "12:00").split(":").map(Number);
  due.setHours(h || 0, mi || 0, 0, 0);
  return { ...base, state: now.getTime() >= due.getTime() ? "warn" : "todo", text: t("todoNotSent"), act: { a: "msg", k: "invite", label: t("todoSend") } };
}

function squadStep(s: State, m: Match, now: Date): Step {
  const base = { key: "squad" as const, mid: m.id, title: t("todoSquad") };
  const { playing, wait } = lineup(s, m);
  const cap = capOf(s, m);
  const locked = isLocked(m, now);
  const n = playing.length;
  const count = cap ? n + "/" + cap : t("peopleN", { n });
  const extra = wait.length ? " · " + t("todoWait", { n: wait.length }) : "";
  const full = cap ? n >= cap : locked && n >= 2;
  // Kadro kesinleşince son hâli gruba duyurulur (Kural 1.4, 15.3)
  if (locked && n >= 2 && !m.sent.squad) {
    return { ...base, state: full ? "todo" : "warn", text: count + " · " + (full ? t("todoSquadLocked") : t("todoSquadShort", { x: cap - n })) + extra, act: { a: "msg", k: "squad", label: t("todoShare") } };
  }
  if (full) return { ...base, state: "done", text: count + " · " + t("todoSquadFull") + extra };
  const paste: StepAct = { a: "pasteList", label: t("todoPaste") };
  if (!cap) return { ...base, state: "todo", text: count, act: paste };
  return { ...base, state: locked ? "warn" : "todo", text: count + " · " + (locked ? t("todoSquadShort", { x: cap - n }) : t("spotsLeft", { n: cap - n })), act: paste };
}

function fieldStep(s: State, m: Match, now: Date): Step {
  const f = fieldOf(s, m);
  const base = { key: "field" as const, mid: m.id, title: isFootball(m) ? t("field") : t("venue") };
  const name = f ? f.name : t("noField");
  if (m.reserved) return { ...base, state: "done", text: name + " · " + t("todoReserved") };
  const days = s.settings.reserveDays;
  const soon = !!days && matchStart(m.date, m.time).getTime() - now.getTime() <= days * 24 * 60 * 60 * 1000;
  return { ...base, state: soon ? "warn" : "todo", text: name + " · " + t("todoNotReserved"), act: { a: "reserve", label: t("reservedDone") } };
}

function teamsStep(s: State, m: Match, now: Date): Step {
  const mode = kindOf(m).teams;
  const two = mode === "pitch" || mode === "two";
  const base = { key: "teams" as const, mid: m.id, title: two ? t("tabTeams") : t("todoDraw") };
  const ids = active(s, m);
  const cap = capOf(s, m);
  const ready = isLocked(m, now) || (cap ? ids.length >= cap : false);
  const go = (label: string): StepAct => ({ a: "goTeams", label });
  if (ids.length < 2) return { ...base, state: "later", text: t("todoNeedSquad") };
  if (!two) {
    const singles = mode === "queue" && agreeValue(m, "mode") !== "double";
    const drawn = isCup(m) ? !!m.bracket?.seeds.length : singles ? !!m.queue : !!m.draw;
    if (drawn) return { ...base, state: "done", text: t("todoDrawn") };
    return { ...base, state: ready ? "todo" : "later", text: t("todoNotDrawn"), act: go(t("todoDrawAct")) };
  }
  const set = new Set(ids);
  const a = m.teams.a.filter((id) => set.has(id)), b = m.teams.b.filter((id) => set.has(id));
  if (!a.length && !b.length) return { ...base, state: ready ? "todo" : "later", text: t("todoNotBuilt"), act: go(t("todoBuild")) };
  const un = ids.length - a.length - b.length;
  if (un > 0) return { ...base, state: "warn", text: t("todoUnassigned", { n: un }), act: go(t("todoOpen")) };
  const share: StepAct = { a: "msg", k: "teams", label: t("todoShare") };
  if (!m.sent.teams) return { ...base, state: "todo", text: t("todoTeamsBuilt"), act: share };
  if (m.sent.teamsSig !== teamsSig({ ...m, teams: { a, b } })) return { ...base, state: "warn", text: t("todoTeamsChanged"), act: share };
  return { ...base, state: "done", text: t("todoSent", { d: stamp(m.sent.teams) }) };
}

function resultStep(m: Match, now: Date, past = false): Step {
  const fb = isFootball(m);
  const base = { key: "result" as const, mid: m.id, title: past ? t("todoPastResult", { d: short(m) }) : t("result"), past };
  const start = matchStart(m.date, m.time).getTime();
  if (now.getTime() < start) return { ...base, state: "later", text: fb ? t("todoAfterMatch") : t("todoAfterEvent") };
  const over = now.getTime() >= start + (fb ? 3 : 6) * 60 * 60 * 1000;
  return { ...base, state: over ? "warn" : "todo", text: t("todoNoResult"), act: { a: "openResult", label: t("todoEnter") } };
}

function payStep(s: State, m: Match, acc: Map<string, Account>, past = false): Step {
  const base = { key: "pay" as const, mid: m.id, title: past ? t("todoPastPay", { d: short(m) }) : t("tabPay"), past };
  const p = payProgress(s, m, acc);
  if (!p.n) return { ...base, state: "later", text: t("todoNoPayers") };
  if (p.paid >= p.n) return { ...base, state: "done", text: t("todoAllPaid", { n: p.n }) };
  const text = t("todoPaidN", { p: p.paid, n: p.n }) + (p.left > 0 ? " · " + t("todoLeft", { a: money(p.left) }) : "");
  return { ...base, state: past ? "warn" : "todo", text, act: { a: "todoPay", label: t("todoOpen") } };
}

/** Sıradaki (açık) etkinliğin adımları, yapılış sırasıyla. */
export function matchSteps(s: State, m: Match, now: Date, today: string, acc: Map<string, Account> = accounts(s, today)): Step[] {
  return [inviteStep(s, m, now), squadStep(s, m, now), fieldStep(s, m, now), teamsStep(s, m, now), resultStep(m, now), payStep(s, m, acc)];
}

/** Ödemesi kapanmamış eski etkinlik kaç gün geriye kadar hatırlatılır. */
export const PAST_DAYS = 30;

/**
 * Önceki etkinliklerden kalan işler, eskiden yeniye: saati geçtiği hâlde sonucu girilmemiş
 * etkinlikler ve son PAST_DAYS gün içinde oynanıp ödemesi kapanmamış olanlar (en çok 3).
 */
export function pastSteps(s: State, cur: Match | null, now: Date, today: string, acc: Map<string, Account> = accounts(s, today)): Step[] {
  const out: Step[] = [];
  for (const m of unfinished(s, now)) if (!cur || m.id !== cur.id) out.push(resultStep(m, now, true));
  const cut = addDays(today, -PAST_DAYS);
  const played = s.matches
    .filter((m) => m.status === "played" && m.date >= cut)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((m) => payStep(s, m, acc, true))
    .filter((x) => x.state === "warn");
  return [...out, ...played.slice(-3)];
}

export interface Todo {
  /** Önceki etkinliklerden kalanlar + sıradaki etkinliğin adımları */
  steps: Step[];
  /** Şimdi yapılabilecek ilk iş (yoksa null) */
  next: Step | null;
  /** Sıradaki etkinliğin tamamlanan / toplam adımı */
  done: number;
  total: number;
}

export function todoOf(s: State, m: Match | null, now: Date, today: string): Todo {
  const acc = accounts(s, today);
  const cur = m ? matchSteps(s, m, now, today, acc) : [];
  const steps = [...pastSteps(s, m, now, today, acc), ...cur];
  const next = steps.find((x) => x.state === "warn" && x.past) || steps.find((x) => x.state === "todo" || x.state === "warn") || null;
  return { steps, next, done: cur.filter((x) => x.state === "done").length, total: cur.length };
}
