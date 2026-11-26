// Day Studio's own 2D drawers: the instruments re-drawn for daylight (objects on pale plaster, each with
// its shadow on the floor; graphite where a finger holds, the one blue where something sounds; nothing
// glows). A chunk of their own, fetched when Day Studio is the theme in use (themes/drawers.ts), where the
// shared drawers in ui/ then hand over to these at their top.
//
// Each is the shared drawer's signature, and shares its layout, its live state and what it records for the
// tests with it (imported from ui/): what is here is paint, and the little geometry that is paint's own (a
// shadow's silhouette, a tube's lit band, the flute's levers).
import { registerDrawers } from '../../drawers.ts';
import { breathStream, paintField } from './kit.ts';
import { drawBowed } from './bowed.ts';
import { drawFlute } from './flute.ts';
import { drawTrumpet } from './trumpet.ts';
import { drawBassoon } from './bassoon.ts';
import { drawClarinet } from './clarinet.ts';
import { drawOboe } from './oboe.ts';
import { drawHorn } from './horn.ts';
import { drawTrombone } from './trombone.ts';
import { drawTuba } from './tuba.ts';
import { drawTimpani } from './timpani.ts';
import { drawHarp } from './harp.ts';
import { drawGlock } from './glock.ts';
import { drawPiano } from './piano.ts';
import { drawRoom } from './room.ts';

export const DAY_DRAWERS = {
  bowed: drawBowed,
  flute: drawFlute,
  trumpet: drawTrumpet,
  bassoon: drawBassoon,
  clarinet: drawClarinet,
  oboe: drawOboe,
  horn: drawHorn,
  trombone: drawTrombone,
  tuba: drawTuba,
  timpani: drawTimpani,
  harp: drawHarp,
  glock: drawGlock,
  piano: drawPiano,
  room: drawRoom,
  breath: breathStream,
  field: paintField,
};
registerDrawers('day-studio', DAY_DRAWERS);

// (what the tests measure of the day's paint)
export { WOOD as CLARINET_WOOD } from './clarinet.ts';
export { WOOD as OBOE_WOOD } from './oboe.ts';
export { LIGHT } from './kit.ts';
