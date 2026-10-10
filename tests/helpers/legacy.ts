/**
 * ALTIN REFERANS: eski uygulamanın (legacy/index.html) hesaplama fonksiyonları,
 * küresel S yerine parametre alacak şekilde birebir kopyalandı. Yeni kodun
 * eski verilerle AYNI sonuçları verdiğini doğrulamak için kullanılır.
 * Bu dosyayı "düzeltmeyin": amacı eski davranışı dondurmaktır.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type S = any;

let seq = 0;
const uid = () => "legacy" + seq++;

export function legacyDefaults() {
  return {
    v: 2, updatedAt: 0,
    settings: { defaultFieldId: "", price: 3000, iban: "", ibanName: "", slots: [{ d: 2, t: "21:00" }, { d: 4, t: "21:00" }], format: 7, gkFree: true, round: true, lang: "tr" },
    fields: [] as any[], players: [] as any[], matches: [] as any[],
  };
}

export function legacyMigrate(s: S): S {
  s = JSON.parse(JSON.stringify(s));
  const d = legacyDefaults();
  if (!s || typeof s !== "object") return d;
  const old = s.settings || {};
  s.settings = Object.assign(d.settings, old);
  if (!Array.isArray(s.settings.slots)) s.settings.slots = d.settings.slots;
  s.fields = Array.isArray(s.fields) ? s.fields : [];
  if (typeof s.settings.field === "string") {
    if (s.settings.field.trim() && !s.fields.some((f: any) => f.name === s.settings.field.trim())) {
      const f = { id: uid(), name: s.settings.field.trim(), address: "", link: "", phone: "", price: Number(s.settings.price) || 0, lat: null, lng: null };
      s.fields.push(f);
      if (!s.settings.defaultFieldId) s.settings.defaultFieldId = f.id;
    }
    delete s.settings.field;
  }
  s.players = Array.isArray(s.players) ? s.players : [];
  s.players.forEach((p: any) => { if (!p.pos) p.pos = p.gk ? "GK" : ""; delete p.gk; if (p.phone == null) p.phone = ""; });
  s.matches = Array.isArray(s.matches) ? s.matches : [];
  s.matches.forEach((m: any) => {
    m.att = m.att || {}; m.order = m.order || []; m.guests = m.guests || []; m.paid = m.paid || {}; m.exempt = m.exempt || {}; m.teams = m.teams || { a: [], b: [] };
    m.guests.forEach((g: any) => { if (!g.pos) g.pos = g.gk ? "GK" : ""; delete g.gk; });
    if (!m.fieldId && m.field) { const f = s.fields.find((x: any) => x.name === m.field); if (f) m.fieldId = f.id; }
  });
  s.v = 2; s.updatedAt = s.updatedAt || 0;
  return s;
}

export function makeLegacy(S: S, today: string) {
  const getP = (m: any, id: string) => S.players.find((p: any) => p.id === id) || (m && m.guests.find((g: any) => g.id === id)) || null;
  const isGK = (p: any) => !!(p && p.pos === "GK");
  const capOf = (m: any) => ((m.format || S.settings.format) + 1) * 2;
  function lineup(m: any) {
    const ins = m.order.filter((id: string) => m.att[id] === "in" && getP(m, id));
    const c = capOf(m);
    return { playing: ins.slice(0, c), wait: ins.slice(c) };
  }
  const isFree = (m: any, id: string) => !!(S.settings.gkFree && isGK(getP(m, id)));
  function payersOf(m: any) {
    if (m.status === "cancelled") return [];
    const { playing } = lineup(m);
    const late = Object.keys(m.att).filter((id) => m.att[id] === "late" && getP(m, id));
    return playing.concat(late).filter((id: string) => !isFree(m, id) && !m.exempt[id]);
  }
  const roundShare = (raw: number) => (S.settings.round ? Math.ceil(raw / 5) * 5 : Math.round(raw * 100) / 100);
  const shareOf = (m: any) => { const n = payersOf(m).length; return n ? roundShare((Number(m.price) || 0) / n) : 0; };
  function estShare(m: any) {
    const n = payersOf(m).length;
    if (n) return shareOf(m);
    const c = capOf(m) - (S.settings.gkFree ? 2 : 0);
    return roundShare((Number(m.price) || 0) / Math.max(1, c));
  }
  const isDue = (m: any) => m.status === "played" || (m.status === "open" && m.date <= today);
  function debts() {
    const map: Record<string, any> = {};
    S.matches.forEach((m: any) => {
      if (m.status === "cancelled" || !isDue(m)) return;
      const sh = shareOf(m);
      payersOf(m).forEach((id: string) => {
        if (m.paid[id]) return;
        const p = getP(m, id); if (!p) return;
        map[id] = map[id] || { id, name: p.name, total: 0, n: 0, phone: p.phone || "" };
        map[id].total += sh; map[id].n++;
      });
    });
    return Object.values(map).sort((a: any, b: any) => b.total - a.total);
  }
  function computeStats() {
    const st: Record<string, any> = {};
    S.matches.forEach((m: any) => {
      if (m.status !== "played") return;
      lineup(m).playing.forEach((id: string) => { st[id] = st[id] || { p: 0, w: 0, d: 0, l: 0 }; st[id].p++; });
      if (!m.score || !(m.teams.a.length || m.teams.b.length)) return;
      const r = m.score.a > m.score.b ? "a" : m.score.a < m.score.b ? "b" : "d";
      ["a", "b"].forEach((side) => m.teams[side].forEach((id: string) => { const s = st[id]; if (!s) return; if (r === "d") s.d++; else if (r === side) s.w++; else s.l++; }));
    });
    return st;
  }
  return { getP, lineup, payersOf, shareOf, estShare, isDue, debts, computeStats, capOf };
}
