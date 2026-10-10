/**
 * KURALLAR.md ayrıştırıcı: altın kurallar ve numaralı maddeler.
 * Biçim:
 *   ## Kısaca: 10 altın kural      → "1. …" satırları
 *   ## 2. Ücret ve Ödeme            → bölüm
 *   **2.3 Başlık:** metin           → madde
 */
import { norm } from "./text";

export interface RuleItem {
  /** "2.3" ya da altın kural için "A3" */
  id: string;
  title: string;
  text: string;
}

export interface RuleSection {
  num: string;
  title: string;
  items: RuleItem[];
}

export interface RuleBook {
  title: string;
  intro: string;
  goldenTitle: string;
  golden: RuleItem[];
  sections: RuleSection[];
}

export function parseRules(md: string): RuleBook {
  const book: RuleBook = { title: "", intro: "", goldenTitle: "", golden: [], sections: [] };
  let mode: "intro" | "golden" | "section" = "intro";
  let sec: RuleSection | null = null;
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.+)$/))) {
      book.title = m[1].trim();
    } else if ((m = line.match(/^##\s+(\d+)\.\s*(.+)$/))) {
      sec = { num: m[1], title: m[2].trim(), items: [] };
      book.sections.push(sec);
      mode = "section";
    } else if ((m = line.match(/^##\s+(.+)$/))) {
      book.goldenTitle = m[1].trim();
      mode = "golden";
    } else if (mode === "golden" && (m = line.match(/^(\d+)\.\s+(.+)$/))) {
      book.golden.push({ id: "A" + m[1], title: "", text: m[2].trim() });
    } else if (mode === "section" && sec && (m = line.match(/^\*\*(\d+\.\d+)\s+([^*]+?):?\*\*\s*(.*)$/))) {
      sec.items.push({ id: m[1], title: m[2].replace(/:$/, "").trim(), text: m[3].trim() });
    } else if (mode === "section" && sec && sec.items.length) {
      // Önceki maddenin devam satırı
      const it = sec.items[sec.items.length - 1];
      it.text += (it.text ? " " : "") + line;
    } else if (mode === "intro") {
      book.intro += (book.intro ? " " : "") + line;
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
  const hay = norm(id + " " + item.title + " " + item.text);
  return n.split(/\s+/).every((w) => hay.includes(w));
}

export function findRule(book: RuleBook, id: string): RuleItem | null {
  for (const s of book.sections) for (const it of s.items) if (it.id === id) return it;
  return book.golden.find((g) => g.id === id) || null;
}

/** Paylaşım metni: "📖 Kural 2.3 – Başlık\nMetin" */
export function ruleShareText(item: RuleItem, goldenLabel: string): string {
  if (item.id.startsWith("A")) return "⭐ " + goldenLabel + " " + item.id.slice(1) + "\n" + stripMd(item.text);
  return "📖 Kural " + item.id + " – " + item.title + "\n" + stripMd(item.text);
}

export function stripMd(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}
