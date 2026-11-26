// Evening Hall: a concert hall at night. Claret-black, a velvet bar, lacquer and brass over ivory keys; one
// warm spot, gold, for whatever is chosen or sounding; ivory programme paper for whatever opens. Libre
// Caslon speaks, Cabin labels. In 3D a stage's boards under one spotlight, a velvet curtain (world.ts).
import type { Theme } from '../types.ts';

export const eveningHall: Theme = {
  id: 'evening-hall',
  name: 'Evening Hall',
  scheme: 'dark',
  // (the bar's velvet)
  bar: '#3b0f19',
  swatch: ['#3b0f19', '#ecbb62', '#f1e7d3'],
  // ivory for the instrument's lines; the stage's light, a pale gold, for whatever sounds (the brightest
  // thing drawn); amber for the board and the warm half of a wave; verdigris for the other half, for air
  // and for "ideal / reference"
  ink: {
    ground: '#140a0b',
    line: '241,231,211',
    sound: '255,212,128',
    warm: '238,150,58',
    cool: '138,196,178',
    copper: '204,128,84',
    felt: '205,181,146',
    wood: '66,40,24',
    ebony: '20,14,12',
  },
  // an engraver's plate: ivory for the instrument, gold for the sound; the slots verdigris, rose, gilt, white
  vector: {
    ink: {
      ground: '#0b0405',
      line: '#e8dec8',
      lineMid: '#b3a68c',
      lineDim: '#7d7260',
      frame: '#5c4a2a',
      sound: '#ffbe55',
      slot1: '#62cfa9',
      slot2: '#f08a94',
      slot3: '#d9b25f',
      slot4: '#fffaf0',
    },
    heat: [
      [0, '#3a2408'],
      [0.35, '#c9822a'],
      [0.6, '#ffbe55'],
      [0.82, '#ffe39a'],
      [1, '#fff8ec'],
    ],
    blend: 'lighter',
    core: ['#ffffff', 0.55],
    glow: true,
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    figures: '500 10px "Hershey", ui-monospace, monospace',
    labelBlend: 'lighter',
    corner: '#fff8ec',
    ownKeys: { black: 'rgba(195, 208, 220, 0.2)', blackDown: 'rgba(255, 190, 85, 0.55)', whiteDown: 'rgba(255, 190, 85, 0.3)', blackEdge: 'lineMid', whiteEdge: 'lineDim' },
  },
  // one pen (1.5 px at 16 px, round ends), never a character standing in for a sign
  glyphs: {
    svgClass: 'icon',
    svgAttrs: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    back: { d: 'M9.5 3.5 5 8l4.5 4.5M5.5 8H13' },
    prev: { d: 'M10 3.5 5.5 8l4.5 4.5' },
    next: { d: 'M6 3.5 10.5 8 6 12.5' },
    close: { d: 'M4 4l8 8M12 4l-8 8' },
    reset: { d: 'M3.6 6.2A5 5 0 1 1 3 8.6M3.4 2.6v3.7h3.7' },
    // a knob: its cap, its pointer, a tick either side
    knobs: { d: 'M8 2.6a5.4 5.4 0 1 1-.01 0M8 8l2.5-3.3M1.2 12.4l1.3-.9M14.8 12.4l-1.3-.9' },
  },
  // the bench's dials (brass by its sheet): a hand from the middle of the cap
  chrome: { knobPointer: [0, 9], stagePointer: [0, 9], skip: false },
  figures: '500 11px "Cabin Variable", "Gill Sans", sans-serif',
  // the spectrum's figures in the muted ink (6:1 on the ground) and, with no sound yet, their axis under
  // them: three numbers floating over nothing say nothing. An orchestra's piano's own keys are the bench's.
  draw: {
    spectrum: { label: [0.64, 0.64], trace: [0.55, 0.9], floor: [0.28, 0.28], foot: 0 },
    scopeAxisAtRest: true,
    roomLight: false,
    stamp: { weight: 600, family: '"Cabin Variable", "Gill Sans", sans-serif' },
    ownKeys: { white: '#efe7d6', whiteDown: '#f2c3ad', parting: 'rgba(120, 106, 84, 0.75)', front: 'rgba(60, 48, 30, 0.28)', slip: 'rgba(0, 0, 0, 0.3)', black: '#15120f', blackDown: '#6a2a1a' },
  },
};
