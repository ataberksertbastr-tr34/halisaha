/**
 * Uygulama durumu: tek bir State nesnesi + arayüz durumu (ui).
 * Değişiklikler commit() ile kalıcı hale getirilir ve ekran yeniden çizilir.
 */
import { defaults } from "../domain/schema";
import type { State } from "../domain/types";
import { todayISO } from "../domain/dates";
import { setLang, t } from "../i18n";
import { toast } from "../ui/toast";

export type FilterKey = "att" | "roster" | "team" | "people";
export interface Filter {
  q: string;
  pos: string;
  st?: string;
}

export interface UIState {
  matchId: string | null;
  payId: string | null;
  editId: string | null;
  refocus: string | null;
  fieldTarget: "match" | "default" | null;
  /** Maç kartındaki düzenleme alanları açık mı */
  detailsOpen: boolean;
  /** Ödemeler sekmesindeki alt bölüm */
  payTab: "match" | "people" | "cash";
  /** Kasa bölümünde seçili ay (YYYY-AA) */
  month: string;
  /** Sahada takas için seçilen oyuncu */
  swapPick: string | null;
  /** Yeni eşleşme kuralı: aynı takım mı */
  ruleTogether: boolean;
  /** Kullanıcının açıp kapattığı <details> bölümleri (yeniden çizimde korunur) */
  open: Record<string, boolean>;
  f: Record<FilterKey, Filter>;
}

export const store: { s: State } = { s: defaults() };

export const ui: UIState = {
  matchId: null, payId: null, editId: null, refocus: null, fieldTarget: null, detailsOpen: false, payTab: "match", month: "", open: {}, swapPick: null, ruleTogether: true,
  f: { att: { q: "", pos: "", st: "" }, roster: { q: "", pos: "" }, team: { q: "", pos: "" }, people: { q: "", pos: "" } },
};

type Fn = () => void;
let renderFn: Fn = () => undefined;
let persistFn: (s: State) => void = () => undefined;

export function setRenderer(fn: Fn): void {
  renderFn = fn;
}
export function setPersister(fn: (s: State) => void): void {
  persistFn = fn;
}

export function render(): void {
  renderFn();
}

/** Değişikliği kaydeder ve (istenirse) ekranı yeniler. */
export function commit(noRender?: boolean): void {
  store.s.updatedAt = Date.now();
  setLang(store.s.settings.lang);
  persistFn(store.s);
  if (!noRender) renderFn();
}

/** Tüm durumu değiştirir (yedekten yükleme, sıfırlama). */
export function replaceState(next: State): void {
  store.s = next;
  setLang(next.settings.lang);
  ui.matchId = null;
  ui.payId = null;
  ui.editId = null;
}

export const today = (): string => todayISO();

/** Durumu değiştirir ama arayüz seçimlerini korur (Geri al için). */
function restore(json: string): void {
  store.s = JSON.parse(json) as State;
  setLang(store.s.settings.lang);
  ui.editId = null;
}

let lockHook: (s: State, reason: string) => Promise<void> = async () => undefined;
export function setLockHook(fn: (s: State, reason: string) => Promise<void>): void {
  lockHook = fn;
}

/**
 * Değişiklik yapar ve kaydeder. label verilirse "… · Geri al" bildirimi çıkar;
 * Geri al, işlemden önceki duruma döner. lock: riskli işlemlerde (silme,
 * iptal) önceki durum kilitli yerel sürüm olarak da saklanır.
 */
export function mutate(labelIn: string | null | (() => string | null), fn: () => void | false, opts: { lock?: string } = {}): void {
  const before = JSON.stringify(store.s);
  if (fn() === false) return;
  const label = typeof labelIn === "function" ? labelIn() : labelIn;
  // Kilitli sürüm, yeni durumdan önce kuyruğa girer (sürüm listesinde doğru sıra).
  if (opts.lock) lockHook(JSON.parse(before) as State, opts.lock).catch(() => undefined);
  commit();
  if (label) {
    toast(label, {
      label: t("undo"),
      run: () => {
        restore(before);
        commit();
        toast(t("undone"));
      },
    });
  }
}

/** <details data-keep="anahtar"> için açık mı? Kullanıcı seçmediyse varsayılan. */
export function isOpen(key: string, dflt: boolean): boolean {
  return key in ui.open ? ui.open[key] : dflt;
}
