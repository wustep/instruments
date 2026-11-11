// The B♭ clarinet on the 2D stage (the classic look), and its plan shared with the vector display
// (vector/clarinet.ts). A Boehm-system clarinet (17 keys, 6 rings, as a Buffet R13) from the front, the
// side its tone holes face: lying with its mouthpiece to the left on a wide stage, standing mouthpiece up
// on a phone held upright and in a tall box (an Orchestra cell), drawn at its real sizes in metres from
// the reed's tip.
//
// The measures. The bore and every tone hole from a measured Buffet Crampon clarinet (Debut, Kergomard &
// Laloë 2005, "Analysis and optimisation of the tuning of the twelfths for a clarinet resonator", Applied
// Acoustics 66, Table 3; arXiv physics/0309051): 664 mm reed tip to bell rim; the mouthpiece's bore to
// 89 mm (Ø 14.8 there), the barrel's Ø 15.6, the upper and lower joints' Ø 14.5 cylinder to 492.5 mm,
// opening to Ø 22.2 at 598 mm and the bell's Ø 60 mouth; 24 holes at their distances from the reed's tip
// with their radii and chimneys (the register hole at 152.7 mm, Ø 2.8, 13 mm long; the thumb hole 238.9;
// L1 252.2, L2 284.3, L3 308.2; R1 364.8, R2 391.0, R3 413.1; the little fingers' pads 445.6, 472.9,
// 504.9, 543.7, Ø 10.8–12.2). The joints, the outer profile (the barrel's swell, the bell's flare to its
// Ø 69 rim) and which side each key sits on measured off Yamaha's front photograph of a YCL-CSGIII
// (Wikimedia Commons, File:Yamaha_Clarinet_YCL-CSGIII.tif, CC BY-SA 4.0), whose rings and pads fall
// within 4 mm of the Buffet's holes once scaled; the barrel 66 mm (the R13's); the mouthpiece 69 mm out of
// the barrel (its bore's 89 mm less its tenon), its tip 13 mm across with a 1.2 mm tip opening (a
// Vandoren B45's 119.5/100 mm).
//
// What moves. The keys close for the engine's note by the shared fingering chart (clarinet-fingering.ts),
// each on a spring; the rings' linkages as a Boehm clarinet's: the thumb ring and L1's shut the G vent
// between L1 and L2, the lower joint's rings (and the B/F♯ sliver) the B/F♯ pad above R1, the little
// fingers' F♯, F and E keys their pads in a chain down the joint. The thumb ring and the register key are
// on the back: drawn faintly through the wood, lit when the thumb is on them. The reed, behind the beak,
// shows at the tip: the opening between the reed's tip and the mouthpiece's tip rail, seen a little from
// its end, following the engine's own reed (its opening over the last cycles, played back slowed: shut
// once a cycle when the note is loud). The bore's standing wave (the engine's, with its sign) glows inside
// the cylinder from the reed (a pressure antinode) to where it leaves the tube past the first open hole (a
// node): one quarter-wave in the chalumeau, three on the same long tube for a clarion note (the register
// key's vent sits near the first node: the twelfth), five or seven in the altissimo. The engine plays each
// note on the tube whose fundamental it is (clarinet.ts); its quarter-wave is drawn as the first quarter,
// each later half-wave as its lobe, the sign alternating.
import type { VisualFrame } from '@piano-model/engine';
import { L1, L2, L3, LA, LCS, LE, LFS, LGS, R1, R2, R3, RAB, RB, RE, REG, RF, SEB, T, clarinetFingersFor, clarinetRegister } from './clarinet-fingering.ts';
import { AutoScale, INK, boreAt, breathStream, newBoreWave, rgba, slowPhase, spring01, trackBoreWave, type BoreWave } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface ClarinetState {
  /** where its sound leaves (the bell's mouth: the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** each key's spring (1 its hole open, 0 shut), the fingers' press (0..1) */
  keys?: { pos: Float32Array; vel: Float32Array; press: Float32Array; t: number; quiet: number };
  /** the reed's opening over one cycle (from the cycle's narrowest), from the engine's trace */
  reed?: { cyc: Float32Array; last: Float32Array | null };
  /** where it was last drawn (box px): the instrument, reed tip to bell rim and its keys' reach; the
   *  reed's tip; the keywork; the mouthpiece (tests, and the review's close-ups) */
  drawn?: { body: Box; reed: { x: number; y: number }; keys: Box; mouth: Box; vertical: boolean; fingers: number };
}
export const newClarinetState = (): ClarinetState => ({});

// ---------------------------------------------------------------- the plan, metres from the reed's tip
/** the clarinet's length, reed tip to bell rim (m) */
export const CL_LEN = 0.664;
/** the box (m) the clarinet is drawn in at one px per metre (an ensemble sizes it from the strings' scale):
 *  its length over the share of the box it fills, and across it the bell, the keys and the wave */
export const clarinetBox = (): { w: number; h: number } => ({ w: CL_LEN / 0.9, h: 0.17 });
/** the barrel's top (the mouthpiece's end out of it), the upper joint's top, the lower joint's socket,
 *  the bell's socket */
export const CL_MP = 0.069;
export const CL_BAR = 0.135;
export const CL_UJ = 0.327;
export const CL_LJ = 0.561;
/** a tone hole's end correction (m): the wave leaves the bore this far past an open hole's centre (the
 *  measured Buffet's chalumeau notes, each first open hole against c/4f: 7–25 mm, mean 18) */
export const CL_HOLE_CORR = 0.018;
/** the register hole's (a narrow tube 13 mm long, Ø 2.8: a long correction; B♭4 sounds through it) */
const CL_REG_CORR = 0.054;
/** with every hole shut the bell's flare turns the wave back well before the rim: the low E's
 *  quarter-wave (c/4f at D3, concert) ends here */
export const CL_BELL_END = 0.586;
const C_AIR = 343;

/** the ligature: its sleeve, and the two screws' places */
const LIG: [number, number] = [0.031, 0.061];
const LIG_SCREWS = [0.0365, 0.0555];
/** the reed (behind the beak): its tip's half-width, its length, the end of its vamp (the cut) */
export const REED_HW = 0.0065;
const REED_LEN = 0.067;
const REED_VAMP = 0.034;
const MP_PROFILE: [number, number][] = [
  [0.003, 0.0072], [0.0046, 0.0079], [0.0076, 0.0089], [0.0122, 0.0099], [0.018, 0.0106], [0.024, 0.011], [0.031, 0.0114], [0.04, 0.0119], [0.05, 0.0124], [0.06, 0.0129], [CL_MP, 0.0131],
];
/** the wood's outer radius against x: the barrel (its rings, its swell), the upper joint's slight taper,
 *  the lower joint's socket ring, the bell's ring, flare and rim */
const CL_PROFILE: [number, number][] = [
  [CL_MP, 0.0136], [0.0755, 0.0136], [0.0757, 0.0134], [0.085, 0.0137], [0.095, 0.0142], [0.105, 0.0148], [0.113, 0.0152], [0.12, 0.0152], [0.1265, 0.0149], [0.1285, 0.0147],
  [0.1285, 0.015], [CL_BAR, 0.015], [CL_BAR, 0.0143], [0.2, 0.014], [0.3, 0.0136], [CL_UJ, 0.0136],
  [CL_UJ, 0.0149], [0.334, 0.0149], [0.334, 0.0144], [0.36, 0.0144], [0.45, 0.0146], [CL_LJ, 0.015],
  [CL_LJ, 0.0158], [0.5685, 0.0158], [0.5687, 0.015], [0.5824, 0.0162], [0.5956, 0.0175], [0.6087, 0.019], [0.6219, 0.0205], [0.6352, 0.0227], [0.6417, 0.0246],
  [0.6483, 0.0271], [0.6528, 0.0292], [0.6571, 0.0327], [0.6593, 0.0343], [0.6615, 0.0345], [0.663, 0.0343], [CL_LEN, 0.0336],
];
/** the bore's radius: the mouthpiece's chamber from the tip, the barrel's wider bore, the joints' Ø 14.5
 *  cylinder, the lower joint's flare and the bell's to its Ø 60 mouth (the Buffet's, Table 3) */
