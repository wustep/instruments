// The oboe on the 2D stage (the classic look), and its plan shared with the vector display
// (vector/oboe.ts). A full-conservatoire oboe from the front, the side its tone holes face: lying with
// its reed to the left on a wide stage, standing reed up in a tall box (an Orchestra cell), drawn at its
// real sizes in metres from the reed's tip:
//   the reed (71 mm, 55 mm of it out of the reed well: its cane blades with their scrape and bark, the
//   thread, the staple and its cork); the top joint 233 mm, the lower joint 240 mm, the bell 127 mm
//   (601 mm of wood: the Brussels MIM's Lorée, Système Conservatoire, inv. 1983.021, whose reed is
//   71 mm on a 47 mm staple, its reed well 7.4 × 18.2 mm, its bore 4.0 mm at the top, 10.0 at the end of
//   the top joint, 15.5 at the end of the lower joint; brusselsmimoboecollection.kcb.be); the outer
//   profile (the top joint's turned knob, the socket rings, the bell's swell to its 50 mm rim) and the
//   keys' places measured off a front photograph of a conservatoire oboe standing (Wikimedia Commons,
//   File:Oboe_2.JPG) at those lengths.
// The tone holes are placed so that, with a cone's missing apex of 0.10 m above the reed's tip (the top
// joint's taper, 4 → 10 mm over 233 mm, carried on to its point) and an end correction of 20 mm at each
// hole, every first-register note's first open hole falls within 5 % of its c / 2f (apps/web/test/
// oboe2d.test.ts): the standing wave drawn along the bore ends where it really leaves the tube.
// The keys close for the engine's note by the shared fingering chart (oboe-fingering.ts), each on a
// spring; the double reed's opening flutters with the engine's own reed (its opening over the last
// cycles, played back slowed); the bore's standing wave (the engine's, with its sign) glows inside the
// conical bore from the reed to the first open hole, in as many half-waves as the fingering's register
// plays (an octave-keyed note: two).
import type { VisualFrame } from '@piano-model/engine';
import { HALF, L1, L2, L3, LB, LBB, LEB, LGS, OCT1, OCT2, R1, R2, R3, RC, RCS, REB, RF, oboeFingersFor } from './oboe-fingering.ts';
import { AutoScale, INK, boreAt, newBoreWave, rgba, slowPhase, spring01, trackBoreWave, type BoreWave } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface OboeState {
  pScale: AutoScale;
  env: Float32Array;
  /** where its sound leaves (the bell's mouth: the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** each key's spring (1 its hole open, 0 shut), the fingers' press (0..1), the half-hole's roll */
  keys?: { pos: Float32Array; vel: Float32Array; press: Float32Array; half: Float32Array; t: number; quiet: number };
  /** the reed's opening over one cycle (from the cycle's narrowest), from the engine's trace */
  reed?: { cyc: Float32Array; last: Float32Array | null };
  /** where it was last drawn (box px): the instrument, reed tip to bell rim and its keys' reach; the
   *  reed's tip; the keywork (tests, and the review's close-ups) */
  drawn?: { body: Box; reed: { x: number; y: number }; keys: Box; vertical: boolean; fingers: number };
}
export const newOboeState = (): OboeState => ({ pScale: new AutoScale(1e-6), env: new Float32Array(0) });

// ---------------------------------------------------------------- the plan, metres from the reed's tip
/** the oboe's length, reed tip to bell rim (m) */
export const OB_LEN = 0.655;
/** the box (m) the oboe is drawn in at one px per metre (an ensemble sizes it from the strings' scale):
 *  its length over the share of the box it fills, and across it the bell, the keys and the wave */
export const oboeBox = (): { w: number; h: number } => ({ w: OB_LEN / 0.9, h: 0.16 });
/** the top joint's top (the reed well's mouth), its join with the lower joint, the bell's socket */
export const OB_TJ = 0.055;
export const OB_LJ = 0.288;
export const OB_BELL = 0.528;
/** the cone's missing apex above the reed's tip, and a tone hole's end correction (m) */
export const OB_APEX = 0.1;
export const OB_HOLE_CORR = 0.02;
/** the open bell's end correction (0.6 × its 19.5 mm mouth) */
const OB_BELL_CORR = 0.012;

/** the reed: the cane's half-width (7.2 mm at the tip, narrowing to the tie), the thread, the staple, the
 *  cork (its visible top above the reed well) */
const RD_CANE = 0.026;
const RD_THREAD = [0.024, 0.041] as const;
const RD_CORK = 0.0445;
export const RD_TIP_HW = 0.0036;
export const reedHW = (x: number): number => {
  if (x < RD_CANE) {
    // (the tip's corners rounded)
    const c = x < 0.0007 ? Math.sqrt(Math.max(0, 1 - ((0.0007 - x) / 0.0007) ** 2)) : 1;
    return (RD_TIP_HW - (RD_TIP_HW - 0.0024) * Math.pow(Math.max(0, x) / RD_CANE, 1.15)) * (0.82 + 0.18 * c);
  }
  if (x < RD_THREAD[1]) return 0.0024 + (0.0004 * (x - RD_CANE)) / (RD_THREAD[1] - RD_CANE);
  if (x < RD_CORK) return 0.0021;
  return 0.0031 + (0.0006 * (x - RD_CORK)) / (OB_TJ - RD_CORK);
};

/** the wood's outer radius against x: the top's silver ring and turned knob, the top joint's slight
 *  taper, the lower joint's socket ring and shoulder, the bell's socket ring, swell, flare and rim */
const OB_PROFILE: [number, number][] = [
  [OB_TJ, 0.0068], [0.0558, 0.0079], [0.0568, 0.009], [0.057, 0.0101], [0.0598, 0.0122], [0.0635, 0.0137], [0.0685, 0.0143], [0.0735, 0.0142],
  [0.0785, 0.0134], [0.0825, 0.0123], [0.0855, 0.0118], [0.09, 0.01165], [0.16, 0.0119], [OB_LJ, 0.0126],
  [OB_LJ, 0.0136], [0.2884, 0.014], [0.2935, 0.014], [0.2938, 0.0137], [0.309, 0.0137], [0.3125, 0.0131], [0.4, 0.0134], [OB_BELL, 0.0141],
  [OB_BELL, 0.015], [0.5284, 0.0154], [0.5335, 0.0154], [0.5338, 0.015], [0.545, 0.0143], [0.565, 0.0143], [0.59, 0.0149], [0.605, 0.0158],
  [0.617, 0.0172], [0.627, 0.019], [0.635, 0.0212], [0.641, 0.0232], [0.6455, 0.0245], [0.649, 0.0251], [0.652, 0.0248], [0.654, 0.0236], [OB_LEN, 0.0222],
];
/** the bore's radius: the staple's cone (in the reed), the reed well, the top joint 4 → 10 mm, the
 *  lower joint 10.2 → 15.5 mm, the bell's flare to its 39 mm mouth behind an inner lip */
