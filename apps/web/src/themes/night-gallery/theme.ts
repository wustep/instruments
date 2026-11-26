// Night Gallery: the instrument is the one lit object in a museum room after closing, and the page is
// that room. A cool charcoal wall, the type a wall label's (Libre Franklin). Three lights and no paint:
// silver (whatever is chosen, pressed or sounding is lit, never coloured), tungsten (what a body does),
// steel (reference). In 3D a silver light from behind, a dim tungsten key, no fill (world.ts).
import type { Theme } from '../types.ts';

export const nightGallery: Theme = {
  id: 'night-gallery',
  name: 'Night Gallery',
  scheme: 'dark',
  bar: '#111315',
  swatch: ['#111315', '#f5f7f9', '#8ba8c6'],
  ink: {
    ground: '#111315',
    line: '230,232,234',
    sound: '245,247,249',
    warm: '237,208,156',
    cool: '139,168,198',
    copper: '196,128,82',
    felt: '205,181,146',
    wood: '58,42,28',
    ebony: '18,20,24',
  },
  // a drawing in light on the wall turned down: argon blue and tungsten amber, paler than a tube's
  vector: {
    ink: {
      ground: '#08090b',
      line: '#86bdea',
      lineMid: '#5a8fbf',
      lineDim: '#3a6289',
      frame: '#1d3147',
      sound: '#ffc56e',
      slot1: '#7fdca0',
      slot2: '#ff7c5e',
      slot3: '#f08fd2',
      slot4: '#eef3f8',
    },
    heat: [
      [0, '#33240e'],
      [0.35, '#bd8a44'],
      [0.6, '#ffc56e'],
      [0.82, '#ffe6b0'],
      [1, '#fff9ee'],
    ],
    blend: 'lighter',
    core: ['#ffffff', 0.55],
    glow: true,
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    figures: '500 11px "Hershey", ui-monospace, monospace',
    labelBlend: 'lighter',
    corner: '#fff8ec',
    ownKeys: { black: 'rgba(134, 189, 234, 0.22)', blackDown: 'rgba(255, 197, 110, 0.55)', whiteDown: 'rgba(255, 197, 110, 0.3)', blackEdge: 'lineMid', whiteEdge: 'lineDim' },
  },
  // each one drawn line on a 16 px square, one stroke and one weight (its sheet's .ico)
  glyphs: {
    svgClass: 'ico',
    back: { d: 'M13 8H3.5M7.25 4 3.25 8l4 4' },
    prev: { d: 'M9.75 3.5 5.25 8l4.5 4.5' },
    next: { d: 'M6.25 3.5 10.75 8l-4.5 4.5' },
    close: { d: 'M4 4l8 8M12 4l-8 8' },
    reset: { d: 'M3.4 9.2a4.8 4.8 0 1 0 1.2-4.6M4 1.9v3h3' },
    // a dial: its ring open at the foot, an index
    knobs: { d: 'M4.1 12.4a5.5 5.5 0 1 1 7.8 0M8 8l2.6-3' },
  },
  // a fallboard knob's index is a short mark on its ring, not a hand from the middle; a knob on the stage
  // says what it moves by what is drawn in its middle (a lid raised on its hinge; a room's walls with the
  // sound's source inside them), and its arc is its value (its sheet shows no pointer)
  chrome: {
    knobPointer: [5.5, 10.5],
    stagePointer: [0, 9],
    stageSigns: { cls: 'sk-glyph', over: true, lid: 'M13.6 24.2h12.8M13.6 24.2 24.6 16.4', room: 'M14 14h12v12H14zM18.4 20a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0' },
    skip: false,
  },
  figures: '11px "Libre Franklin Variable", "Helvetica Neue", Arial, sans-serif',
  // the spectrum's scale hangs under the floor of its trace, each figure from a tick at its frequency (in
  // the trace it was struck through; parted for them, the trace lost its partials at 100 Hz and 1 kHz);
  // before any sound the floor is there, a hairline, and the scope shows nothing at all. An orchestra's
  // piano's own keys in half-light, a held one lit as the screen's are.
  draw: {
    spectrum: { label: [0.6, 0.6], trace: [0.55, 0.9], floor: [0.3, 0.5], foot: 13 },
    scopeAxisAtRest: false,
    roomLight: false,
    stamp: { weight: 500, family: '"Libre Franklin Variable", "Helvetica Neue", Arial, sans-serif' },
    ownKeys: { white: '#a9abae', whiteDown: '#f5f7f9', parting: 'rgba(32, 34, 37, 0.8)', front: 'rgba(20, 24, 30, 0.3)', slip: 'rgba(0, 0, 0, 0.34)', black: '#0b0d10', blackDown: '#7c8591' },
  },
};
