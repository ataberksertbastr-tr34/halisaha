/**
 * Skor tabelası motoru. Oyunun durumu sayı kayıtlarından (pts) her seferinde
 * yeniden hesaplanır; böylece "Geri al" yalnızca son kaydı siler.
 *
 *  - Voleybol (Kural 18.2): her ralli bir sayı, setler 25'e, karar seti 15'e,
 *    en az 2 sayı fark, 3 sette 2 alan kazanır. Servisi ralliyi kazanan atar.
 *  - Ayak tenisi (Kural 19.5): setler 15'e, 2 fark, 3 sette 2.
 *  - Masa tenisi (Kural 20.1, 20.3): oyunlar 11'e, 2 fark; herkes art arda
 *    2 servis atar, 10-10'dan sonra servis her sayıda değişir; bir oyunda ilk
 *    servisi atan, sonraki oyunda ilk servisi karşılar.
 *  - Tavla (Kural 21.4): 5 sayıya, mars 2 sayı ("a2").
 */
import type { Game, GameCfg, GameType, Match } from "./types";
import { agreeValue } from "./kinds";
import { uid } from "./text";

export type Side = "a" | "b";
export const other = (x: Side): Side => (x === "a" ? "b" : "a");

export interface GameState {
  /** Biten setler [a, b] */
  sets: [number, number][];
  /** Süren set */
  cur: [number, number];
  setsWon: [number, number];
  done: boolean;
  win: Side | "d" | null;
  /** Servis sırası kimde (servis kuralı yoksa null) */
  server: Side | null;
  /** Süren setin hedefi */
  target: number;
  /** Set/oyun puanı: bir sayı sonra set ya da maç bitebilir */
  point: Side | null;
}

const idx = (x: Side) => (x === "a" ? 0 : 1);

function parsePt(p: string): { side: Side; n: number } | null {
  const side = p[0];
  if (side !== "a" && side !== "b") return null;
  const n = Number(p.slice(1)) || 1;
  return { side, n };
}

/** Setin bitip bitmediği. */
function setOver(cfg: GameCfg, cur: [number, number], target: number, side: Side): boolean {
  if (!target) return false;
  const me = cur[idx(side)], them = cur[idx(other(side))];
  return me >= target && (!cfg.by2 || me - them >= 2);
}

export function replay(g: Pick<Game, "cfg" | "pts" | "first" | "win">): GameState {
  const cfg = g.cfg;
  const need = Math.ceil(Math.max(1, cfg.bestOf) / 2);
  const sets: [number, number][] = [];
  let cur: [number, number] = [0, 0];
  const won: [number, number] = [0, 0];
  let setFirst: Side = g.first;
  let server: Side = setFirst;
  let done = false;
  let win: Side | "d" | null = null;
  const targetOf = () => (sets.length === Math.max(1, cfg.bestOf) - 1 && cfg.last ? cfg.last : cfg.to);
  for (const raw of g.pts) {
    if (done) break;
    const p = parsePt(raw);
    if (!p) continue;
    cur[idx(p.side)] += p.n;
    if (cfg.serve === "rally") server = p.side;
    if (setOver(cfg, cur, targetOf(), p.side)) {
      sets.push(cur);
      won[idx(p.side)]++;
      cur = [0, 0];
      if (won[idx(p.side)] >= need) {
        done = true;
        win = p.side;
      } else {
        setFirst = other(setFirst);
        server = setFirst;
      }
    }
  }
  if (g.win) {
    done = true;
    win = g.win;
  }
  const target = targetOf();
  let srv: Side | null = null;
  if (!done && cfg.serve === "rally") srv = server;
  if (!done && cfg.serve === "tt") {
    const n = cur[0] + cur[1];
    const deuce = target > 1 && cur[0] >= target - 1 && cur[1] >= target - 1;
    if (deuce) srv = (n - 2 * (target - 1)) % 2 === 0 ? setFirst : other(setFirst);
    else srv = Math.floor(n / 2) % 2 === 0 ? setFirst : other(setFirst);
  }
  let point: Side | null = null;
  if (!done && target) {
    for (const side of ["a", "b"] as Side[]) {
      const next: [number, number] = [cur[0], cur[1]];
      next[idx(side)]++;
      if (setOver(cfg, next, target, side)) point = side;
    }
  }
  return { sets, cur, setsWon: won, done, win, server: srv, target, point };
}

