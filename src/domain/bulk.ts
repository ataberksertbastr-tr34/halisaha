/**
 * Toplu oyuncu ekleme satırı: "Ali Yılmaz", "3. Ali Yılmaz" ya da mevki ve seviyeyle
 * "Ali Yılmaz, DOS, 4" / "Ali Yılmaz - Defans - 3/5". Mevki ve seviye yalnızca ayraçtan
 * (virgül, noktalı virgül, dikey çizgi, eğik çizgi ya da boşluklu tire) sonra aranır; ayraçsız
 * "Mehmet Amca 1" gibi rakamlı adlar bozulmaz.
 */
import type { Pos } from "./types";
import { cleanBulkLine, cleanName } from "./text";

export interface BulkLine {
  name: string;
  pos: Pos;
  /** 1–5; yazılmadıysa 3 */
  rating: number;
}

const POS_WORDS: [Exclude<Pos, "">, string[]][] = [
  ["GK", ["k", "kaleci", "gk", "keeper", "goalkeeper"]],
  ["DEF", ["d", "defans", "def", "df", "defender", "stoper", "bek"]],
  ["DM", ["dos", "defansif orta saha", "defansif", "dm"]],
  ["MID", ["os", "orta saha", "ortasaha", "orta", "mid", "mf", "midfielder"]],
  ["AM", ["oos", "ofansif orta saha", "ofansif", "am"]],
  ["FWD", ["f", "forvet", "fw", "fwd", "forward", "santrafor"]],
];
const POS_OF = new Map<string, Exclude<Pos, "">>(POS_WORDS.flatMap(([p, ws]) => ws.map((w): [string, Exclude<Pos, "">] => [w, p])));
const SEP = /\s*[,;|/]\s*|\s+[-–—]\s+/u;

const low = (x: string) => x.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

/** Satırı ad, mevki ve seviyeye ayırır; ad yoksa null. */
export function parseBulkLine(raw: string): BulkLine | null {
  // Baştaki liste numarası ("3. ", "4- ") ve "4/5" seviye yazımı ayraçla karışmasın
  const line = String(raw || "").replace(/^\s*\d+\s*[.)\-:]\s*/, "").replace(/(?<!\d)([1-5])\s*\/\s*5(?!\d)/g, "$1");
  const [first, ...rest] = line.split(SEP);
  let pos: Pos = "";
  let rating = 3;
  const extra: string[] = [];
  for (const tok of rest) {
    const w = low(tok);
    if (!w) continue;
    const lv = /^(?:seviye\s*)?([1-5])$/u.exec(w);
    if (POS_OF.has(w) && !pos) pos = POS_OF.get(w)!;
    else if (lv) rating = Number(lv[1]);
    else extra.push(tok);
  }
  // Tanınmayan parçalar adın devamı sayılır (bilgi kaybolmasın)
  const name = cleanName(cleanBulkLine([first, ...extra].join(" ")));
  return name ? { name, pos, rating } : null;
}