const OB_BORE: [number, number][] = [
  [0, 0.0009], [RD_CANE, 0.0007], [0.073, 0.0021], [OB_LJ, 0.005], [OB_LJ, 0.0051], [OB_BELL, 0.00775], [0.56, 0.0082], [0.595, 0.0094], [0.62, 0.0118], [0.638, 0.016], [0.65, 0.0208], [OB_LEN, 0.0196],
];
const lerpTab = (t: [number, number][], x: number): number => {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) {
    const [x0, y0] = t[i - 1];
    const [x1, y1] = t[i];
    return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;
  }
  return t[t.length - 1][1];
};
/** the outer radius at x: the reed's, then the wood's */
export const obR = (x: number): number => (x < OB_TJ ? reedHW(x) : lerpTab(OB_PROFILE, x));
export const obBore = (x: number): number => lerpTab(OB_BORE, x);
/** where the wave's envelope stands off the body: the wood's mean radius (the reed and the top's knob
 *  smoothed over), the bell's flare */
export const obLobeBase = (x: number): number => Math.max(0.0118 + 0.0024 * Math.min(1, Math.max(0, x) / OB_BELL), x > 0.6 ? obR(x) : 0);

export type ObStyle = 'ring' | 'plate' | 'cup';
export interface ObKey {
  id: string;
  /** the tone hole's centre along the oboe (m from the reed's tip) */
  x: number;
  /** round the body from the front (deg), towards the player's right */
  phi: number;
  /** the cup's or ring's radius, and the tone hole's */
  r: number;
  hole: number;
  style: ObStyle;
  /** closed-standing: its pad shut at rest, lifted by its touch */
  closed?: boolean;
  /** a register vent (an octave key's), not a hole that sets the note */
  vent?: boolean;
  /** the hole open for a fingering (the chart's bits) */
  open: (f: number) => boolean;
  /** the fingers whose press moves it */
  by: number;
  /** across (m) the rod its arm runs to */
  rod: number;
}
/** the rods' places across the body (m: − the player's left, + the right) */
const ROD_TJ = 0.0088;
const ROD_LJ = 0.0098;
const ROD_LONG = -0.0124;
const ROD_BELL = -0.0136;
/** The keys, top to bottom (the photograph's places at the Lorée's joint lengths; the vents' linkages as
 *  a full conservatoire's: the R1 ring opens the C vent with L1 down and L2 up, and the B♭ vent with L2
 *  down and L3 up) */
export const OB_KEYS: ObKey[] = [
  { id: 'oct2', x: 0.104, phi: -62, r: 0.0031, hole: 0.0012, style: 'cup', closed: true, vent: true, open: (f) => !!(f & OCT2), by: OCT2, rod: -ROD_TJ },
  { id: 'oct1', x: 0.129, phi: 66, r: 0.0032, hole: 0.0013, style: 'cup', closed: true, vent: true, open: (f) => !!(f & OCT1), by: OCT1, rod: ROD_TJ },
  // (the trill keys on the player's left, by L1–L3: shut, played by no note of the chart)
  { id: 'trill-cd', x: 0.2005, phi: -52, r: 0.0025, hole: 0.001, style: 'cup', closed: true, vent: true, open: () => false, by: 0, rod: -ROD_TJ },
  { id: 'trill-bc', x: 0.2365, phi: -52, r: 0.0025, hole: 0.001, style: 'cup', closed: true, vent: true, open: () => false, by: 0, rod: -ROD_TJ },
  { id: 'l1', x: 0.185, phi: 0, r: 0.0058, hole: 0.0021, style: 'plate', open: (f) => !(f & L1), by: L1, rod: ROD_TJ },
  { id: 'cvent', x: 0.2035, phi: 34, r: 0.0029, hole: 0.0012, style: 'cup', closed: true, open: (f) => !!(f & L1) && !!(f & R1) && !(f & L2), by: R1, rod: ROD_TJ },
  { id: 'l2', x: 0.22, phi: 0, r: 0.0056, hole: 0.0024, style: 'ring', open: (f) => !(f & L2), by: L2, rod: ROD_TJ },
  { id: 'bbvent', x: 0.2375, phi: 34, r: 0.0029, hole: 0.0012, style: 'cup', closed: true, open: (f) => !!(f & L2) && !!(f & R1) && !(f & L3), by: R1, rod: ROD_TJ },
  { id: 'l3', x: 0.255, phi: 0, r: 0.0056, hole: 0.0024, style: 'ring', open: (f) => !(f & L3), by: L3, rod: ROD_TJ },
  { id: 'gs', x: 0.279, phi: -38, r: 0.0041, hole: 0.0019, style: 'cup', closed: true, open: (f) => !!(f & LGS), by: LGS, rod: -ROD_TJ },
  { id: 'r1', x: 0.323, phi: 0, r: 0.0058, hole: 0.0025, style: 'ring', open: (f) => !(f & R1), by: R1, rod: -ROD_LJ },
  { id: 'r2', x: 0.356, phi: 0, r: 0.0058, hole: 0.0025, style: 'ring', open: (f) => !(f & R2), by: R2, rod: -ROD_LJ },
  { id: 'f', x: 0.373, phi: 42, r: 0.0039, hole: 0.0018, style: 'cup', closed: true, open: (f) => !!(f & RF), by: RF, rod: ROD_LJ },
  { id: 'r3', x: 0.388, phi: 0, r: 0.0058, hole: 0.0025, style: 'ring', open: (f) => !(f & R3), by: R3, rod: -ROD_LJ },
  { id: 'eb', x: 0.416, phi: -40, r: 0.0045, hole: 0.0021, style: 'cup', closed: true, open: (f) => !!(f & (REB | LEB)), by: REB | LEB, rod: -ROD_LJ },
  { id: 'cs', x: 0.446, phi: 36, r: 0.005, hole: 0.0024, style: 'cup', open: (f) => !(f & (RCS | RC)), by: RCS | RC, rod: ROD_LJ },
  { id: 'c', x: 0.483, phi: 6, r: 0.006, hole: 0.0028, style: 'cup', open: (f) => !(f & RC), by: RC, rod: ROD_LJ },
  { id: 'b', x: 0.551, phi: 34, r: 0.0061, hole: 0.003, style: 'cup', open: (f) => !(f & (LB | LBB)), by: LB | LBB, rod: ROD_BELL },
  { id: 'bb', x: 0.578, phi: 34, r: 0.0063, hole: 0.0031, style: 'cup', open: (f) => !(f & LBB), by: LBB, rod: ROD_BELL },
];
/** which of the keys stand open for a note (the tests hold them to the chart) */
export const oboeKeysOpen = (m: number): { id: string; x: number; open: boolean }[] => {
  const f = oboeFingersFor(m);
  return OB_KEYS.map((k) => ({ id: k.id, x: k.x, open: k.open(f) }));
};
/** the half-hole's small perforation in L1's plate, open (the finger off the plate, or rolled down) */
export const halfOpen = (f: number): boolean => !(f & L1) || !!(f & HALF);
/** the first open hole that sets the note (vents aside), or null for the open bell */
export function obFirstOpen(f: number): ObKey | null {
  for (const k of OB_KEYS) if (!k.vent && k.open(f)) return k;
  return null;
}
/** The standing wave's span along the bore for a fingering and a sounding frequency: it leaves the tube
 *  an end correction past the first open hole (or the bell's mouth), `end` m from the reed's tip, in
 *  `n` half-waves (with the cone's missing apex, n·c/2f long: one in the first register, two for an
 *  octave-keyed or half-holed note, more for the third octave's cross-fingerings), its nodes inside the
 *  tube at `nodes` */
