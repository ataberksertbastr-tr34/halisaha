/**
 * Panodaki metnin türü: WhatsApp kadro listesi mi, banka bildirimi mi (Kural 1.2, 2.3).
 * Organizatör metni WhatsApp'ta ya da banka uygulamasında kopyalar; "WhatsApp listesini
 * yapıştır" ya da "Banka bildirimini yapıştır"a dokununca uygulama panoya bakar ve doğru
 * önizlemeyi doğrudan açar. Liste önce denenir: davet listesinin "kişi başı 320 ₺" satırı
 * tutar içerir ama listedeki numaralı isimler onu liste yapar.
 */
import { parseList } from "./signup";
import { parseBank } from "./bank";

export type ClipKind = "list" | "bank" | "none";

export function clipKind(text: string, today: string): ClipKind {
  const s = String(text || "");
  if (!s.trim()) return "none";
  if (parseList(s).length >= 2) return "list";
  // Banka: tutarı ve gönderen adı (ya da giden para işareti) olan en az bir satır
  if (parseBank(s, today).some((l) => l.sender || l.out)) return "bank";
  return "none";
}
