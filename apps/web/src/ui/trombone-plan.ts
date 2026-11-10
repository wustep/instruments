// The slide trombone on the 2D stage: its plan in metres, shared by both styles (trombone-draw.ts, the
// stage's own look; vector/trombone.ts, the lines). Three sizes, one model (the engine's TROMBONE_SIZES):
// the alto in E♭ (no valve), the tenor in B♭ with its F attachment (one rotor, a traditional wrap), the bass
// in B♭ with F and G♭ attachments (two independent rotors in line). Seen from the player's right as makers
// photograph them: the bell section above, its bell opening to the right, the tuning slide's bow at the far
// left; the slide below it, the mouthpiece on its upper tube pointing back at the player, the crook out at
// the right.
//
// The measures. Laid out from Yamaha's own side photographs (Wikimedia Commons, CC BY-SA 4.0): the YSL-620
// (tenor, B♭/F, bell 214.4 mm, bore 13.89 mm: the rim 335 px across, 0.640 mm/px), the YBL-830 (bass, two
// rotors, bell 241 mm: 236 px, 1.02 mm/px) and the YSL-871 (alto in E♭: 380 px, 0.46 mm/px), each scaled
// by its own bell. Measured off them (docs/3d-reference.md, Trombone (2D)): the slide's tubes 72 mm apart
// (tenor; 70 the bass, 46.5 the alto), the crook 730 mm down the slide from the mouthpiece's receiver
// (570 the alto), the outer slide's top 66 mm below the receiver and its hand brace 81 mm, the bell's rim
// 272 mm along (232 the alto) with its axis 51 mm above the slide's upper tube (69 the alto, 71 the bass:
// a larger bell clears the slide), the tuning slide's legs 116 mm apart (tenor), the F rotor 99 mm behind
// the receiver; the bell's flare a Bessel horn fitted to the YSL-620's outline (Ø 147 mm 17 mm in from the
// rim, 90 at 49, 59 at 97, 44 at 161, 35 at 257, 25 at 385: r = R·(d₀/(d + d₀))^0.75, d₀ = 22 mm on a
// 214 mm bell). The air's path through it is the engine's tube (core/trombone.ts: 2.74 m in B♭, 2.06 m the
// alto, mouthpiece to rim, the slide in): the tuning slide's bow and each attachment's loop are placed so
// that their lengths come out at the engine's (the F loop 0.917 m: a fourth; the G♭ loop 0.692 m: with the
// F loop, a minor sixth), and the slide's legs each lengthen by the engine's slide (half the tube it adds).
import { TROMBONE_SIZES, type TromboneSize } from '@piano-model/engine';
import { arc, bezier, plen, rounded, type P } from './horn-plan.ts';

export type { P };
export type Size = TromboneSize;
export const SIZES: Size[] = ['alto', 'tenor', 'bass'];
const D2R = Math.PI / 180;
const join = (...ps: P[][]): P[] => ps.reduce((a, p) => (a.length ? [...a, ...p.slice(1)] : [...p]), [] as P[]);

/** a tube: its centre line (in the air's direction), its outside radius, the layer it is drawn in (0
 *  farthest: the valve loops 0–1, the tuning slide 2, the receiver 3); nickel silver or brass */
export interface Tube {
  id: string;
  pts: P[];
  r: number;
  layer: number;
  nickel?: boolean;
}
/** a run of the air's path: a tube, a passage inside a rotor (hidden: a straight line with its own length),
 *  the bell; how far along its tube it starts */
export interface Run {
  id: string;
  pts: P[];
  len: number;
  hidden?: boolean;
  offset?: number;
}
/** a rotor: its centre, its casing's radius, its cap's; the angles (radians, from +x, y up) of its ports */
export interface Rotor {
  c: P;
  R: number;
  cap: number;
}