export function obWaveSpan(f: number, f1: number): { end: number; n: number; nodes: number[] } {
  const k = obFirstOpen(f);
  const end = k ? k.x + OB_HOLE_CORR : OB_LEN + OB_BELL_CORR;
  const n = Math.max(1, Math.round((end + OB_APEX) / (343 / (2 * f1))));
  const nodes: number[] = [];
  for (let j = 1; j < n; j++) nodes.push(Math.max(0, (j * (end + OB_APEX)) / n - OB_APEX));
  return { end, n, nodes };
}

/** a touch the fingers press: a spatula, from its root (on the body) out to its round end */
export interface ObTouch {
  id: string;
  bit: number;
  x0: number;
  v0: number;
  x1: number;
  v1: number;
  w: number;
  /** behind the body (the thumb's plate, the thumb rest: only their edges show) */
  back?: boolean;
  /** a fixed part (the thumb rest) or a key the chart never uses (the banana key) */
  fixed?: boolean;
}
export const OB_TOUCHES: ObTouch[] = [
  // the side octave key's long lever, by L1 on the player's left; the thumb's plate behind
  { id: 'oct2', bit: OCT2, x0: 0.15, v0: -0.0128, x1: 0.192, v1: -0.0136, w: 0.0026 },
  { id: 'thumb', bit: OCT1, x0: 0.14, v0: 0.0108, x1: 0.162, v1: 0.0129, w: 0.0034, back: true },
  // the left little finger: the G♯ spatula at the top joint's foot, and the low B, B♭ and E♭ at the
  // lower joint's head (their long rods run down to the bell and the E♭ pad)
  { id: 'gs', bit: LGS, x0: 0.262, v0: -0.0112, x1: 0.282, v1: -0.0205, w: 0.0038 },
  { id: 'leb', bit: LEB, x0: 0.296, v0: -0.0125, x1: 0.309, v1: -0.0195, w: 0.0033 },
  { id: 'lb', bit: LB, x0: 0.303, v0: -0.0128, x1: 0.321, v1: -0.0232, w: 0.0039 },
  { id: 'lbb', bit: LBB, x0: 0.313, v0: -0.013, x1: 0.334, v1: -0.0268, w: 0.0042 },
  // the right hand: the F lever between R2 and R3; the little finger's C♯, C and E♭
  { id: 'f', bit: RF, x0: 0.364, v0: 0.0118, x1: 0.378, v1: 0.0158, w: 0.0026 },
  // (the right thumb's rest behind the lower joint; the banana key by R3)
  { id: 'rest', bit: 0, x0: 0.318, v0: 0.0118, x1: 0.336, v1: 0.0157, w: 0.0036, back: true, fixed: true },
  { id: 'banana', bit: 0, x0: 0.38, v0: 0.0104, x1: 0.396, v1: 0.0132, w: 0.0021, fixed: true },
  { id: 'rcs', bit: RCS, x0: 0.398, v0: 0.0128, x1: 0.414, v1: 0.0218, w: 0.0036 },
  { id: 'rc', bit: RC, x0: 0.408, v0: 0.013, x1: 0.428, v1: 0.0258, w: 0.0042 },
  { id: 'reb', bit: REB, x0: 0.424, v0: 0.0128, x1: 0.44, v1: 0.0202, w: 0.0034 },
];
/** the keys' and touches' farthest reach across the body (m) */
export const OB_REACH = 0.0285;
/** the rods (across at v, along from a to b) and their pillars */
export const OB_RODS: [number, number, number][] = [
  [-ROD_TJ, 0.097, 0.284],
  [ROD_TJ, 0.112, 0.284],
  [-ROD_LJ, 0.298, 0.522],
  [ROD_LJ, 0.298, 0.49],
  [ROD_LONG, 0.3, 0.524],
  [ROD_BELL, 0.532, 0.584],
];
const OB_POSTS: [number, number][] = [
  [-ROD_TJ, 0.097], [-ROD_TJ, 0.165], [-ROD_TJ, 0.284], [ROD_TJ, 0.112], [ROD_TJ, 0.196], [ROD_TJ, 0.284],
  [-ROD_LJ, 0.298], [-ROD_LJ, 0.404], [-ROD_LJ, 0.522], [ROD_LJ, 0.298], [ROD_LJ, 0.398], [ROD_LJ, 0.49],
  [ROD_LONG, 0.524], [ROD_BELL, 0.532], [ROD_BELL, 0.584],
];
/** each key's hinge tube along its rod (m) */
const hingeOf = (k: ObKey): [number, number] => {
  const h = Math.max(0.006, k.r * 1.7);
  return [k.x - h / 2, k.x + h / 2];
};
/** the edges where rings and joints meet, drawn as hairlines across the wood */
const OB_SEAMS = [0.0568, OB_LJ, 0.2935, 0.3125, OB_BELL, 0.5335];
/** the silver rings: the reed well's lining at the top, the lower joint's and the bell's sockets */
const OB_SILVER: [number, number][] = [[OB_TJ, 0.0568], [OB_LJ, 0.2935], [OB_BELL, 0.5335]];

/** where a key's cup sits across the body: in front (φ 0) on the axis, round the side further out */
export const keyV = (k: ObKey): number => (k.phi === 0 ? 0 : (obR(k.x) + 0.0009) * Math.sin((k.phi * Math.PI) / 180));

// ---------------------------------------------------------------- the layout (cached per box)
export interface ObLayout {
  key: string;
  vertical: boolean;
  sc: number;
  x0: number;
  c: number;
  /** the lobes' greatest height either side of the body (px) */
  Hm: number;
  body: Path2D;
  /** the wood's lit upper edge */
  rimUp: Path2D;
  sheen: Path2D;
  spec: Path2D;
  bounce: Path2D;
  grain: Path2D;
  seams: Path2D;
  silver: Path2D;
  /** the bell's mouth (seen a little from its side) and its inner lip */
  mouth: Path2D;
  mouthIn: Path2D;
  /** the conical bore, wide and narrow (the wave's glow) */
  bore: Path2D;
  boreIn: Path2D;
  rods: Path2D;
  posts: Path2D;
  hinges: Path2D;
  touches: Path2D[];
  /** the reed: cork, staple, thread (and its winding), the cane (its bark, scrape, spine and tip) */
  cork: Path2D;
  corkDots: Path2D;
  staple: Path2D;
  thread: Path2D;
  winding: Path2D;
  cane: Path2D;
  bark: Path2D;
  scrape: Path2D;
  spine: Path2D;
  tip: Path2D;
}
const layouts = new Map<string, ObLayout>();
/** a repeatable scatter in 0..1 */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** dense samples along a span, with the profile's own corners */
const samples = (a: number, b: number, step: number, tab: [number, number][]): number[] => {
  const xs: number[] = [];
  for (let x = a; x < b; x += step) xs.push(x);
  xs.push(b);
  for (const [x] of tab) if (x > a && x < b) xs.push(x, x + 1e-7);
  return xs.sort((p, q) => p - q);
};
/** a band along the body between fractions f0 and f1 of its radius (−1 the upper edge, +1 the lower) */
function band(X: (x: number) => number, Y: (v: number) => number, a: number, b: number, f0: number, f1: number): Path2D {
  const p = new Path2D();
  const xs = samples(a, b, 0.002, OB_PROFILE);
  xs.forEach((x, i) => (i ? p.lineTo(X(x), Y(f0 * obR(x))) : p.moveTo(X(x), Y(f0 * obR(x)))));
  for (let i = xs.length - 1; i >= 0; i--) p.lineTo(X(xs[i]), Y(f1 * obR(xs[i])));
  p.closePath();
  return p;
}
/** a spatula from its root (x0, v0: narrow) to its round end (x1, v1), half-width w at the end */
export function spatula(p: Path2D, X: (x: number) => number, Y: (v: number) => number, t: ObTouch, sc: number): void {
  const n = 16;
  const dx = (t.x1 - t.x0) * sc;
  const dy = (t.v1 - t.v0) * sc;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const A: [number, number][] = [];
  const B: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    // narrow at the root, swelling to a round spoon at the end
    const swell = 0.32 + 0.68 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + 0.92 * f) * 0.5), 2);
    const round = f > 0.82 ? Math.sqrt(Math.max(0, 1 - ((f - 0.82) / 0.18) ** 2)) * 0.98 + 0.02 : 1;
    const hw = t.w * sc * swell * round;
    const cx = X(t.x0) + dx * f;
    const cy = Y(t.v0) + dy * f;
    A.push([cx + nx * hw, cy + ny * hw]);
    B.push([cx - nx * hw, cy - ny * hw]);
  }
  [...A, ...B.reverse()].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
}
/** a capsule from xa to xb at y, half-height r (a hinge tube) */
function capsule(p: Path2D, xa: number, xb: number, y: number, r: number): void {
  p.moveTo(xa, y - r);
  p.lineTo(xb, y - r);
  p.arc(xb, y, r, -Math.PI / 2, Math.PI / 2);
  p.lineTo(xa, y + r);
  p.arc(xa, y, r, Math.PI / 2, (3 * Math.PI) / 2);
  p.closePath();
}