/** Sayı ekler (oyun bitmişse eklemez). */
export function addPoint(g: Game, side: Side, n = 1): boolean {
  if (replay(g).done) return false;
  g.pts.push(n > 1 ? side + n : side);
  g.done = replay(g).done;
  return true;
}

/** Son kaydı geri alır; elle verilen sonucu da kaldırır. */
export function undoPoint(g: Game): boolean {
  if (g.win) {
    delete g.win;
    g.done = replay(g).done;
    return true;
  }
  if (!g.pts.length) return false;
  g.pts.pop();
  g.done = replay(g).done;
  return true;
}

/** Skor özeti: "25-21, 18-25, 15-12" ya da tek sayılı oyunda "5-3". */
export function scoreLine(g: Game): string {
  const st = replay(g);
  if (g.type === "result") return "";
  if (g.type !== "sets") {
    const t: [number, number] = st.sets.length ? st.sets[0] : st.cur;
    return t[0] + "-" + t[1];
  }
  const parts = st.sets.map((x) => x[0] + "-" + x[1]);
  if (!st.done && (st.cur[0] || st.cur[1])) parts.push(st.cur[0] + "-" + st.cur[1]);
  return parts.join(", ");
}

/** Türe ve ön anlaşmalara göre oyun ayarı. */
export function presetFor(m: Pick<Match, "kind" | "agree">, type: GameType): GameCfg {
  if (type === "tavla") {
    const to = Number(agreeValue(m, "tavla")) || 5;
    return { to, last: to, bestOf: 1, by2: false, serve: "" };
  }
  if (type === "rounds" || type === "result") return { to: 0, last: 0, bestOf: 1, by2: false, serve: "" };
  switch (m.kind) {
    case "volleyball": {
      const f = agreeValue(m, "fmt");
      if (f === "bo1") return { to: 25, last: 25, bestOf: 1, by2: true, serve: "rally" };
      if (f === "bo3s") return { to: 21, last: 15, bestOf: 3, by2: true, serve: "rally" };
      return { to: 25, last: 15, bestOf: 3, by2: true, serve: "rally" };
    }
    case "footvolley":
      return agreeValue(m, "sets") === "bo1" ? { to: 15, last: 15, bestOf: 1, by2: true, serve: "rally" } : { to: 15, last: 15, bestOf: 3, by2: true, serve: "rally" };
    case "tabletennis": {
      const bo = Number(agreeValue(m, "bo")) === 5 ? 5 : 3;
      return { to: 11, last: 11, bestOf: bo, by2: true, serve: "tt" };
    }
    default:
      return { to: 21, last: 15, bestOf: 3, by2: true, serve: "rally" };
  }
}

export function newGame(m: Pick<Match, "kind" | "agree">, type: GameType, a: string[], b: string[], label: string, at: string, first: Side = "a"): Game {
  return { id: uid(), type, label, a: [...a], b: [...b], cfg: presetFor(m, type), pts: [], first, done: false, at };
}

/** Sonucu doğrudan girilen oyun (masa sonucu, "kazanan kalır" maçı). */
export function resultGame(a: string[], b: string[], win: Side | "d", label: string, at: string): Game {
  return { id: uid(), type: "result", label, a: [...a], b: [...b], cfg: { to: 0, last: 0, bestOf: 1, by2: false, serve: "" }, pts: [], first: "a", win, done: true, at };
}

/** Oyunun kazananı (sayıyla bitmiş ya da elle verilmiş); bitmediyse null. */
export function winnerOf(g: Pick<Game, "cfg" | "pts" | "first" | "win">): Side | "d" | null {
  const st = replay(g);
  return st.done ? st.win : null;
}

/** Etkinliğin takım skoru (oyunlardan): her tarafın kazandığı oyun sayısı. */
export function gamesTally(m: Match): { a: number; b: number } | null {
  const team = (ids: string[], side: string[]) => ids.length && ids.every((id) => side.includes(id)) && side.every((id) => ids.includes(id));
  let a = 0, b = 0, any = false;
  for (const g of m.games || []) {
    const w = winnerOf(g);
    if (!w || w === "d") continue;
    const ga = team(g.a, m.teams.a) && team(g.b, m.teams.b);
    const gb = team(g.a, m.teams.b) && team(g.b, m.teams.a);
    if (!ga && !gb) continue;
    any = true;
    const winA = (w === "a") === ga;
    if (winA) a++;
    else b++;
  }
  return any ? { a, b } : null;
}