/** one size's plan */
export interface Plan {
  size: Size;
  /** the engine's measures (bore, bell, open tube, travel, mouthpiece) */
  bore: number;
  /** the slide: its tubes' spacing; the inner tubes' and the outer tubes' outside radii; the bell
   *  section's tubing's */
  sp: number;
  rIn: number;
  rOut: number;
  rT: number;
  /** along the slide (m from the receiver's mouth, first position): the crook's arc starts, the inner
   *  tubes' stockings end, the outer slide's top, its hand brace, the inner slide's brace, the slide lock
   *  (where the lower tube goes into the bell section) */
  xc: number;
  xs: number;
  xo: number;
  xh: number;
  xi: number;
  xl: number;
  /** how far the slide goes out (m: the engine's travel, or as far as the outer tubes stay on the inner
   *  ones' stockings) */
  travel: number;
  /** the mouthpiece: its length, how much of it shows out of the receiver, its outline as [radius,
   *  distance from the rim] (rim, cup, throat, stem, shank) */
  mpLen: number;
  mpVis: number;
  mpProfile: [number, number][];
  /** the bell: its rim's plane (x), its axis (y), its rim's radius; where its tail leaves the tuning slide
   *  (x) */
  rimX: number;
  axisY: number;
  R: number;
  tailX: number;
  /** the bell's outside radius d m back from its rim */
  bellR: (d: number) => number;
  /** the tuning slide: its legs (y), its bow's centre and radius; its sleeves (x ranges, both legs) */
  tsUp: number;
  tsLo: number;
  bowC: P;
  bowR: number;
  sleeves: [number, number][];
  /** the bell brace (x), from the bell's tail down to the receiver */
  braceX: number;
  /** the rotors (none on the alto; the F valve, then the bass's G♭ valve) */
  rotors: Rotor[];
  /** the fixed tubes of the bell section by id (the F and G♭ loops among them) */
  tubes: Record<string, Tube>;
  /** the bell's run (the tail from the tuning slide to the rim) */
  bell: Run;
}

// ---------------------------------------------------------------- the bell's flare
/** a Bessel horn on the rim's radius: fitted to the YSL-620 (d₀ 22 mm on its 214 mm bell, ε 0.75), the
 *  others scaled by their bells; never under the tubing */
const bellOf = (R: number, rT: number) => {
  const d0 = 0.022 * (R / 0.1072);
  return (d: number): number => Math.max(rT, R * Math.pow(d0 / (Math.max(0, d) + d0), 0.75));
};

// ---------------------------------------------------------------- the mouthpieces
/** a trombone mouthpiece's outline (Bach 6½AL: rim Ø 40 mm outside, cup 25.4, 88 mm long; the others by
 *  their cups), [radius, distance from the rim] */
const mpOf = (cup: number, len: number): [number, number][] => {
  const k = cup / 0.0254;
  const a = (r: number, s: number): [number, number] => [r * k, s * k];
  return [
    a(0.0128, 0.0007), a(0.0186, 0), a(0.0199, 0.0018), a(0.02, 0.0045), a(0.0188, 0.0085), a(0.0162, 0.0145), a(0.0128, 0.021), a(0.0097, 0.0265), a(0.0081, 0.031), a(0.0077, 0.037),
    a(0.0079, 0.043), a(0.0083, 0.0465), a(0.0074, 0.05), [0.0069 * k, len * 0.7], [0.0064 * k, len],
  ];
};

// ---------------------------------------------------------------- the sizes
/** the tube lengths the engine has (m, mouthpiece to rim, the slide in): each side's */
export const OPEN = (size: Size): number => TROMBONE_SIZES[size].length;
export const F_LOOP = (size: Size): number => OPEN(size) * (Math.pow(2, 5 / 12) - 1);
export const GB_LOOP = (size: Size): number => OPEN(size) * (Math.pow(2, 8 / 12) - Math.pow(2, 5 / 12));
/** the passage through a rotor (straight through, or into a loop and out) */
export const PASS = 0.026;

/** a rotor's port on its casing at angle a (degrees) */
const port = (r: Rotor, a: number): P => [r.c[0] + r.R * Math.cos(a * D2R), r.c[1] + r.R * Math.sin(a * D2R)];

/** the plan for a size: laid out at the photographs' measures, then the tuning slide's bow and each loop's
 *  far bow moved so the tubes come out at the engine's lengths (their legs are straight: a bow moved Δ
 *  lengthens its loop by 2Δ) */
