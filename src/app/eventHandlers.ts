/**
 * Etkinlik eylemleri: yeni etkinlik, hazırlık listesi, ön anlaşmalar, araç
 * paylaşımı, maç saati, raunt/set/masa sonuçları, kura ve sıra, disiplin,
 * duyurular. Halı saha eylemleri handlers.ts'te.
 */
import { t } from "../i18n";
import { commit, mutate, render, store, today, ui } from "./store";
import { go } from "./router";
import { registerActions } from "./actions";
import type { Game, Kind, Match, Sanction } from "../domain/types";
import { KINDS } from "../domain/types";
import { active, currentMatch, getMatch, getP } from "../domain/lineup";
import { makeEvent } from "../domain/schedule";
import { applyFixed, blockedFor } from "../domain/roster";
import { agreeValue, isFootball } from "../domain/kinds";
import { newCar, seatsLeft } from "../domain/cars";
import { addPoint, newGame, other, replay, resultGame, undoPoint, winnerOf, type Side } from "../domain/scoring";
import { drawTables, drawTeams, partners, queueResult, startQueue, syncQueue, tableGame } from "../domain/draw";
import { addInfraction, removeInfraction, suggest } from "../domain/discipline";
import { newExtra, toggleExtraPaid } from "../domain/ledger";
import { billOf } from "../domain/money";
import { teamName } from "../domain/teamstyle";
import { BIB_COLORS } from "../domain/teamstyle";
import { openGamePicker, openNewEvent } from "../ui/views/newEvent";
import { findGame, openScoreboard, refreshScoreboard } from "../ui/views/scoreboard";
import { discDraft, openDiscDialog, refreshDiscDialog } from "../ui/views/discipline";
import { annSet, annToggle, ruleChangeText } from "../ui/views/announce";
import { closeModal } from "../ui/modal";
import { shareText } from "../ui/share";
import { copyText } from "../ui/clipboard";
import { toast } from "../ui/toast";
import { elapsed } from "../ui/clock";

const cur = (): Match | null => currentMatch(store.s, ui.matchId, today());
const val = (sel: string) => (document.querySelector(sel) as HTMLInputElement | null)?.value ?? "";
const nameOf = (m: Match, id: string) => getP(store.s, m, id)?.name || "?";
const first = (m: Match, id: string) => nameOf(m, id).split(" ")[0];

/** Oyun tarafının adı: takımın tamamıysa takım adı, değilse ilk isimler. */
function sideName(m: Match, ids: string[]): string {
  const S = store.s;
  const same = (side: string[]) => ids.length > 0 && ids.length === side.length && ids.every((id) => side.includes(id));
  if (same(m.teams.a)) return teamName(S, "a");
  if (same(m.teams.b)) return teamName(S, "b");
  return ids.map((id) => first(m, id)).join(" & ");
}

/** Yeni oyun için taraf adayları: kura takımları ya da tek tek oyuncular. */
function pickGroups(m: Match): string[][] {
  const d = m.draw;
  if (d && d.game === "teams") return d.groups.filter((g) => g.length === d.size);
  return active(store.s, m).map((id) => [id]);
}

function buzz(): void {
  try {
    navigator.vibrate?.(120);
  } catch {
    /* titreşim yok */
  }
}

/** Masa tenisinde sıradaki iki kişinin oyunu bitince kazanan kalır (Kural 20.7). */
function advanceQueue(m: Match, g: Game): void {
  if (!m.queue || g.a.length !== 1 || g.b.length !== 1) return;
  const q = syncQueue(m.queue, active(store.s, m));
  const [x, y] = q.table;
  const pair = new Set([g.a[0], g.b[0]]);
  if (!x || !y || !pair.has(x) || !pair.has(y)) return;
  const w = winnerOf(g);
  if (w !== "a" && w !== "b") return;
  m.queue = queueResult(q, w === "a" ? g.a[0] : g.b[0], Number(agreeValue(m, "queue")) || 0);
}

