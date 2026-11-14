// The zephyr's plan, in metres: an instrument that does not exist yet (engine core/zephyr.ts), drawn as it
// would be built. Seen from its player's side: x to the right (the treble), y up, the origin on the floor
// under the mast. It is an upright keyboard instrument, the shape of a sail:
//
//   the mast    a hollow carbon tube at the bass end, 2.1 m, the wind's way up from the blower at its foot
//   the yard    the curved beam the ribbons hang from, falling from the mast's head to the treble end: the
//               ribbons' tops draw it by themselves (their lengths are the engine's, 1.25 m to 0.11 m)
//   the boom    the body: a shallow case at a keyboard's height, its top the soundboard (two skins on an
//               aerogel core), a low bridge along it that the ribbons stand on, the five-octave keyboard
//               in front
//   the blade   the wind rail: a tapering wing across the ribbons, 0.38 of the way up each (ZEPHYR_SLOT),
//               as tall there as each ribbon's slot; a jet from each slot crosses its ribbon broadside
//
// Each ribbon stands over its own key (a semitone is 13.75 mm, an octave of keys 165 mm). The ribbons of the
// accidentals are dark, the naturals pale, every C a warmer one, so the eye finds its place as on a harp.
import { ZEPHYR_SLOT, zephyrStrings, type ZephyrString } from '@piano-model/engine';

export type P = [number, number];
export const RIBBONS: ZephyrString[] = zephyrStrings();
const N = RIBBONS.length;

/** a semitone along the bridge (m), and where the first ribbon stands */
export const PITCH = 0.01375;
export const X0 = 0.17;
export const RIBBON_X: number[] = RIBBONS.map((_, i) => X0 + i * PITCH);
/** the soundboard's top (the boom's), the bridge on it: the ribbons' lower ends */
export const BOARD_Y = 0.8;
export const BRIDGE_H = 0.028;
export const RIBBON_Y0: number[] = RIBBONS.map(() => BOARD_Y + BRIDGE_H);
export const RIBBON_Y1: number[] = RIBBONS.map((r, i) => RIBBON_Y0[i] + r.length);

// ---------------------------------------------------------------- the frame
/** the mast: its middle, its radius, its foot and its head */
export const MAST_X = 0.085;
export const MAST_R = 0.026;
export const MAST_Y1 = RIBBON_Y1[0] + 0.075;
/** the yard: its lower edge just over the ribbons' tops (their pins are in it), 36 mm deep at the mast
 *  thinning to 22 mm at the treble end, where a short post takes it down to the boom */
export const YARD_GAP = 0.012;
export const POST_X = RIBBON_X[N - 1] + 0.05;
export const yardLower: P[] = [[MAST_X, RIBBON_Y1[0] + YARD_GAP + 0.004], ...RIBBON_X.map((x, i): P => [x, RIBBON_Y1[i] + YARD_GAP]), [POST_X, RIBBON_Y1[N - 1] + YARD_GAP - 0.004]];
export const yardUpper: P[] = yardLower.map(([x, y], i): P => [x, y + 0.036 - 0.014 * (i / (yardLower.length - 1))]);
/** the boom: the case (its soundboard its top), from the mast to past the post */
export const BOOM_X0 = 0.04;
export const BOOM_X1 = POST_X + 0.035;
export const BOOM_Y0 = 0.655;
export const BOOM: P[] = [[BOOM_X0, BOOM_Y0 + 0.02], [BOOM_X0 + 0.02, BOOM_Y0], [BOOM_X1 - 0.02, BOOM_Y0], [BOOM_X1, BOOM_Y0 + 0.02], [BOOM_X1, BOARD_Y], [BOOM_X0, BOARD_Y]];
/** the keyboard in front of the case: 61 keys, C2–C7, each under its ribbon; the key fronts' strip */
export const KEYS_Y0 = 0.7;
export const KEYS_Y1 = 0.728;
export const KEYS_X0 = X0 - PITCH * 0.75;
export const KEYS_X1 = RIBBON_X[N - 1] + PITCH * 0.75;
/** the white keys' edges along the keyboard (36 of them: seven to an octave of 165 mm), and each black
 *  key's middle */
export const WHITE_W = (12 * PITCH) / 7;
export const whiteX = (k: number): number => KEYS_X0 + k * WHITE_W;
export const WHITES = 36;
/** the legs: the mast's foot and the treble leg, each on a cross foot; the blower's drum at the mast's foot */
export const LEG_X = POST_X;
export const BLOWER: P[] = [[MAST_X - 0.11, 0.03], [MAST_X + 0.15, 0.03], [MAST_X + 0.15, 0.2], [MAST_X + 0.12, 0.235], [MAST_X - 0.08, 0.235], [MAST_X - 0.11, 0.2]];

// ---------------------------------------------------------------- the wind
/** each ribbon's slot: where the jet crosses it (y from … to) */
export const slotY = (i: number): [number, number] => {
  const mid = RIBBON_Y0[i] + ZEPHYR_SLOT * RIBBONS[i].length;
  return [mid - RIBBONS[i].slot / 2, mid + RIBBONS[i].slot / 2];
};
/** the blade: a wing behind the ribbons, its edges a little past the slots' ends, from the mast (where the
 *  wind comes into it) to the treble end */
export const BLADE: P[] = (() => {
  const lo: P[] = [[MAST_X, slotY(0)[0] - 0.02]];
  const hi: P[] = [[MAST_X, slotY(0)[1] + 0.02]];
  for (let i = 0; i < N; i += 2) {
    const [a, b] = slotY(i);
    const pad = 0.012 + 0.006 * (1 - i / (N - 1));
    lo.push([RIBBON_X[i], a - pad]);
    hi.push([RIBBON_X[i], b + pad]);
  }
  const [a, b] = slotY(N - 1);
  lo.push([RIBBON_X[N - 1] + 0.025, a - 0.01]);
  hi.push([RIBBON_X[N - 1] + 0.025, b + 0.01]);
  return [...lo, ...hi.reverse()];
})();
/** the blade's lower edge (the duct runs along it) */
export const BLADE_LOW: P[] = BLADE.slice(0, BLADE.length / 2);

/** the plan's box (m) */
export const ZP_X0 = -0.06;
export const ZP_X1 = BOOM_X1 + 0.06;
export const ZP_Y0 = 0;
export const ZP_Y1 = MAST_Y1 + 0.03;
/** how a ribbon is told from its neighbours: a C, another natural, an accidental */
export const kindOf = (i: number): 'c' | 'natural' | 'sharp' => (RIBBONS[i].sharp ? 'sharp' : RIBBONS[i].midi % 12 === 0 ? 'c' : 'natural');