const CL_BORE: [number, number][] = [
  [0, 0.0026], [0.012, 0.0045], [0.03, 0.0062], [0.06, 0.0072], [0.089, 0.0074], [0.1175, 0.0073], [0.1175, 0.0078], [0.1525, 0.0078], [0.1525, 0.00725], [0.4925, 0.00725],
  [0.526, 0.00755], [0.565, 0.00845], [0.5782, 0.0092], [0.598, 0.0111], [0.62, 0.015], [0.635, 0.0185], [0.648, 0.0235], [0.657, 0.0285], [CL_LEN, 0.03],
];
function lerpTab(t: [number, number][], x: number): number {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) {
    const [x0, y0] = t[i - 1];
    const [x1, y1] = t[i];
    return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;
  }
  return t[t.length - 1][1];
}
/** the beak's rounded end seen from the front (the tip rail's curve, the reed's tip cut to it): a
 *  superellipse `MP_TIP` long, as wide as the photograph's 3 mm from the tip */
export const MP_TIP = 0.003;
const TIP_HW = 0.0072;
const TIP_N = 2.6;
/** the tip's outline at t (−π/2 … π/2 across it): along (m from the tip) and across (m) */
export const tipAt = (t: number, hw = TIP_HW): [number, number] => [MP_TIP * (1 - Math.pow(Math.abs(Math.cos(t)), 2 / TIP_N)), hw * Math.sign(t) * Math.pow(Math.abs(Math.sin(t)), 2 / TIP_N)];
/** the mouthpiece's half-width from the front (its beak): the tip's rounded end, then widening to the
 *  barrel (the photograph's outline) */
export const mpHW = (x: number): number => {
  if (x <= 0) return 0;
  if (x < MP_TIP) return TIP_HW * Math.pow(Math.max(0, 1 - Math.pow(1 - x / MP_TIP, TIP_N)), 1 / TIP_N);
  return lerpTab(MP_PROFILE, x);
};
/** the outer radius at x: the mouthpiece's, then the wood's */
export const clR = (x: number): number => (x < CL_MP ? mpHW(x) : lerpTab(CL_PROFILE, x));
export const clBore = (x: number): number => lerpTab(CL_BORE, x);
/** where the wave's envelope stands off the body: the wood's mean radius (the mouthpiece and the barrel's
 *  swell smoothed over), the bell's flare */
export const clLobeBase = (x: number): number => Math.max(0.0128 + 0.0024 * Math.min(1, Math.max(0, x) / 0.2), x > 0.585 ? clR(x) : 0);

export type ClStyle = 'ring' | 'plain' | 'cup';
export interface ClKey {
  id: string;
  /** the tone hole's centre along the clarinet (m from the reed's tip) */
  x: number;
  /** round the body from the front (deg), towards the player's right; 180 the back */
  phi: number;
  /** the cup's or ring's radius, and the tone hole's */
  r: number;
  hole: number;
  style: ClStyle;
  /** closed-standing: its pad shut at rest, lifted by its touch */
  closed?: boolean;
  /** a vent (the register key, the side trill keys), not a hole that ends the tube */
  vent?: boolean;
  /** on the back (the thumb's): drawn faintly through the wood */
  back?: boolean;
  /** the hole open for a fingering (the chart's bits) */
  open: (f: number) => boolean;
  /** the fingers whose press moves it */
  by: number;
  /** across (m) the rod its arm runs to (0: no key: L3's plain hole, the back's) */
  rod: number;
}
/** the rods' places across the body (m: − the player's left, + the right): the upper joint's (the A and
 *  G♯ keys' hinge on the front-left, the rings' and side keys' axle on the right), the lower joint's */
const ROD_UL = -0.0098;
const ROD_UR = 0.0152;
const ROD_LL = -0.011;
const ROD_LR = 0.0158;
const ROD_LONG = -0.0158;
const SIDE = 82;
/** The keys and holes, top to bottom (the Buffet's holes; the sides as the photograph's) */
export const CL_KEYS: ClKey[] = [
  { id: 'reg', x: 0.1527, phi: 180, r: 0.0036, hole: 0.0014, style: 'cup', closed: true, vent: true, back: true, open: (f) => !!(f & REG), by: REG, rod: 0 },
  // (the side keys on the player's right, seen edge-on: three trill keys the chart never opens, the lowest
  // the E♭/B♭ key)
  { id: 'tr1', x: 0.1934, phi: SIDE, r: 0.0042, hole: 0.0028, style: 'cup', closed: true, vent: true, open: () => false, by: 0, rod: ROD_UR },
  { id: 'a', x: 0.2029, phi: 0, r: 0.005, hole: 0.0027, style: 'cup', closed: true, open: (f) => !!(f & LA), by: LA, rod: ROD_UL },
  { id: 'gs', x: 0.2132, phi: 14, r: 0.0049, hole: 0.00255, style: 'cup', closed: true, open: (f) => !!(f & LGS), by: LGS, rod: ROD_UL },
  { id: 'tr2', x: 0.2304, phi: SIDE, r: 0.004, hole: 0.0024, style: 'cup', closed: true, vent: true, open: () => false, by: 0, rod: ROD_UR },
  { id: 'thumb', x: 0.2389, phi: 180, r: 0.0068, hole: 0.0039, style: 'ring', back: true, open: (f) => !(f & T), by: T, rod: 0 },
  { id: 'tr3', x: 0.2413, phi: SIDE, r: 0.004, hole: 0.00235, style: 'cup', closed: true, vent: true, open: () => false, by: 0, rod: ROD_UR },
  { id: 'l1', x: 0.2522, phi: 0, r: 0.0071, hole: 0.00245, style: 'ring', open: (f) => !(f & L1), by: L1, rod: ROD_UR },
  // the G vent (the F♯ pad over it): open for the open G, shut by the thumb's ring or L1's
  { id: 'gvent', x: 0.2705, phi: 0, r: 0.0049, hole: 0.0023, style: 'cup', open: (f) => !(f & (T | L1)), by: T | L1, rod: ROD_UR },
  { id: 'l2', x: 0.2843, phi: 0, r: 0.0071, hole: 0.0033, style: 'ring', open: (f) => !(f & L2), by: L2, rod: ROD_UR },
  { id: 'seb', x: 0.2893, phi: SIDE, r: 0.0044, hole: 0.00285, style: 'cup', closed: true, open: (f) => !!(f & SEB), by: SEB, rod: ROD_UR },
  { id: 'l3', x: 0.3082, phi: 0, r: 0.006, hole: 0.00395, style: 'plain', open: (f) => !(f & L3), by: L3, rod: 0 },
  { id: 'cs', x: 0.3188, phi: -74, r: 0.0046, hole: 0.0024, style: 'cup', closed: true, open: (f) => !!(f & LCS), by: LCS, rod: ROD_UL },
  // the B/F♯ pad above R1: open for C4 (its hole), shut by any of the lower rings or the B/F♯ sliver
  { id: 'bfs', x: 0.3489, phi: 0, r: 0.0052, hole: 0.00355, style: 'cup', open: (f) => !(f & (R1 | R2 | R3 | RB)), by: R1 | R2 | R3 | RB, rod: ROD_LR },
  { id: 'r1', x: 0.3648, phi: 0, r: 0.0072, hole: 0.00405, style: 'ring', open: (f) => !(f & R1), by: R1, rod: ROD_LR },
  { id: 'r2', x: 0.391, phi: 0, r: 0.0072, hole: 0.00385, style: 'ring', open: (f) => !(f & R2), by: R2, rod: ROD_LR },
  { id: 'r3', x: 0.4131, phi: 0, r: 0.0077, hole: 0.00485, style: 'ring', open: (f) => !(f & R3), by: R3, rod: ROD_LR },
  { id: 'ab', x: 0.4456, phi: -62, r: 0.0074, hole: 0.0054, style: 'cup', closed: true, open: (f) => !!(f & RAB), by: RAB, rod: ROD_LL },
  // the little fingers' chain: the F♯/C♯ key shuts the first pad, the F/C key the first two, the E/B the three
  { id: 'fs', x: 0.4729, phi: 56, r: 0.0081, hole: 0.0061, style: 'cup', open: (f) => !(f & (LFS | RF | LE | RE)), by: LFS | RF | LE | RE, rod: ROD_LR },
  { id: 'f', x: 0.5049, phi: -58, r: 0.0079, hole: 0.0056, style: 'cup', open: (f) => !(f & (RF | LE | RE)), by: RF | LE | RE, rod: ROD_LL },
  { id: 'e', x: 0.5437, phi: 56, r: 0.008, hole: 0.0058, style: 'cup', open: (f) => !(f & (LE | RE)), by: LE | RE, rod: ROD_LR },
];
/** which of the keys stand open for a note (the tests hold them to the chart) */
export const clarinetKeysOpen = (m: number): { id: string; x: number; open: boolean }[] => {
  const f = clarinetFingersFor(m);
  return CL_KEYS.map((k) => ({ id: k.id, x: k.x, open: k.open(f) }));
};
/** the holes that end the tube (in order down the bore), and the chain of open-standing ones */
const TONE = CL_KEYS.filter((k) => !k.vent);
const CHAIN = TONE.filter((k) => !k.closed);
/** The hole the sounding tube ends at, for a fingering in a register: in the chalumeau and the clarion the
 *  first open hole (the register key a vent in the clarion; B♭4 sounds through it); in the altissimo the
 *  first open hole with the next hole of the chain below it open too (an open hole with shut ones below is
 *  a vent: the cross-fingering's). null: the bell. */