let gpFirst: Side = "a";

registerActions({
  newEvent: () => openNewEvent(),
  createEvent: (ds) => {
    const k = ds.v as Kind;
    if (!KINDS.includes(k)) return;
    const S = store.s;
    const m = makeEvent(S, k, today());
    const blocked = k === "football" ? applyFixed(S, m, blockedFor(S, today())).blocked : [];
    S.matches.push(m);
    ui.matchId = m.id;
    ui.payId = m.id;
    // Yeni etkinlikte başlık, tarih ve mekân hemen düzenlensin
    ui.detailsOpen = k !== "football";
    closeModal(false, () => {
      go({ name: "match" });
      commit();
      window.scrollTo(0, 0);
      // Engelli sabit oyuncular yazılmadı (Kural 2.4, 9.1, 9.3); organizatör yine de elle ekleyebilir (12.1).
      if (blocked.length) toast(t("blockedSkipped", { n: blocked.map((id) => getP(S, m, id)?.name || "").join(", ") }), undefined, 8000);
    });
  },
  check: (ds) => {
    const m = getMatch(store.s, ds.id);
    if (!m || !ds.k) return;
    if (m.checks[ds.k]) delete m.checks[ds.k];
    else m.checks[ds.k] = true;
    commit();
  },
  clock: (ds) => {
    const m = cur();
    if (!m) return;
    const now = Date.now();
    if (ds.v === "start") m.clock = { start: now, acc: m.clock ? m.clock.acc : 0 };
    else if (ds.v === "pause" && m.clock) m.clock = { start: 0, acc: elapsed(m, now) };
    else if (ds.v === "reset") delete m.clock;
    commit();
  },
  round: (ds) => {
    const m = cur();
    if (!m) return;
    const side = ds.side === "b" ? "b" : "a";
    const sc = m.score ? { ...m.score } : { a: 0, b: 0 };
    sc[side] = Math.max(0, sc[side] + (Number(ds.d) || 0));
    m.score = sc.a || sc.b ? sc : null;
    if (Number(ds.d) > 0) buzz();
    commit();
  },
  newGame: (ds) => {
    const m = cur();
    if (!m) return;
    const S = store.s;
    let g: Game | null = null;
    if (ds.mode === "teams") {
      if (!m.teams.a.length || !m.teams.b.length) return toast(t("buildTeamsFirst"));
      g = newGame(m, "sets", m.teams.a, m.teams.b, t("gameN", { n: m.games.length + 1 }), today());
    } else if (ds.mode === "tavla") {
      const i = Number(ds.t);
      const grp = m.draw?.groups[i];
      if (!grp || grp.length !== 2) return;
      g = newGame(m, "tavla", [grp[0]], [grp[1]], t("tableN", { n: i + 1 }) + " · " + (tableGame("tavla")?.name || "Tavla"), today());
    } else if (ds.mode === "queue") {
      if (!m.queue) return;
      const q = syncQueue(m.queue, active(S, m));
      const [x, y] = q.table;
      if (!x || !y) return toast(t("queueNeedTwo"));
      g = newGame(m, "sets", [x], [y], first(m, x) + " – " + first(m, y), today());
    }
    if (!g) return;
    m.games.push(g);
    commit();
    openScoreboard(g.id);
  },
  newGamePick: () => {
    const m = cur();
    if (!m) return;
    if (pickGroups(m).length < 2) return toast(t("needPlayers"));
    gpFirst = "a";
    openGamePicker(m);
  },
  gpServe: (ds) => {
    gpFirst = ds.v === "b" ? "b" : "a";
    document.querySelectorAll<HTMLElement>('[data-a="gpServe"]').forEach((b) => {
      const on = b.dataset.v === gpFirst;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  },
  createGame: () => {
    const m = cur();
    if (!m) return;
    const groups = pickGroups(m);
    const ia = Number(val("#gp-a")), ib = Number(val("#gp-b"));
    const a = groups[ia], b = groups[ib];
    if (!a || !b || ia === ib) return toast(t("ruleSame"));
    ui.pickA = ia;
    ui.pickB = ib;
    const label = val("#gp-label").trim() || t("gameN", { n: m.games.length + 1 });
    const g = newGame(m, "sets", a, b, label, today(), gpFirst);
    m.games.push(g);
    commit();
    openScoreboard(g.id);
  },
  score: (ds) => {
    const f = findGame(ds.id!);
    if (!f) return;
    if (f.g.type === "result") return toast(t("winnerIs", { n: sideName(f.m, f.g.win === "b" ? f.g.b : f.g.a) }));
    openScoreboard(f.g.id);
  },
  pt: (ds) => {
    const f = findGame(ds.id!);
    if (!f) return;
    const { m, g } = f;
    const wasDone = replay(g).done;
    if (!addPoint(g, ds.side === "b" ? "b" : "a", Number(ds.n) || 1)) return;
    const st = replay(g);
    if (!wasDone && st.done) {
      advanceQueue(m, g);
      buzz();
      if (st.win === "a" || st.win === "b") toast(t("winnerIs", { n: sideName(m, st.win === "a" ? g.a : g.b) }));
    } else if (st.point) buzz();
    commit();
    refreshScoreboard(g.id);
  },
  ptUndo: (ds) => {
    const f = findGame(ds.id!);
    if (!f || !undoPoint(f.g)) return;
    commit();
    refreshScoreboard(f.g.id);
  },
  ptServe: (ds) => {
    const f = findGame(ds.id!);
    if (!f || f.g.pts.length) return;
    f.g.first = other(f.g.first);
    commit();
    refreshScoreboard(f.g.id);
  },
  ptEnd: (ds) => {
    const f = findGame(ds.id!);
    if (!f) return;
    f.g.win = ds.w === "b" ? "b" : "a";
    f.g.done = true;
    advanceQueue(f.m, f.g);
    commit();
    refreshScoreboard(f.g.id);
  },
  delGame: (ds) => {
    const m = store.s.matches.find((x) => x.games.some((g) => g.id === ds.id));
    if (!m) return;
    mutate(t("gameDeleted"), () => {
      m.games = m.games.filter((g) => g.id !== ds.id);
    });
  },
  drawTeams: (ds) => {
    const m = cur();
    if (!m) return;
    const n = Math.max(1, Number(ds.n) || 2);
    mutate(m.draw ? t("drawDone") : null, () => {
      m.draw = drawTeams(store.s, m, n);
    });
  },
  drawGame: (ds) => {
    ui.drawGame = ds.v || "okey";
    render();
  },
  drawPairs: () => {
    ui.drawPairs = !ui.drawPairs;
    render();
  },
  drawTables: () => {
    const m = cur();
    if (!m) return;
    const g = tableGame(ui.drawGame);
    if (!g) return;
    mutate(m.draw ? t("drawDone") : null, () => {
      m.draw = drawTables(store.s, m, g.id, ui.drawPairs && !!g.pairs);
    });
  },
  tableWin: (ds) => {
    const m = cur();
    const d = m?.draw;
    if (!m || !d) return;
    const i = Number(ds.t);
    const grp = d.groups[i];
    if (!grp) return;
    const label = t("tableN", { n: i + 1 }) + " · " + (tableGame(d.game)?.name || d.game);
    let g: Game;
    if (d.pairs && grp.length === 4 && (ds.w === "0" || ds.w === "1")) {
      const [p1, p2] = partners(grp);
      g = resultGame(p1, p2, ds.w === "0" ? "a" : "b", label, today());
    } else {
      const id = ds.id!;
      if (!grp.includes(id)) return;
      g = resultGame([id], grp.filter((x) => x !== id), "a", label, today());
    }
    mutate(t("winnerIs", { n: sideName(m, g.win === "b" ? g.b : g.a) }), () => {
      m.games.push(g);
    });
  },
  queueStart: () => {
    const m = cur();
    if (!m) return;
    const ids = active(store.s, m);
    if (ids.length < 2) return toast(t("queueNeedTwo"));
    mutate(m.queue ? t("drawDone") : null, () => {
      m.queue = startQueue(ids);
    });
  },
  queueWin: (ds) => {
    const m = cur();
    if (!m || !m.queue) return;
    const q = syncQueue(m.queue, active(store.s, m));
    const [x, y] = q.table;
    const w = ds.id!;
    if (!x || !y || (w !== x && w !== y)) return;
    mutate(t("wonShort", { n: nameOf(m, w) }), () => {
      m.games.push(resultGame([x], [y], w === x ? "a" : "b", first(m, x) + " – " + first(m, y), today()));
      m.queue = queueResult(q, w, Number(agreeValue(m, "queue")) || 0);
    });
  },
  addCar: () => {
    const m = cur();
    if (!m) return;
    const d = val("#newCarDriver");
    if (!d) return;
    m.cars.forEach((c) => {
      c.pax = c.pax.filter((x) => x !== d);
    });
    m.cars.push(newCar(d));
    commit();
  },
  delCar: (ds) => {
    const m = cur();
    if (!m) return;
    mutate(t("carDeleted"), () => {
      m.cars = m.cars.filter((c) => c.id !== ds.id);
    });
  },
  carPax: (ds) => {
    const m = cur();
    if (!m) return;
    const c = m.cars.find((x) => x.id === ds.car);
    const id = ds.id!;
    if (!c) return;
    if (c.pax.includes(id)) c.pax = c.pax.filter((x) => x !== id);
    else {
      if (!seatsLeft(c)) return toast(t("carFull"));
      m.cars.forEach((x) => {
        x.pax = x.pax.filter((p) => p !== id);
      });
      c.pax.push(id);
    }
    commit();
  },
  addExtra: (ds) => {
    const S = store.s;
    const m = getMatch(S, ds.id);
    if (!m) return;
    const amount = Number(String(val("#xc-amount")).replace(",", "."));
    if (!(amount > 0)) return toast(t("amountBad"));
    const who = val("#xc-who");
    const note = val("#xc-note").trim() || t("extraCharge");
    const at = m.date <= today() ? m.date : today();
    let ids: string[];
    if (who === "__all") {
      const b = billOf(S, m).payers;
      ids = b.length ? b : active(S, m);
    } else ids = who ? [who] : [];
    if (!ids.length) return toast(t("needPlayers"));
    const per = Math.round((who === "__all" ? amount / ids.length : amount) * 100) / 100;
    mutate(t("extraAdded"), () => {
      ids.forEach((id) => S.charges.push(newExtra(id, per, at, note, m.id, "15.4")));
    });
  },
  extraPaid: (ds) => {
    const S = store.s;
    const x = S.charges.find((c) => c.id === ds.id);
    if (!x) return;
    mutate(null, () => {
      if (!toggleExtraPaid(S, x, today())) return false;
    });
  },
  delExtra: (ds) => {
    const S = store.s;
    mutate(t("extraDeleted"), () => {
      S.charges = S.charges.filter((c) => c.id !== ds.id);
      S.payments = S.payments.filter((p) => p.cid !== ds.id);
      S.discipline.forEach((r) => {
        if (r.cid === ds.id) delete r.cid;
      });
    });
  },
  discNew: (ds) => openDiscDialog(ds.id || "", ds.mid || ""),
  discSave: () => {
    const S = store.s;
    const d = discDraft();
    d.amount = val("#disc-amount");
    d.note = val("#disc-note").trim();
    if (!d.pid) return;
    const m = getMatch(S, d.mid);
    const sug = suggest(S, d.pid, d.type, m);
    const sanction = (d.sanction || sug.sanction) as Sanction;
    const step = !d.sanction || d.sanction === sug.sanction ? sug.step : undefined;
    const amount = Number(String(d.amount).replace(",", "."));
    if (sanction === "damage" && !(amount > 0)) return toast(t("amountBad"));
    const at = m && m.date <= today() ? m.date : today();
    closeModal(false, () =>
      mutate(t("discSaved"), () => {
        addInfraction(S, { pid: d.pid, type: d.type, at, sanction, step, rule: sug.rule, mid: d.mid || undefined, target: d.target || undefined, amount: amount > 0 ? amount : undefined, note: d.note }, today());
      }),
    );
  },
  discDel: (ds) => {
    mutate(t("discRemoved"), () => removeInfraction(store.s, ds.id!));
  },
  annMove: (ds) => {
    annToggle(ds.v || "");
    render();
  },
  shareArea: (ds) => {
    const ta = document.getElementById(ds.v || "") as HTMLTextAreaElement | null;
    if (ta) shareText(ta.value);
  },
  copyArea: (ds) => {
    const ta = document.getElementById(ds.v || "") as HTMLTextAreaElement | null;
    if (ta) copyText(ta.value);
  },
});

/** Etkinlik alanları (data-f). İşlendiyse true. */
export function onEventField(el: HTMLInputElement | HTMLSelectElement): boolean {
  const f = el.dataset.f || "";
  const v = el.value;
  const S = store.s;
  if (f.startsWith("disc.")) {
    const d = discDraft();
    const k = f.slice(5) as "pid" | "type" | "mid" | "sanction" | "target";
    d.amount = val("#disc-amount");
    d.note = val("#disc-note");
    if (k === "sanction") d.sanction = v as Sanction;
    else {
      d[k] = v;
      if (k !== "target") d.sanction = "";
    }
    refreshDiscDialog();
    return true;
  }
  if (f.startsWith("ann.")) {
    const k = f.slice(4) as "cancel" | "rule" | "ruleText";
    annSet(k, v);
    if (k === "ruleText") {
      const ta = document.getElementById("ann-rule") as HTMLTextAreaElement | null;
      if (ta) ta.value = ruleChangeText();
    } else render();
    return true;
  }
  if (f.startsWith("team.")) {
    const [, side, k] = f.split(".");
    const key = side === "b" ? "teamB" : "teamA";
    const ts = S.settings[key];
    if (k === "name") ts.name = v.trim().slice(0, 24);
    else if (k === "color") ts.color = BIB_COLORS.some((b) => b.hex === v) ? v : "";
    commit();
    toast(t("saved"));
    return true;
  }
  if (f.startsWith("car.")) {
    const m = cur();
    const c = m?.cars.find((x) => x.id === el.dataset.id);
    if (!c) return true;
    const k = f.slice(4);
    const n = Math.max(0, Number(String(v).replace(",", ".")) || 0);
    if (k === "seats") {
      c.seats = Math.max(2, Math.min(9, Math.round(n) || 5));
      while (c.pax.length > c.seats - 1) c.pax.pop();
    } else if (k === "fuel") c.fuel = n;
    else if (k === "toll") c.toll = n;
    commit();
    return true;
  }
  const m = cur();
  if (!m) return false;
  if (f === "m.agree") {
    const k = el.dataset.k;
    if (!k) return true;
    if (v) m.agree[k] = v;
    else delete m.agree[k];
    ui.matchId = m.id;
    commit();
    return true;
  }
  if (f === "m.title") m.title = v.trim().slice(0, 60);
  else if (f === "m.cap") m.cap = Math.max(0, Math.round(Number(v) || 0));
  else if (f === "m.lockH") m.lockH = Math.max(0, Math.round(Number(v) || 0));
  else if (f === "m.note") m.note = v.trim().slice(0, 400);
  else return false;
  ui.matchId = m.id;
  commit();
  if (!isFootball(m) && f === "m.cap") toast(t("saved"));
  return true;
}
