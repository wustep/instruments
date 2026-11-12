// The tuba's plan, in metres: the contrabass tuba in C with four front-action piston valves (the American
// orchestral pattern: York, Hirsbrunner, Conn 52J), seen from its valve side as it stands on its bottom bow,
// the bell up, as the makers photograph it.
//
// Which way round. A front-action tuba is held with its bell at the player's left and its valves before his
// right hand. Seen from the valve side that is: the bell's stack at the left, leaning a few degrees further
// left; the wound body and the valve block to its right; the leadpipe coming from the first valve across
// the front of the stack to the mouthpiece, which stands out past the stack at the left, two thirds of the
// way up, pointing at the player's mouth (he sits at that side, looking along the instrument); the pistons
// leaning, their buttons up and towards him, where the fingers of the right hand come round to them
// (photographs: Yamaha YCB-822/YFB-822 and YBB-641, front-action and rotary, bell left; a top-action tuba,
// YBB-321, is the mirror image and is held with the bell at the right). As first drawn (#62) this plan was
// that mirror image with front valves, and its mouthpiece at the height of the bell's flare: a tuba no one
// could hold.
//
// Drawn from its measures: 0.97 m tall, a bell 0.48 m across, a bore of 19 mm through the valves
// widening all the way to the bell (Fletcher & Rossing 1998, "The Physics of Musical Instruments" §14.9;
// the makers' specifications: Conn 52J and 54J, Yamaha YCB-822, Miraphone 1291: bells 483–508 mm, bores
// 17.5–19.5 mm, heights 0.93–1.0 m). x to the right, y up, the origin on the floor under the body's middle.
//
// The air's way, lips to bell: the mouthpiece beside the bell, the leadpipe across the front of the stack and
// down into the first valve; through the four pistons in their row (each switching its loop in when it is
// down: the second's, a semitone; the first's, a tone; the third's, a tone and a half; the fourth's, a
// fourth); out of the fourth valve's foot into the main tuning slide's bow and up into the body, which winds
// inwards-out as a flattened spiral, each lap wider than the last: up, over the small top bow, down, round
// the small bottom bow, up, over the large top bow, down the outer branch, round the bottom bow and up the
// bell's stack to the rim. Every length is the engine's: the open tube 4.88 m (TUBA_LENGTH), each loop the
// open tube × (2^(k/12) − 1) for the 1, 2, 3 and 5 semitones it lowers (0.290, 0.598, 0.923 and 1.634 m),
// the plan's two free measures (how deep the main slide hangs, how far each loop reaches) solved to them.
import { TUBA_LENGTH, tubaFingering, valvesDown } from '@piano-model/engine';
import { arc, plen, rounded, type P, type Run, type Tube } from './horn-plan.ts';

/** the bore's radius through the valves and their slides (19 mm), the tubes' walls and all */
export const BORE = 0.0105;
/** the four pistons: their casings' centres along the row (the first valve nearest the leadpipe), the
 *  height of the main line through them, the casings' radius and ends, the stems' tops (up) and their travel */
export const VALVE_X = [0.03, 0.075, 0.12, 0.165];
export const VALVE_Y = 0.44;
export const CASING_R = 0.0165;
export const CASING_Y0 = 0.375;
export const CASING_Y1 = 0.515;
export const BUTTON_Y = 0.578;
export const TRAVEL = 0.021;
/** how far the pistons lean from upright, their buttons towards the mouthpiece's side (rad): front-action */
export const PISTON_LEAN = (22 * Math.PI) / 180;
/** a point of valve k's piston drawn upright, leaned with it about the main line's passage through it */
export const lean = (k: number, p: P): P => {
  const c = Math.cos(PISTON_LEAN);
  const s = Math.sin(PISTON_LEAN);
  const dx = p[0] - VALVE_X[k];
  const dy = p[1] - VALVE_Y;
  return [VALVE_X[k] + dx * c - dy * s, VALVE_Y + dx * s + dy * c];
};
/** each valve's loop lowers the tube by this many semitones (valves 1–4) */
export const VALVE_SEMIS = [2, 1, 3, 5];
/** a loop's length for its semitones (m) */
export const loopLength = (k: number): number => TUBA_LENGTH * (Math.pow(2, VALVE_SEMIS[k] / 12) - 1);

