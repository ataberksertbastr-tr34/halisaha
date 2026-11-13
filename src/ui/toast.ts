/** Kısa bildirimler; isteğe bağlı bir ya da iki eylem düğmesi ("Geri al" gibi). */
import { esc } from "../domain/text";

export interface ToastAction {
  label: string;
  run: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let current: ToastAction[] = [];

function el(): HTMLElement {
  return document.getElementById("toast") as HTMLElement;
}

/** action: tek eylem ya da iki eylem (iki eylemde düğmeler metnin altına iner). */
export function toast(msg: string, action?: ToastAction | ToastAction[], ms?: number): void {
  const box = el();
  if (!box) return;
  current = !action ? [] : Array.isArray(action) ? action.slice(0, 2) : [action];
  box.innerHTML = '<span class="toast-msg">' + esc(msg) + "</span>" +
    current.map((a, i) => '<button type="button" class="toast-act" data-toast-act="' + i + '">' + esc(a.label) + "</button>").join("");
  box.classList.toggle("two", current.length > 1);
  box.classList.add("show");
  if (timer) clearTimeout(timer);
  timer = setTimeout(hideToast, ms ?? (current.length ? 6000 : 2200));
}

export function hideToast(): void {
  const box = el();
  if (box) box.classList.remove("show");
  current = [];
}

/** Eylem düğmesine basıldı (i: kaçıncı düğme). */
export function runToastAction(i = 0): void {
  const a = current[i];
  hideToast();
  if (a) a.run();
}
