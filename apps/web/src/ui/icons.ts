// The chrome's own small icons: each one drawn line on a 16 px square, one stroke and one weight (.ico in
// styles.css), in the control's own colour. (The instruments' glyphs are ui/controls.ts; the file player's
// icons are its own.)
const ico = (d: string): string => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;

/** the octave's arrows */
export const ICON_LEFT = ico('M9.75 3.5 5.25 8l4.5 4.5');
export const ICON_RIGHT = ico('M6.25 3.5 10.75 8l-4.5 4.5');
/** the way back to the stage */
export const ICON_BACK = ico('M13 8H3.5M7.25 4 3.25 8l4 4');
/** the knobs back to where they began: an arc and its arrowhead */
export const ICON_RESET = ico('M3.4 9.2a4.8 4.8 0 1 0 1.2-4.6M4 1.9v3h3');
/** shut a panel */
export const ICON_CLOSE = ico('M4 4l8 8M12 4l-8 8');
/** a phone's knobs, behind one button: a dial (its ring open at the foot, an index) */
export const ICON_DIAL = ico('M4.1 12.4a5.5 5.5 0 1 1 7.8 0M8 8l2.6-3');
