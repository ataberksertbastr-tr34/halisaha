/**
 * Veri migration sistemi.
 *
 * Eski uygulamanın (legacy/index.html) "Yedeği kopyala" çıktısı şema v1 ve v2
 * olabilir; ikisi de burada eksiksiz güncel şemaya taşınır. Kural:
 *  - Bilinmeyen alanlar silinmez (ileri uyumluluk).
 *  - Her şema değişikliği yeni bir adım (STEPS) ve test ister.
 *  - Daha yeni bir uygulamadan gelen yedek reddedilir (veri kaybını önlemek için).
 */
import { defaults, SCHEMA_VERSION } from "./schema";
import type { Att, Field, Match, Player, Pos, State } from "./types";
import { clampRating, uid } from "./text";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export class BackupError extends Error {
  constructor(public code: "invalid" | "future", message?: string) {
    super(message || code);
    this.name = "BackupError";
  }
}

const POS_OK = new Set(["", "GK", "DEF", "MID", "FWD"]);
const ATT_OK = new Set(["in", "maybe", "out", "late"]);
const STATUS_OK = new Set(["open", "played", "cancelled"]);

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const arr = <T = Raw>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const num = (x: unknown, d = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};
const str = (x: unknown) => (x == null ? "" : String(x));

/**
 * v1 → v2 (eski uygulamadaki migrate() ile birebir aynı mantık; idempotent):
 *  - settings.field (metin) → fields[] kaydı + defaultFieldId
 *  - oyuncu/misafir gk:true → pos:"GK"
 *  - maç field (isim) → fieldId
 */
function legacyV1toV2(s: Raw): Raw {
  const d = defaults();
  const old = isObj(s.settings) ? s.settings : {};
  s.settings = Object.assign(d.settings, old);
  if (!Array.isArray(s.settings.slots)) s.settings.slots = d.settings.slots;
  s.fields = arr(s.fields);
  if (typeof s.settings.field === "string") {
    const name = s.settings.field.trim();
    if (name && !s.fields.some((f: Raw) => f && f.name === name)) {
      const f = { id: uid(), name, address: "", link: "", phone: "", price: num(s.settings.price), lat: null, lng: null };
      s.fields.push(f);
      if (!s.settings.defaultFieldId) s.settings.defaultFieldId = f.id;
    }
    delete s.settings.field;
  }
  s.players = arr(s.players);
  s.players.forEach((p: Raw) => {
    if (!isObj(p)) return;
    if (!p.pos) p.pos = p.gk ? "GK" : "";
    delete p.gk;
    if (p.phone == null) p.phone = "";
  });
  s.matches = arr(s.matches);
  s.matches.forEach((m: Raw) => {
    if (!isObj(m)) return;
    m.att = m.att || {}; m.order = m.order || []; m.guests = m.guests || []; m.paid = m.paid || {};
    m.exempt = m.exempt || {}; m.teams = m.teams || { a: [], b: [] };
    arr(m.guests).forEach((g: Raw) => {
      if (!isObj(g)) return;
      if (!g.pos) g.pos = g.gk ? "GK" : "";
      delete g.gk;
    });
    if (!m.fieldId && m.field) {
      const f = s.fields.find((x: Raw) => x && x.name === m.field);
      if (f) m.fieldId = f.id;
    }
  });
  s.updatedAt = s.updatedAt || 0;
  return s;
}

/** Sürüm N'den N+1'e geçiş adımları (v1→v2 yukarıdaki legacyV1toV2'dir). */
const STEPS: Record<number, (s: Raw) => Raw> = {};

function detectVersion(s: Raw): number {
  const v = Math.floor(num(s.v, 1));
  return v >= 1 ? v : 1;
}

