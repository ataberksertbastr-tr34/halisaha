/**
 * Firebase ile giriş (Google ya da e-posta/şifre). Bu dosya yalnızca giriş
 * gerektiğinde dinamik olarak yüklenir; ilk açılışı yavaşlatmaz.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  indexedDBLocalPersistence,
  initializeAuth,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updatePassword,
  type Auth,
  type User,
} from "firebase/auth";
import { EMULATOR, EMULATOR_HOST, type FirebaseCfg } from "./config";

export interface SyncUser {
  uid: string;
  email: string | null;
  name: string | null;
  /** E-posta/şifre ile de girilebilir mi */
  hasPassword: boolean;
  hasGoogle: boolean;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function toUser(u: User | null): SyncUser | null {
  if (!u) return null;
  const ids = u.providerData.map((p) => p.providerId);
  return { uid: u.uid, email: u.email, name: u.displayName, hasPassword: ids.includes("password"), hasGoogle: ids.includes("google.com") };
}

function need(): Auth {
  if (!auth) throw new Error("auth not loaded");
  return auth;
}

/** Firebase'i başlatır; oturum değişimlerini bildirir. */
export function start(cfg: FirebaseCfg, lang: string, onUser: (u: SyncUser | null) => void): void {
  if (!auth) {
    app = initializeApp(cfg, "halisaha");
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    if (EMULATOR) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  }
  auth.languageCode = lang;
  onAuthStateChanged(auth, (u) => onUser(toUser(u)));
}

export function setLanguage(lang: string): void {
  if (auth) auth.languageCode = lang;
}

export async function signInGoogle(): Promise<void> {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(need(), p);
}

export async function signInEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(need(), email.trim(), password);
}

export async function signUpEmail(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(need(), email.trim(), password);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(need(), email.trim());
}

/**
 * Google ile girilmiş hesaba şifre ekler (iPhone'daki uygulamada e-postayla girebilmek için).
 * Hesabın kendi e-postasına şifre atamak "password" girişini de ekler. Atanmadıysa e-posta
 * kimliği hesaba bağlanır. (Doğrudan bağlamak, e-posta Google hesabında kayıtlı olduğundan
 * bazı ortamlarda "kullanımda" hatası verip konsola hata düşürüyor.)
 * Oturum eskiyse Google ile yeniden doğrulanır.
 */
export async function setPassword(password: string): Promise<SyncUser | null> {
  const a = need();
  const u = a.currentUser;
  if (!u || !u.email) throw Object.assign(new Error("no-email"), { code: "auth/no-email" });
  const email = u.email;
  const attempt = async () => {
    await updatePassword(u, password);
    await u.reload();
    if (!u.providerData.some((p) => p.providerId === "password")) await linkWithCredential(u, EmailAuthProvider.credential(email, password));
  };
  try {
    await attempt();
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/requires-recent-login") throw e;
    await reauthenticateWithPopup(u, new GoogleAuthProvider());
    await attempt();
  }
  await u.reload();
  return toUser(a.currentUser);
}

export async function signOut(): Promise<void> {
  await fbSignOut(need());
}

export async function idToken(force = false): Promise<string> {
  const u = need().currentUser;
  if (!u) throw Object.assign(new Error("signed-out"), { code: "auth/signed-out" });
  return u.getIdToken(force);
}

/** Firebase hata kodunu kullanıcıya gösterilecek mesaj anahtarına çevirir. */
export function errorKey(e: unknown): string {
  const code = String((e as { code?: string })?.code || "");
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return "cancelled";
    case "auth/popup-blocked":
    case "auth/operation-not-supported-in-this-environment":
    case "auth/web-storage-unsupported":
      return "popup";
    case "auth/network-request-failed":
      return "network";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "badLogin";
    case "auth/invalid-email":
    case "auth/missing-email":
      return "badEmail";
    case "auth/weak-password":
    case "auth/missing-password":
      return "weakPassword";
    case "auth/email-already-in-use":
    case "auth/credential-already-in-use":
    case "auth/account-exists-with-different-credential":
      return "emailInUse";
    case "auth/too-many-requests":
      return "tooMany";
    case "auth/unauthorized-domain":
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "setup";
    case "auth/provider-already-linked":
      return "alreadyLinked";
    default:
      return "unknown";
  }
}
