/**
 * KURALLAR.md ayrıştırıcı: yönetmeliğin kısımları, bölümleri, maddeleri,
 * altın kuralları ve yaptırımlar tablosu.
 * Biçim:
 *   # Başlık
 *   alt başlık satırı, giriş paragrafı
 *   ## Altın Kurallar           → ### grup, "1. …" satırları, "> not" satırları
 *   ## Kısım 1 · Halı Saha      → kısım
 *   ### 1. Organizasyon …       → bölüm
 *   **1.1 [Bayrak] Başlık:** metin → madde (bayrak: Sıfır tolerans, Güvenlik)
 *   ## Ek · Yaptırımlar …       → "| ihlal | yaptırım | kural |" tablosu
 */
import { norm } from "./text";

export interface RuleItem {
  /** "2.3" ya da altın kural için "A3" */
  id: string;
  title: string;
  text: string;
  /** Vurgulu madde: "Sıfır tolerans", "Güvenlik" */
  flag?: string;
}

export interface RuleSection {
  num: string;
  title: string;
  /** Bağlı olduğu kısım numarası */
  part: string;
  items: RuleItem[];
}

export interface RulePart {
  num: string;
  title: string;
}

export interface GoldenGroup {
  title: string;
  items: RuleItem[];
}

export interface SanctionRow {
  violation: string;
  sanction: string;
  rules: string[];
  /** Ağır yaptırım (tabloda kalın) */
  severe: boolean;
}

export interface RuleBook {
  title: string;
  subtitle: string;
  intro: string;
  goldenTitle: string;
  goldenGroups: GoldenGroup[];
  golden: RuleItem[];
  notes: string[];
  parts: RulePart[];
  sections: RuleSection[];
  appendixTitle: string;
  appendixIntro: string;
  sanctions: SanctionRow[];
}