/** the layout for a W×H box (the file player's `top` px kept clear at its top): lying (reed to the
 *  left) unless the box is clearly taller than wide, then standing (reed up) */
export function oboeLayout(W: number, H: number, top = 0): ObLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const vertical = H - top > W * 1.05;
  const Lw = vertical ? H - top : W;
  const Cw = vertical ? W : H;
  const sc = (0.9 * Lw) / OB_LEN;
  const x0 = (vertical ? top : 0) + (Lw - OB_LEN * sc) / 2;
  const Hm = Math.min(Cw * 0.14, 0.05 * sc);
  // lying on a stage: above the middle (the room's grip sits at its right edge, half way down), clear of
  // the player; in a cell, or standing, in the middle
  const stage = !vertical && H > 0.3 * W;
  const c = vertical ? Cw / 2 : stage ? Math.max(top + OB_REACH * sc + Hm * 0.6, H * 0.4) : top + (H - top) / 2;
  const X = (x: number) => x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  // ---- the wood
  const xs = samples(OB_TJ, OB_LEN, 0.0015, OB_PROFILE);
  const body = new Path2D();
  xs.forEach((x, i) => (i ? body.lineTo(X(x), Y(-obR(x))) : body.moveTo(X(x), Y(-obR(x)))));
  for (let i = xs.length - 1; i >= 0; i--) body.lineTo(X(xs[i]), Y(obR(xs[i])));
  body.closePath();
  const rimUp = new Path2D();
  xs.forEach((x, i) => (i ? rimUp.lineTo(X(x), Y(-obR(x) + 0.0003)) : rimUp.moveTo(X(x), Y(-obR(x) + 0.0003))));
  const sheen = band(X, Y, OB_TJ + 0.001, OB_LEN - 0.002, -0.78, -0.36);
  const spec = band(X, Y, OB_TJ + 0.002, OB_LEN - 0.003, -0.64, -0.52);
  const bounce = band(X, Y, OB_TJ + 0.001, OB_LEN - 0.002, 0.7, 0.9);
  // grenadilla's grain: fine streaks along the wood, each a little wavy, some broken
  const grain = new Path2D();
  for (let g = 0; g < 26; g++) {
    const f = -0.86 + (1.72 * (g + 0.5)) / 26 + (hash(g) - 0.5) * 0.04;
    const a0 = OB_TJ + 0.03 + hash(g + 7) * 0.05;
    let on = false;
    for (let x = a0; x < OB_LEN - 0.006; x += 0.003) {
      if (hash(g * 31 + Math.floor(x * 60)) < 0.18) {
        on = false;
        continue;
      }
      const v = (f + 0.025 * Math.sin(x * 70 + g * 1.7) + 0.012 * Math.sin(x * 210 + g)) * obR(x);
      if (on) grain.lineTo(X(x), Y(v));
      else grain.moveTo(X(x), Y(v));
      on = true;
    }
  }
  const seams = new Path2D();
  for (const x of OB_SEAMS) {
    const r = Math.min(obR(x - 1e-6), obR(x + 1e-6));
    seams.moveTo(X(x), Y(-r));
    seams.lineTo(X(x), Y(r));
  }
  const silver = new Path2D();
  for (const [a, b] of OB_SILVER) silver.addPath(band(X, Y, a, b, -1, 1));
  // the bell's mouth, a little from its side: the rim's face and the inner lip
  const rr = obR(OB_LEN);
  const mouth = new Path2D();
  mouth.ellipse(X(OB_LEN), Y(0), 0.0042 * sc, rr * sc, 0, 0, 2 * Math.PI);
  const mouthIn = new Path2D();
  mouthIn.ellipse(X(OB_LEN) + 0.0004 * sc, Y(0), 0.0034 * sc, obBore(OB_LEN) * sc, 0, 0, 2 * Math.PI);
  // ---- the bore (the wave's glow): through the staple and the cane, then the wood's cone
  const glowW = (x: number, k: number) => Math.min(obR(x) - 0.0007, obBore(x) * k + 0.0019 * k);
  const bore = new Path2D();
  const boreIn = new Path2D();
  const bx = samples(0, OB_LEN - 0.002, 0.003, OB_BORE);
  for (const [p, k] of [[bore, 1], [boreIn, 0.5]] as const) {
    bx.forEach((x, i) => (i ? p.lineTo(X(x), Y(-glowW(x, k))) : p.moveTo(X(x), Y(-glowW(x, k)))));
    for (let i = bx.length - 1; i >= 0; i--) p.lineTo(X(bx[i]), Y(glowW(bx[i], k)));
    p.closePath();
  }
  // ---- the mechanism: rods, pillars, hinge tubes, the touches
  const rods = new Path2D();
  for (const [v, a, b] of OB_RODS) {
    rods.moveTo(X(a), Y(v));
    rods.lineTo(X(b), Y(v));
  }
  // (the long rods' bridge over the bell's socket)
  rods.moveTo(X(0.522), Y(ROD_LONG));
  rods.quadraticCurveTo(X(0.529), Y(ROD_LONG - 0.0018), X(0.534), Y(ROD_BELL));
  const posts = new Path2D();
  for (const [v, x] of OB_POSTS) {
    posts.moveTo(X(x) + 0.0017 * sc, Y(v));
    posts.arc(X(x), Y(v), 0.0017 * sc, 0, 2 * Math.PI);
  }
  const hinges = new Path2D();
  for (const k of OB_KEYS) {
    const [a, b] = hingeOf(k);
    capsule(hinges, X(a), X(b), Y(k.rod), 0.0015 * sc);
  }
  const touches = OB_TOUCHES.map((t) => {
    const p = new Path2D();
    spatula(p, X, Y, t, sc);
    return p;
  });
  // ---- the reed
  const outline = (a: number, b: number, hw: (x: number) => number, step = 0.0005) => {
    const p = new Path2D();
    const s: number[] = [];
    for (let x = a; x < b; x += step) s.push(x);
    s.push(b);
    s.forEach((x, i) => (i ? p.lineTo(X(x), Y(-hw(x))) : p.moveTo(X(x), Y(-hw(x)))));
    for (let i = s.length - 1; i >= 0; i--) p.lineTo(X(s[i]), Y(hw(s[i])));
    p.closePath();
    return p;
  };
  const cork = outline(RD_CORK, OB_TJ + 0.0004, reedHW);
  const corkDots = new Path2D();
  for (let i = 0; i < 26; i++) {
    const x = RD_CORK + 0.0006 + hash(i * 3.3) * (OB_TJ - RD_CORK - 0.0008);
    const v = (hash(i * 7.1 + 2) * 2 - 1) * reedHW(x) * 0.85;
    const r = (0.00012 + hash(i + 50) * 0.00016) * sc;
    corkDots.moveTo(X(x) + r, Y(v));
    corkDots.arc(X(x), Y(v), r, 0, 2 * Math.PI);
  }
  const staple = outline(RD_THREAD[1] - 0.0005, RD_CORK + 0.0003, () => 0.0021);
  const thread = outline(RD_THREAD[0], RD_THREAD[1], (x) => reedHW(Math.max(x, RD_CANE)) + 0.00025 * Math.sin(Math.PI * Math.min(1, (x - RD_THREAD[0]) / 0.003)));
  const winding = new Path2D();
  for (let x = RD_THREAD[0] + 0.0005; x < RD_THREAD[1] - 0.0002; x += 0.00065) {
    const hw = reedHW(Math.max(x, RD_CANE));
    winding.moveTo(X(x), Y(-hw));
    winding.lineTo(X(x + 0.0007), Y(hw));
  }
  const cane = outline(0, RD_CANE, reedHW, 0.0003);
  const bark = outline(0.0165, RD_CANE, reedHW, 0.0004);
  // the scrape: the tip (thinnest, pale), the heart and the back with its two windows either side of the spine
  const scrape = outline(0, 0.0165, (x) => reedHW(x) * 0.9, 0.0003);
  const spine = new Path2D();
  spine.moveTo(X(0.0035), Y(0));
  spine.bezierCurveTo(X(0.007), Y(-0.0009), X(0.013), Y(-0.0011), X(0.0165), Y(-0.0012));
  spine.lineTo(X(0.0165), Y(0.0012));
  spine.bezierCurveTo(X(0.013), Y(0.0011), X(0.007), Y(0.0009), X(0.0035), Y(0));
  spine.closePath();
  const tip = outline(0, 0.0028, (x) => reedHW(x) * 0.93, 0.0002);
  const L: ObLayout = { key, vertical, sc, x0, c, Hm, body, rimUp, sheen, spec, bounce, grain, seams, silver, mouth, mouthIn, bore, boreIn, rods, posts, hinges, touches, cork, corkDots, staple, thread, winding, cane, bark, scrape, spine, tip };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}

