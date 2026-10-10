/**
 * Alttan açılan sayfa (bottom sheet). Android geri tuşu sayfayı kapatır;
 * açıkken arka plan erişilebilirlik ağacından çıkarılır (inert).
 */
let opener: HTMLElement | null = null;
let pushed = false;
let afterBack: (() => void) | null = null;

const md = () => document.getElementById("modal") as HTMLElement;
const BG = ["hero", "view", "tabs", "banner"];

function setInert(on: boolean) {
  BG.forEach((id) => {
    const e = document.getElementById(id);
    if (e) e.inert = on;
  });
}

export function isModalOpen(): boolean {
  return !md().hidden;
}

export function showModal(html: string, labelledBy = "sheet-title", kind = ""): void {
  const box = md();
  const wasOpen = !box.hidden;
  if (!wasOpen) opener = document.activeElement as HTMLElement | null;
  box.innerHTML = '<div class="sheet' + (kind ? " sheet-" + kind : "") + '" data-sheet="' + kind + '" role="dialog" aria-modal="true" aria-labelledby="' + labelledBy + '" tabindex="-1"><div class="grab" aria-hidden="true"></div>' + html + "</div>";
  box.hidden = false;
  setInert(true);
  document.body.classList.add("noscroll");
  if (!wasOpen) {
    try {
      history.pushState({ modal: true }, "", location.href);
      pushed = true;
    } catch {
      pushed = false;
    }
  }
  const focusable = box.querySelector<HTMLElement>("[autofocus]") || box.querySelector<HTMLElement>(".sheet");
  focusable?.focus({ preventScroll: true });
}

/** Açık sayfanın içeriğini yeniler (odak ve geçmiş kaydı korunur). */
export function updateModal(html: string): void {
  const sheet = md().querySelector<HTMLElement>(".sheet");
  if (!sheet || md().hidden) return;
  const y = sheet.scrollTop;
  sheet.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
  sheet.scrollTop = y;
}

/** Açık sayfanın türü (data-sheet). */
export function modalKind(): string {
  const sheet = md().querySelector<HTMLElement>(".sheet");
  return !md().hidden && sheet ? sheet.dataset.sheet || "" : "";
}

/**
 * Sayfayı kapatır. fromPop: geri tuşundan geldiyse geçmişe dokunmaz.
 * then: geçmiş kaydı geri alındıktan sonra çalışır (kapanıştan sonra yönlendirme için).
 */
export function closeModal(fromPop = false, then?: () => void): void {
  const box = md();
  if (box.hidden) {
    then?.();
    return;
  }
  box.hidden = true;
  box.innerHTML = "";
  setInert(false);
  document.body.classList.remove("noscroll");
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  opener = null;
  if (pushed && !fromPop) {
    pushed = false;
    afterBack = then || (() => undefined);
    history.back();
    return;
  }
  pushed = false;
  then?.();
}

/** popstate geldiğinde: açık sayfayı kapatır ya da bekleyen geri dönüşü tamamlar. true → olay tüketildi. */
export function handlePopForModal(): boolean {
  if (afterBack) {
    const fn = afterBack;
    afterBack = null;
    fn();
    return true;
  }
  if (!isModalOpen()) return false;
  closeModal(true);
  return true;
}