// ---------------------------------------------------------------- the bell
/** the bell's axis at the stack's foot, its rim's height and radius, the stack's foot; and how far the bell
 *  leans from upright towards the mouthpiece's side (rad: a tuba's bell stands a few degrees off its body) */
export const BELL_X = -0.09;
export const RIM_Y = 0.97;
export const RIM_R = 0.24;
export const STACK_Y0 = 0.2;
export const BELL_TILT = (4 * Math.PI) / 180;
/** the bell's axis at height y (it leans from the stack's foot up) */
export const bellAxisX = (y: number): number => BELL_X - Math.max(0, y - STACK_Y0) * Math.tan(BELL_TILT);
/** where the axis meets the rim's plane */
export const BELL_TOP_X = bellAxisX(RIM_Y);
/** the bell's radius d m below the rim: a Bessel horn (r ∝ (d + d₀)^−0.75) from the rim's 0.24 m to the
 *  stack's foot, 55 mm, where the bottom bow takes over */
export const bellR = (d: number): number => RIM_R * Math.pow(0.125 / (Math.max(0, d) + 0.125), 0.75);
/** how flat the rim's circle looks from the front, a little above (its ellipse's minor over major axis) */
export const MOUTH_K = 0.2;

// ---------------------------------------------------------------- the body (the wide tubing)
/** where the body begins (the main slide's upper end) */
const BODY_X0 = 0.09;
const BODY_Y0 = 0.36;
const turned = (ps: P[]): P[] => ps.map(([x, y]) => [-x, y] as P);
const BODY_PTS: P[] = (() => {
  const j = (...ps: P[][]): P[] => ps.reduce((a, p) => (a.length ? [...a, ...p.slice(1)] : [...p]), [] as P[]);
  const line = (a: P, b: P): P[] => rounded([a, b], 0);
  // (laid out with the bell at the right and turned over, x → −x: see the head of the file)
  return turned(j(
    line([-BODY_X0, BODY_Y0], [-BODY_X0, 0.63]),
    arc([-0.1075, 0.63], 0.0175, 0, Math.PI), // the small top bow
    line([-0.125, 0.63], [-0.125, 0.24]),
    arc([-0.085, 0.24], 0.04, Math.PI, 2 * Math.PI), // the small bottom bow
    line([-0.045, 0.24], [-0.045, 0.67]),
    arc([-0.1225, 0.67], 0.0775, 0, Math.PI), // the large top bow
    line([-0.2, 0.67], [-0.2, STACK_Y0]),
    arc([-0.055, STACK_Y0], 0.145, Math.PI, 2 * Math.PI), // the bottom bow
  ));
})();
const BODY_LEN = plen(BODY_PTS);
/** the body's radius s m along it: from the main slide's 11 mm to the stack's foot */
const bodyR = (s: number): number => 0.011 + (bellR(RIM_Y - STACK_Y0) - 0.011) * Math.pow(Math.min(1, Math.max(0, s / BODY_LEN)), 1.3);
/** the bell's stack and flare: its axis from the bottom bow up to the rim, leaning */
export const BELL_PTS: P[] = rounded([[BELL_X, STACK_Y0], [BELL_TOP_X, RIM_Y]], 0, 0.004);
export const BELL_LEN = plen(BELL_PTS);

// ---------------------------------------------------------------- the mouthpiece and the leadpipe
/** the mouthpiece's rim (its middle: at the player's mouth, 0.58 m over the lap the tuba stands on) and the
 *  way into it (the air goes right, towards the leadpipe) */
export const MP_RIM: P = [-0.345, 0.58];
export const MP_DIR: P = [1, 0];
/** its length, and how much of it shows outside the receiver */
export const MP_LEN = 0.09;
const MP_VIS = 0.068;
/** a tuba's mouthpiece (a deep funnel: Conn Helleberg's sizes) as [radius, distance from the rim], m */
export const MPIECE: [number, number][] = [[0.0218, 0], [0.0245, 0.003], [0.024, 0.009], [0.0205, 0.02], [0.0145, 0.036], [0.0098, 0.05], [0.0086, MP_VIS]];
/** the leadpipe: from the mouthpiece across the front of the bell's stack, down along it, round and up into
 *  the first valve (0.8 m of it, as a tuba's is) */