export function clFirstOpen(f: number, register: 1 | 2 | 3 = 1): ClKey | null {
  if (register === 1 && f & REG) return CL_KEYS[0];
  for (const k of TONE) {
    if (!k.open(f)) continue;
    if (register < 3) return k;
    const next = CHAIN.find((c) => c.x > k.x + 1e-6);
    if (!next || next.open(f)) return k;
  }
  return null;
}
/** The standing wave's span along the bore for a fingering and a sounding frequency: it leaves the tube an
 *  end correction past the tube's open hole (or at the bell's flare), `end` m from the reed's tip, in `n`
 *  quarter-waves (odd: the reed a pressure antinode, the open end a node; one in the chalumeau, three in
 *  the clarion, five or seven in the altissimo), its nodes inside the tube at `nodes` */
export function clWaveSpan(f: number, f1: number, register: 1 | 2 | 3 = 1): { end: number; n: number; nodes: number[] } {
  const k = clFirstOpen(f, register);
  const end = k ? k.x + (k.id === 'reg' ? CL_REG_CORR : CL_HOLE_CORR) : CL_BELL_END;
  const q = end / (C_AIR / (4 * f1));
  const n = Math.max(1, 2 * Math.round((q - 1) / 2) + 1);
  const nodes: number[] = [];
  for (let j = 0; j < (n - 1) / 2; j++) nodes.push(((2 * j + 1) * end) / n);
  return { end, n, nodes };
}

/** a touch the fingers press: a spatula, from its root (on its rod) out to its round end */
export interface ClTouch {
  id: string;
  bit: number;
  x0: number;
  v0: number;
  x1: number;
  v1: number;
  w: number;
  /** behind the body (the register key's lever: drawn faintly through the wood) */
  back?: boolean;
  /** a key the chart never uses (the trill keys) */
  fixed?: boolean;
}
export const CL_TOUCHES: ClTouch[] = [
  // the register key's lever on the back, down to the thumb
  { id: 'reg', bit: REG, x0: 0.156, v0: 0.0012, x1: 0.226, v1: 0.0042, w: 0.0026, back: true },
  // the left index: the A key's spatula down the front from its cup, the G♯ key's over the left edge
  { id: 'a', bit: LA, x0: 0.2075, v0: -0.0008, x1: 0.2315, v1: -0.0034, w: 0.0034 },
  { id: 'gs', bit: LGS, x0: 0.2215, v0: -0.0102, x1: 0.2515, v1: -0.0178, w: 0.0033 },
  // the right index's side keys: three trills and, lowest, the E♭/B♭ key
  { id: 'tr1', bit: 0, x0: 0.3035, v0: 0.0164, x1: 0.3135, v1: 0.0288, w: 0.0023, fixed: true },
  { id: 'tr2', bit: 0, x0: 0.3085, v0: 0.0164, x1: 0.3235, v1: 0.0288, w: 0.0023, fixed: true },
  { id: 'tr3', bit: 0, x0: 0.3135, v0: 0.0164, x1: 0.3325, v1: 0.024, w: 0.0023, fixed: true },
  { id: 'seb', bit: SEB, x0: 0.3185, v0: 0.0164, x1: 0.3415, v1: 0.024, w: 0.0024 },
  // the left little finger: the C♯/G♯ key's teardrop just past L3 (its lever across the front from the
  // right rod), then by the lower joint's head the F♯/C♯ and E/B spatulas (long rods down to their pads)
  { id: 'lcs', bit: LCS, x0: 0.3215, v0: 0.0146, x1: 0.3185, v1: -0.0126, w: 0.0034 },
  { id: 'lfs', bit: LFS, x0: 0.3255, v0: -0.0146, x1: 0.3425, v1: -0.0284, w: 0.0047 },
  { id: 'le', bit: LE, x0: 0.3365, v0: -0.0154, x1: 0.3575, v1: -0.0306, w: 0.0049 },
  // the B/F♯ sliver between R2 and R3, across the front from the right rod
  { id: 'rb', bit: RB, x0: 0.4035, v0: 0.0146, x1: 0.4012, v1: -0.0036, w: 0.0015 },
  // the right little finger at the lower joint's foot: A♭/E♭, F/C, E/B
  { id: 'rab', bit: RAB, x0: 0.4185, v0: 0.0148, x1: 0.4315, v1: 0.0232, w: 0.0036 },
  { id: 'rf', bit: RF, x0: 0.4255, v0: 0.0154, x1: 0.4435, v1: 0.0292, w: 0.0047 },
  { id: 're', bit: RE, x0: 0.4365, v0: 0.0158, x1: 0.4575, v1: 0.0312, w: 0.0049 },
];
/** the keys', touches' and bell's farthest reach across the body (m) */
export const CL_REACH = 0.0366;
/** the rods (across at v, along from a to b) */
export const CL_RODS: [number, number, number][] = [
  [ROD_UL, 0.1975, 0.2205],
  [ROD_UL, 0.3125, 0.3245],
  [ROD_UR, 0.1885, 0.322],
  [ROD_LR, 0.3405, 0.552],
  [ROD_LL, 0.3405, 0.551],
];
const CL_POSTS: [number, number][] = [
  [ROD_UL, 0.1975], [ROD_UL, 0.2205], [ROD_UL, 0.3125], [ROD_UL, 0.3245],
  [ROD_UR, 0.1885], [ROD_UR, 0.2245], [ROD_UR, 0.2605], [ROD_UR, 0.2975], [ROD_UR, 0.322],
  [ROD_LR, 0.3405], [ROD_LR, 0.3775], [ROD_LR, 0.4235], [ROD_LR, 0.4605], [ROD_LR, 0.5105], [ROD_LR, 0.552],
  [ROD_LL, 0.3405], [ROD_LL, 0.4155], [ROD_LL, 0.4835], [ROD_LL, 0.551], [ROD_LONG, 0.5095],
];
/** each key's hinge tube along its rod (m) */
const hingeOf = (k: ClKey): [number, number] => {
  const h = Math.max(0.006, k.r * 1.5);
  return [k.x - h / 2, k.x + h / 2];
};
/** the edges where rings and joints meet, drawn as hairlines across the wood */
const CL_SEAMS = [CL_MP, 0.0755, 0.1285, CL_BAR, CL_UJ, 0.334, CL_LJ, 0.5685];
/** the silver rings: the barrel's two, the lower joint's socket, the bell's socket */
const CL_SILVER: [number, number][] = [[CL_MP, 0.0755], [0.1285, CL_BAR], [CL_UJ, 0.334], [CL_LJ, 0.5685]];

