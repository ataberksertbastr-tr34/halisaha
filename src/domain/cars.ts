/**
 * Araç paylaşımı (Kural 15.8): uzak tesislere gidişte araçlar organize edilir;
 * yakıt ve geçiş ücretleri araçtakiler (sürücü dahil) arasında eşit bölünür.
 * Pay sürücüye ödenir, organizatörün kasasına girmez.
 */
import type { Car, Match, State } from "./types";
import { active } from "./lineup";
import { uid } from "./text";

export function newCar(driver: string, seats = 5): Car {
  return { id: uid(), driver, seats: Math.max(1, seats), pax: [], fuel: 0, toll: 0 };
}

/** Araçtakiler: sürücü + yolcular. */
export const occupants = (c: Car): string[] => [c.driver, ...c.pax].filter(Boolean);

/** Boş koltuk (sürücü dahil koltuk sayısından). */
export const seatsLeft = (c: Car): number => Math.max(0, c.seats - occupants(c).length);

/** Kişi başı pay: (yakıt + geçiş) / araçtakiler, liraya yukarı yuvarlanır. */
export function perHead(c: Car): number {
  const n = occupants(c).length;
  const total = (Number(c.fuel) || 0) + (Number(c.toll) || 0);
  return n && total > 0 ? Math.ceil(total / n) : 0;
}

/** Herhangi bir araçta yeri olmayan aktif katılımcılar. */
export function unassigned(s: State, m: Match): string[] {
  const inCar = new Set(m.cars.flatMap(occupants));
  return active(s, m).filter((id) => !inCar.has(id));
}

/** Kadrodan çıkanları araçlardan da çıkarır; sürücüsü giden araç silinir. */
export function cleanCars(s: State, m: Match): void {
  const ok = new Set(active(s, m));
  m.cars = m.cars.filter((c) => ok.has(c.driver));
  m.cars.forEach((c) => (c.pax = c.pax.filter((id) => ok.has(id) && id !== c.driver)));
}

/** Kişinin araç payı ve sürücüsü (araçta değilse null). */
export function carOf(m: Match, id: string): { car: Car; share: number } | null {
  const car = m.cars.find((c) => occupants(c).includes(id));
  return car ? { car, share: perHead(car) } : null;
}