export const LEAD_X = -0.03;
export const LEAD_Y0 = 0.26;
const LEAD_PTS: P[] = rounded([[MP_RIM[0] + MP_VIS, MP_RIM[1]], [LEAD_X, MP_RIM[1]], [LEAD_X, LEAD_Y0], [0, LEAD_Y0], [0, VALVE_Y], [VALVE_X[0] - CASING_R, VALVE_Y]], [0.05, 0.015, 0.015, 0.012]);
const LEAD_LEN = plen(LEAD_PTS);

// ---------------------------------------------------------------- the valves' passages, the loops, the main slide
/** the passage straight through a piston, the port into (or out of) its loop, the knuckle to the next valve */
const THROUGH = 0.03;
const INTO = 0.015;
const KNUCKLE = VALVE_X[1] - VALVE_X[0] - THROUGH;

/** a loop's centre line for its free measure `u` (how far its bow reaches), in the air's direction: the
 *  first three stand on their pistons and lean with them */
function loopPts(k: number, u: number): P[] {
  const x = VALVE_X[k];
  const up = CASING_Y1 - 0.035;
  const dn = CASING_Y0 + 0.025;
  const on = (ps: P[]): P[] => ps.map((q) => lean(k, q));
  switch (k) {
    // the first valve's slide hangs down under its casing
    case 0:
      return on(rounded([[x - 0.012, dn], [x - 0.012, dn - u], [x + 0.012, dn - u], [x + 0.012, dn]], 0.012));
    // the second's stands up behind its stem, short
    case 1:
      return on(rounded([[x - 0.012, up], [x - 0.012, up + u], [x + 0.012, up + u], [x + 0.012, up]], 0.012));
    // the third's goes up, over, down past the casing and back up into it
    case 2:
      return on(rounded([[x - 0.012, up], [x - 0.012, up + u], [x + 0.012, up + u], [x + 0.012, 0.29], [x - 0.012, 0.29], [x - 0.012, dn]], 0.012));
    // the fourth's is the long one: out of its casing's side to the right of the body, up, over, all the way
    // down and back
    default: {
      const a = lean(3, [x + CASING_R, up]);
      const b = lean(3, [x + CASING_R, dn]);
      return rounded([a, [0.262, a[1]], [0.262, a[1] + u], [0.286, a[1] + u], [0.286, 0.09], [0.262, 0.09], [0.262, b[1]], b], 0.012);
    }
  }
}
/** the measure that makes a polyline family `f(u)` as long as `want` (its length grows with u) */
function solve(f: (u: number) => P[], want: number, lo: number, hi: number): number {
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (plen(f(m)) < want) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
// (a loop switched in: the port in, the loop, the port out, in place of the passage through)
const LOOP_PTS: P[][] = [0, 1, 2, 3].map((k) => loopPts(k, solve((u) => loopPts(k, u), loopLength(k) - 2 * INTO + THROUGH, 0.02, 0.6)));
/** the main tuning slide: out of the fourth valve's (leaning) foot, straight down under its casing's middle,
 *  round its bow and up into the body; `y` its bow's height */
const FOOT: P = lean(3, [VALVE_X[3], CASING_Y0]);
const slidePts = (y: number): P[] => [...rounded([FOOT, [VALVE_X[3], FOOT[1] - 0.03], [VALVE_X[3], y]], 0.012), ...arc([(VALVE_X[3] + BODY_X0) / 2, y], (VALVE_X[3] - BODY_X0) / 2, 2 * Math.PI, Math.PI).slice(1), ...rounded([[BODY_X0, y], [BODY_X0, BODY_Y0]], 0).slice(1)];
/** the open tube without the main slide: the mouthpiece, the leadpipe (less the shank inside it), the four
 *  passages and three knuckles, the body, the bell */
const REST = MP_LEN + (LEAD_LEN - (MP_LEN - MP_VIS)) + 4 * THROUGH + 3 * KNUCKLE + BODY_LEN + BELL_LEN;
// (a deeper bow is a longer slide: solved downwards)
const SLIDE_PTS: P[] = slidePts(0.36 - solve((u) => slidePts(0.36 - u), TUBA_LENGTH - REST, 0.02, 0.36));

// ---------------------------------------------------------------- the tubes
export const TUBES: Record<string, Tube> = {
  body: { id: 'body', pts: BODY_PTS, r: bodyR, layer: 0 },
  slide: { id: 'slide', pts: SLIDE_PTS, r: 0.011, layer: 1 },
  L4: { id: 'L4', pts: LOOP_PTS[3], r: BORE, layer: 2 },
  L3: { id: 'L3', pts: LOOP_PTS[2], r: BORE, layer: 2 },
  L1: { id: 'L1', pts: LOOP_PTS[0], r: BORE, layer: 2 },
  L2: { id: 'L2', pts: LOOP_PTS[1], r: BORE, layer: 2 },
  lead: { id: 'lead', pts: LEAD_PTS, r: (s: number) => 0.0072 + (BORE - 0.0072) * Math.min(1, s / LEAD_LEN), layer: 3 },
};
export const TUBE_LEN: Record<string, number> = Object.fromEntries(Object.entries(TUBES).map(([k, t]) => [k, plen(t.pts)]));

/** the plan's box (m): from the mouthpiece's rim or the leaning bell's rim, whichever is further, to the
 *  fourth loop's bow; the floor to the rim's far edge */
export const TB_X0 = Math.min(MP_RIM[0] - 0.006, BELL_TOP_X - RIM_R - 0.004);
export const TB_X1 = 0.3;
export const TB_Y0 = 0;
export const TB_Y1 = RIM_Y + RIM_R * MOUTH_K + RIM_R * Math.sin(BELL_TILT) + 0.004;

// ---------------------------------------------------------------- the air's path for a fingering
const hid = (id: string, a: P, b: P, len: number): Run => ({ id, pts: [a, b], len, hidden: true });
const tube = (id: string): Run => ({ id, pts: TUBES[id].pts, len: TUBE_LEN[id] });
const MP_RUN: Run = { id: 'mp', pts: [MP_RIM, [MP_RIM[0] + MP_DIR[0] * MP_LEN, MP_RIM[1]]], len: MP_LEN };
const LEAD_RUN: Run = (() => {
  let s = 0;
  let i = 1;
  for (; i < LEAD_PTS.length; i++) {
    s += Math.hypot(LEAD_PTS[i][0] - LEAD_PTS[i - 1][0], LEAD_PTS[i][1] - LEAD_PTS[i - 1][1]);
    if (s >= MP_LEN - MP_VIS) break;
  }
  return { id: 'lead', pts: LEAD_PTS.slice(i), len: LEAD_LEN - s, offset: s };
})();
const BELL_RUN: Run = { id: 'bell', pts: BELL_PTS, len: BELL_LEN };

/** the air's path from the lips to the bell's rim with these valves down ([1, 2, 3, 4]) */
export function airPath(down: readonly boolean[]): Run[] {
  const runs: Run[] = [MP_RUN, LEAD_RUN];
  for (let k = 0; k < 4; k++) {
    const c: P = [VALVE_X[k], VALVE_Y];
    const id = `L${k + 1}`;
    if (down[k]) {
      const p = TUBES[id].pts;
      runs.push(hid(`v${k + 1}in`, c, p[0], INTO), tube(id), hid(`v${k + 1}out`, p[p.length - 1], c, INTO));
    } else runs.push(hid(`v${k + 1}`, [c[0] - CASING_R, c[1]], [c[0] + CASING_R, c[1]], THROUGH));
    if (k < 3) runs.push(hid(`k${k + 1}`, [c[0] + CASING_R, c[1]], [VALVE_X[k + 1] - CASING_R, c[1]], KNUCKLE));
  }
  runs.push(tube('slide'), tube('body'), BELL_RUN);
  return runs;
}
const pathCache = new Map<string, { runs: Run[]; total: number; starts: number[] }>();
/** the path for the valves down, its runs' starts (m from the lips) and its whole length (cached) */
export function tubaAir(down: readonly boolean[]): { runs: Run[]; total: number; starts: number[] } {
  const key = down.map((d) => (d ? 1 : 0)).join('');
  let a = pathCache.get(key);
  if (!a) {
    const runs = airPath(down);
    const starts: number[] = [];
    let s = 0;
    for (const r of runs) {
      starts.push(s);
      s += r.len;
    }
    pathCache.set(key, (a = { runs, total: s, starts }));
  }
  return a;
}
/** the drawn air path's length for the engine's fingering of a note (m): the open tube and each valve
 *  alone are the engine's lengths exactly; valves together fall short of it as a real tuba's do (each loop
 *  is cut for the open tube: 1+2+3+4 is 10 % short, and played with the slides pulled) */
export const tubaAirLength = (m: number): number => tubaAir(valvesDown(tubaFingering(m).valves, 4)).total;