/** Tip güvenliği için son temizlik: eksik alanları varsayılanla doldurur, hiçbir bilgiyi silmez. */
function normalize(s: Raw): State {
  const d = defaults();
  const st = s.settings;
  st.price = num(st.price);
  st.format = num(st.format, 7) || 7;
  st.gkFree = st.gkFree !== false;
  st.round = st.round !== false;
  st.lang = st.lang === "en" ? "en" : "tr";
  st.theme = st.theme === "light" || st.theme === "dark" ? st.theme : "system";
  st.iban = str(st.iban); st.ibanName = str(st.ibanName); st.defaultFieldId = str(st.defaultFieldId);
  st.slots = arr(st.slots).filter(isObj).map((x: Raw) => ({ ...x, d: x.d === "" || x.d == null ? "" : num(x.d), t: str(x.t) || "21:00" }));
  if (!st.slots.length) st.slots = d.settings.slots;

  s.fields = arr(s.fields).filter(isObj).map((f: Raw): Field => ({
    ...f, id: str(f.id) || uid(), name: str(f.name), address: str(f.address), link: str(f.link), phone: str(f.phone),
    price: num(f.price), lat: f.lat === "" || f.lat == null ? null : num(f.lat), lng: f.lng === "" || f.lng == null ? null : num(f.lng),
  }));

  s.players = arr(s.players).filter(isObj).map((p: Raw): Player => ({
    ...p, id: str(p.id) || uid(), name: str(p.name), rating: clampRating(p.rating || 3), pos: (POS_OK.has(p.pos) ? p.pos : "") as Pos,
    phone: str(p.phone), active: p.active !== false,
  }));

  s.matches = arr(s.matches).filter(isObj).map((m: Raw): Match => {
    const att: Record<string, Att> = {};
    if (isObj(m.att)) for (const k in m.att) if (ATT_OK.has(m.att[k])) att[k] = m.att[k];
    const flags = (o: Raw) => {
      const r: Record<string, boolean> = {};
      if (isObj(o)) for (const k in o) if (o[k]) r[k] = true;
      return r;
    };
    const teams = isObj(m.teams) ? m.teams : {};
    return {
      ...m,
      id: str(m.id) || uid(), date: str(m.date), time: str(m.time) || "21:00", fieldId: str(m.fieldId),
      price: num(m.price), format: num(m.format) || st.format,
      status: STATUS_OK.has(m.status) ? m.status : "open",
      att, order: arr(m.order).map(str),
      guests: arr(m.guests).filter(isObj).map((g: Raw) => ({ ...g, id: str(g.id), name: str(g.name), rating: clampRating(g.rating || 3), pos: (POS_OK.has(g.pos) ? g.pos : "") as Pos })),
      paid: flags(m.paid), exempt: flags(m.exempt),
      teams: { a: arr(teams.a).map(str), b: arr(teams.b).map(str) },
      score: isObj(m.score) ? { a: num(m.score.a), b: num(m.score.b) } : null,
    };
  });
  s.v = SCHEMA_VERSION;
  s.updatedAt = num(s.updatedAt);
  return s as State;
}

/**
 * Her türlü girdiyi güncel şemaya taşır. Geçersiz girdide boş durum döner
 * (eski uygulamayla aynı). Yedek içe aktarımı için parseBackup kullanılmalı.
 */
export function migrate(input: unknown): State {
  if (!isObj(input)) return defaults();
  let s: Raw = JSON.parse(JSON.stringify(input));
  let v = detectVersion(s);
  if (v > SCHEMA_VERSION) throw new BackupError("future");
  // v1→v2 dönüşümü eski uygulamada sürümden bağımsız çalışıyordu; aynı güvenceyi koruyoruz.
  if (v <= 2) s = legacyV1toV2(s);
  if (v < 2) v = 2;
  while (v < SCHEMA_VERSION) {
    s = STEPS[v](s);
    v++;
  }
  return normalize(s);
}

/** Yedek metnini doğrular ve taşır. Eski uygulamadaki kontrolün aynısı: players ve matches dizi olmalı. */
export function parseBackup(text: string): State {
  let obj: unknown;
  try {
    obj = JSON.parse(String(text).trim().replace(/^﻿/, ""));
  } catch {
    throw new BackupError("invalid");
  }
  if (!isObj(obj) || !Array.isArray(obj.players) || !Array.isArray(obj.matches)) throw new BackupError("invalid");
  return migrate(obj);
}
