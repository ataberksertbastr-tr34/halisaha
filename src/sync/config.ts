/**
 * Firebase yapılandırması.
 *
 * Firebase web yapılandırması gizli değildir (apiKey bir şifre değil, projenin
 * herkese açık kimliğidir); verinin güvenliği Firestore kurallarıyla sağlanır
 * (firestore.rules: herkes yalnızca kendi verisini okur/yazar). Bu yüzden
 * organizatörün projesinin yapılandırması burada, kodun içinde durabilir.
 */
export interface FirebaseCfg {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

/** Organizatörün Firebase projesi. Kurulum tamamlanınca doldurulur. */
export const BUILT_IN: FirebaseCfg | null = null;

/** Uçtan uca testler için Firebase emülatörlerine bağlanan derleme (VITE_FIREBASE_EMULATOR=1). */
export const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === "1";
export const EMULATOR_HOST = (import.meta.env.VITE_FIREBASE_EMULATOR_HOST as string | undefined) || "127.0.0.1";
const DEMO: FirebaseCfg = { apiKey: "demo-key", authDomain: "demo-halisaha.firebaseapp.com", projectId: "demo-halisaha" };

const STORE_KEY = "halisaha.firebase";
const KEYS: (keyof FirebaseCfg)[] = ["apiKey", "authDomain", "projectId", "appId", "storageBucket", "messagingSenderId", "measurementId"];

function valid(c: Partial<FirebaseCfg>): c is FirebaseCfg {
  return (
    typeof c.apiKey === "string" && /^[\w-]{10,}$/.test(c.apiKey) &&
    typeof c.projectId === "string" && /^[a-z0-9-]{4,40}$/.test(c.projectId) &&
    typeof c.authDomain === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.authDomain)
  );
}

/**
 * Firebase konsolundan kopyalanan yapılandırmayı okur. Hem JSON'u hem de
 * `const firebaseConfig = { apiKey: "...", ... };` biçimindeki JS parçasını kabul eder.
 */
export function parseConfig(text: string): FirebaseCfg | null {
  const out: Partial<Record<keyof FirebaseCfg, string>> = {};
  for (const k of KEYS) {
    const m = new RegExp("[\"']?" + k + "[\"']?\\s*:\\s*[\"'`]([^\"'`]+)[\"'`]").exec(text);
    if (m) out[k] = m[1].trim();
  }
  return valid(out) ? (out as FirebaseCfg) : null;
}

function stored(): FirebaseCfg | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<FirebaseCfg>;
    return valid(c) ? c : null;
  } catch {
    return null;
  }
}

/** Kullanılacak yapılandırma: test derlemesinde emülatör, yoksa koddaki, yoksa bu cihaza yapıştırılan. */
export function activeConfig(): FirebaseCfg | null {
  if (EMULATOR) return DEMO;
  return BUILT_IN || stored();
}

/** Koddaki yapılandırma yokken organizatörün kendi yapıştırdığı yapılandırmayı saklar. */
export function storeConfig(c: FirebaseCfg | null): void {
  try {
    if (c) localStorage.setItem(STORE_KEY, JSON.stringify(c));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* depolama kapalı */
  }
}

/** Yapılandırma kodun içinden mi geliyor (ayarlardan değiştirilemez). */
export const builtIn = (): boolean => EMULATOR || !!BUILT_IN;