/** where a key's cup sits across the body: in front (φ 0) on the axis, round the side further out */
export const keyV = (k: ClKey): number => (k.phi === 0 || k.back ? 0 : (clR(k.x) + 0.0009) * Math.sin((k.phi * Math.PI) / 180));

// ---------------------------------------------------------------- the layout (cached per box)
export interface ClLayout {
  key: string;
  vertical: boolean;
  /** the file player's px over the box's top */
  top: number;
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
  /** the bore (the wave's glow): wide and narrow */
  bore: Path2D;
  boreIn: Path2D;
  rods: Path2D;
  posts: Path2D;
  hinges: Path2D;
  touches: Path2D[];
  /** the mouthpiece (its beak's outline, the beak's lit ridge), the ligature's sleeve (its ribs) and its
   *  two screws (their tabs, their knurled heads), the reed behind (its outline and vamp) */
  mp: Path2D;
  mpRidge: Path2D;
  lig: Path2D;
  ligRib: Path2D;
  screwTabs: Path2D;
  screwHeads: Path2D;
  screwKnurl: Path2D;
  reed: Path2D;
  vamp: Path2D;
}
const layouts = new Map<string, ClLayout>();
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
/** a band along the wood between fractions f0 and f1 of its radius (−1 the upper edge, +1 the lower) */
function band(X: (x: number) => number, Y: (v: number) => number, a: number, b: number, f0: number, f1: number): Path2D {
  const p = new Path2D();
  const xs = samples(a, b, 0.002, CL_PROFILE);
  xs.forEach((x, i) => (i ? p.lineTo(X(x), Y(f0 * clR(x))) : p.moveTo(X(x), Y(f0 * clR(x)))));
  for (let i = xs.length - 1; i >= 0; i--) p.lineTo(X(xs[i]), Y(f1 * clR(xs[i])));
  p.closePath();
  return p;
}
/** a spatula from its root (x0, v0: narrow) to its round end (x1, v1), half-width w at the end */
export function spatula(p: Path2D, X: (x: number) => number, Y: (v: number) => number, t: ClTouch, sc: number): void {
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
    const swell = 0.32 + 0.68 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + 0.92 * f) * 0.5), 2);
    const round = f > 0.8 ? Math.sqrt(Math.max(0, 1 - ((f - 0.8) / 0.2) ** 2)) * 0.98 + 0.02 : 1;
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

/** px kept above the reed's tip on a stage the clarinet stands on (the breath's handle, under the
 *  player) and below its bell */
const STAND_ABOVE = 22;
const STAND_BELOW = 8;
/** the layout for a W×H box (the file player's `top` px kept clear at its top): lying (mouthpiece to the
 *  left) on a wide box, standing (mouthpiece up, its keys to the audience) on a portrait or near-square
 *  one (a phone held upright) and in a tall Orchestra cell. An Orchestra cell (clarinetBox at the group's
 *  px/m) is filled to 90 % of its length; on a phone's stage it stands as tall as fits between the player
 *  and the keys. */