function build(size: Size, shift: { bow: number; f: number; g: number }): Plan {
  const B = TROMBONE_SIZES[size];
  const bass = size === 'bass';
  const alto = size === 'alto';
  // the tubing's outside radii: the bore and its walls (inner slide 0.4 mm, outer slide 0.8 mm over it)
  const rIn = B.bore / 2 + 0.0004;
  const rOut = B.bore / 2 + 0.0012;
  const rT = B.bore / 2 + 0.0008;
  const sp = alto ? 0.0465 : bass ? 0.07 : 0.072;
  const xc = alto ? 0.57 : bass ? 0.683 : 0.73;
  const xo = alto ? 0.075 : 0.066;
  const xh = alto ? 0.083 : 0.081;
  const xi = alto ? 0.018 : 0.016;
  const xl = alto ? -0.012 : -0.017;
  const mpLen = alto ? 0.08 : bass ? 0.095 : 0.088;
  const mpVis = alto ? 0.058 : bass ? 0.046 : 0.042;
  const R = B.bell / 2;
  const rimX = alto ? 0.232 : 0.272;
  const axisY = alto ? 0.069 : bass ? 0.071 : 0.051;
  const bellR = bellOf(R, rT);
  const tsUp = axisY;
  const tsLo = alto ? -sp : bass ? -0.062 : -0.065;
  // the tuning slide's bow (its centre's x, before the fit), the bell's tail out of its upper leg
  const bowR = (tsUp - tsLo) / 2;
  const bowX = (alto ? -0.108 : bass ? -0.31 : -0.322) + shift.bow;
  const bowC: P = [bowX, (tsUp + tsLo) / 2];
  const tailX = bowX + (alto ? 0.075 : 0.112);
  const sleeves: [number, number][] = [[bowX + 0.001, tailX - 0.002]];
  const braceX = alto ? -0.037 : -0.067;
  const tubes: Record<string, Tube> = {};
  const rotors: Rotor[] = [];
  const R1: Rotor = { c: [-0.0986, -0.0486], R: 0.0162, cap: 0.0143 };
  const R2: Rotor = { c: [-0.1476, -0.0486], R: 0.0162, cap: 0.0143 };
  // ---- the tuning slide: out along its lower leg (from the receiver, or the last rotor), round its bow,
  // back along its upper leg into the bell's tail
  const tuning = (from: P): P[] => {
    const lead = rounded([from, [from[0] - 0.012, tsLo], [bowX, tsLo]], 0.012);
    const bow = arc(bowC, bowR, -Math.PI / 2, -Math.PI * 1.5);
    return join(lead, bow, rounded([[bowX, tsUp], [tailX, tsUp]], 0));
  };
  if (alto) {
    // no valve: the neckpipe straight back from the slide lock along the slide's lower line
    tubes.recv = { id: 'recv', pts: rounded([[xl, -sp], [xl - 0.03, -sp]], 0), r: rT, layer: 3, nickel: true };
    tubes.tuning = { id: 'tuning', pts: tuning([xl - 0.03, -sp]), r: rT, layer: 2 };
  } else {
    rotors.push(R1);
    if (bass) rotors.push(R2);
    // the receiver: back from the slide lock, then up into the F rotor's lower right
    const inF = port(R1, -38);
    tubes.recv = { id: 'recv', pts: join(rounded([[xl, -sp], [-0.074, -sp]], 0), bezier([-0.074, -sp], [-0.082, -sp], [inF[0] + 0.004, inF[1] - 0.006], inF)), r: rT, layer: 3 };
    const out = port(bass ? R2 : R1, 232);
    tubes.tuning = { id: 'tuning', pts: join(bezier(out, [out[0] - 0.006, out[1] - 0.006], [out[0] - 0.012, tsLo], [out[0] - 0.02, tsLo]), tuning([out[0] - 0.02, tsLo]).slice(1)), r: rT, layer: 2 };
    sleeves.push([out[0] - 0.034, out[0] - 0.024]);
    // ---- the F attachment's loop (a traditional wrap, as the YSL-620's): up out of the rotor's top right,
    // over to the left along A, round a small oval (its tuning slide), along B behind A, round its big bow
    // inside the tuning slide's, back along C and up an S into the rotor's left
    if (!bass) {
      const top = port(R1, 62);
      const yA = 0.028;
      const yB = 0.0365;
      const yC = -0.053;
      const oval = { x0: -0.2415, x1: -0.1605, y0: -0.021 };
      const fx = -0.3 + shift.f;
      const sIn = port(R1, 165);
      tubes.floop = {
        id: 'floop',
        pts: join(
          rounded([top, [top[0] + 0.002, -0.022], [top[0] - 0.012, yA + 0.006], [-0.134, yA]], [0.03, 0.05]),
          rounded([[-0.134, yA], [oval.x0, yA]], 0),
          arc([oval.x0, (yA + oval.y0) / 2], (yA - oval.y0) / 2, Math.PI / 2, Math.PI * 1.5),
          rounded([[oval.x0, oval.y0], [oval.x1, oval.y0]], 0),
          arc([oval.x1, (oval.y0 + yB) / 2], (yB - oval.y0) / 2, -Math.PI / 2, Math.PI / 2),
          rounded([[oval.x1, yB], [fx, yB]], 0),
          arc([fx, (yB + yC) / 2], (yB - yC) / 2, Math.PI / 2, Math.PI * 1.5),
          rounded([[fx, yC], [-0.222, yC]], 0),
          bezier([-0.222, yC], [-0.18, yC], [-0.165, sIn[1] + 0.002], sIn),
        ),
        r: rT,
        layer: 0,
      };
      sleeves.push([-0.215, -0.175], [-0.2, -0.16]);
    } else {
      // the bass (the YBL-830's: two rotors in line, independent, each loop out of its rotor's top and round a
      // bow nested inside the tuning slide's, the F loop's legs outside the G♭ loop's; the F loop's own
      // tuning slide a hairpin standing in the middle of the wrap): with both valves the air goes round both
      // loops (the engine's D side). The F loop's lower leg passes behind the G♭ rotor into the F rotor's
      // lower left
      const R2r = rotors[1];
      const yF1 = 0.06;
      const yF2 = -0.053;
      const fx = -0.3625;
      const top = port(R1, 62);
      const back = port(R1, 205);
      const ux = -0.236;
      const uh = 0.02 - shift.f;
      tubes.floop = {
        id: 'floop',
        pts: join(
          rounded([top, [top[0] + 0.001, yF1], [-0.15, yF1]], 0.034),
          rounded([[-0.15, yF1], [fx, yF1]], 0),
          arc([fx, (yF1 + yF2) / 2], (yF1 - yF2) / 2, Math.PI / 2, Math.PI * 1.5),
          rounded([[fx, yF2], [ux, yF2], [ux, uh], [ux + 0.026, uh], [ux + 0.026, yF2], [back[0] - 0.012, yF2], back], [0.012, 0.013, 0.013, 0.012, 0.008]),
        ),
        r: rT,
        layer: 0,
      };
      tubes.link = { id: 'link', pts: rounded([port(R1, 180), port(R2r, 0)], 0), r: rT, layer: 3 };
      const yG1 = 0.046;
      const yG2 = -0.039;
      const gx = -0.36;
      const gTop = port(R2r, 62);
      const gIn = port(R2r, 160);
      const gux = -0.318;
      const guh = 0.0 - shift.g;
      tubes.gloop = {
        id: 'gloop',
        pts: join(
          rounded([gTop, [gTop[0] + 0.001, yG1], [-0.19, yG1]], 0.03),
          rounded([[-0.19, yG1], [gx, yG1]], 0),
          arc([gx, (yG1 + yG2) / 2], (yG1 - yG2) / 2, Math.PI / 2, Math.PI * 1.5),
          rounded([[gx, yG2], [gux, yG2], [gux, guh], [gux + 0.024, guh], [gux + 0.024, yG2], [gIn[0] - 0.02, yG2], gIn], [0.011, 0.012, 0.012, 0.011, 0.012]),
        ),
        r: rT,
        layer: 1,
      };
      sleeves.push([-0.3, -0.255], [-0.21, -0.17]);
    }
  }
  // ---- the bell's run: its tail out of the tuning slide's upper leg, along its axis to the rim
  const bellPts = rounded([[tailX, axisY], [rimX, axisY]], 0, 0.001);
  const bell: Run = { id: 'bell', pts: bellPts, len: plen(bellPts) };
  return {
    size,
    bore: B.bore,
    sp,
    rIn,
    rOut,
    rT,
    xc,
    xs: xc - 0.01,
    xo,
    xh,
    xi,
    xl,
    // (the bass's slide is the YBL-830's, a little shorter than the tenor's: its outer tubes stay on the
    // inner ones' stockings to 0.6 m, past its seventh position)
    travel: Math.min(B.travel, xc - 0.01 - xo - 0.004),
    mpLen,
    mpVis,
    mpProfile: mpOf(B.cup, mpLen),
    rimX,
    axisY,
    R,
    tailX,
    bellR,
    tsUp,
    tsLo,
    bowC,
    bowR,
    sleeves,
    braceX,
    rotors,
    tubes,
    bell,
  };
}

