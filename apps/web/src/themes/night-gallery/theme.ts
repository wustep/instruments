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
  figures: '11px "Libre Franklin Variable", "Helvetica Neue", Arial, sans-serif',
};
