/** WhatsApp mesajları: davet, takımlar, ödeme hatırlatması, kişiye özel hatırlatma. */
import { DAYS, lang, money, t } from "../i18n";
import type { Match, State, TemplateKey } from "./types";
import { render, templateOf } from "./templates";
import { ddmm, weekday } from "./dates";
import { fieldOf, mapsUrl } from "./fields";
import { capOf, cleanTeams, getP, isGK, lineup } from "./lineup";
import { billOf, estShare } from "./money";
import { accounts } from "./ledger";
import { phoneDigits } from "./text";

export function dayName(date: string): string {
  return DAYS[lang()][weekday(date)];
}

function nameOf(s: State, m: Match, id: string): string {
  return getP(s, m, id)?.name ?? "";
}

export function ibanLine(s: State): string {
  return s.settings.iban ? "IBAN: " + s.settings.iban + (s.settings.ibanName ? " (" + s.settings.ibanName + ")" : "") : "";
}

/** Maçla ilgili ortak yer tutucular. */
export function matchVars(s: State, m: Match): Record<string, string> {
  const f = fieldOf(s, m);
  const { playing, wait } = lineup(s, m);
  const maybe = Object.keys(m.att).filter((id) => m.att[id] === "maybe" && getP(s, m, id));
  const label = (id: string) => nameOf(s, m, id) + (isGK(getP(s, m, id)) ? " 🧤" : "");
  return {
    gun: dayName(m.date),
    tarih: ddmm(m.date),
    saat: m.time,
    saha: f ? f.name + (f.address ? ", " + f.address : "") : "",
    harita: mapsUrl(f),
    format: (m.format || s.settings.format) + "+1",
    sayi: String(playing.length),
    kontenjan: String(capOf(s, m)),
    pay: money(estShare(s, m)),
    iban: ibanLine(s),
    kadro: playing.map((id, i) => i + 1 + ". " + label(id)).join("\n"),
    yedek: wait.map((id) => nameOf(s, m, id)).join(", "),
    belki: maybe.map((id) => nameOf(s, m, id)).join(", "),
  };
}

function tpl(s: State, key: TemplateKey): string {
  return templateOf(s.settings.templates, key, lang());
}

export function msgInvite(s: State, m: Match): string {
  const v = matchVars(s, m);
  const { playing } = lineup(s, m);
  const c = capOf(s, m);
  const lines: string[] = [];
  for (let i = 0; i < c; i++) {
    const id = playing[i];
    lines.push(i + 1 + ". " + (id ? nameOf(s, m, id) + (isGK(getP(s, m, id)) ? " 🧤" : "") : ""));
  }
  return render(tpl(s, "invite"), { ...v, liste: lines.join("\n") });
}

/** Kadro kesinleşti duyurusu (Kural 1.4). */
export function msgSquad(s: State, m: Match): string {
  return render(tpl(s, "squad"), matchVars(s, m));
}

export function msgTeams(s: State, m: Match): string {
  cleanTeams(s, m);
  const line = (ids: string[]) => ids.map((id) => "• " + nameOf(s, m, id) + (isGK(getP(s, m, id)) ? " 🧤" : "")).join("\n");
  return render(tpl(s, "teams"), { ...matchVars(s, m), sarilar: line(m.teams.a), turuncular: line(m.teams.b) });
}

export function msgPay(s: State, m: Match, today: string): string {
  const { payers, share: sh } = billOf(s, m);
  const acc = accounts(s, today);
  const unpaid = payers.filter((id) => acc.get(id)?.charges.find((c) => c.mid === m.id)?.status !== "paid");
  return render(tpl(s, "pay"), {
    ...matchVars(s, m),
    pay: money(sh),
    odemeyenler: unpaid.map((id) => "• " + nameOf(s, m, id)).join("\n"),
    kapanis: unpaid.length ? t("payFooter") : t("everyonePaid"),
  });
}

export function personalPayText(s: State, name: string, amt: number): string {
  return render(tpl(s, "personalPay"), { ad: name, tutar: money(amt), iban: ibanLine(s) });
}

/** Yedekten kadroya giren oyuncuya hazır mesaj. */
export function promotedText(s: State, m: Match, id: string): string {
  return render(tpl(s, "promoted"), { ...matchVars(s, m), ad: nameOf(s, m, id) });
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