export function clarinetLayout(W: number, H: number, top = 0): ClLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const vertical = H - top > W * 0.75;
  const Lw = vertical ? H - top : W;
  const Cw = vertical ? W : H;
  // (a stage, not a cell: wide enough across for the lobes and handles)
  const standing = vertical && W > 0.35 * (H - top);
  const len = standing ? Math.min(0.94 * Lw, Lw - STAND_ABOVE - STAND_BELOW) : 0.9 * Lw;
  const sc = len / CL_LEN;
  const x0 = (vertical ? top : 0) + (standing ? STAND_ABOVE + (Lw - STAND_ABOVE - STAND_BELOW - len) / 2 : (Lw - len) / 2);
  const Hm = Math.min(Cw * 0.14, 0.05 * sc);
  // lying on a stage: above the middle (the room's grip sits at its right edge, half way down), clear of
  // the player; in a cell, or standing, in the middle
  const stage = !vertical && H > 0.3 * W;
  const c = vertical ? Cw / 2 : stage ? Math.max(top + CL_REACH * sc + Hm * 0.6, H * 0.4) : top + (H - top) / 2;
  const X = (x: number) => x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  // ---- the wood
  const xs = samples(CL_MP, CL_LEN, 0.0015, CL_PROFILE);
  const body = new Path2D();
  xs.forEach((x, i) => (i ? body.lineTo(X(x), Y(-clR(x))) : body.moveTo(X(x), Y(-clR(x)))));
  for (let i = xs.length - 1; i >= 0; i--) body.lineTo(X(xs[i]), Y(clR(xs[i])));
  body.closePath();
  const rimUp = new Path2D();
  xs.forEach((x, i) => (i ? rimUp.lineTo(X(x), Y(-clR(x) + 0.0003)) : rimUp.moveTo(X(x), Y(-clR(x) + 0.0003))));
  const sheen = band(X, Y, CL_MP + 0.001, CL_LEN - 0.002, -0.8, -0.38);
  const spec = band(X, Y, CL_MP + 0.002, CL_LEN - 0.003, -0.66, -0.54);
  const bounce = band(X, Y, CL_MP + 0.001, CL_LEN - 0.002, 0.7, 0.9);
  // grenadilla's grain: fine streaks along the wood, each a little wavy, some broken
  const grain = new Path2D();
  for (let g = 0; g < 28; g++) {
    const f = -0.86 + (1.72 * (g + 0.5)) / 28 + (hash(g) - 0.5) * 0.04;
    const a0 = CL_MP + 0.008 + hash(g + 7) * 0.05;
    let on = false;
    for (let x = a0; x < CL_LEN - 0.006; x += 0.003) {
      if (hash(g * 31 + Math.floor(x * 60)) < 0.18 || CL_SILVER.some(([a, b]) => x > a - 0.002 && x < b + 0.002)) {
        on = false;
        continue;
      }
      const v = (f + 0.025 * Math.sin(x * 70 + g * 1.7) + 0.012 * Math.sin(x * 210 + g)) * clR(x);
      if (on) grain.lineTo(X(x), Y(v));
      else grain.moveTo(X(x), Y(v));
      on = true;
    }
  }
  const seams = new Path2D();
  for (const x of CL_SEAMS) {
    const r = Math.min(clR(x - 1e-6), clR(x + 1e-6));
    seams.moveTo(X(x), Y(-r));
    seams.lineTo(X(x), Y(r));
  }
  const silver = new Path2D();
  for (const [a, b] of CL_SILVER) silver.addPath(band(X, Y, a, b, -1, 1));
  // the bell's mouth, a little from its side: the rim's face and the inner lip
  const rr = clR(CL_LEN);
  const mouth = new Path2D();
  mouth.ellipse(X(CL_LEN), Y(0), 0.0052 * sc, rr * sc, 0, 0, 2 * Math.PI);
  const mouthIn = new Path2D();
  mouthIn.ellipse(X(CL_LEN) + 0.0005 * sc, Y(0), 0.0043 * sc, clBore(CL_LEN) * sc, 0, 0, 2 * Math.PI);
  // ---- the bore (the wave's glow)
  const glowW = (x: number, k: number) => Math.min(clR(x) - 0.0012, clBore(x) * k + 0.0016 * k);
  const bore = new Path2D();
  const boreIn = new Path2D();
  const bx = samples(0.0004, CL_LEN - 0.002, 0.003, CL_BORE);
  for (const [p, k] of [[bore, 1], [boreIn, 0.5]] as const) {
    bx.forEach((x, i) => (i ? p.lineTo(X(x), Y(-glowW(x, k))) : p.moveTo(X(x), Y(-glowW(x, k)))));
    for (let i = bx.length - 1; i >= 0; i--) p.lineTo(X(bx[i]), Y(glowW(bx[i], k)));
    p.closePath();
  }
  // ---- the mechanism: rods, pillars, hinge tubes, the touches
  const rods = new Path2D();
  for (const [v, a, b] of CL_RODS) {
    rods.moveTo(X(a), Y(v));
    rods.lineTo(X(b), Y(v));
  }
  // (the left little finger's long rod: from its touches down the left of the lower joint to the F pad)
  rods.moveTo(X(0.3445), Y(ROD_LONG));
  rods.bezierCurveTo(X(0.42), Y(ROD_LONG - 0.0012), X(0.48), Y(ROD_LONG), X(0.5095), Y(ROD_LONG));
  const posts = new Path2D();
  for (const [v, x] of CL_POSTS) {
    posts.moveTo(X(x) + 0.0018 * sc, Y(v));
    posts.arc(X(x), Y(v), 0.0018 * sc, 0, 2 * Math.PI);
  }
  const hinges = new Path2D();
  for (const k of CL_KEYS) {
    if (!k.rod) continue;
    const [a, b] = hingeOf(k);
    capsule(hinges, X(a), X(b), Y(k.rod), 0.0015 * sc);
  }
  const touches = CL_TOUCHES.map((t) => {
    const p = new Path2D();
    spatula(p, X, Y, t, sc);
    return p;
  });
  // ---- the mouthpiece: its beak from the front, tapering to the tip's rounded rail
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
  const mp = outline(0, CL_MP + 0.0003, mpHW, 0.0003);
  // the beak's ridge: the long slope towards the tip catches the light down its upper side
  const mpRidge = new Path2D();
  mpRidge.moveTo(X(0.0028), Y(-0.0034));
  mpRidge.bezierCurveTo(X(0.012), Y(-0.0052), X(0.022), Y(-0.0062), X(LIG[0]), Y(-0.0066));
  mpRidge.lineTo(X(LIG[0]), Y(-0.0022));
  mpRidge.bezierCurveTo(X(0.022), Y(-0.0022), X(0.012), Y(-0.0016), X(0.0028), Y(-0.0012));
  mpRidge.closePath();
  // the ligature: a sleeve round the mouthpiece (its bands' ribs), the screws' tabs and knurled heads on
  // the player's right
  const ligHW = (x: number) => mpHW(x) + 0.0007;
  const lig = outline(LIG[0], LIG[1], ligHW, 0.0008);
  const ligRib = new Path2D();
  for (const x of [LIG[0] + 0.0012, LIG_SCREWS[0], LIG_SCREWS[1], LIG[1] - 0.0012]) {
    ligRib.moveTo(X(x), Y(-ligHW(x)));
    ligRib.lineTo(X(x), Y(ligHW(x)));
  }
  const screwTabs = new Path2D();
  const screwHeads = new Path2D();
  const screwKnurl = new Path2D();
  for (const x of LIG_SCREWS) {
    const v0 = ligHW(x) - 0.0004;
    screwTabs.rect(X(x - 0.0026), Y(v0), 0.0052 * sc, 0.0036 * sc);
    screwTabs.rect(X(x - 0.0011), Y(v0 + 0.0034), 0.0022 * sc, 0.0018 * sc);
    screwHeads.moveTo(X(x - 0.0034), Y(v0 + 0.0052));
    screwHeads.lineTo(X(x + 0.0034), Y(v0 + 0.0052));
    screwHeads.lineTo(X(x + 0.0034), Y(v0 + 0.0084));
    screwHeads.quadraticCurveTo(X(x + 0.0034), Y(v0 + 0.0092), X(x + 0.0026), Y(v0 + 0.0092));
    screwHeads.lineTo(X(x - 0.0026), Y(v0 + 0.0092));
    screwHeads.quadraticCurveTo(X(x - 0.0034), Y(v0 + 0.0092), X(x - 0.0034), Y(v0 + 0.0084));
    screwHeads.closePath();
    for (let k = -2; k <= 2; k++) {
      screwKnurl.moveTo(X(x + k * 0.0012), Y(v0 + 0.0056));
      screwKnurl.lineTo(X(x + k * 0.0012), Y(v0 + 0.0089));
    }
  }
  // the reed behind the beak: its outline (the tip's corners rounded) and the end of its vamp
  const reedHW = (x: number) => (x < MP_TIP ? (mpHW(x) * REED_HW) / TIP_HW : REED_HW - 0.0004 * Math.min(1, x / REED_LEN));
  const reed = outline(0, REED_LEN, reedHW, 0.0003);
  const vamp = new Path2D();
  vamp.moveTo(X(0.0016), Y(-REED_HW * 0.82));
  vamp.bezierCurveTo(X(0.016), Y(-REED_HW * 0.7), X(0.028), Y(-REED_HW * 0.32), X(REED_VAMP), Y(0));
  vamp.bezierCurveTo(X(0.028), Y(REED_HW * 0.32), X(0.016), Y(REED_HW * 0.7), X(0.0016), Y(REED_HW * 0.82));
  const L: ClLayout = { key, vertical, top, sc, x0, c, Hm, body, rimUp, sheen, spec, bounce, grain, seams, silver, mouth, mouthIn, bore, boreIn, rods, posts, hinges, touches, mp, mpRidge, lig, ligRib, screwTabs, screwHeads, screwKnurl, reed, vamp };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}