// ---------------------------------------------------------------- the live state (both styles)
export interface ObLive {
  /** the fingering held (0: all lifted) */
  fingers: number;
  /** each key's spring: 1 its hole open, 0 shut */
  keyPos: number[];
  /** each touch's (OB_TOUCHES) and each finger key's press, 0..1, and the half-hole's roll (1 open) */
  touchPress: number[];
  keyPress: number[];
  half: number;
  blow: number;
  vib: number;
  /** the wave: its level (0..1 of the recent loudest), slow phase (−1..1), span and amplitude at x */
  lvl: number;
  ph: number;
  sounding: boolean;
  end: number;
  n: number;
  nodes: number[];
  ampAt: (x: number) => number;
  /** the reed's opening now (1 at rest, 0 shut), drawn slowed */
  open: number;
}
const CYC = 32;
const pressOf = (fingers: number, bits: number) => (fingers & bits ? 1 : 0);

/** the frame into the drawing's live state (the same for both styles: a change of style carries it) */
export function oboeLive(fr: VisualFrame | null, st: OboeState, now: number): ObLive {
  const focus = fr?.focus ?? null;
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  // ---- the fingering: the engine's note while it sounds and a moment after, then the fingers lift
  const nk = OB_KEYS.length;
  const nt = OB_TOUCHES.length;
  const ks = (st.keys ??= { pos: new Float32Array(nk).fill(-1), vel: new Float32Array(nk), press: new Float32Array(nk + nt), half: new Float32Array(2).fill(1), t: now, quiet: 10 });
  if (ks.pos[0] < 0) OB_KEYS.forEach((k, i) => (ks.pos[i] = k.open(0) ? 1 : 0));
  const dt = Math.min(0.1, Math.max(0, (now - ks.t) / 1000));
  ks.t = now;
  ks.quiet = blow > 0.015 ? 0 : ks.quiet + dt;
  const fingers = focus && ks.quiet < 0.8 ? oboeFingersFor(focus.midi) : 0;
  const keyPos = OB_KEYS.map((k, i) => spring01(ks.pos, ks.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62));
  // (the fingers' press: quick, no bounce)
  const ease = 1 - Math.exp(-dt / 0.035);
  const keyPress = OB_KEYS.map((k, i) => (ks.press[i] += (pressOf(fingers, k.style === 'cup' ? 0 : k.by) - ks.press[i]) * ease));
  const touchPress = OB_TOUCHES.map((t, i) => (ks.press[nk + i] += (pressOf(fingers, t.bit) - ks.press[nk + i]) * ease));
  ks.half[0] += ((halfOpen(fingers) ? 1 : 0) - ks.half[0]) * (1 - Math.exp(-dt / 0.05));
  const half = ks.half[0];
  // ---- the bore's standing wave
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  const f1 = focus?.f1 ?? 440;
  const ph = Math.cos(slowPhase(f1, now));
  const span = obWaveSpan(focus ? oboeFingersFor(focus.midi) : 0, f1);
  // the engine's wave runs reed (u 0) → open end (u 1); where its antinode is
  let um = 0.5;
  let best = -1;
  for (let i = 0; i < w.amp.length; i++) if (Math.abs(w.amp[i]) > best) {
    best = Math.abs(w.amp[i]);
    um = i / Math.max(1, w.amp.length - 1);
  }
  const bounds = [0, ...span.nodes, span.end];
  const ampAt = (x: number): number => {
    if (x < 0 || x > span.end || w.amp.length < 2) return 0;
    if (span.n === 1) return boreAt(w.amp, x / span.end) / scale;
    let j = 0;
    while (j < span.n - 1 && x > bounds[j + 1]) j++;
    const a = bounds[j];
    const b = bounds[j + 1];
    if (b - a < 1e-4) return 0;
    const f = (x - a) / (b - a);
    // the first half-wave as the engine's, from the reed to its node; the later ones node to node, each
    // the engine's lobe (its antinode in the middle), in turn the other way
    const u = j === 0 ? f : 1 - (1 - um) * (1 - Math.abs(2 * f - 1));
    return ((j % 2 ? -1 : 1) * boreAt(w.amp, u)) / scale;
  };
  // ---- the reed: its opening over a cycle, from the cycle's narrowest, played back on the wave's slow clock
  const rd = (st.reed ??= { cyc: new Float32Array(CYC).fill(1), last: null });
  const e = fr?.excite;
  const tr = e?.trace;
  if (e && tr && tr !== rd.last && focus && blow > 0.01) {
    rd.last = tr;
    const P = (e.rate || 48000) / f1;
    if (P >= 4 && tr.length >= 2 * P + 2) {
      let i0 = Math.floor(tr.length - 2 * P);
      let lo = Infinity;
      for (let i = i0; i < tr.length - P - 1; i++) if (tr[i] < lo) {
        lo = tr[i];
        i0 = i;
      }
      for (let k = 0; k < CYC; k++) {
        const q = i0 + (k * P) / CYC;
        const qi = Math.floor(q);
        const v = tr[qi] + (tr[Math.min(tr.length - 1, qi + 1)] - tr[qi]) * (q - qi);
        rd.cyc[k] += (Math.max(0, Math.min(1.5, v)) - rd.cyc[k]) * 0.35;
      }
    }
  } else if (!(blow > 0.01)) {
    // the breath gone: the blades spring back to their rest opening
    const k = 1 - Math.exp(-dt / 0.08);
    for (let i = 0; i < CYC; i++) rd.cyc[i] += (1 - rd.cyc[i]) * k;
  }
  const th = (((slowPhase(f1, now) / (2 * Math.PI)) % 1) + 1) % 1;
  const ci = th * CYC;
  const c0 = Math.floor(ci) % CYC;
  const open = rd.cyc[c0] + (rd.cyc[(c0 + 1) % CYC] - rd.cyc[c0]) * (ci - Math.floor(ci));
  const sounding = !!focus && lvl > 0.02;
  return { fingers, keyPos, touchPress, keyPress, half, blow, vib, lvl, ph, sounding, end: span.end, n: span.n, nodes: span.nodes, ampAt, open };
}

