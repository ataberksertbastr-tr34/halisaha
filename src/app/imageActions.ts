/** Kadro görseli eylemleri: aç (çiz ve önizle), paylaş (dosya olarak), indir. */
import { registerActions } from "./actions";
import { t } from "../i18n";
import { toast } from "../ui/toast";
import { store, today, ui } from "./store";
import { currentMatch, getMatch } from "../domain/lineup";
import { downloadImage, openSquadImage, pendingImage, type PendingImage } from "../ui/views/squadimg";
import { sentIf } from "./handlers";

function save(p: PendingImage): void {
  downloadImage(p);
  toast(t("imgSaved"));
}

registerActions({
  imgOpen: (ds) => {
    const m = ds.id ? getMatch(store.s, ds.id) : currentMatch(store.s, ui.matchId, today());
    if (m) void openSquadImage(m, new Date());
  },
  // Paylaşım dokunuşun içinde, beklemeden çağrılır (görsel önceden hazır)
  imgShare: () => {
    const p = pendingImage();
    if (!p) return;
    const file = new File([p.blob], p.name, { type: "image/png" });
    let files = false;
    try {
      files = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
    } catch {
      files = false;
    }
    if (!files) return save(p);
    navigator.share({ files: [file] }).then(
      // Kadro kesinleştikten sonra paylaşılan görsel, kadro duyurusu sayılır (iş listesi)
      () => p.locked && sentIf("shared", p.mid, "squad"),
      (e) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) save(p);
      },
    );
  },
  imgSave: () => {
    const p = pendingImage();
    if (p) save(p);
  },
});
