/**
 * WhatsApp mesajları: davet, kadro, takımlar, ödeme hatırlatması, kişiye özel
 * hatırlatma, brifing (etkinlik kuralları), araç paylaşımı ve iptal duyurusu.
 * Hepsi düzenlenebilir şablonlardan üretilir; etkinlik türüne göre başlık,
 * ikon ve ilgili kural numaraları değişir.
 */
import { DAYS, lang, money, t } from "../i18n";
import type { Match, State, TemplateKey } from "./types";
import { render, templateOf } from "./templates";
import { ddmm, weekday } from "./dates";
import { fieldOf, mapsUrl } from "./fields";
import { capOf, cleanTeams, getP, isGK, lineup } from "./lineup";
import { billOf, estShare } from "./money";
import { accounts } from "./ledger";
import { phoneDigits } from "./text";
import { agreeLabel, agreeValue, eventTitle, isFootball, kindOf, L } from "./kinds";
import { lockAt, lockHours } from "./roster";
import { teamEmoji, teamName } from "./teamstyle";
import { occupants, perHead, unassigned } from "./cars";

export function dayName(date: string): string {
  return DAYS[lang()][weekday(date)];
}

function nameOf(s: State, m: Match, id: string): string {
  return getP(s, m, id)?.name ?? "";
}