// ---------------------------------------------------------------- the live state (both styles)
export interface ClLive {
  /** the fingering held (0: all lifted) */
  fingers: number;
  /** each key's spring: 1 its hole open, 0 shut */
  keyPos: number[];
  /** each touch's (CL_TOUCHES) and each finger key's press, 0..1 */
  touchPress: number[];
  keyPress: number[];
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
export function clarinetLive(fr: VisualFrame | null, st: ClarinetState, now: number): ClLive {
  const focus = fr?.focus ?? null;
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  // ---- the fingering: the engine's note while it sounds and a moment after, then the fingers lift
  const nk = CL_KEYS.length;
  const nt = CL_TOUCHES.length;
  const ks = (st.keys ??= { pos: new Float32Array(nk).fill(-1), vel: new Float32Array(nk), press: new Float32Array(nk + nt), t: now, quiet: 10 });
  if (ks.pos[0] < 0) CL_KEYS.forEach((k, i) => (ks.pos[i] = k.open(0) ? 1 : 0));
  const dt = Math.min(0.1, Math.max(0, (now - ks.t) / 1000));
  ks.t = now;
  ks.quiet = blow > 0.015 ? 0 : ks.quiet + dt;
  const fingers = focus && ks.quiet < 0.8 ? clarinetFingersFor(focus.midi) : 0;
  const keyPos = CL_KEYS.map((k, i) => spring01(ks.pos, ks.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62));
  // (the fingers' press: quick, no bounce; a ring or a plain hole under its own finger)
  const ease = 1 - Math.exp(-dt / 0.035);
  const keyPress = CL_KEYS.map((k, i) => (ks.press[i] += (pressOf(fingers, k.style === 'cup' ? 0 : k.by) - ks.press[i]) * ease));
  const touchPress = CL_TOUCHES.map((t, i) => (ks.press[nk + i] += (pressOf(fingers, t.bit) - ks.press[nk + i]) * ease));
  // ---- the bore's standing wave
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  const f1 = focus?.f1 ?? 440;
  const ph = Math.cos(slowPhase(f1, now));
  const span = focus ? clWaveSpan(clarinetFingersFor(focus.midi), f1, clarinetRegister(focus.midi)) : { end: CL_BELL_END, n: 1, nodes: [] };
  const bounds = [0, ...span.nodes, span.end];
  const ampAt = (x: number): number => {
    if (x < 0 || x > span.end || w.amp.length < 2) return 0;
    if (span.n === 1) return boreAt(w.amp, x / span.end) / scale;
    let j = 0;
    while (j < bounds.length - 2 && x > bounds[j + 1]) j++;
    const a = bounds[j];
    const b = bounds[j + 1];
    if (b - a < 1e-4) return 0;
    const f = (x - a) / (b - a);
    // the first quarter-wave as the engine's, from the reed's antinode to its node; each later half-wave
    // node to node, the engine's quarter mirrored about the antinode in its middle, in turn the other way
    const u = j === 0 ? f : Math.abs(1 - 2 * f);
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
    // the breath gone: the reed springs back to its rest opening
    const k = 1 - Math.exp(-dt / 0.08);
    for (let i = 0; i < CYC; i++) rd.cyc[i] += (1 - rd.cyc[i]) * k;
  }
  const th = (((slowPhase(f1, now) / (2 * Math.PI)) % 1) + 1) % 1;
  const ci = th * CYC;
  const c0 = Math.floor(ci) % CYC;
  const open = rd.cyc[c0] + (rd.cyc[(c0 + 1) % CYC] - rd.cyc[c0]) * (ci - Math.floor(ci));
  const sounding = !!focus && lvl > 0.02;
  return { fingers, keyPos, touchPress, keyPress, blow, vib, lvl, ph, sounding, end: span.end, n: span.n, nodes: span.nodes, ampAt, open };
}

/** a point of the clarinet's own frame (x along, v across, m) in the box's px */
export function clToBox(L: ClLayout, W: number, x: number, v: number): { x: number; y: number } {
  const lx = L.x0 + x * L.sc;
  const ly = L.c + v * L.sc;
  return L.vertical ? { x: W - ly, y: lx } : { x: lx, y: ly };
}
/** record where it was drawn (and the fingering it showed) and where its sound leaves */
export function clRecord(L: ClLayout, W: number, st: ClarinetState, fingers: number): void {
  const box = (xa: number, xb: number, va: number, vb: number): Box => {
    const a = clToBox(L, W, xa, va);
    const b = clToBox(L, W, xb, vb);
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  };
  st.drawn = { body: box(0, CL_LEN, -CL_REACH, CL_REACH), reed: clToBox(L, W, 0, 0), keys: box(0.145, 0.565, -0.031, 0.031), mouth: box(-0.006, 0.082, -0.022, 0.022), vertical: L.vertical, fingers };
  st.src = clToBox(L, W, CL_LEN + 0.004, 0);
}

// ---------------------------------------------------------------- the classic drawing
const silver = (a: number) => rgba('230,232,236', a);
const SILVER_BODY = 'rgb(62,64,68)';
const WOOD = '#14100c';
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);
const D2R = Math.PI / 180;

/** The clarinet from the front: the mouthpiece's beak with its ligature and the reed's tip opening and
 *  shutting with the engine's reed (drawn slowed), the grenadilla joints with their silver rings and
 *  keywork, the keys closing for the engine's note by the chart (each on a spring), the thumb's ring and
 *  register key faint through the wood, and the bore's standing wave glowing inside the cylinder from the
 *  reed to where it leaves the tube, its envelope either side. `top`: the file player's px over the box's
 *  top. */
