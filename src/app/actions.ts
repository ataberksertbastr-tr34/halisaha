/**
 * Eylem kayıt defteri. Arayüzdeki her düğme data-a="eylem" taşır;
 * tek bir tıklama dinleyicisi doğru işleyiciyi çağırır.
 */
export type Handler = (ds: DOMStringMap, el: HTMLElement) => void;

const registry: Record<string, Handler> = {};

export function registerActions(map: Record<string, Handler>): void {
  for (const k in map) {
    if (registry[k]) throw new Error("Eylem iki kez tanımlandı: " + k);
    registry[k] = map[k];
  }
}

export function dispatch(name: string, ds: DOMStringMap, el: HTMLElement): void {
  const fn = registry[name];
  if (fn) fn(ds, el);
}

/** data-confirm taşıyan düğmeler önce "Emin misin?" der, ikinci dokunuşta çalışır. */
export function needsConfirm(el: HTMLElement, label: string): boolean {
  if (!el.dataset.confirm || el.classList.contains("armed")) return false;
  const old = el.innerHTML;
  el.classList.add("armed");
  el.textContent = label;
  setTimeout(() => {
    if (el.isConnected) {
      el.classList.remove("armed");
      el.innerHTML = old;
    }
  }, 3000);
  return true;
}