// ---------------------------------------------------------------- the air's path
/** the valves down for a fingering (the F valve, the G♭ valve) */
export type Down = [boolean, boolean];
const runOf = (t: Tube): Run => ({ id: t.id, pts: t.pts, len: plen(t.pts) });
const hid = (id: string, a: P, b: P, len: number): Run => ({ id, pts: [a, b], len, hidden: true });

/** the bell section's runs for the valves down (from the slide lock to the rim; the slide's own are added
 *  per frame, as it moves) */
export function bellRuns(p: Plan, down: Down): Run[] {
  const runs: Run[] = [runOf(p.tubes.recv)];
  const t = p.tubes;
  if (p.rotors.length) {
    // each rotor in line: straight through, or out round its loop and back (the F rotor, then the bass's
    // G♭ rotor)
    let at = t.recv.pts[t.recv.pts.length - 1];
    p.rotors.forEach((R, k) => {
      const loop = k ? t.gloop : t.floop;
      if (down[k]) {
        runs.push(hid(`r${k}in`, at, loop.pts[0], PASS / 2));
        runs.push(runOf(loop));
        runs.push(hid(`r${k}out`, loop.pts[loop.pts.length - 1], R.c, PASS / 2));
      } else runs.push(hid(`r${k}`, at, R.c, PASS / 2));
      at = R.c;
      if (k < p.rotors.length - 1) {
        runs.push(hid(`r${k}x`, at, t.link.pts[0], PASS / 2));
        runs.push(runOf(t.link));
        at = t.link.pts[t.link.pts.length - 1];
      }
    });
    runs.push(hid('rout', at, t.tuning.pts[0], PASS / 2));
  }
  runs.push(runOf(t.tuning));
  runs.push(p.bell);
  return runs;
}