export function drawClarinet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: ClarinetState, top = 0): void {
  const L = clarinetLayout(W, H, top);
  const { sc, c, Hm } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const lv = clarinetLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  ctx.save();
  if (L.vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- behind the clarinet: the pressure's standing-wave envelope either side, pinched at the nodes
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    const M = 110;
    for (const sgn of [-1, 1]) {
      // (the reed is a pressure antinode: the envelope starts at its fullest, its end rounded off)
      const A0 = Math.min(1, Math.abs(lv.ampAt(0))) * hm;
      const b0 = Y(sgn * clLobeBase(0));
      ctx.beginPath();
      ctx.moveTo(X(0) - 0.5 * A0, b0);
      ctx.quadraticCurveTo(X(0) - 0.5 * A0, b0 + sgn * A0, X(0), b0 + sgn * A0);
      for (let i = 0; i <= M; i++) {
        const x = (end * i) / M;
        const A = Math.min(1, Math.abs(lv.ampAt(x)));
        ctx.lineTo(X(x), Y(sgn * clLobeBase(Math.min(CL_LEN, x))) + sgn * hm * A);
      }
      ctx.lineTo(X(end), Y(sgn * clLobeBase(Math.min(CL_LEN, end))));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.vermilion, 0.07 * lvl + 0.03);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.vermilion, 0.16 + 0.22 * lvl);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // ---- the mouthpiece: black ebonite, its beak's ridge lit (its ligature goes on over the bore's glow)
  ctx.fillStyle = '#0b0b0d';
  ctx.fill(L.mp);
  const gm = ctx.createLinearGradient(0, Y(-0.013), 0, Y(0.013));
  gm.addColorStop(0, 'rgba(225,228,236,0.06)');
  gm.addColorStop(0.18, 'rgba(225,228,236,0.22)');
  gm.addColorStop(0.42, 'rgba(225,228,236,0.05)');
  gm.addColorStop(0.85, 'rgba(225,228,236,0.03)');
  gm.addColorStop(1, 'rgba(225,228,236,0.1)');
  ctx.fillStyle = gm;
  ctx.fill(L.mp);
  ctx.fillStyle = 'rgba(225,228,236,0.14)';
  ctx.fill(L.mpRidge);
  ctx.strokeStyle = rgba(INK.ivory, 0.26);
  ctx.lineWidth = 1;
  ctx.stroke(L.mp);
  // ---- the wood: grenadilla, near black, polished, lit from above the player's left
  ctx.fillStyle = WOOD;
  ctx.fill(L.body);
  ctx.strokeStyle = 'rgba(110,84,62,0.16)';
  ctx.lineWidth = 0.7;
  ctx.stroke(L.grain);
  ctx.fillStyle = 'rgba(236,226,206,0.07)';
  ctx.fill(L.sheen);
  ctx.fillStyle = 'rgba(236,226,206,0.15)';
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
  ctx.fillStyle = '#1c1612';
  ctx.fill(L.mouth);
  ctx.strokeStyle = rgba(INK.ivory, 0.3);
  ctx.stroke(L.mouth);
  ctx.fillStyle = '#050403';
  ctx.fill(L.mouthIn);
  ctx.strokeStyle = rgba(INK.ivory, 0.14);
  ctx.stroke(L.mouthIn);
  // ---- the tone holes in the wood: L3's raised chimney, the rings' holes, a pad's hole as it lifts
  CL_KEYS.forEach((k, i) => {
    if (k.back) return;
    const p = keyPos[i];
    const cphi = Math.cos(k.phi * D2R);
    const cx = X(k.x);
    const cy = Y(keyV(k));
    if (k.style === 'plain') {
      ctx.beginPath();
      ctx.arc(cx, cy, k.r * sc, 0, 2 * Math.PI);
      ctx.fillStyle = '#0a0806';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,120,96,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - 0.00035 * sc, k.r * sc * 0.92, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.strokeStyle = 'rgba(236,226,206,0.2)';
      ctx.stroke();
    }
    if (k.style === 'cup' && p < 0.03) return;
    ctx.beginPath();
    ctx.ellipse(cx, cy, k.hole * sc, Math.max(0.4, k.hole * sc * Math.abs(cphi)), 0, 0, 2 * Math.PI);
    ctx.fillStyle = k.style === 'cup' ? `rgba(3,2,2,${Math.min(1, p * 1.5).toFixed(3)})` : '#020101';
    ctx.fill();
  });
  // ---- the standing wave inside the bore: compression warm, rarefaction cool, the nodes dark
  if (lv.sounding) {
    const ge = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const gw = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const N = 56;
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
  // ---- the ligature over the mouthpiece (metal: the glow stays under it): the screws, then the sleeve
  ctx.fillStyle = SILVER_BODY;
  ctx.fill(L.screwTabs);
  ctx.fill(L.screwHeads);
  ctx.fillStyle = metalGrad(ctx, Y, 0.012);
  ctx.fill(L.screwTabs);
  const gs = ctx.createLinearGradient(0, Y(0.012), 0, Y(0.022));
  gs.addColorStop(0, silver(0.6));
  gs.addColorStop(0.5, silver(0.25));
  gs.addColorStop(1, silver(0.1));
  ctx.fillStyle = gs;
  ctx.fill(L.screwHeads);
  ctx.strokeStyle = 'rgba(20,20,22,0.55)';
  ctx.lineWidth = Math.max(0.5, 0.0003 * sc);
  ctx.stroke(L.screwKnurl);
  ctx.strokeStyle = silver(0.45);
  ctx.lineWidth = 0.8;
  ctx.stroke(L.screwHeads);
  ctx.fillStyle = SILVER_BODY;
  ctx.fill(L.lig);
  ctx.fillStyle = metalGrad(ctx, Y, 0.0125);
  ctx.fill(L.lig);
  ctx.fillStyle = metalGrad(ctx, Y, 0.0125);
  ctx.fill(L.lig);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(0.6, 0.0004 * sc);
  ctx.stroke(L.ligRib);
  ctx.strokeStyle = silver(0.5);
  ctx.lineWidth = 0.9;
  ctx.stroke(L.lig);
  // ---- through the wood: the thumb's ring and the register key on the back (faint; lit under the thumb)
  CL_KEYS.forEach((k, i) => {
    if (!k.back) return;
    // (the thumb on its ring; the register key's pad lifted by its lever)
    const q = k.style === 'ring' ? lv.keyPress[i] : keyPos[i];
    ghostKey(ctx, X(k.x), Y(0), k.r * sc, k.style === 'ring' ? k.hole * sc * 1.3 : 0, q, sc);
  });
  CL_TOUCHES.forEach((t, i) => {
    if (!t.back) return;
    const q = lv.touchPress[i];
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.amber, 0.16 * q);
      ctx.fill(L.touches[i]);
    }
    ctx.save();
    ctx.setLineDash([0.0016 * sc, 0.0012 * sc]);
    ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.35 + 0.35 * q) : rgba(INK.ivory, 0.2);
    ctx.lineWidth = 1;
    ctx.stroke(L.touches[i]);
    ctx.restore();
  });
  // ---- the mechanism: rods (each a polished axle), hinge tubes
  ctx.strokeStyle = 'rgb(46,47,50)';
  ctx.lineWidth = Math.max(1, 0.002 * sc);
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
  // ---- the keys: each on its arm from its hinge, cups lifting and seating on springs, the rings under
  // the fingers
  for (const k of CL_KEYS) {
    if (!k.rod || k.back) continue;
    const cy = Y(keyV(k));
    const ry = k.r * sc * Math.abs(Math.cos(k.phi * D2R));
    const rod = Y(k.rod);
    // (a long arm, to a rod across the body, is a slender lever)
    const long = Math.abs(k.rod - keyV(k)) > 0.012;
    if (Math.abs(rod - cy) > ry) clArm(ctx, X(k.x), cy + (Math.sign(rod - cy) || 1) * ry * 0.75, rod, k.r * sc * (long ? 0.18 : 0.36), (long ? 0.0009 : 0.0013) * sc);
  }
  CL_KEYS.forEach((k, i) => {
    if (k.back) return;
    const cphi = Math.cos(k.phi * D2R);
    const sphi = Math.sin(k.phi * D2R);
    const p = keyPos[i];
    // the pad's lift (2.5 mm open), seen from the front: outwards round the body
    const lift = (k.style === 'cup' ? p : 0) * 0.0025 * sc;
    const cx = X(k.x);
    const cy = Y(keyV(k)) + lift * sphi;
    const moved = k.closed ? p : 1 - p;
    if (k.style === 'ring') clRing(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], p);
    else if (k.style === 'plain') clPlain(ctx, cx, cy, k.hole * sc, lv.keyPress[i]);
    else clCup(ctx, cx, cy, k.r * sc, Math.max(0.6, k.r * sc * Math.abs(cphi)), p, moved, lift);
  });
  // the touches: the levers and spatulas, lit amber under a finger
  CL_TOUCHES.forEach((t, i) => {
    if (t.back) return;
    const q = lv.touchPress[i];
    const path = L.touches[i];
    ctx.fillStyle = 'rgb(56,58,62)';
    ctx.fill(path);
    const g = ctx.createLinearGradient(0, Y(Math.min(t.v0, t.v1) - 0.003), 0, Y(Math.max(t.v0, t.v1) + 0.003));
    g.addColorStop(0, silver(t.fixed ? 0.42 : 0.55));
    g.addColorStop(0.5, silver(0.22));
    g.addColorStop(1, silver(0.1));
    ctx.fillStyle = g;
    ctx.fill(path);
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.amber, 0.5 * q);
      ctx.fill(path);
    }
    ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.55 + 0.35 * q) : rgba(INK.ivory, t.fixed ? 0.32 : 0.45);
    ctx.lineWidth = 1 + 0.4 * q;
    ctx.stroke(path);
  });
  // the pillars, over the rods
  ctx.fillStyle = '#2a2825';
  ctx.fill(L.posts);
  ctx.strokeStyle = silver(0.6);
  ctx.lineWidth = 1;
  ctx.stroke(L.posts);
  // ---- the reed behind the beak (its outline and vamp, faint through the ebonite), and at the tip the
  // opening between its tip and the tip rail, seen a little from its end (drawn twice its size: 1.2 mm at
  // rest, shut once a cycle when the note is loud)
  ctx.save();
  ctx.setLineDash([0.0018 * sc, 0.0013 * sc]);
  ctx.strokeStyle = 'rgba(226,196,130,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke(L.reed);
  ctx.strokeStyle = 'rgba(226,196,130,0.16)';
  ctx.stroke(L.vamp);
  ctx.restore();
  clTipEye(ctx, X, Y, lv.open * 0.0024, sc);
  // the breath into the mouthpiece: a faint stream from the lips, flowing in
  if (lv.blow > 0.02) {
    const a = Math.min(1, 0.3 + lv.blow) * (1 + 2.5 * lv.vib);
    breathStream(ctx, (b, w) => [X(-b), Y(w)], sc, [[0.017, 0.0046], [0.007, 0.0026], [0.0016, 0.0008]], 0.45 * a, now);
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still)
  if (lv.sounding) {
    ctx.beginPath();
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const x = (end * i) / n;
      const v = lv.ampAt(x) * ph * Math.min(0.0045, 0.6 * clBore(Math.min(CL_LEN, x)) + 0.0012);
      if (i) ctx.lineTo(X(x), Y(-v));
      else ctx.moveTo(X(x), Y(-v));
    }
    ctx.strokeStyle = rgba(INK.ivory, 0.75 * Math.min(1, 3 * lvl));
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
  clRecord(L, W, st, lv.fingers);
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
function clArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number): void {
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
/** a covered key's cup from the front: a silver dome, lifted `p` (1 open), lit amber where a finger or a
 *  linkage has moved it off its rest (`moved`), the pad's leather showing under its rim as it lifts */
function clCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: number, moved: number, lift: number): void {
  const s = 0.965 + 0.035 * p;
  rx *= s;
  ry *= s;
  if (p > 0.02) {
    ctx.beginPath();
    ctx.ellipse(cx + lift * 0.2, cy + lift * 0.35, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(0,0,0,${(0.4 * p).toFixed(3)})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(0.5, ry), 0, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgb(48,50,54)';
  ctx.fill();
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
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.5, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = `rgba(214,190,150,${(0.45 * p).toFixed(3)})`;
    ctx.stroke();
  }
  if (ry > 2.5) {
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
}
/** a ring key from the front: a thin silver ring round its tone hole's raised chimney; under the finger
 *  (`q`) the ring goes down and the fingertip covers the hole */
function clRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, p: number): void {
  const s = 0.965 + 0.035 * p;
  const ro = r * s;
  const ri = r * 0.74;
  // the chimney's top inside the ring, dark, the hole deeper
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.fillStyle = '#0c0907';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, hole, 0, 2 * Math.PI);
  ctx.fillStyle = '#010101';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.moveTo(cx + ri, cy);
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI, true);
  ctx.fillStyle = 'rgb(58,60,64)';
  ctx.fill('evenodd');
  const g = ctx.createLinearGradient(0, cy - ro, 0, cy + ro);
  g.addColorStop(0, silver(0.75));
  g.addColorStop(0.42, silver(0.3));
  g.addColorStop(0.58, silver(0.42));
  g.addColorStop(1, silver(0.12));
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.5 + 0.35 * q) : rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1 + 0.4 * q;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.ivory, 0.32);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (q > 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, ro * 0.95, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.amber, 0.16 * q);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, ri * 1.02, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.amber, 0.72 * q);
    ctx.fill();
  }
}
/** L3's plain hole under its finger: the fingertip over the chimney */
function clPlain(ctx: CanvasRenderingContext2D, cx: number, cy: number, hole: number, q: number): void {
  if (q <= 0.01) return;
  ctx.beginPath();
  ctx.arc(cx, cy, hole * 1.35, 0, 2 * Math.PI);
  ctx.fillStyle = rgba(INK.amber, 0.72 * q);
  ctx.fill();
  ctx.strokeStyle = rgba(INK.amber, 0.5 + 0.35 * q);
  ctx.lineWidth = 1 + 0.4 * q;
  ctx.stroke();
}
/** a key on the back, seen through the wood: its outline dashed and faint, filled amber under the thumb
 *  (`q`); a ring's hole inside it */