/** a point of the oboe's own frame (x along, v across, m) in the box's px */
export function obToBox(L: ObLayout, W: number, x: number, v: number): { x: number; y: number } {
  const lx = L.x0 + x * L.sc;
  const ly = L.c + v * L.sc;
  return L.vertical ? { x: W - ly, y: lx } : { x: lx, y: ly };
}
/** record where it was drawn (and the fingering it showed) and where its sound leaves */
export function obRecord(L: ObLayout, W: number, st: OboeState, fingers: number): void {
  const box = (xa: number, xb: number, va: number, vb: number): Box => {
    const a = obToBox(L, W, xa, va);
    const b = obToBox(L, W, xb, vb);
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  };
  st.drawn = { body: box(0, OB_LEN, -OB_REACH, OB_REACH), reed: obToBox(L, W, 0, 0), keys: box(0.09, 0.6, -OB_REACH, OB_REACH), vertical: L.vertical, fingers };
  st.src = obToBox(L, W, OB_LEN + 0.004, 0);
}

// ---------------------------------------------------------------- the classic drawing
const silver = (a: number) => rgba('230,232,236', a);
const SILVER_BODY = 'rgb(62,64,68)';
const WOOD = '#15100c';
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);
const D2R = Math.PI / 180;

/** The oboe from the front: the reed (its blades fluttering open and shut with the engine's reed, drawn
 *  slowed), the grenadilla body with its silver rings and keywork, the keys closing for the engine's note
 *  by the chart (each on a spring), and the bore's standing wave glowing inside the cone from the reed to
 *  the first open hole, its envelope either side. `top`: the file player's px over the box's top. */
