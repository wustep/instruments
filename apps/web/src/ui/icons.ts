// The chrome's few signs that are not instruments: drawn, in one weight (1.5 px on a 16 px box, round
// ends), never a character of a font standing in for a picture. Each takes its colour from the text's.

const SVGNS = 'http://www.w3.org/2000/svg';
const icon = (d: string, size = 16): SVGElement => {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('ico');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return s;
};

/** a step down (the octave under) */
export const chevronLeft = (): SVGElement => icon('M9.75 3.5 5.25 8l4.5 4.5');
/** a step up (the octave over) */
export const chevronRight = (): SVGElement => icon('M6.25 3.5 10.75 8l-4.5 4.5');
/** back to where one came from */
export const arrowLeft = (): SVGElement => icon('M13 8H3.5M7.5 3.5 3 8l4.5 4.5');
/** shut */
export const cross = (): SVGElement => icon('M3.75 3.75l8.5 8.5M12.25 3.75l-8.5 8.5');
/** as it was: an arc turned back on itself */
export const turnBack = (): SVGElement => icon('M3.2 8a4.8 4.8 0 1 0 1.6-3.58M3 2.75v2.5h2.5');
/** the knobs: a dial and its pointer */
export const dial = (): SVGElement => icon('M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM8 8l2.6-2.6', 20);