export function ibanLine(s: State): string {
  return s.settings.iban ? "IBAN: " + s.settings.iban + (s.settings.ibanName ? " (" + s.settings.ibanName + ")" : "") : "";
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** Kesinleşme cümlesi (Kural 1.4–1.5, 15.3); kesinleşme yoksa boş. */
function lockPhrase(m: Match): string {
  if (isFootball(m)) return t("lockSentenceMatch");
  const at = lockAt(m);
  if (!at) return "";
  const iso = at.getFullYear() + "-" + p2(at.getMonth() + 1) + "-" + p2(at.getDate());
  return t("lockSentenceEvent", { h: lockHours(m), d: dayName(iso).slice(0, 3) + " " + ddmm(iso) + " " + p2(at.getHours()) + ":" + p2(at.getMinutes()) });
}

/** Ön anlaşmaların özeti (madde işaretli). */
export function agreementLines(m: Match): string {
  const k = kindOf(m);
  return k.agree.map((a) => {
    const v = agreeValue(m, a.key);
    if (a.key === "dessert") return "";
    return "• " + L(a) + ": " + (v ? agreeLabel(a, v) : t("notAgreed")) + " (" + a.rule + ")";
  }).filter(Boolean).join("\n");
}

/** Maçla ilgili ortak yer tutucular. */
export function matchVars(s: State, m: Match): Record<string, string> {
  const f = fieldOf(s, m);
  const { playing, wait } = lineup(s, m);
  const maybe = Object.keys(m.att).filter((id) => m.att[id] === "maybe" && getP(s, m, id));
  const fb = isFootball(m);
  const label = (id: string) => nameOf(s, m, id) + (fb && isGK(getP(s, m, id)) ? " 🧤" : "");
  const cap = capOf(s, m);
  const k = kindOf(m);
  return {
    gun: dayName(m.date),
    tarih: ddmm(m.date),
    saat: m.time,
    saha: f ? f.name + (f.address ? ", " + f.address : "") : "",
    harita: mapsUrl(f),
    format: fb ? (m.format || s.settings.format) + "+1" : "",
    sayi: String(playing.length),
    kontenjan: cap ? String(cap) : "",
    kisi: fb ? (m.format || s.settings.format) + "+1 (" + playing.length + "/" + cap + ")" : cap ? playing.length + "/" + cap : t("peopleN", { n: playing.length }),
    pay: money(estShare(s, m)),
    iban: ibanLine(s),
    kadro: playing.map((id, i) => i + 1 + ". " + label(id)).join("\n"),
    yedek: wait.map((id) => nameOf(s, m, id)).join(", "),
    belki: maybe.map((id) => nameOf(s, m, id)).join(", "),
    baslik: fb && !m.title ? L(k.name) : eventTitle(m),
    ikon: k.emoji,
    kesinlesme: lockPhrase(m),
    kuralgec: fb ? "1.5" : "15.3",
    iyi: fb ? t("goodGame") : t("goodEvent"),
    takima: teamName(s, "a"),
    takimb: teamName(s, "b"),
    renka: teamEmoji(s, "a"),
    renkb: teamEmoji(s, "b"),
    not: m.note || "",
    anlasmalar: agreementLines(m),
    ucret: fb ? t("feeField") : t("feeEvent", { e: fb && !m.title ? L(k.name) : eventTitle(m) }),
  };
}

function tpl(s: State, key: TemplateKey, m?: Match): string {
  return templateOf(s.settings.templates, key, lang(), !m || isFootball(m));
}

export function msgInvite(s: State, m: Match): string {
  const v = matchVars(s, m);
  const { playing } = lineup(s, m);
  const c = capOf(s, m);
  const lines: string[] = [];
  const n = c || playing.length;
  for (let i = 0; i < n; i++) {
    const id = playing[i];
    lines.push(i + 1 + ". " + (id ? nameOf(s, m, id) + (isFootball(m) && isGK(getP(s, m, id)) ? " 🧤" : "") : ""));
  }
  if (!c) lines.push(n + 1 + ". ");
  return render(tpl(s, "invite", m), { ...v, liste: lines.join("\n") });
}

/** Kadro kesinleşti duyurusu (Kural 1.4, 15.3). */
export function msgSquad(s: State, m: Match): string {
  return render(tpl(s, "squad", m), matchVars(s, m));
}

export function msgTeams(s: State, m: Match): string {
  cleanTeams(s, m);
  const fb = isFootball(m);
  const line = (ids: string[]) => ids.map((id) => "• " + nameOf(s, m, id) + (fb && isGK(getP(s, m, id)) ? " 🧤" : "")).join("\n");
  const dessert = fb && agreeValue(m, "dessert") === "yes";
  return render(tpl(s, "teams", m), {
    ...matchVars(s, m),
    sarilar: line(m.teams.a),
    turuncular: line(m.teams.b),
    kapanis: dessert ? t("teamsFooter") : fb ? t("goodGame") : t("goodEvent"),
  });
}

export function msgPay(s: State, m: Match, today: string): string {
  const { payers, share: sh } = billOf(s, m);
  const acc = accounts(s, today);
  const unpaid = payers.filter((id) => acc.get(id)?.charges.find((c) => c.mid === m.id && !c.cid)?.status !== "paid");
  return render(tpl(s, "pay", m), {
    ...matchVars(s, m),
    pay: money(sh),
    odemeyenler: unpaid.map((id) => "• " + nameOf(s, m, id)).join("\n"),
    kapanis: unpaid.length ? t("payFooter") : t("everyonePaid"),
  });
}

/** Brifing: türün temel kuralları (madde numaralarıyla) + ön anlaşmalar + not. */
export function msgBrief(s: State, m: Match): string {
  const k = kindOf(m);
  const rules = k.brief.map((r) => "• " + L(r) + " (" + r.rule + ")").join("\n");
  return render(tpl(s, "brief", m), { ...matchVars(s, m), kurallar: rules });
}

/** Araç paylaşımı (Kural 15.8). */
export function msgCars(s: State, m: Match): string {
  const cars = m.cars.map((c, i) => {
    const pax = c.pax.map((id) => nameOf(s, m, id)).join(", ");
    const per = perHead(c);
    const cost = (Number(c.fuel) || 0) + (Number(c.toll) || 0);
    return "🚙 " + t("carN", { n: i + 1 }) + " – " + nameOf(s, m, c.driver) + " (" + t("driver") + ")" + (pax ? "\n   " + pax : "") +
      (per ? "\n   " + t("carCostLine", { t: money(cost), n: occupants(c).length, p: money(per) }) : "");
  }).join("\n\n");
  return render(tpl(s, "cars", m), { ...matchVars(s, m), araclar: cars, bosta: unassigned(s, m).map((id) => nameOf(s, m, id)).join(", ") });
}

/** İptal duyurusu (Kural 1.9). */
export function msgCancel(s: State, m: Match): string {
  return render(tpl(s, "cancel", m), matchVars(s, m));
}

export function personalPayText(s: State, name: string, amt: number): string {
  return render(tpl(s, "personalPay"), { ad: name, tutar: money(amt), iban: ibanLine(s) });
}

/** Yedekten kadroya giren oyuncuya hazır mesaj. */
export function promotedText(s: State, m: Match, id: string): string {
  return render(tpl(s, "promoted", m), { ...matchVars(s, m), ad: nameOf(s, m, id) });
}

/** Kişiye özel WhatsApp bağlantısı; telefon yoksa boş. */
export function waLink(phone: string | undefined, text: string): string {
  const d = phoneDigits(phone);
  if (!d) return "";
  return "https://wa.me/" + d + "?text=" + encodeURIComponent(text);
}

export function waPersonal(s: State, phone: string | undefined, name: string, amt: number): string {
  return waLink(phone, personalPayText(s, name, amt));
}
