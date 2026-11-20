/**
 * Görsel penceresi (kadro, takımlar, maç afişi): görsel cihazda çizilir, önizlenir; "Paylaş"
 * dosyayı paylaşım menüsüyle (WhatsApp) gönderir, desteklenmiyorsa indirir. Görsel önceden
 * hazırlanır ki paylaşım dokunuşun içinde beklemeden çağrılsın (iPhone'da şart).
 */
import { t } from "../../i18n";
import { esc } from "../../domain/text";
import { isModalOpen, showModal } from "../modal";
import { sheetHead } from "../sheets";
import { IC } from "../icons";

export interface PendingImage {
  blob: Blob;
  url: string;
  name: string;
  mid: string;
  /** Paylaşılınca etkinlikte "gönderildi" diye işaretlenecek mesaj (iş listesi); yoksa boş */
  sent: string;
}

export interface ImageSheet {
  title: string;
  hint: string;
  file: string;
  mid: string;
  sent: string;
  render: () => Promise<Blob>;
}

let pending: PendingImage | null = null;
let seq = 0;

export const pendingImage = (): PendingImage | null => pending;

export async function openImageSheet(o: ImageSheet): Promise<void> {
  const my = ++seq;
  if (pending) URL.revokeObjectURL(pending.url);
  pending = null;
  showModal(sheetHead(o.title) +
    '<div class="sqimg"><img id="sq-img" alt="' + esc(t("imgAlt", { t: o.title })) + '" width="1080" height="1080" hidden><p class="muted small" id="sq-wait">' + esc(t("imgWorking")) + "</p></div>" +
    '<div class="row mt" id="sq-acts"><button type="button" class="btn primary grow" data-a="imgShare" disabled>' + IC.share + esc(t("share")) + "</button>" +
    '<button type="button" class="btn grow" data-a="imgSave" disabled>' + IC.download + esc(t("imgDownload")) + "</button></div>" +
    '<p class="small muted tight mt-s">' + esc(o.hint) + "</p>");
  let blob: Blob;
  try {
    blob = await o.render();
  } catch {
    if (my === seq) {
      const w = document.getElementById("sq-wait");
      if (w) w.textContent = t("imgFail");
    }
    return;
  }
  // Bu arada pencere kapandıysa ya da yeni bir görsel istendiyse bırak
  const img = document.getElementById("sq-img") as HTMLImageElement | null;
  if (my !== seq || !isModalOpen() || !img) return;
  pending = { blob, url: URL.createObjectURL(blob), name: o.file, mid: o.mid, sent: o.sent };
  img.src = pending.url;
  img.hidden = false;
  document.getElementById("sq-wait")?.remove();
  document.querySelectorAll<HTMLButtonElement>("#sq-acts button").forEach((b) => (b.disabled = false));
}

export function downloadImage(p: PendingImage): void {
  const a = document.createElement("a");
  a.href = p.url;
  a.download = p.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
