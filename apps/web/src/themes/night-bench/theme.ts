// Night Bench: an instrument bench at night. Warm near-black, ivory linework, vermilion where something
// vibrates, amber for the board, steel blue for "ideal / reference"; Newsreader and IBM Plex; in 3D a
// product studio (world.ts). The look the app was built in, and the one a first visit sees.
import type { Theme } from '../types.ts';

export const nightBench: Theme = {
  id: 'night-bench',
  name: 'Night Bench',
  scheme: 'dark',
  bar: '#141312',
  swatch: ['#0e0d0b', '#ff5e38', '#ece2ce'],
  ink: {
    ground: '#0e0d0b',
    line: '236,226,206',
    sound: '255,94,56',
    warm: '242,166,70',
    cool: '150,182,210',
    copper: '196,128,82',
    felt: '205,181,146',
    wood: '58,42,28',
    ebony: '22,19,16',
  },
  // thin glowing lines on black, after the screens Jameson Hodge drew for his Chimera vocal synth
  vector: {
    ink: {
      ground: '#000000',
      line: '#4fb6f2',
      lineMid: '#3487c4',
      lineDim: '#1f5f8c',
      frame: '#133954',
      sound: '#ffb340',
      slot1: '#5be381',
      slot2: '#ff5d40',
      slot3: '#ff73cf',
      slot4: '#eef6f8',
    },
    heat: [
      [0, '#3a2408'],
      [0.35, '#c9822a'],
      [0.6, '#ffb340'],
      [0.82, '#ffe39a'],
      [1, '#fff8ec'],
    ],
    blend: 'lighter',
    core: ['#ffffff', 0.55],
    glow: true,
    mono: '"IBM Plex Mono", ui-monospace, monospace',
    figures: '500 10px "Hershey", "IBM Plex Mono", monospace',
    labelBlend: 'lighter',
    corner: '#fff8ec',
    ownKeys: { black: 'rgba(79, 182, 242, 0.22)', blackDown: 'rgba(255, 179, 64, 0.55)', whiteDown: 'rgba(255, 179, 64, 0.3)', blackEdge: 'lineMid', whiteEdge: 'lineDim' },
  },
  // characters of the page's own type
  glyphs: { svgClass: 'ico', back: '←', prev: '‹', next: '›', close: '×', reset: '↺', knobs: '◐' },
  // the dials as they have always been: a hand from the middle of the cap, nothing on it
  chrome: { knobPointer: [0, 9], stagePointer: [0, 9], skip: false },
  figures: '10px "IBM Plex Mono", monospace',
  // the spectrum's figures faint in the trace's own box, nothing before the first sound; an orchestra's
  // piano's own keys warm ivory and ebony, a held one warm as the screen's are
  draw: {
    spectrum: { label: [0.3, 0.3], trace: [0.55, 0.9], floor: [0, 0], foot: 0 },
    scopeAxisAtRest: true,
    roomLight: false,
    stamp: { weight: 500, family: '"IBM Plex Mono", monospace' },
    ownKeys: { white: '#efe7d6', whiteDown: '#f2c3ad', parting: 'rgba(120, 106, 84, 0.75)', front: 'rgba(60, 48, 30, 0.28)', slip: 'rgba(0, 0, 0, 0.3)', black: '#15120f', blackDown: '#6a2a1a' },
  },
};
