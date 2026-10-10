/** Ulaşım ve araç paylaşımı (Kural 15.8). */
import { money, t } from "../../i18n";
import { isOpen, store } from "../../app/store";
import type { Match } from "../../domain/types";
import { esc, trSort } from "../../domain/text";
import { getP } from "../../domain/lineup";
import { cleanCars, occupants, perHead, seatsLeft, unassigned } from "../../domain/cars";
import { ruleChip, shareButtons } from "../components";
import { IC } from "../icons";

export function carsBlock(m: Match): string {
  const S = store.s;
  const name = (id: string) => getP(S, m, id)?.name || "?";
  cleanCars(S, m);
  const free = unassigned(S, m);
  const key = "cars-" + m.id;
  let h = '<section class="section" aria-labelledby="h-cars"><details data-keep="' + esc(key) + '"' + (isOpen(key, m.cars.length > 0) ? " open" : "") + "><summary>" +
    '<span class="prep-sum"><span class="navic sm">' + IC.car + '</span><span class="minw0"><h2 id="h-cars" class="inline">' + esc(t("carsTitle")) + "</h2>" +
    '<span class="meta">' + esc(m.cars.length ? t("carsMeta", { n: m.cars.length, f: free.length }) : t("carsNone")) + "</span></span></span></summary>";
  h += '<p class="small muted tight">' + esc(t("carsHint")) + " " + ruleChip("15.8") + "</p>";
  m.cars.forEach((c, i) => {
    const per = perHead(c);
    h += '<div class="car"><div class="car-head"><strong>' + IC.car + esc(t("carN", { n: i + 1 }) + " · " + name(c.driver)) + '</strong><span class="tag gold">' + esc(t("seatsLeftN", { n: seatsLeft(c) })) + "</span>" +
      '<button type="button" class="tx" data-a="delCar" data-id="' + esc(c.id) + '" aria-label="' + esc(t("del")) + '">' + IC.close + "</button></div>" +
      '<div class="grid2"><label class="fld">' + esc(t("carSeats")) + '<select data-f="car.seats" data-id="' + esc(c.id) + '">' + [2, 3, 4, 5, 6, 7, 8, 9].map((n) => '<option value="' + n + '"' + (c.seats === n ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>" +
      '<label class="fld">' + esc(t("carFuel")) + '<input type="number" inputmode="decimal" min="0" data-f="car.fuel" data-id="' + esc(c.id) + '" value="' + esc(c.fuel || "") + '"></label>' +
      '<label class="fld">' + esc(t("carToll")) + '<input type="number" inputmode="decimal" min="0" data-f="car.toll" data-id="' + esc(c.id) + '" value="' + esc(c.toll || "") + '"></label>' +
      '<div class="car-per"><span>' + esc(t("perPerson")) + "</span><b>" + esc(per ? money(per) : "—") + "</b></div></div>" +
      '<div class="phchips mt-s">' + c.pax.map((id) => '<button type="button" class="fchip on" data-a="carPax" data-car="' + esc(c.id) + '" data-id="' + esc(id) + '" aria-pressed="true">' + esc(name(id)) + " ✕</button>").join("") +
      (seatsLeft(c) ? free.map((id) => '<button type="button" class="fchip" data-a="carPax" data-car="' + esc(c.id) + '" data-id="' + esc(id) + '" aria-pressed="false">+ ' + esc(name(id)) + "</button>").join("") : "") + "</div>" +
      '<p class="small muted m0 mt-s">' + esc(t("carRiders", { n: occupants(c).length })) + "</p></div>";
  });
  const drivers = free.map((id) => ({ id, name: name(id) })).sort(trSort);
  if (drivers.length) {
    h += '<div class="row nowrap mt-s"><select id="newCarDriver" aria-label="' + esc(t("carDriver")) + '">' + drivers.map((d) => '<option value="' + esc(d.id) + '">' + esc(t("carDriver") + ": " + d.name) + "</option>").join("") + "</select>" +
      '<button type="button" class="btn side" data-a="addCar">' + IC.plus + esc(t("addCar")) + "</button></div>";
  } else if (!m.cars.length) h += '<p class="muted small m0">' + esc(t("carsNeedPeople")) + "</p>";
  if (m.cars.length) h += '<div class="row nowrap mt">' + shareButtons("cars", t("carsShare")) + "</div>";
  return h + "</details></section>";
}