/** the slide's runs with the outer slide `s` m out: the mouthpiece, the upper leg (the leadpipe in the inner
 *  tube, on into the outer), the crook, the lower leg back to the slide lock */
export function slideRuns(p: Plan, s: number): Run[] {
  const x0 = p.mpLen - p.mpVis;
  const xc = p.xc + s;
  const r = p.sp / 2;
  return [
    { id: 'mp', pts: [[-p.mpVis, 0], [x0, 0]], len: p.mpLen },
    { id: 'up', pts: [[x0, 0], [xc, 0]], len: xc - x0 },
    { id: 'crook', pts: arc([xc, -r], r, Math.PI / 2, -Math.PI / 2, 0.003), len: Math.PI * r },
    { id: 'down', pts: [[xc, -p.sp], [p.xl, -p.sp]], len: xc - p.xl },
  ];
}

/** the path's length for a slide and the valves down */
export function airLength(p: Plan, s: number, down: Down): number {
  let L = 0;
  for (const r of slideRuns(p, s)) L += r.len;
  for (const r of bellRuns(p, down)) L += r.len;
  return L;
}

// ---------------------------------------------------------------- the plans, fitted
const plans = new Map<Size, Plan>();
/** a size's plan: its tubes fitted to the engine's (the open tube 2.74 m or 2.06 m, the F loop a fourth,
 *  the G♭ loop to a minor sixth with it) */
export function plan(size: Size): Plan {
  let p = plans.get(size);
  if (p) return p;
  const shift = { bow: 0, f: 0, g: 0 };
  for (let it = 0; it < 8; it++) {
    const q = build(size, shift);
    shift.bow -= (OPEN(size) - airLength(q, 0, [false, false])) / 2;
    if (q.rotors.length) {
      const fl = airLength(q, 0, [true, false]) - airLength(q, 0, [false, false]);
      shift.f -= (F_LOOP(size) - fl) / 2;
    }
    if (q.rotors.length > 1) {
      const gl = airLength(q, 0, [true, true]) - airLength(q, 0, [true, false]);
      shift.g -= (GB_LOOP(size) - gl) / 2;
    }
  }
  p = build(size, shift);
  plans.set(size, p);
  return p;
}

/** a plan's extent (m): the tuning slide's bow (or a valve loop's, out past it) to the crook's bumper with
 *  the slide all the way out, the slide's lower tube (and the water key under it) to the bell's rim */
export function extent(p: Plan): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = p.bowC[0] - p.bowR;
  for (const t of Object.values(p.tubes)) for (const q of t.pts) x0 = Math.min(x0, q[0]);
  return { x0: x0 - p.rT - 0.004, x1: p.xc + p.travel + p.sp / 2 + p.rOut + 0.012, y0: -p.sp - p.rOut - 0.016, y1: p.axisY + p.R + 0.004 };
}
/** where the slide stands for a position (1–7) on a side lowered `lower` semitones (m out): half the tube
 *  it adds (the engine's tromboneSlideOut) */
export const positionOut = (size: Size, n: number, lower = 0): number => (OPEN(size) * Math.pow(2, lower / 12) * (Math.pow(2, (n - 1) / 12) - 1)) / 2;
