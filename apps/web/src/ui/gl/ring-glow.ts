// The ring glow of the struck instruments in 3D: a glockenspiel's bar, a timpano's head. One light for both,
// kept with the app's other 3D light (a trumpet's pressed piston: [1, 0.62, 0.34] at 0.05; the timpani's
// heads had 0.13; the strings' stopped note is a line of amber), never a lamp: warm, and at its strongest on
// a fortissimo stroke a faint warmth over the metal or the calfskin. It is passed with a negative alpha:
// mats3 then casts what the part reflects in the light's colour as well as adding the light, so a
// near-white head shows it where added light clips (the other glows, alpha 0 … 1, are added light only).
//
// What it follows is the engine's own measure of the ring (the glockenspiel's `amp`: 0 … 1 of a hard
// stroke's swing; a drum's `level`): it lights on the stroke, as the engine's level is a peak held as it
// comes, and fades as the note does: in decibels, as the ear hears the ring go, over RANGE_DB below a hard
// stroke, to nothing at the bottom with no step (a glockenspiel's low bar rings for seconds, its top bar
// for one, a bar the hand stops at once; a timpani roll's strokes keep it up). Nothing per frame is
// remembered: the engine's level is smoothed already (a 50 ms fall), so a seat in the Orchestra glows as the
// instrument alone does.
import type { RGBA } from './gl3d.ts';

/** the light's colour (linear-ish rgb, squared in the shader: mats3 `vGlow.rgb²`) */
export const RING_TINT: readonly [number, number, number] = [1, 0.78, 0.5];
/** its strength at a hard stroke (the instance's glow alpha: the shader's emission is rgb² · a · 0.55) */
export const RING_MAX = 0.3;
/** how far below a hard stroke the light is gone (dB) */
export const RING_RANGE_DB = 36;
/** a timpano's `level` taken as a hard stroke's (the core's own scale, measured with the engine at 48 kHz: a
 *  C3 at velocity 127 peaks at 24–27 dB of it, 64 at 12–13 dB, 30 at 5 dB; 12 is 21.6 dB, so a forte and up
 *  lights the head fully and a drum ringing on reads as long as it is heard) */
export const TIMPANI_HARD = 12;

/** the glow's share of its strongest (0 … 1) for a ring at `rel` of a hard stroke's (linear): 1 at a hard
 *  stroke, falling with the ring's decibels, squared so it eases out to 0 at RANGE_DB below */
export function ringGlow(rel: number): number {
  if (!(rel > 0)) return 0;
  const g = 1 + (20 * Math.log10(rel)) / RING_RANGE_DB;
  if (g <= 0) return 0;
  const c = Math.min(1, g);
  // (the last of it, under a five-hundredth, is none: the bar is counted as still)
  return c * c > 0.002 ? c * c : 0;
}

/** a ring's light as an instance's glow (RGBA, written into `out`; its alpha negative: a light falling on
 *  the part, mats3), or null when there is none */
export function ringRGBA(share: number, out: RGBA): RGBA | null {
  if (!(share > 0)) return null;
  out[0] = RING_TINT[0];
  out[1] = RING_TINT[1];
  out[2] = RING_TINT[2];
  out[3] = -RING_MAX * Math.min(1, share);
  return out;
}
