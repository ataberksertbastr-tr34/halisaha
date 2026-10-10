/**
 * Disiplin (Bölüm 9, 13.9 ve Ek: Yaptırımlar Özet Tablosu).
 *
 * Her ihlal bir kayıttır. Yaptırımın durumu (uyarı sayısı, ceza, davet
 * edilmeme, ihraç, tür yasağı) kayıtlardan türetilir; bir kayıt silinirse
 * (affedilirse) durum kendiliğinden düzelir.
 *
 * Kural 9.3 kademesi: 1. ihlal uyarı → 2. ihlal bir maç kadroya alınmaz →
 * 3. ihlal organizasyona davet edilmez. "Tekrarında Kural 9.3" maddeleri
 * (16.5, 17.6, 21.6) ilk seferde yalnızca oyundan çıkarır, sonra kademeye girer.
 */
import type { Infraction, Kind, Match, Sanction, State } from "./types";
import type { Txt } from "./kinds";
import { L, isFootball, kindDef } from "./kinds";
import { getMatch, openMatches, setAtt } from "./lineup";
import { newExtra } from "./ledger";
import { uid } from "./text";

export type Mode = "step" | "fixed" | "repeat";

export interface Violation extends Txt {
  key: string;
  rule: string;
  mode: Mode;
  /** fixed/repeat için anında yaptırım */
  sanction?: Sanction;
  /** Tür yasağı */
  kind?: Kind;
  /** Etkinlik seçilmesi gerekir (alkol, maske …) */
  event?: boolean;
  /** Tutar girilir (zarar) */
  amount?: boolean;
  /** Etkinlikte ilgili kural türe göre değişir (16.2 ↔ 17.2) */
  ruleByKind?: Partial<Record<Kind, string>>;
}

/** İhlal kataloğu: yönetmelikteki maddeler ve Ek tablosu. */
export const VIOLATIONS: Violation[] = [
  { key: "fight", rule: "9.1", mode: "fixed", sanction: "expel", tr: "Kavga ve fiziksel saldırı", en: "Fighting or physical assault" },
  { key: "swear", rule: "9.2", mode: "step", tr: "Küfür ve hakaret", en: "Swearing and insults" },
  { key: "dispute", rule: "8.2", mode: "step", tr: "Kararlara itiraz, oyunu durdurma", en: "Arguing calls, stopping play" },
  { key: "timewaste", rule: "8.4", mode: "step", tr: "Zaman geçirme", en: "Time-wasting" },
  { key: "late", rule: "1.7", mode: "step", tr: "Geç kalma", en: "Arriving late" },
  { key: "guest", rule: "1.8", mode: "step", tr: "Getirdiği misafirin ihlali", en: "Their guest's misconduct" },
  { key: "chronic", rule: "2.4", mode: "fixed", sanction: "ban", tr: "Ödemeyi sürekli geciktirme", en: "Repeatedly paying late" },
  { key: "gear", rule: "4.3", mode: "step", tr: "Yasak ekipman (çivili krampon, aksesuar)", en: "Banned gear (studs, jewellery)" },
  { key: "tackle", rule: "7.1", mode: "step", tr: "Kayarak müdahale, aşırı sert temas", en: "Slide tackle, excessive contact" },
  { key: "mess", rule: "10.1", mode: "step", tr: "Soyunma odasını kirli bırakma", en: "Leaving the changing room dirty" },
  { key: "smoke", rule: "10.4", mode: "step", tr: "Kapalı alanda sigara", en: "Smoking indoors" },
  { key: "damage", rule: "10.5", mode: "fixed", sanction: "damage", amount: true, tr: "Tesis malzemesine zarar", en: "Damaging venue equipment" },
  { key: "group", rule: "13.2", mode: "step", tr: "Grupta siyaset, din, özel hayat, uygunsuz içerik ya da spam", en: "Politics, religion, private life, inappropriate content or spam in the group" },
  { key: "illicit", rule: "13.4", mode: "fixed", sanction: "expel", tr: "Gayrimeşru iş teklifi (bahis, kumar, kaçak mal)", en: "Illicit offers (betting, gambling, contraband)" },
  { key: "privacy", rule: "13.6", mode: "fixed", sanction: "expel", tr: "Kişisel bilgileri izinsiz paylaşma", en: "Sharing personal data without consent" },
  { key: "alcohol", rule: "15.7", mode: "fixed", sanction: "remove", event: true, tr: "Etkinliğe alkollü gelme", en: "Turning up drunk" },
  { key: "mask", rule: "16.2", ruleByKind: { airsoft: "17.2" }, mode: "fixed", sanction: "dropDay", event: true, tr: "Oyun alanında maske/gözlüğü çıkarma", en: "Removing mask/goggles on the field" },
  { key: "wipe", rule: "16.5", mode: "repeat", sanction: "dropGame", event: true, tr: "Boya izini silme", en: "Wiping paint" },
  { key: "hidehit", rule: "17.6", mode: "repeat", sanction: "dropGame", event: true, tr: "Vuruşu saklama", en: "Not calling hits" },
  { key: "replica", rule: "17.4", mode: "fixed", sanction: "kindBan", kind: "airsoft", tr: "Replikayı halka açık alanda çıkarma", en: "Showing a replica in public" },
  { key: "gamble", rule: "21.3", mode: "fixed", sanction: "expel", tr: "Kumar ya da bahis", en: "Gambling or betting" },
  { key: "cheat", rule: "21.6", mode: "repeat", sanction: "dropGame", event: true, tr: "Masa oyununda hile", en: "Cheating at table games" },
  { key: "other", rule: "9.3", mode: "step", tr: "Diğer kural ihlali", en: "Other rule breach" },
];

