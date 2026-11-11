// The harp's plan, in metres: a concert grand pedal harp (47 strings, about 1.88 m tall and a metre from
// the column to the body's back: the measures of the Lyon & Healy style 23 and 30 and the Salvi Diana: 1.85–
// 1.88 m, a soundboard about 0.56 m at its widest, 35–37 kg), seen from its side as it stands, the column at
// the left and the player's place at the right. x to the right, y up, the origin on the floor under the
// column. The strings are the engine's (harpStrings: their lengths, materials and colours); each hangs plumb
// from the neck to the soundboard, which rises from the base to the player's shoulder, so the strings' tops
// draw the neck's harmonic curve by themselves: high at the column over the long bass strings, swooping
// down, and up again a little at the knee.
import { HARP_PEDALS, harpStrings, type HarpString } from '@piano-model/engine';

export type P = [number, number];
export const STRINGS: HarpString[] = harpStrings();
const N = STRINGS.length;

/** where the strings stand along the soundboard: 17 mm apart in the bass, 12.6 mm at the top */
const X0 = 0.105;
export const STRING_X: number[] = (() => {
  const out: number[] = [];
  let x = X0;
  for (let i = 0; i < N; i++) {
    out.push(x);
    x += 0.017 - 0.0044 * (i / (N - 1));
  }
  return out;
})();
/** the soundboard's line: its height at x (the strings' lower ends), rising to the player's shoulder */
const BOARD_Y0 = 0.285;
const BOARD_SLOPE = 1.55;
export const boardY = (x: number): number => BOARD_Y0 + BOARD_SLOPE * (x - X0);
/** each string's ends: on the soundboard, and at the neck (its sounding length above) */
export const STRING_Y0: number[] = STRING_X.map(boardY);
export const STRING_Y1: number[] = STRING_X.map((x, i) => boardY(x) + STRINGS[i].length);

// ---------------------------------------------------------------- the frame
/** the column: its foot on the base, its head (the crown above it) */
export const COLUMN_X = 0.045;
export const COLUMN_R = 0.03;
export const COLUMN_Y0 = 0.105;
export const COLUMN_Y1 = 1.83;
export const CROWN_Y = 1.885;
/** the neck: its lower edge runs a little above the strings' tops (the tuning pins and the discs are on
 *  it), its upper edge 70 mm higher at the column thinning to 45 mm at the knee */
export const NECK_GAP = 0.03;
export const neckLower: P[] = [[COLUMN_X, STRING_Y1[0] + NECK_GAP - 0.01], ...STRING_X.map((x, i): P => [x, STRING_Y1[i] + NECK_GAP]), [STRING_X[N - 1] + 0.07, STRING_Y1[N - 1] + NECK_GAP + 0.03]];
export const neckUpper: P[] = neckLower.map(([x, y], i): P => [x, y + 0.07 - 0.025 * (i / (neckLower.length - 1))]);
/** the body (the soundbox): the soundboard's edge from the base up to the knee, and its back, 0.2 m behind at
 *  the base narrowing to 0.07 m at the top (in this side view: its depth) */
export const BOARD_A: P = [X0 - 0.045, boardY(X0 - 0.045)];
export const BOARD_B: P = [STRING_X[N - 1] + 0.07, boardY(STRING_X[N - 1] + 0.07)];
export const BODY: P[] = [BOARD_A, BOARD_B, [BOARD_B[0] + 0.065, BOARD_B[1] - 0.035], [BOARD_A[0] + 0.33, 0.115], [BOARD_A[0] + 0.02, 0.115]];
/** the base: the pedestal the column and the body stand on, its feet */
export const BASE: P[] = [[-0.035, 0.035], [0.47, 0.035], [0.5, 0.075], [0.43, 0.118], [0.0, 0.118], [-0.035, 0.085]];
export const FEET: P[][] = [[[-0.03, 0], [0.03, 0], [0.025, 0.035], [-0.025, 0.035]], [[0.4, 0], [0.47, 0], [0.465, 0.035], [0.405, 0.035]]];

// ---------------------------------------------------------------- the pedals
/** the seven pedals round the base's back, in their order at the player's feet (D C B | E F G A), each a
 *  lever in a slot with three notches: up (flat), the middle (natural), down (sharp). Seen from the side they
 *  are fanned: the left foot's three, a gap, the right foot's four */
export const PEDAL_X: number[] = HARP_PEDALS.map((_, k) => 0.535 + 0.036 * k + (k > 2 ? 0.03 : 0));
export const PEDAL_Y = 0.085;
/** how far a pedal's foot moves from notch to notch */
export const PEDAL_STEP = 0.022;
export const PEDAL_LEN = 0.075;
/** a pedal's foot for its position (−1 up … 1 down): [x, y] */
export const pedalFoot = (k: number, pos: number): P => [PEDAL_X[k] + PEDAL_LEN * 0.3, PEDAL_Y - PEDAL_STEP * pos];

/** the discs (fourchettes) on the neck under each string's top: the upper turns against the string for the
 *  natural, the lower for the sharp; their heights below the string's top */
export const DISC_DY = [0.022, 0.05];
/** a string's sounding top for its pedal (−1, 0, 1): open, or stopped a semitone or two down by its discs */
export const stopY = (i: number, acc: number): number => STRING_Y1[i] - STRINGS[i].length * (1 - Math.pow(2, -(acc + 1) / 12));

/** the plan's box (m) */
export const HP_X0 = -0.05;
export const HP_X1 = PEDAL_X[6] + PEDAL_LEN + 0.02;
export const HP_Y0 = 0;
export const HP_Y1 = CROWN_Y + 0.035;
/** a string's letter index among the pedals (D C B E F G A): which pedal moves it */
export const pedalOf = (i: number): number => HARP_PEDALS.indexOf(STRINGS[i].letter as (typeof HARP_PEDALS)[number]);
