/**
 * Tek dokunuşla paylaşım: Web Share API (Android/iPhone'da paylaşım menüsü →
 * WhatsApp). Desteklenmiyorsa metin panoya kopyalanır.
 * Not: navigator.share kullanıcı dokunuşunun içinde, beklemeden çağrılmalı.
 */
import { t } from "../i18n";
import { copyText } from "./clipboard";

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export function canShareText(): boolean {
  return typeof navigator.share === "function";
}

export async function shareText(text: string): Promise<ShareResult> {
  if (canShareText()) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // İzin/biçim hatası: kopyalamaya düş
    }
  }
  return (await copyText(text, t("copiedPaste"))) ? "copied" : "failed";
}