export const violation = (key: string): Violation => VIOLATIONS.find((v) => v.key === key) || VIOLATIONS[VIOLATIONS.length - 1];

/** Yaptırım adları (Ek tablosundaki ifadeler). */
export const SANCTION_TXT: Record<Sanction, Txt> = {
  warn: { tr: "Uyarı", en: "Warning" },
  bench: { tr: "Bir maç kadroya alınmaz", en: "Benched for one match" },
  ban: { tr: "Organizasyona davet edilmez", en: "No longer invited" },
  expel: { tr: "Gruptan kalıcı olarak çıkarıldı", en: "Expelled from the group" },
  kindBan: { tr: "Bu tür etkinliklere bir daha davet edilmez", en: "Banned from this kind of event" },
  dropDay: { tr: "O günkü oyunlardan çıkarıldı", en: "Out for the rest of the day" },
  dropGame: { tr: "O oyundan çıkarıldı", en: "Out of that game" },
  remove: { tr: "Etkinliğe alınmadı, payını öder", en: "Not allowed to play, still pays" },
  damage: { tr: "Zararı karşılar", en: "Pays for the damage" },
};

export const sanctionText = (r: Pick<Infraction, "sanction" | "kind">): string => {
  if (r.sanction === "kindBan" && r.kind) return L(kindDef(r.kind).name) + ": " + L({ tr: "bir daha davet edilmez", en: "no more invites" });
  return L(SANCTION_TXT[r.sanction]);
};

export const STEP_SANCTION: Record<number, Sanction> = { 1: "warn", 2: "bench", 3: "ban" };

/** Kişinin 9.3 kademesinde kaçıncı ihlali olacağı. */
export function nextStep(s: State, pid: string): number {
  const n = s.discipline.filter((r) => r.pid === pid && r.step).length;
  return Math.min(3, n + 1);
}

export interface Suggestion {
  sanction: Sanction;
  step?: number;
  rule: string;
}

/** İhlal için yönetmeliğin öngördüğü yaptırım. */
export function suggest(s: State, pid: string, type: string, m?: Match | null): Suggestion {
  const v = violation(type);
  const rule = (m && v.ruleByKind?.[m.kind]) || v.rule;
  if (v.mode === "step") {
    const step = nextStep(s, pid);
    return { sanction: STEP_SANCTION[step], step, rule };
  }
  if (v.mode === "repeat") {
    const before = s.discipline.some((r) => r.pid === pid && r.type === type);
    return before ? { sanction: v.sanction!, step: nextStep(s, pid), rule } : { sanction: v.sanction!, rule };
  }
  return { sanction: v.sanction!, rule };
}

/** "Bir maç kadroya alınmaz" için varsayılan hedef: tarihten sonraki ilk açık halı saha maçı (yoksa ilk açık etkinlik). */
export function benchTarget(s: State, today: string, exclude?: string): Match | null {
  const open = openMatches(s).filter((m) => m.date >= today && m.id !== exclude);
  return open.find((m) => isFootball(m)) || open[0] || null;
}

export interface Status {
  warnings: number;
  /** Davet edilmez (2.4, 9.3 3. kademe) */
  banned: boolean;
  /** Gruptan çıkarıldı (9.1, 13.9) */
  expelled: boolean;
  /** Yasaklı etkinlik türleri (17.4) */
  kinds: Kind[];
  /** Kadroya alınmayacağı maçlar */
  bench: string[];
  records: Infraction[];
}