export function drawOboe(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: OboeState, top = 0): void {
  const L = oboeLayout(W, H, top);
  const { sc, c, Hm } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const lv = oboeLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  ctx.save();
  if (L.vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- behind the oboe: the pressure's standing-wave envelope either side, pinched at the nodes
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    const M = 96;
    for (const sgn of [-1, 1]) {
      // (the reed is a pressure antinode: the envelope starts at its fullest, its end rounded off)
      const A0 = Math.min(1, Math.abs(lv.ampAt(0))) * hm;
      const b0 = Y(sgn * obLobeBase(0));
      ctx.beginPath();
      ctx.moveTo(X(0) - 0.5 * A0, b0);
      ctx.quadraticCurveTo(X(0) - 0.5 * A0, b0 + sgn * A0, X(0), b0 + sgn * A0);
      for (let i = 0; i <= M; i++) {
        const x = (end * i) / M;
        const A = Math.min(1, Math.abs(lv.ampAt(x)));
        ctx.lineTo(X(x), Y(sgn * obLobeBase(Math.min(OB_LEN, x))) + sgn * hm * A);
      }
      ctx.lineTo(X(end), Y(sgn * obLobeBase(Math.min(OB_LEN, end))));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.vermilion, 0.07 * lvl + 0.03);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.vermilion, 0.16 + 0.22 * lvl);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // ---- the reed: the cork in the reed well, the staple, the thread, the cane
  ctx.fillStyle = '#6e5038';
  ctx.fill(L.cork);
  const gk = ctx.createLinearGradient(0, Y(-0.0037), 0, Y(0.0037));
  gk.addColorStop(0, 'rgba(255,230,190,0.05)');
  gk.addColorStop(0.25, 'rgba(255,230,190,0.28)');
  gk.addColorStop(0.6, 'rgba(0,0,0,0)');
  gk.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = gk;
  ctx.fill(L.cork);
  ctx.fillStyle = 'rgba(40,26,16,0.55)';
  ctx.fill(L.corkDots);
  ctx.fillStyle = SILVER_BODY;
  ctx.fill(L.staple);
  ctx.fillStyle = metalGrad(ctx, Y, 0.0021);
  ctx.fill(L.staple);
  ctx.fillStyle = '#244a2e';
  ctx.fill(L.thread);
  const gt = ctx.createLinearGradient(0, Y(-0.0028), 0, Y(0.0028));
  gt.addColorStop(0, 'rgba(160,220,150,0.1)');
  gt.addColorStop(0.3, 'rgba(160,220,150,0.32)');
  gt.addColorStop(0.65, 'rgba(0,0,0,0.05)');
  gt.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = gt;
  ctx.fill(L.thread);
  ctx.strokeStyle = 'rgba(10,30,14,0.55)';
  ctx.lineWidth = Math.max(0.5, 0.00018 * sc);
  ctx.stroke(L.winding);
  // the cane: bark at the tie, the scrape pale to the translucent tip, the spine down its middle
  ctx.fillStyle = '#c8ad74';
  ctx.fill(L.cane);
  ctx.fillStyle = '#a77a34';
  ctx.fill(L.bark);
  const gb = ctx.createLinearGradient(0, Y(-0.003), 0, Y(0.003));
  gb.addColorStop(0, 'rgba(255,240,200,0.1)');
  gb.addColorStop(0.28, 'rgba(255,240,200,0.42)');
  gb.addColorStop(0.5, 'rgba(255,240,200,0.06)');
  gb.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = gb;
  ctx.fill(L.bark);
  ctx.fillStyle = 'rgba(236,222,180,0.55)';
  ctx.fill(L.scrape);
  ctx.fillStyle = 'rgba(176,146,90,0.55)';
  ctx.fill(L.spine);
  // (the tip, thinnest: the light through it, brighter as the blades part)
  ctx.fillStyle = `rgba(250,242,214,${(0.55 + 0.25 * Math.min(1, lv.open)).toFixed(3)})`;
  ctx.fill(L.tip);
  ctx.strokeStyle = 'rgba(60,42,18,0.7)';
  ctx.lineWidth = 0.8;
  ctx.stroke(L.cane);
  // ---- the wood: grenadilla, near black, polished, lit from above the player's left
  ctx.fillStyle = WOOD;
  ctx.fill(L.body);
  ctx.strokeStyle = 'rgba(110,84,62,0.16)';
  ctx.lineWidth = 0.7;
  ctx.stroke(L.grain);
  ctx.fillStyle = 'rgba(236,226,206,0.07)';
  ctx.fill(L.sheen);
  ctx.fillStyle = 'rgba(236,226,206,0.16)';
  ctx.fill(L.spec);
  ctx.fillStyle = 'rgba(236,226,206,0.04)';
  ctx.fill(L.bounce);
  // the silver rings
  ctx.fillStyle = SILVER_BODY;
  ctx.fill(L.silver);
  ctx.fillStyle = metalGrad(ctx, Y, 0.016);
  ctx.fill(L.silver);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke(L.seams);
  ctx.strokeStyle = rgba(INK.ivory, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke(L.body);
  ctx.strokeStyle = rgba(INK.ivory, 0.32);
  ctx.stroke(L.rimUp);
  // the bell's mouth: its rim's face, the inner lip, the dark of the bore
  ctx.fillStyle = '#1d1712';
  ctx.fill(L.mouth);
  ctx.strokeStyle = rgba(INK.ivory, 0.3);
  ctx.stroke(L.mouth);
  ctx.fillStyle = '#050403';
  ctx.fill(L.mouthIn);
  ctx.strokeStyle = rgba(INK.ivory, 0.14);
  ctx.stroke(L.mouthIn);
  // ---- the tone holes (dark in the wood: the rings' always, a pad's when it lifts)
  OB_KEYS.forEach((k, i) => {
    if (k.style === 'plate') return;
    const p = keyPos[i];
    if (k.style === 'cup' && p < 0.03) return;
    const cphi = Math.cos(k.phi * D2R);
    ctx.beginPath();
    ctx.ellipse(X(k.x), Y(keyV(k)), k.hole * sc, Math.max(0.4, k.hole * sc * cphi), 0, 0, 2 * Math.PI);
    ctx.fillStyle = k.style === 'ring' ? '#030202' : `rgba(3,2,2,${Math.min(1, p * 1.5).toFixed(3)})`;
    ctx.fill();
  });
  // ---- the standing wave inside the bore: compression warm, rarefaction cool, the nodes dark
  if (lv.sounding) {
    const ge = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const gw = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const A = lv.ampAt((end * i) / N);
      ge.addColorStop(i / N, rgba(INK.vermilion, 0.3 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
      gw.addColorStop(i / N, rgba(waveInk(A * ph), 0.46 * Math.min(1, Math.pow(Math.abs(A * ph), 1.15))));
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = ge;
    ctx.fill(L.bore);
    ctx.fillStyle = gw;
    ctx.fill(L.boreIn);
    ctx.restore();
  }
  // ---- the mechanism: rods (each a polished axle), hinge tubes
  ctx.strokeStyle = 'rgb(46,47,50)';
  ctx.lineWidth = Math.max(1, 0.0021 * sc);
  ctx.stroke(L.rods);
  ctx.strokeStyle = silver(0.5);
  ctx.lineWidth = Math.max(0.6, 0.0007 * sc);
  ctx.save();
  ctx.translate(0, -0.0004 * sc);
  ctx.stroke(L.rods);
  ctx.restore();
  ctx.fillStyle = '#24231f';
  ctx.fill(L.hinges);
  ctx.strokeStyle = silver(0.48);
  ctx.lineWidth = 1;
  ctx.stroke(L.hinges);
  // ---- the keys: each on its arm from its hinge, cups lifting and seating on springs, the rings and
  // L1's plate under the fingers
  for (const k of OB_KEYS) {
    const cy = Y(keyV(k));
    const ry = k.r * sc * Math.cos(k.phi * D2R);
    const rod = Y(k.rod);
    // (a long arm, to a rod across the body, is a slender lever)
    const long = Math.abs(k.rod - keyV(k)) > 0.012;
    obArm(ctx, X(k.x), cy + (Math.sign(rod - cy) || 1) * ry * 0.75, rod, k.r * sc * (long ? 0.2 : 0.42), (long ? 0.0009 : 0.0013) * sc);
  }
  OB_KEYS.forEach((k, i) => {
    const cphi = Math.cos(k.phi * D2R);
    const sphi = Math.sin(k.phi * D2R);
    const p = keyPos[i];
    // the pad's lift (2 mm open), seen from the front: outwards round the body
    const lift = (k.style === 'cup' ? p : 0) * 0.0021 * sc;
    const cx = X(k.x);
    const cy = Y(keyV(k)) + lift * sphi;
    const moved = k.closed ? p : 1 - p;
    if (k.style === 'ring') obRing(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], p);
    else if (k.style === 'plate') obPlate(ctx, cx, cy, k.r * sc, lv.keyPress[i], p, lv.half, sc);
    else obCup(ctx, cx, cy, k.r * sc, k.r * sc * cphi, p, moved, lift);
  });
  // the touches: the thumb's plate behind, its edge showing; the levers and spatulas
  OB_TOUCHES.forEach((t, i) => {
    const q = lv.touchPress[i];
    const path = L.touches[i];
    ctx.save();
    if (t.back) ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgb(56,58,62)';
    ctx.fill(path);
    const g = ctx.createLinearGradient(0, Y(Math.min(t.v0, t.v1) - 0.003), 0, Y(Math.max(t.v0, t.v1) + 0.003));
    g.addColorStop(0, silver(0.55));
    g.addColorStop(0.5, silver(0.22));
    g.addColorStop(1, silver(0.1));
    ctx.fillStyle = g;
    ctx.fill(path);
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.amber, 0.5 * q);
      ctx.fill(path);
    }
    ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.55 + 0.35 * q) : rgba(INK.ivory, 0.45);
    ctx.lineWidth = 1 + 0.4 * q;
    ctx.stroke(path);
    ctx.restore();
  });
  // the pillars, over the rods
  ctx.fillStyle = '#2a2825';
  ctx.fill(L.posts);
  ctx.strokeStyle = silver(0.6);
  ctx.lineWidth = 1;
  ctx.stroke(L.posts);
  // ---- the reed's tip, a little from its end: the two blades' edges and the opening between them
  // (exaggerated: at rest about a millimetre each side, shut once a cycle when the note is loud)
  obReedEye(ctx, X(0), Y(0), RD_TIP_HW * 0.94 * sc, lv.open * 0.0022 * sc, sc);
  // the breath into the reed: a faint stream from the lips, flowing in
  if (lv.blow > 0.02) {
    const a = Math.min(1, 0.3 + lv.blow) * (1 + 2.5 * lv.vib);
    ctx.save();
    ctx.setLineDash([0.003 * sc, 0.0025 * sc]);
    ctx.lineDashOffset = -((now / 1000) * 0.03 * sc);
    ctx.strokeStyle = rgba(INK.steel, 0.45 * a);
    ctx.lineWidth = 1;
    for (const j of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(X(-0.016), Y(j * 0.0042));
      ctx.quadraticCurveTo(X(-0.006), Y(j * 0.0022), X(-0.0012), Y(j * 0.0006));
      ctx.stroke();
    }
    ctx.restore();
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still)
  if (lv.sounding) {
    ctx.beginPath();
    const n = 150;
    for (let i = 0; i <= n; i++) {
      const x = (end * i) / n;
      const v = lv.ampAt(x) * ph * Math.min(0.0042, 0.6 * obR(Math.min(OB_LEN, x)));
      if (i) ctx.lineTo(X(x), Y(-v));
      else ctx.moveTo(X(x), Y(-v));
    }
    ctx.strokeStyle = rgba(INK.ivory, 0.75 * Math.min(1, 3 * lvl));
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
  obRecord(L, W, st, lv.fingers);
}

