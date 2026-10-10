/** Kısa bildirimler; isteğe bağlı eylem düğmesi ("Geri al" gibi). */
import { esc } from "../domain/text";

export interface ToastAction {
  label: string;
  run: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let current: ToastAction | null = null;

function el(): HTMLElement {
  return document.getElementById("toast") as HTMLElement;
}

export function toast(msg: string, action?: ToastAction, ms?: number): void {
  const box = el();
  if (!box) return;
  current = action || null;
  box.innerHTML = '<span class="toast-msg">' + esc(msg) + "</span>" + (action ? '<button type="button" class="toast-act" data-toast-act="1">' + esc(action.label) + "</button>" : "");
  box.classList.add("show");
  if (timer) clearTimeout(timer);
  timer = setTimeout(hideToast, ms ?? (action ? 6000 : 2200));
}

export function hideToast(): void {
  const box = el();
  if (box) box.classList.remove("show");
  current = null;
}

/** Eylem düğmesine basıldı. */
export function runToastAction(): void {
  const a = current;
  hideToast();
  if (a) a.run();
}