function ghostKey(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, sc: number): void {
  ctx.save();
  ctx.setLineDash([0.0016 * sc, 0.0012 * sc]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  if (q > 0.01) {
    ctx.fillStyle = rgba(INK.amber, 0.2 * q);
    ctx.fill();
  }
  ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.4 + 0.35 * q) : rgba(INK.ivory, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();
  if (hole > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, hole, 0, 2 * Math.PI);
    ctx.strokeStyle = rgba(INK.ivory, 0.14);
    ctx.stroke();
  }
  ctx.restore();
}
/** The tip opening between the reed's tip and the tip rail, a thin crescent round the beak's rounded end
 *  (`o` m at its middle, closing at the side rails; shut: the reed's tip on the rail), as two paths in the
 *  box's px: the crescent, and the reed's tip beyond it (shared with the vector look) */
export function tipEyePaths(X: (x: number) => number, Y: (v: number) => number, o: number): { gap: Path2D; reed: Path2D; rail: Path2D } {
  const n = 28;
  const gap = new Path2D();
  const reed = new Path2D();
  const rail = new Path2D();
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / n;
    const [a, v] = tipAt(t);
    const [ra, rv] = tipAt(t, TIP_HW * 0.93);
    const w = Math.pow(Math.cos(t), 0.7);
    out.push([X(ra - Math.max(0, o) * w - 0.00015 * w), Y(rv)]);
    if (i) rail.lineTo(X(a), Y(v));
    else rail.moveTo(X(a), Y(v));
    if (i) gap.lineTo(X(a), Y(v));
    else gap.moveTo(X(a), Y(v));
  }
  for (let i = n; i >= 0; i--) gap.lineTo(out[i][0], out[i][1]);
  gap.closePath();
  out.forEach(([x, y], i) => (i ? reed.lineTo(x, y) : reed.moveTo(x, y)));
  return { gap, reed, rail };
}
function clTipEye(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (v: number) => number, o: number, sc: number): void {
  const { gap, reed, rail } = tipEyePaths(X, Y, o);
  ctx.fillStyle = '#050404';
  ctx.fill(gap);
  ctx.strokeStyle = 'rgba(236,212,160,0.9)';
  ctx.lineWidth = Math.max(0.9, 0.0004 * sc);
  ctx.stroke(reed);
  ctx.strokeStyle = 'rgba(210,214,224,0.45)';
  ctx.lineWidth = Math.max(0.7, 0.00025 * sc);
  ctx.stroke(rail);
}
