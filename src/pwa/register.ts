/**
 * Service worker kaydı, "Yeni sürüm hazır → Güncelle" akışı ve
 * "Uygulamayı yükle" (Android/Chrome) desteği.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((fn) => fn());

let waiting: ServiceWorker | null = null;
let deferredInstall: BeforeInstallPromptEvent | null = null;
let applying = false;

export const pwa = {
  updateReady: () => !!waiting,
  canInstall: () => !!deferredInstall,
  onChange(fn: Listener) {
    listeners.add(fn);
  },
};

export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** Bekleyen yeni sürümü etkinleştirir; sayfa controllerchange ile yenilenir. */
export function applyUpdate(beforeReload?: () => Promise<void> | void): void {
  if (!waiting) return;
  applying = true;
  Promise.resolve(beforeReload?.()).finally(() => waiting?.postMessage({ type: "SKIP_WAITING" }));
}

export async function promptInstall(): Promise<boolean> {
  const ev = deferredInstall;
  if (!ev) return false;
  deferredInstall = null;
  notify();
  await ev.prompt();
  const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome === "accepted";
}

export function initPWA(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    notify();
  });

  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  const sw = navigator.serviceWorker;
  sw.addEventListener("controllerchange", () => {
    if (applying) location.reload();
  });
  const register = async () => {
    try {
      const reg = await sw.register("./sw.js", { scope: "./" });
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && sw.controller) {
            waiting = w;
            notify();
          }
        });
      };
      if (reg.waiting && sw.controller) {
        waiting = reg.waiting;
        notify();
      }
      track(reg.installing);
      reg.addEventListener("updatefound", () => track(reg.installing));
      // Uygulama açık kaldıkça ve öne geldikçe yeni sürüm var mı diye bak (en fazla saatte bir).
      let last = Date.now();
      const check = () => {
        if (Date.now() - last < 60 * 60 * 1000) return;
        last = Date.now();
        reg.update().catch(() => undefined);
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, 15 * 60 * 1000);
    } catch {
      /* SW desteklenmiyorsa uygulama yine çalışır, sadece çevrimdışı olmaz */
    }
  };
  // Açılış asenkron olduğu için "load" olayı çoktan geçmiş olabilir.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