/** polished silver across a part of half-height h about the axis */
function metalGrad(ctx: CanvasRenderingContext2D, Y: (v: number) => number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, Y(-h), 0, Y(h));
  g.addColorStop(0, silver(0.2));
  g.addColorStop(0.2, silver(0.7));
  g.addColorStop(0.34, silver(0.36));
  g.addColorStop(0.64, silver(0.12));
  g.addColorStop(0.9, silver(0.26));
  g.addColorStop(1, silver(0.08));
  return g;
}
/** a key's arm: from its cup's edge (y0, half-width w0) narrowing to its hinge tube (y1, w1) */
function obArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number): void {
  const m = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w0, y0);
  ctx.bezierCurveTo(x - w0 * 0.5, m, x - w1, m, x - w1, y1);
  ctx.lineTo(x + w1, y1);
  ctx.bezierCurveTo(x + w1, m, x + w0 * 0.5, m, x + w0, y0);
  ctx.closePath();
  ctx.fillStyle = '#282623';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.ivory, 0.4);
  ctx.lineWidth = 0.9;
  ctx.stroke();
}
/** a covered key's cup from the front: a silver dome, lifted `p` (1 open), lit amber where a finger has
 *  moved it off its rest (`moved`), the pad's leather showing under its rim as it lifts */
function obCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: number, moved: number, lift: number): void {
  const s = 0.965 + 0.035 * p;
  rx *= s;
  ry *= s;
  if (p > 0.02) {
    // its shadow on the wood
    ctx.beginPath();
    ctx.ellipse(cx + lift * 0.2, cy + lift * 0.35, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(0,0,0,${(0.4 * p).toFixed(3)})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(0.5, ry), 0, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgb(48,50,54)';
  ctx.fill();
  // (polished silver: a bright crown towards the light, a dark band, the floor's bounce at its skirt)
  const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  g.addColorStop(0, silver(0.78));
  g.addColorStop(0.3, silver(0.42));
  g.addColorStop(0.62, silver(0.07));
  g.addColorStop(0.9, silver(0.26));
  g.addColorStop(1, silver(0.12));
  ctx.fillStyle = g;
  ctx.fill();
  if (moved > 0.01) {
    ctx.fillStyle = rgba(INK.amber, 0.14 * moved);
    ctx.fill();
  }
  ctx.strokeStyle = moved > 0.5 ? rgba(INK.amber, 0.45 + 0.35 * moved) : rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1 + 0.4 * moved;
  ctx.stroke();
  if (p > 0.05) {
    // the pad's leather under the raised rim
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.5, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = `rgba(214,190,150,${(0.45 * p).toFixed(3)})`;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.74, Math.max(0.4, ry * 0.74), 0, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.ivory, 0.16);
  ctx.lineWidth = 1;
  ctx.stroke();
  // the dome's highlight
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.22, cy - ry * 0.4, rx * 0.26, Math.max(0.3, ry * 0.12), 0, 0, 2 * Math.PI);
  ctx.fillStyle = silver(0.6);
  ctx.fill();
}
/** a ring key from the front: the silver ring round its tone hole; under the finger (`q`) the ring goes
 *  down and the fingertip covers the hole */
function obRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, p: number): void {
  const s = 0.965 + 0.035 * p;
  const ro = r * s;
  const ri = hole * 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.moveTo(cx + ri, cy);
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI, true);
  ctx.fillStyle = 'rgb(58,60,64)';
  ctx.fill('evenodd');
  const g = ctx.createLinearGradient(0, cy - ro, 0, cy + ro);
  g.addColorStop(0, silver(0.7));
  g.addColorStop(0.45, silver(0.28));
  g.addColorStop(0.55, silver(0.4));
  g.addColorStop(1, silver(0.1));
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.5 + 0.35 * q) : rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1 + 0.4 * q;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.ivory, 0.4);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  if (q > 0.01) {
    // the fingertip, over the ring and its hole
    ctx.beginPath();
    ctx.arc(cx, cy, ro * 0.92, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.amber, 0.16 * q);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, ri * 1.05, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.amber, 0.72 * q);
    ctx.fill();
  }
}
/** L1's plate from the front, its small half-hole near its upper end: raised (`p` 1) with the finger off;
 *  under the finger (`q`) the fingertip covers it, rolled down off the perforation when half-holing (`half`) */
function obPlate(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, q: number, p: number, half: number, sc: number): void {
  const s = 0.965 + 0.035 * p;
  const rr = r * s;
  if (p > 0.02) {
    ctx.beginPath();
    ctx.arc(cx + 0.3, cy + 0.6, rr * 1.03, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(0,0,0,${(0.4 * p).toFixed(3)})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgb(58,60,64)';
  ctx.fill();
  const g = ctx.createLinearGradient(0, cy - rr, 0, cy + rr);
  g.addColorStop(0, silver(0.66));
  g.addColorStop(0.45, silver(0.3));
  g.addColorStop(1, silver(0.1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.5 + 0.35 * q) : rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1 + 0.4 * q;
  ctx.stroke();
  // the perforation, towards the reed
  const hx = cx - 0.0029 * sc;
  ctx.beginPath();
  ctx.arc(hx, cy, Math.max(0.8, 0.0011 * sc), 0, 2 * Math.PI);
  ctx.fillStyle = '#040303';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.ivory, 0.45);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (q > 0.01) {
    // the fingertip: on the whole plate, or rolled down off the perforation
    const roll = Math.max(0, Math.min(1, half));
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.95, 0, 2 * Math.PI);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cx + roll * 0.0021 * sc, cy, rr * (0.95 - 0.3 * roll), rr * 0.9, 0, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.amber, 0.55 * q);
    ctx.fill();
    ctx.restore();
  }
}
/** the reed's tip seen a little from its end: the opening between the two blades as an eye, half-length
 *  `hl` across the reed, half-opening `t` (shut: the blades' edges meet in one line) */
function obReedEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, hl: number, t: number, sc: number): void {
  const o = Math.max(0, t);
  ctx.beginPath();
  ctx.moveTo(cx, cy - hl);
  ctx.bezierCurveTo(cx - o * 1.33, cy - hl * 0.45, cx - o * 1.33, cy + hl * 0.45, cx, cy + hl);
  ctx.bezierCurveTo(cx + o * 1.33, cy + hl * 0.45, cx + o * 1.33, cy - hl * 0.45, cx, cy - hl);
  ctx.closePath();
  ctx.fillStyle = '#080604';
  ctx.fill();
  ctx.strokeStyle = 'rgba(244,232,196,0.85)';
  ctx.lineWidth = Math.max(0.8, 0.00035 * sc);
  ctx.stroke();
}
