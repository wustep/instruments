// Day Studio: an instrument in a north-lit white room at midday. One plaster white is the wall, the floor
// and the page; what is laid on it is paper white and casts a soft shadow. Nothing glows. Ink is what is
// chosen; the one blue is what sounds. Ysabeau Office and Sometype Mono. Its 2D instruments are drawn for
// daylight (draw/), and in 3D the room is a daylight studio (world.ts).
import type { Theme } from '../types.ts';

export const dayStudio: Theme = {
  id: 'day-studio',
  name: 'Day Studio',
  scheme: 'light',
  bar: '#eceff1',
  swatch: ['#eceff1', '#1d48d1', '#1c222a'],
  // graphite for a line on the ground; the one blue for what sounds; a bronze that reads on the plaster
  // for brass and what is warm; a slate blue-grey for what is measured against, and the breath
  ink: {
    ground: '#eceff1',
    line: '28,34,42',
    sound: '29,72,209',
    warm: '158,110,36',
    cool: '92,112,138',
    copper: '176,108,62',
    felt: '205,181,146',
    wood: '58,42,28',
    ebony: '22,19,16',
  },
  // fine lines on a sheet of drafting film: graphite in three weights, the sound in the blue, crossings
  // deepening as ink does; the fourth slot the deepest ink
  vector: {
    ink: {
      ground: '#f3f5f8',
      line: '#2b3644',
      lineMid: '#64707d',
      lineDim: '#9aa5b0',
      frame: '#c3cad2',
      sound: '#1d48d1',
      slot1: '#14804a',
      slot2: '#d03b22',
      slot3: '#b8308a',
      slot4: '#0e141b',
    },
    heat: [
      [0, '#c4d2f6'],
      [0.35, '#6c8de8'],
      [0.6, '#1d48d1'],
      [0.82, '#132f96'],
      [1, '#0a1a56'],
    ],
    blend: 'multiply',
    core: ['#060a14', 0.45],
    glow: false,
    mono: 'ui-monospace, monospace',
    figures: '500 11px "Hershey", ui-monospace, monospace',
    // (lettering is laid plainly on the sheet; the travelling corner is the deepest ink)
    labelBlend: 'source-over',
    corner: '#0e141b',
    ownKeys: { black: 'rgba(43, 54, 68, 0.3)', blackDown: 'rgba(29, 72, 209, 0.6)', whiteDown: 'rgba(29, 72, 209, 0.2)', blackEdge: 'line', whiteEdge: 'lineMid' },
  },
  // drawn, in one weight (1.5 px on a 16 px box, round ends: its sheet's .ico)
  glyphs: {
    svgClass: 'ico',
    back: { d: 'M13 8H3.5M7.5 3.5 3 8l4.5 4.5', size: 16 },
    prev: { d: 'M9.75 3.5 5.25 8l4.5 4.5', size: 16 },
    next: { d: 'M6.25 3.5 10.75 8l-4.5 4.5', size: 16 },
    close: { d: 'M3.75 3.75l8.5 8.5M12.25 3.75l-8.5 8.5', size: 16 },
    reset: { d: 'M3.2 8a4.8 4.8 0 1 0 1.6-3.58M3 2.75v2.5h2.5', size: 16 },
    // a dial and its pointer
    knobs: { d: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM8 8l2.6-2.6', size: 20 },
  },
  // a knob on the stage carries its sign on its cap (the lid: a lid ajar on its case; the room: a point of
  // sound and two fronts leaving it), so its pointer is a mark at the cap's rim, clear of it; and for a
  // keyboard and a screen reader the page has a way past the bar and its name
  chrome: {
    knobPointer: [0, 9],
    stagePointer: [6.9, 9.9],
    stageSigns: { cls: 'sk-sign', over: false, lid: 'M15.6 22.4h8.8M15.6 22.4l7.4-4.6', room: 'M16.4 20h.01M19 17.6a3.4 3.4 0 0 1 0 4.8M21.4 15.8a6 6 0 0 1 0 8.4' },
    skip: true,
  },
  figures: '500 11.5px "Ysabeau Office Variable", "Avenir Next", "Segoe UI", system-ui, sans-serif',
  // the spectrum's figures and its trace firm on the plaster, and before any sound the line it will rise
  // from; an orchestra's piano's own keys paper white, a held one in the blue's wash as the screen's are
  draw: {
    spectrum: { label: [0.62, 0.7], trace: [0.8, 0.9], floor: [0.28, 0.28], foot: 0 },
    scopeAxisAtRest: true,
    roomLight: true,
    stamp: { weight: 600, family: '"Ysabeau Office Variable", "Avenir Next", "Segoe UI", system-ui, sans-serif' },
    ownKeys: { white: '#f8f7f1', whiteDown: '#c9d8fb', parting: 'rgba(126, 124, 116, 0.8)', front: 'rgba(70, 66, 56, 0.22)', slip: 'rgba(28, 34, 42, 0.22)', black: '#24272a', blackDown: '#2553e0' },
  },
};
