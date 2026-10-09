/**
 * Yedek dosyası: JSON indirme, Web Share API ile paylaşma, dosyadan okuma,
 * haftalık yedek hatırlatması kuralı.
 */
import type { State } from "../domain/types";
import { iso } from "../domain/dates";
import type { Meta } from "./persist";

export const DAY = 24 * 60 * 60 * 1000;
export const REMIND_EVERY_DAYS = 7;

export function backupFileName(d: Date = new Date()): string {
  return "halisaha-yedek-" + iso(d) + ".json";
}

/** Yedek metni: uygulama durumunun kendisi (eski "Yedeği kopyala" çıktısıyla aynı biçim). */
export function backupText(s: State): string {
  return JSON.stringify(s);
}

export function hasData(s: State): boolean {
  return s.players.length > 0 || s.matches.length > 0;
}

/** Haftalık hatırlatma: veri varsa ve son yedekten (ya da ilk kullanımdan) 7 gün geçtiyse, ertelenmemişse. */
export function reminderDue(meta: Meta, now: number, dataExists: boolean): boolean {
  if (!dataExists) return false;
  if (now < (meta.reminderSnoozeUntil || 0)) return false;
  const since = meta.lastExportAt || meta.firstUseAt || now;
  return now - since >= REMIND_EVERY_DAYS * DAY;
}

export function daysSince(ts: number, now: number): number {
  return Math.max(0, Math.floor((now - ts) / DAY));
}

function makeFile(s: State): File {
  return new File([backupText(s)], backupFileName(), { type: "application/json" });
}

export function canShareFiles(): boolean {
  try {
    const f = new File(["{}"], "x.json", { type: "application/json" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

/** Dosyayı cihaza indirir. */
export function downloadBackup(s: State): void {
  const url = URL.createObjectURL(new Blob([backupText(s)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName();
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Yedeği paylaşım menüsüyle gönderir (WhatsApp, Drive, e-posta…).
 * Dosya paylaşımı desteklenmiyorsa indirir.
 */
export async function shareBackup(s: State, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [makeFile(s)], title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  downloadBackup(s);
  return "downloaded";
}

export function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}