export function statusOf(s: State, pid: string): Status {
  const records = s.discipline.filter((r) => r.pid === pid).sort((a, b) => b.at.localeCompare(a.at));
  const st: Status = { warnings: 0, banned: false, expelled: false, kinds: [], bench: [], records };
  for (const r of records) {
    if (r.sanction === "warn" || r.step === 1) st.warnings++;
    if (r.sanction === "expel") st.expelled = true;
    if (r.sanction === "ban" || r.step === 3) st.banned = true;
    if (r.sanction === "kindBan" && r.kind && !st.kinds.includes(r.kind)) st.kinds.push(r.kind);
    if (r.target && (r.sanction === "bench" || r.step === 2)) st.bench.push(r.target);
  }
  if (st.expelled) st.banned = true;
  return st;
}

export function statusMap(s: State): Record<string, Status> {
  const out: Record<string, Status> = {};
  for (const id of new Set(s.discipline.map((r) => r.pid))) out[id] = statusOf(s, id);
  return out;
}

export interface Block {
  /** "expel" | "ban" | "kind" | "bench" | "debt" */
  why: string;
  rule: string;
}

/**
 * Bu kişi bu etkinliğe yazılabilir mi? Engel varsa nedeni (organizatör yine
 * de ekleyebilir: Kural 12.1 son söz organizatörün).
 */
export function joinBlock(s: State, m: Match, pid: string, debt: number, st?: Status): Block | null {
  const x = st || statusOf(s, pid);
  if (x.expelled) return { why: "expel", rule: "9.1" };
  if (x.banned) return { why: "ban", rule: "9.3" };
  if (x.kinds.includes(m.kind)) return { why: "kind", rule: "17.4" };
  if (x.bench.includes(m.id)) return { why: "bench", rule: "9.3" };
  if (s.settings.debtBlock && debt > 0.004) return { why: "debt", rule: "2.4" };
  return null;
}

export interface NewInfraction {
  pid: string;
  type: string;
  at: string;
  sanction: Sanction;
  step?: number;
  rule: string;
  mid?: string;
  target?: string;
  amount?: number;
  note?: string;
}

/**
 * Kaydı ekler ve yan etkilerini uygular:
 *  - bench: hedef maçta "Var" ise kadrodan çıkar
 *  - ban/expel/3. kademe: açık etkinliklerdeki "Var/Belki" yanıtları silinir
 *  - kindBan: o türdeki açık etkinliklerden çıkar
 *  - remove/dropDay/expel: etkinlikte oyundan alınır (payını öder)
 *  - damage: kişiye zarar bedeli yazılır
 */
export function addInfraction(s: State, x: NewInfraction, today: string): Infraction {
  const v = violation(x.type);
  const r: Infraction = { id: uid(), pid: x.pid, at: x.at, type: x.type, rule: x.rule, sanction: x.sanction, note: x.note || "" };
  if (x.mid) r.mid = x.mid;
  if (x.step) r.step = x.step;
  if (x.sanction === "kindBan") r.kind = v.kind || "airsoft";
  const benched = x.sanction === "bench" || x.step === 2;
  if (benched) {
    const t = getMatch(s, x.target) || benchTarget(s, today, x.mid);
    if (t) {
      r.target = t.id;
      if (t.att[x.pid] === "in" || t.att[x.pid] === "maybe") setAtt(t, x.pid, "out", true);
    }
  }
  const out = x.sanction === "ban" || x.sanction === "expel" || x.step === 3;
  for (const m of openMatches(s)) {
    if (m.id === x.mid) continue;
    const hit = out || (x.sanction === "kindBan" && m.kind === r.kind);
    if (hit && m.date >= today && (m.att[x.pid] === "in" || m.att[x.pid] === "maybe")) {
      delete m.att[x.pid];
      m.order = m.order.filter((id) => id !== x.pid);
    }
  }
  const ev = getMatch(s, x.mid);
  if (ev && (x.sanction === "remove" || x.sanction === "dropDay" || x.sanction === "expel")) ev.removed[x.pid] = x.rule;
  if (x.sanction === "damage" && x.amount && x.amount > 0) {
    const c = newExtra(x.pid, x.amount, x.at, x.note || L(violation(x.type)), x.mid, x.rule);
    s.charges.push(c);
    r.cid = c.id;
  }
  s.discipline.push(r);
  return r;
}

/** Kaydı siler (affeder): zarar bedeli ve "oyundan alındı" işareti de kalkar. */
export function removeInfraction(s: State, id: string): void {
  const r = s.discipline.find((x) => x.id === id);
  if (!r) return;
  s.discipline = s.discipline.filter((x) => x.id !== id);
  if (r.cid) {
    s.charges = s.charges.filter((c) => c.id !== r.cid);
    s.payments = s.payments.filter((p) => p.cid !== r.cid);
  }
  const ev = getMatch(s, r.mid);
  if (ev && ev.removed[r.pid] === r.rule && !s.discipline.some((x) => x.pid === r.pid && x.mid === ev.id && (x.sanction === "remove" || x.sanction === "dropDay" || x.sanction === "expel"))) delete ev.removed[r.pid];
}