export function parseRules(md: string): RuleBook {
  const book: RuleBook = { title: "", subtitle: "", intro: "", goldenTitle: "", goldenGroups: [], golden: [], notes: [], parts: [], sections: [], appendixTitle: "", appendixIntro: "", sanctions: [] };
  let mode: "intro" | "golden" | "part" | "appendix" = "intro";
  let sec: RuleSection | null = null;
  let part = "";
  let header = true;
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.+)$/))) {
      book.title = m[1].trim();
    } else if ((m = line.match(/^##\s+Kısım\s+(\d+)\s*[·:.-]\s*(.+)$/i))) {
      part = m[1];
      book.parts.push({ num: m[1], title: m[2].trim() });
      mode = "part";
      sec = null;
    } else if ((m = line.match(/^##\s+Ek\s*[·:.-]\s*(.+)$/i))) {
      book.appendixTitle = m[1].trim();
      mode = "appendix";
      sec = null;
    } else if ((m = line.match(/^#{2,3}\s+(\d+)\.\s*(.+)$/))) {
      sec = { num: m[1], title: m[2].trim(), part, items: [] };
      book.sections.push(sec);
      if (mode !== "part") mode = "part";
    } else if ((m = line.match(/^##\s+(.+)$/))) {
      book.goldenTitle = m[1].trim();
      mode = "golden";
    } else if (mode === "golden" && (m = line.match(/^###\s+(.+)$/))) {
      book.goldenGroups.push({ title: m[1].trim(), items: [] });
    } else if (mode === "golden" && (m = line.match(/^(\d+)\.\s+(.+)$/))) {
      const it: RuleItem = { id: "A" + m[1], title: "", text: m[2].trim() };
      if (!book.goldenGroups.length) book.goldenGroups.push({ title: "", items: [] });
      book.goldenGroups[book.goldenGroups.length - 1].items.push(it);
      book.golden.push(it);
    } else if ((m = line.match(/^>\s*(.+)$/))) {
      book.notes.push(m[1].trim());
    } else if (mode === "part" && sec && (m = line.match(/^\*\*(\d+\.\d+)\s+(?:\[([^\]]+)\]\s*)?([^*]+?):?\*\*\s*(.*)$/))) {
      const it: RuleItem = { id: m[1], title: m[3].replace(/:$/, "").trim(), text: m[4].trim() };
      if (m[2]) it.flag = m[2].trim();
      sec.items.push(it);
    } else if (mode === "part" && sec && sec.items.length) {
      // Önceki maddenin devam satırı
      const it = sec.items[sec.items.length - 1];
      it.text += (it.text ? " " : "") + line;
    } else if (mode === "appendix" && (m = line.match(/^\|(.+)\|$/))) {
      const cells = m[1].split("|").map((c) => c.trim());
      if (cells.length < 3 || /^-+$/.test(cells[0].replace(/[:\s]/g, ""))) continue;
      if (header) {
        header = false; // ilk satır sütun başlıkları
        continue;
      }
      book.sanctions.push({
        violation: stripMd(cells[0]),
        sanction: stripMd(cells[1]),
        rules: stripMd(cells[2]).split(/[,·]/).map((x) => x.trim()).filter(Boolean),
        severe: /^\*\*.+\*\*$/.test(cells[1]),
      });
    } else if (mode === "appendix") {
      book.appendixIntro += (book.appendixIntro ? " " : "") + line;
    } else if (mode === "intro") {
      if (!book.subtitle && /·/.test(line) && line.length < 90) book.subtitle = line;
      else book.intro += (book.intro ? " " : "") + line;
    }
  }
  return book;
}

/** Bir madde arama sorgusuna uyuyor mu (Türkçe karakterden bağımsız; "2.3" gibi numarayla da). */
export function matchesRule(item: RuleItem, q: string): boolean {
  const n = norm(q);
  if (!n) return true;
  const id = item.id.startsWith("A") ? "" : item.id;
  if (id && (id === n || ("kural " + id) === n)) return true;
  if (/^(kural\s+)?\d+\.\d+$/.test(n)) return false;
  const hay = norm(id + " " + item.title + " " + item.text + " " + (item.flag || ""));
  return n.split(/\s+/).every((w) => hay.includes(w));
}

export function findRule(book: RuleBook, id: string): RuleItem | null {
  for (const s of book.sections) for (const it of s.items) if (it.id === id) return it;
  return book.golden.find((g) => g.id === id) || null;
}

export function sectionOf(book: RuleBook, id: string): RuleSection | null {
  const num = id.split(".")[0];
  return book.sections.find((s) => s.num === num) || null;
}

/** Kural kitabını paylaşırken başa yazılan tanıtım: Predators ne, kitap neyi anlatır. */
export const PREDATORS_ABOUT =
  "Predators; halı saha maçları ile paintball, airsoft, voleybol, ayak tenisi, masa tenisi ve kıraathane etkinlikleri düzenleyen bir gruptur. " +
  "Bu kitap grubun nasıl işlediğini anlatır: maça yazılma ve kadro, ödeme, takımlar, sahada ve grupta davranış, disiplin ve etkinlik kuralları.";

/** Paylaşılan madde satırı (WhatsApp'ta *…* kalın görünür). */
function itemLine(it: RuleItem): string {
  return (it.flag ? "⚠️ " : "") + "*" + it.id + " " + it.title + (it.flag ? " (" + it.flag + ")" : "") + ":* " + stripMd(it.text);
}

const footer = (book: RuleBook) => "— Predators · " + book.title;

/** Bir bölümün bütün maddeleri tek mesajda: "📖 *Bölüm 17 – Airsoft*", 17.1, 17.2 … */
export function sectionShareText(book: RuleBook, num: string): string {
  const s = book.sections.find((x) => x.num === num);
  if (!s) return "";
  const part = book.parts.find((p) => p.num === s.part);
  return "📖 *Bölüm " + s.num + " – " + s.title + "*" + (part ? "\n_Kısım " + part.num + " · " + part.title + "_" : "") +
    "\n\n" + s.items.map(itemLine).join("\n\n") + "\n\n" + footer(book);
}

/**
 * Bütün kural kitabı tek mesajda: Predators tanıtımı, giriş, altın kurallar, notlar, üç kısım
 * ve bütün bölümler, yaptırımlar özet tablosu.
 */
export function bookShareText(book: RuleBook, about: string = PREDATORS_ABOUT): string {
  const up = (x: string) => x.toLocaleUpperCase("tr");
  const out: string[] = ["📘 *" + up(book.title) + "*" + (book.subtitle ? "\n" + book.subtitle : "")];
  if (about) out.push(about);
  if (book.intro) out.push(stripMd(book.intro));
  if (book.golden.length) {
    out.push("⭐ *" + up(book.goldenTitle) + "*");
    for (const g of book.goldenGroups) out.push((g.title ? "_" + g.title + "_\n" : "") + g.items.map((x) => x.id.slice(1) + ". " + stripMd(x.text)).join("\n"));
  }
  if (book.notes.length) out.push(book.notes.map((n) => "ℹ️ " + stripMd(n)).join("\n"));
  const parts = book.parts.length ? book.parts : [{ num: "", title: "" }];
  for (const p of parts) {
    if (p.num) out.push("━━━━━━━━━━\n*KISIM " + p.num + " · " + up(p.title) + "*");
    for (const s of book.sections.filter((x) => !p.num || x.part === p.num)) {
      out.push("📖 *" + s.num + ". " + s.title + "*\n\n" + s.items.map(itemLine).join("\n\n"));
    }
  }
  if (book.sanctions.length) {
    out.push("━━━━━━━━━━\n*" + up(book.appendixTitle) + "*" + (book.appendixIntro ? "\n" + stripMd(book.appendixIntro) : ""));
    out.push(book.sanctions.map((r) => "• " + r.violation + ": " + r.sanction + " (Kural " + r.rules.join(", ") + ")").join("\n"));
  }
  out.push(footer(book));
  return out.join("\n\n");
}

/** Paylaşım metni: "📖 Kural 2.3 – Başlık\nMetin" */
export function ruleShareText(item: RuleItem, goldenLabel: string): string {
  if (item.id.startsWith("A")) return "⭐ " + goldenLabel + " " + item.id.slice(1) + "\n" + stripMd(item.text);
  return (item.flag ? "⚠️ " : "📖 ") + "Kural " + item.id + " – " + item.title + "\n" + stripMd(item.text);
}

export function stripMd(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}
