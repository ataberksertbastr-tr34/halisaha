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
let reg: ServiceWorkerRegistration | null = null;
/** Uygulama başka bir pencerede güncellendi; bu pencere hâlâ eski kodla çalışıyor. */
let updatedElsewhere = false;

export const pwa = {
  updateReady: () => !!waiting,
  updatedElsewhere: () => updatedElsewhere,
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

/** Kurulmakta olan sürümün kurulup beklemeye geçmesini bekler; yeni sürüm yoksa ya da kurulamazsa null. */
function whenInstalled(r: ServiceWorkerRegistration, ms: number): Promise<ServiceWorker | null> {
  return new Promise((res) => {
    if (r.waiting) return res(r.waiting);
    const w = r.installing;
    if (!w) return res(null);
    const timer = setTimeout(() => res(r.waiting), ms);
    w.addEventListener("statechange", () => {
      if (w.state === "installed" || w.state === "redundant") {
        clearTimeout(timer);
        res(r.waiting);
      }
    });
  });
}

/**
 * Yeni sürümü hemen getirir ve uygular ("Başka cihaz daha yeni sürümde" ve "veri daha yeni
 * sürümle kaydedilmiş" uyarıları). Bekleyen sürüm varsa onu etkinleştirir; yoksa sunucuda
 * yenisi var mı bakar, indirip kurulunca etkinleştirir. Yeni sürüm bulunamazsa (ya da service
 * worker yoksa) sayfayı yeniden yükler. Sayfa her durumda yeniden açılır.
 */
export async function forceUpdate(beforeReload?: () => Promise<void> | void, timeoutMs = 30000): Promise<"applying" | "reload"> {
  if (!waiting && reg) {
    await reg.update().catch(() => undefined);
    const w = await whenInstalled(reg, timeoutMs);
    if (w && navigator.serviceWorker.controller) waiting = w;
  }
  if (waiting) {
    applyUpdate(beforeReload);
    return "applying";
  }
  await beforeReload?.();
  location.reload();
  return "reload";
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
  // İlk kurulumda da controllerchange gelir (clients.claim); yalnızca önceden bir sürüm çalışıyorsa güncellemedir.
  let hadController = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    if (applying) location.reload();
    else if (hadController) {
      // Başka pencere güncelledi: bu pencere eski kodla kalmasın (yazılanı silmemek için kendiliğinden yenilenmez)
      updatedElsewhere = true;
      waiting = null;
      notify();
    }
    hadController = true;
  });
  const register = async () => {
    try {
      reg = await sw.register("./sw.js", { scope: "./" });
      const r = reg;
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && sw.controller) {
            waiting = w;
            notify();
          }
        });
      };
      if (r.waiting && sw.controller) {
        waiting = r.waiting;
        notify();
      }
      track(r.installing);
      r.addEventListener("updatefound", () => track(r.installing));
      // Uygulama açık kaldıkça ve öne geldikçe yeni sürüm var mı diye bak (en fazla saatte bir).
      let last = Date.now();
      const check = () => {
        if (Date.now() - last < 60 * 60 * 1000) return;
        last = Date.now();
        r.update().catch(() => undefined);
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
