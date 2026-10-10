/**
 * Sahada sürükle-bırak: bir oyuncu karşı takımdan birinin üstüne bırakılırsa
 * takas, karşı yarı sahaya bırakılırsa o takıma geçer. Sürüklemeden dokunmak
 * oyuncuyu seçer (ikinci dokunuşta takas). Kaydırmayı engellememek için yalnızca
 * oyuncu noktalarında dokunma hareketi yakalanır (CSS touch-action).
 */
interface DragState {
  id: string;
  side: string;
  g: SVGGElement;
  svg: SVGSVGElement;
  start: DOMPoint;
  sx: number;
  sy: number;
  moved: boolean;
  pid: number;
}

export interface PitchHandlers {
  tap: (id: string) => void;
  swap: (a: string, b: string) => void;
  move: (id: string) => void;
}

let drag: DragState | null = null;

function toSvg(svg: SVGSVGElement, x: number, y: number): DOMPoint {
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const ctm = svg.getScreenCTM();
  return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
}

export function bindPitchDrag(h: PitchHandlers): void {
  document.addEventListener("pointerdown", (e) => {
    const g = (e.target as Element).closest?.(".pitch .pp") as SVGGElement | null;
    if (!g || !g.ownerSVGElement || (e.pointerType === "mouse" && e.button !== 0)) return;
    const svg = g.ownerSVGElement;
    drag = { id: g.dataset.id!, side: g.dataset.side!, g, svg, start: toSvg(svg, e.clientX, e.clientY), sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* bazı tarayıcılarda desteklenmez */
    }
    e.preventDefault();
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
    drag.moved = true;
    const p = toSvg(drag.svg, e.clientX, e.clientY);
    drag.g.setAttribute("transform", "translate(" + (p.x - drag.start.x) + " " + (p.y - drag.start.y) + ")");
    drag.g.classList.add("dragging");
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    d.g.removeAttribute("transform");
    d.g.classList.remove("dragging");
    if (cancelled) return;
    if (!d.moved) return h.tap(d.id);
    // Altındaki karşı takım oyuncusu
    d.g.style.pointerEvents = "none";
    const target = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest?.(".pitch .pp") as SVGGElement | null).find((x) => x && x !== d.g && x.dataset.side !== d.side);
    d.g.style.pointerEvents = "";
    if (target) return h.swap(d.id, target.dataset.id!);
    const p = toSvg(d.svg, e.clientX, e.clientY);
    const h2 = d.svg.viewBox.baseVal.height / 2;
    if ((d.side === "a" && p.y > h2) || (d.side === "b" && p.y < h2)) h.move(d.id);
  };
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true));
}
