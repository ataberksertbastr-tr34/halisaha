/**
 * Uygulama durumu: tek bir State nesnesi + arayüz durumu (ui).
 * Değişiklikler commit() ile kalıcı hale getirilir ve ekran yeniden çizilir.
 */
import { defaults } from "../domain/schema";
import type { State } from "../domain/types";
import { todayISO } from "../domain/dates";
import { setLang } from "../i18n";

export type FilterKey = "att" | "roster" | "team";
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
  f: Record<FilterKey, Filter>;
}

export const store: { s: State } = { s: defaults() };

export const ui: UIState = {
  matchId: null, payId: null, editId: null, refocus: null, fieldTarget: null,
  f: { att: { q: "", pos: "", st: "" }, roster: { q: "", pos: "" }, team: { q: "", pos: "" } },
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
