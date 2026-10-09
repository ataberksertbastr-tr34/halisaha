/** WhatsApp mesajları: davet, takımlar, ödeme hatırlatması, kişiye özel hatırlatma. */
import { DAYS, lang, money, t } from "../i18n";
import type { Match, State } from "./types";
import { ddmm, weekday } from "./dates";
import { fieldOf, mapsUrl } from "./fields";
import { capOf, cleanTeams, getP, isGK, lineup } from "./lineup";
import { estShare, payersOf, shareOf } from "./money";
import { phoneDigits } from "./text";

export function dayName(date: string): string {
  return DAYS[lang()][weekday(date)];
}

function nameOf(s: State, m: Match, id: string): string {
  return getP(s, m, id)?.name ?? "";
}

export function headerLines(s: State, m: Match): string {
  const f = fieldOf(s, m);
  let out = "⚽ " + dayName(m.date) + " " + ddmm(m.date) + " – " + m.time + "\n";
  if (f) {
    out += "📍 " + f.name + (f.address ? ", " + f.address : "") + "\n";
    const u = mapsUrl(f);
    if (u) out += "🗺️ " + u + "\n";
  }
  return out;
}

export function msgInvite(s: State, m: Match): string {
  const { playing, wait } = lineup(s, m);
  const maybe = Object.keys(m.att).filter((id) => m.att[id] === "maybe" && getP(s, m, id));
  const c = capOf(s, m);
  let out = headerLines(s, m);
  out += "👥 " + (m.format || s.settings.format) + "+1 (" + playing.length + "/" + c + ")\n";
  out += "💰 " + t("perPerson") + " ~" + money(estShare(s, m)) + "\n\n";
  for (let i = 0; i < c; i++) {
    const id = playing[i];
    out += i + 1 + ". " + (id ? nameOf(s, m, id) + (isGK(getP(s, m, id)) ? " 🧤" : "") : "") + "\n";
  }
  if (wait.length) out += "\n⏳ " + t("waitlist") + ": " + wait.map((id) => nameOf(s, m, id)).join(", ") + "\n";
  if (maybe.length) out += "🤔 " + t("maybe") + ": " + maybe.map((id) => nameOf(s, m, id)).join(", ") + "\n";
  return out + "\n" + t("inviteFooter");
}

export function msgTeams(s: State, m: Match): string {
  cleanTeams(s, m);
  const line = (ids: string[]) => ids.map((id) => "• " + nameOf(s, m, id) + (isGK(getP(s, m, id)) ? " 🧤" : "")).join("\n");
  return headerLines(s, m) + "\n🟡 " + t("teamA") + "\n" + line(m.teams.a) + "\n\n🟠 " + t("teamB") + "\n" + line(m.teams.b) + "\n\n" + t("teamsFooter");
}

export function ibanLine(s: State): string {
  return s.settings.iban ? "IBAN: " + s.settings.iban + (s.settings.ibanName ? " (" + s.settings.ibanName + ")" : "") : "";
}

export function msgPay(s: State, m: Match): string {
  const sh = shareOf(s, m);
  const unpaid = payersOf(s, m).filter((id) => !m.paid[id]);
  let out = "💸 " + t("payHeader") + " – " + dayName(m.date) + " " + ddmm(m.date) + "\n" + t("perPerson") + ": " + money(sh) + "\n";
  if (s.settings.iban) out += "\n" + ibanLine(s) + "\n";
  if (unpaid.length) out += "\n" + t("stillUnpaid") + ":\n" + unpaid.map((id) => "• " + nameOf(s, m, id)).join("\n") + "\n\n" + t("payFooter");
  else out += "\n" + t("everyonePaid");
  return out;
}

export function personalPayText(s: State, name: string, amt: number): string {
  return t("personalPay", { name, amt: money(amt), iban: s.settings.iban ? " " + ibanLine(s) + "." : "" });
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
