/** Görsel eylemleri: kadro, takımlar, maç afişi; paylaş (dosya olarak) ve indir. */
import { registerActions } from "./actions";
import { t } from "../i18n";
import { toast } from "../ui/toast";
import { store, today, ui } from "./store";
import type { Match } from "../domain/types";
import { currentMatch, getMatch } from "../domain/lineup";
import { squadCard } from "../domain/squadcard";
import { teamCard } from "../domain/matchcards";
import { squadPng } from "../ui/squadImage";
import { teamsPng } from "../ui/teamImage";
import { downloadImage, openImageSheet, pendingImage, type PendingImage } from "../ui/views/imagesheet";
import { sentIf } from "./handlers";

function save(p: PendingImage): void {
  downloadImage(p);
  toast(t("imgSaved"));
}

const matchOf = (ds: DOMStringMap): Match | null => (ds.id ? getMatch(store.s, ds.id) : currentMatch(store.s, ui.matchId, today()));

registerActions({
  imgOpen: (ds) => {
    const m = matchOf(ds);
    if (!m) return;
    const card = squadCard(store.s, m, new Date());
    // Kadro kesinleştikten sonra paylaşılan görsel, kadro duyurusu sayılır (iş listesi)
    void openImageSheet({ title: t("imgOpen"), hint: t("imgHint"), file: card.file, mid: m.id, sent: card.locked ? "squad" : "", render: () => squadPng(card) });
  },
  imgTeams: (ds) => {
    const m = matchOf(ds);
    if (!m) return;
    const card = teamCard(store.s, m);
    if (!card.ready) return;
    void openImageSheet({ title: t("imgTeamsOpen"), hint: t("imgTeamsHint"), file: card.file, mid: m.id, sent: "teams", render: () => teamsPng(card) });
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
      () => p.sent && sentIf("shared", p.mid, p.sent),
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
