// The bassoon on the 2D stage (the classic look), and its plan shared with the vector display
// (vector/bassoon.ts). A Heckel-system bassoon from the front (the audience's side, its five finger holes
// facing out): standing bell up on a phone held upright and in a tall box (an Orchestra cell), lying with
// its bell to the right on a wide stage (its boot to the left, the bocal and reed rising from the middle),
// drawn at its real sizes in metres.
//
// The measures. 1.34 m tall, its bore 2.54 m (Wikipedia, "Bassoon": "the overall height … 1.34 m", "the
// total sounding length is 2.54 m"), a cone 4 mm across at the reed and 40 mm at the bell (Fletcher &
// Rossing 1998, The Physics of Musical Instruments §15.6; the engine's bore, core/bassoon.ts). The joints,
// their outlines and every visible key's place measured off Gregory Maxwell's front-and-back photograph
// of a Fox (Heckel-system) bassoon standing (Wikimedia Commons, File:FoxBassoon.png, GFDL 1.2; 0.316 mm
// per pixel at 1.34 m): the boot 0.383 m to its silver ring (0.424 m with it), 63–75 mm across, its metal
// cap 55 mm; the wing joint from the boot to its silver cap at 0.871–0.908 m, 29 mm across with its wing
// (the thick ridge the left hand's holes are drilled through) 57 mm across from 0.43 to 0.77 m; the long
// joint 47 mm across to its silver ring at 0.998–1.048 m; the bell 0.29 m, its swell (53 mm) and waist,
// its pale lip at the top; L1 at 0.642 m, L2 0.599, the L3 ring 0.563, R1 0.352, R2's ring 0.305, the
// right hand's two big pads at 0.079 and 0.146 m, the side pads on the long joint at 0.584, 0.854 and
// 0.985 m. The reed 55 mm (Wikipedia: "around 5.5 cm"; its blades 27 mm to the first wire), 14.5 mm
// across its tip, 20 mm of it over the bocal's tip. The bocal 0.30 m along its curve (the bore's 2.54 m
// less the joints' bores: 0.08 m rising from the wing, a 10 mm hook, the long arm to the reed), drawn in
// profile, as photographs show it, its whisper key's nipple 12 mm above the wing's cap.
// The bore's path: the reed and the bocal, down the wing joint and the boot's narrow bore, round the
// U-tube under the boot's cap (its bores 36 mm apart), up the boot's wide bore, the long joint and the
// bell: 2.53 m from the reed's tip to the bell's rim.
// The tone holes. Each one's place along the bore is where it ends the tube: with the cone's missing apex
// (the 4 → 40 mm taper carried on to its point, 0.28 m behind the bocal's tip, and the reed's volume:
// 0.40 m, so that the whole tube plays B♭1, c/2f = 2.94 m, past the bell's rim) and an end correction of
// 30 mm at a finger hole (15 mm at the low keys' wide holes), every first-register note's first open hole
// falls within 3 % of its c/2f (apps/web/test/bassoon2d.test.ts). Their outer openings are the
// photograph's: the wing's and the boot's finger holes are drilled steeply through the wood (their
// chimneys are drawn), so a hole's finger and its place in the bore differ by up to 6 cm, as on the real
// instrument; L3 and R3 close pads lower down.
//
// What moves. The keys close for the engine's note by the shared fingering chart (bassoon-fingering.ts),
// each on a spring: the finger holes under the fingertips (L1 rolled half off for the half-hole), the
// rings and plates, the pads they and the little fingers' keys work; the thumbs' keys on the back (the
// left thumb's flick keys, C♯ key and whisper key on the wing, its four low keys on the long joint, the
// right thumb's four on the boot) drawn faintly through the wood, lit when pressed, and their pads; the
// whisper key's pad seats on the bocal's nipple. The reed's opening (its tip seen a little from its end,
// drawn at twice its 1 mm) follows the engine's own reed, played back slowed: shut once a cycle when the
// note is loud. The bore's standing wave (the engine's, with its sign) glows along the folded bore from
// the reed to an end correction past the first open hole: one half-wave in the first octave, two on the
// same tube in the second (the half-hole, the whisper key off), three or more in the third.
import type { VisualFrame } from '@piano-model/engine';
import { FA, FB, FD, HALF, L1, L2, L3, LB, LBB, LC, LCS, LD, LEB, PF, PFS, PGS, R1, R2, R3, RBB, RE, RFS, RGS, SBB, SE, SEB, TCS, W as WK, bassoonFingersFor, bassoonOctave } from './bassoon-fingering.ts';
import { spatula, type ClTouch } from './clarinet-draw.ts';
import { AutoScale, INK, boreAt, newBoreWave, rgba, slowPhase, spring01, trackBoreWave, type BoreWave } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface BassoonState {
  /** where its sound leaves (the bell's mouth: the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** each key's spring (1 its hole open, 0 shut), the fingers' press (0..1), the half-hole's roll */
  keys?: { pos: Float32Array; vel: Float32Array; press: Float32Array; half: number; t: number; quiet: number };
  /** the reed's opening over one cycle (from the cycle's narrowest), from the engine's trace */
  reed?: { cyc: Float32Array; last: Float32Array | null };
  /** where it was last drawn (box px): the whole instrument and its keys' reach; the reed's tip; the reed
   *  and bocal; the keywork (tests, and the review's close-ups) */
  drawn?: { body: Box; reed: { x: number; y: number }; reedBox: Box; keys: Box; vertical: boolean; fingers: number };
}
export const newBassoonState = (): BassoonState => ({});

// ---------------------------------------------------------------- the plan (m): h up from the boot's
// bottom, u across to the audience's right (the front view, standing)
/** the bassoon's height, the boot's bottom to the bell's rim */
export const BS_H = 1.34;
/** the axes: the wing joint and the boot's narrow bore (left), the long joint, bell and the boot's wide
 *  bore (right) */
export const U_W = -0.0198;
export const U_L = 0.0165;
/** the boot's metal cap, its wood's top, its silver ring's top (where the wing and long joints enter) */
const H_CAP = 0.055;
const H_BOOT = 0.383;
export const H_RING = 0.424;
/** the wing joint's silver cap (the bocal goes in at its top) */
const H_WCAP = 0.871;
const H_WTOP = 0.908;
/** the long joint's silver ring (the bell's socket), the bell's pale lip */
const H_BR0 = 0.998;
const H_BR1 = 1.048;
const H_LIP = 1.329;
const R_LONG = 0.0235;
const R_WING = 0.0145;
const R_WCAP = 0.0149;
/** the boot's half-width up its wood (the photograph's: it widens to the ring) */
const BOOT_HW: [number, number][] = [[H_CAP, 0.0312], [0.156, 0.0335], [0.237, 0.0352], [H_BOOT, 0.0372]];
const BOOT_RING_HW = 0.0378;
const CAP_HW: [number, number][] = [[0, 0.0292], [0.004, 0.0299], [0.05, 0.0306], [H_CAP, 0.0309]];
/** the bell's outer radius (its swell, its waist, the lip) */
const BELL_R: [number, number][] = [
  [H_BR1, 0.0251], [1.077, 0.0248], [1.107, 0.0236], [1.127, 0.0234], [1.158, 0.0247], [1.178, 0.0256], [1.198, 0.0267], [1.21, 0.0263], [1.2285, 0.0248], [1.259, 0.0231], [1.3, 0.0226], [1.322, 0.0229], [H_LIP, 0.0232],
  [H_LIP, 0.0254], [1.332, 0.0265], [1.337, 0.0265], [BS_H, 0.0257],
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
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const bootHW = (h: number): number => (h < H_CAP ? lerpTab(CAP_HW, h) : h < H_BOOT ? lerpTab(BOOT_HW, h) : BOOT_RING_HW);
export const bellR = (h: number): number => (h < H_BR0 ? R_LONG : h < H_BR1 ? 0.0253 : lerpTab(BELL_R, h));
/** the wing joint's right edge: its tube, and below 0.77 m the wing (the ridge over the long joint) */
export const wingRight = (h: number): number => U_W + R_WING + (0.0225 - U_W - R_WING) * smooth(0.775, 0.7, h) - 0.0025 * smooth(0.47, H_RING, h);

// ---- the bore's path, from the reed's tip
/** the reed: 55 mm, 35 mm of it past the bocal's tip */
const REED_LEN = 0.055;
const REED_OUT = 0.035;
/** the bocal: its up-leg out of the wing (from its wide end 40 mm inside), the hook, the long arm (a
 *  cubic from the hook to the reed, (u, h)) */
const H_IN = 0.868;
const H_UP = 0.948;
const HOOK_R = 0.0102;
const BZ: [number, number][] = [[U_W - 2 * HOOK_R, H_UP], [U_W - 2 * HOOK_R, 0.912], [-0.096, 0.884], [-0.192, 0.851]];
/** the U-tube's centre (its bores 36 mm apart) */
const H_TURN = 0.035;
const R_U = (U_L - U_W) / 2;
const U_TURN = (U_L + U_W) / 2;
const bz = (t: number): [number, number] => {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  return [a * BZ[0][0] + b * BZ[1][0] + c * BZ[2][0] + d * BZ[3][0], a * BZ[0][1] + b * BZ[1][1] + c * BZ[2][1] + d * BZ[3][1]];
};
/** the arm's arc length against t (from the hook) */
const BZ_N = 400;
const BZ_S = new Float64Array(BZ_N + 1);
for (let i = 1; i <= BZ_N; i++) {
  const [u0, h0] = bz((i - 1) / BZ_N);
  const [u1, h1] = bz(i / BZ_N);
  BZ_S[i] = BZ_S[i - 1] + Math.hypot(u1 - u0, h1 - h0);
}
const BZ_LEN = BZ_S[BZ_N];
/** the reed's axis (out of the bocal's tip, towards its tip: (u, h)) */
const REED_DIR: [number, number] = (() => {
  const du = BZ[3][0] - BZ[2][0];
  const dh = BZ[3][1] - BZ[2][1];
  const l = Math.hypot(du, dh);
  return [du / l, dh / l];
})();
/** the bore's landmarks, m from the reed's tip: the bocal's tip, the hook, the up-leg, the wing joint's
 *  bore (the bocal's wide end), the U-tube, the wide bore up to the bell */
export const X_BOCAL = REED_OUT;
const X_HOOK = X_BOCAL + BZ_LEN;
const X_UPLEG = X_HOOK + Math.PI * HOOK_R;
export const X_DESC = X_UPLEG + (H_UP - H_IN);
export const X_U = X_DESC + (H_IN - H_TURN);
export const X_ASC = X_U + Math.PI * R_U;
/** the bore's length, the reed's tip to the bell's rim */
export const BS_BORE = X_ASC + (BS_H - H_TURN);
/** where the bore is at x (m from the reed's tip): (h, u) */
export function boreHU(x: number): [number, number] {
  if (x < X_BOCAL) {
    const s = REED_OUT - x;
    return [BZ[3][1] + s * REED_DIR[1], BZ[3][0] + s * REED_DIR[0]];
  }
  if (x < X_HOOK) {
    // (along the arm from the bocal's tip: t from 1 back to 0)
    const target = BZ_LEN - (x - X_BOCAL);
    let lo = 0;
    let hi = BZ_N;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (BZ_S[m] < target) lo = m;
      else hi = m;
    }
    const f = BZ_S[hi] > BZ_S[lo] ? (target - BZ_S[lo]) / (BZ_S[hi] - BZ_S[lo]) : 0;
    const [u, h] = bz((lo + f) / BZ_N);
    return [h, u];
  }
  if (x < X_UPLEG) {
    const th = Math.PI - (x - X_HOOK) / HOOK_R;
    return [H_UP + HOOK_R * Math.sin(th), U_W - HOOK_R + HOOK_R * Math.cos(th)];
  }
  if (x < X_DESC) return [H_UP - (x - X_UPLEG), U_W];
  if (x < X_U) return [H_IN - (x - X_DESC), U_W];
  if (x < X_ASC) {
    const th = Math.PI + (x - X_U) / R_U;
    return [H_TURN + R_U * Math.sin(th), U_TURN + R_U * Math.cos(th)];
  }
  return [H_TURN + (x - X_ASC), U_L];
}
/** a place on the narrow (descending) bore at height h, and on the wide (ascending) one */
const xDesc = (h: number) => X_DESC + (H_IN - h);
const xAsc = (h: number) => X_ASC + (h - H_TURN);
/** the bore's diameter: the reed's channel, then the cone 4.5 → 40 mm */
export const boreD = (x: number): number => (x < X_BOCAL ? 0.0025 + (0.002 * Math.max(0, x)) / X_BOCAL : 0.0045 + ((0.04 - 0.0045) * (x - X_BOCAL)) / (BS_BORE - X_BOCAL));
/** the bocal's outer radius (4.7 mm across at its tip, 9.4 at its wide end) */
const bocalR = (x: number): number => 0.00235 + (0.00235 * Math.max(0, x - X_BOCAL)) / (X_DESC - X_BOCAL);
/** the wall's inside radius about the bore's axis (the glow stays inside the wood) */
function wallR(x: number): number {
  if (x < X_BOCAL) return 0.0042;
  if (x < X_DESC) return bocalR(x) - 0.0007;
  const [h] = boreHU(x);
  if (x < X_U) return h > H_RING ? R_WING - 0.0015 : bootHW(h) + U_W - 0.0022;
  if (x < X_ASC) return 0.016;
  return h > H_RING ? bellR(h) - 0.0022 : bootHW(h) - U_L - 0.0022;
}

/** the cone's missing apex behind the reed's tip, a finger hole's end correction, a wide low-key hole's,
 *  and the bell's (0.6 × its 20 mm radius) */
export const BS_APEX = 0.401;
export const BS_HOLE_CORR = 0.03;
const BS_LOW_CORR = 0.015;
const BS_BELL_CORR = 0.012;

export type BsStyle = 'hole' | 'ring' | 'cup' | 'side' | 'back';
export interface BsKey {
  id: string;
  /** the tone hole's place along the bore (m from the reed's tip) */
  x: number;
  /** where it is drawn: height and across (m), standing */
  h: number;
  u: number;
  /** a cup's or ring's radius, and the hole's */
  r: number;
  hole: number;
  /** hole: an open finger hole; ring: a ring round its hole; cup: a pad from the front; side: a pad on the
   *  long joint's right side (seen edge-on, lifting outwards); back: a pad on the back (faint) */
  style: BsStyle;
  /** closed-standing: its pad shut at rest, lifted by its key */
  closed?: boolean;
  /** a vent (the flicks, the whisper key's nipple, the slivers, the L3 ring's hole): not a tube's end */
  vent?: boolean;
  /** its end correction (m), if not a finger hole's */
  corr?: number;
  /** the hole open for a fingering (the chart's bits) */
  open: (f: number) => boolean;
  /** the fingers whose press moves it */
  by: number;
  /** across (m) the rod its arm runs to (0: none) */
  rod: number;
  /** seen edge-on facing left (the whisper pad on the bocal) */
  left?: boolean;
}
const LOWS = LD | LC | LB | LBB;
/** The keys and holes (the photograph's places; the bore's from the notes they end) */
export const BS_KEYS: BsKey[] = [
  // the bocal's nipple, under the whisper key's pad (W shuts it: the low register)
  { id: 'w', x: X_UPLEG + (H_UP - 0.92), h: 0.92, u: U_W - 0.0068, r: 0.0036, hole: 0.0006, style: 'side', left: true, vent: true, open: (f) => !(f & WK), by: WK, rod: 0 },
  // the flick keys' vents near the wing's top, on its back (the third octave's)
  { id: 'fd', x: xDesc(0.855), h: 0.855, u: U_W, r: 0.0034, hole: 0.0012, style: 'back', closed: true, vent: true, open: (f) => !!(f & FD), by: FD, rod: 0 },
  { id: 'fb', x: xDesc(0.83), h: 0.83, u: U_W, r: 0.0034, hole: 0.0012, style: 'back', closed: true, vent: true, open: (f) => !!(f & FB), by: FB, rod: 0 },
  { id: 'fa', x: xDesc(0.805), h: 0.805, u: U_W, r: 0.0034, hole: 0.0012, style: 'back', closed: true, vent: true, open: (f) => !!(f & FA), by: FA, rod: 0 },
  // the left hand's slivers' pads on the wing's left (E never in a basic fingering, E♭ for E♭5)
  { id: 'se', x: xDesc(0.69), h: 0.684, u: -0.0285, r: 0.0033, hole: 0.0013, style: 'cup', closed: true, vent: true, open: (f) => !!(f & SE), by: SE, rod: -0.0365 },
  { id: 'seb', x: xDesc(0.66), h: 0.658, u: -0.0285, r: 0.0033, hole: 0.0013, style: 'cup', closed: true, vent: true, open: (f) => !!(f & SEB), by: SEB, rod: -0.0365 },
  // the wing's finger holes, drilled steeply down through the ridge; L1's half-hole (rolled off: a vent)
  { id: 'l1', x: xDesc(0.652), h: 0.642, u: 0.0055, r: 0.0042, hole: 0.0029, style: 'hole', open: (f) => !(f & (L1 | HALF)), by: L1 | HALF, rod: 0 },
  { id: 'l2', x: xDesc(0.594), h: 0.599, u: 0.0055, r: 0.0046, hole: 0.0033, style: 'hole', open: (f) => !(f & L2), by: L2, rod: 0 },
  { id: 'l3', x: xDesc(0.563), h: 0.563, u: 0.0055, r: 0.0064, hole: 0.0028, style: 'ring', vent: true, open: (f) => !(f & L3), by: L3, rod: -0.017 },
  // L3's pad, low on the wing (D3's hole)
  { id: 'l3p', x: xDesc(0.466), h: 0.478, u: -0.008, r: 0.0062, hole: 0.0036, style: 'cup', open: (f) => !(f & L3), by: L3, rod: -0.017 },
  // the left thumb's C♯ key's vent, on the wing's back above the boot (a long narrow chimney)
  { id: 'tcs', x: xDesc(0.436), h: 0.436, u: U_W, r: 0.0042, hole: 0.0016, style: 'back', closed: true, corr: 0.04, open: (f) => !!(f & TCS), by: TCS, rod: 0 },
  // the boot's finger holes (the narrow bore), R2 ringed; R3's plate shuts the A pad near the cap
  { id: 'r1', x: xDesc(0.323), h: 0.352, u: -0.0016, r: 0.0046, hole: 0.0034, style: 'hole', open: (f) => !(f & R1), by: R1, rod: 0 },
  { id: 'r2', x: xDesc(0.245), h: 0.305, u: 0.0006, r: 0.0066, hole: 0.0031, style: 'ring', open: (f) => !(f & R2), by: R2, rod: 0.013 },
  // the B♭ vent between R2 and R3, on the boot's back (the right thumb's B♭ key, or the B♭ sliver)
  { id: 'bb2', x: xDesc(0.163), h: 0.163, u: U_W, r: 0.0055, hole: 0.0022, style: 'back', closed: true, open: (f) => !!(f & (RBB | SBB)), by: RBB | SBB, rod: 0 },
  { id: 'r3p', x: xDesc(0.075), h: 0.079, u: 0.008, r: 0.0088, hole: 0.0052, style: 'cup', open: (f) => !(f & R3), by: R3, rod: -0.022 },
  // past the U-tube, up the wide bore: the G♯ vent, the little finger's F pad (open: G2), the F♯ vent,
  // the right thumb's E pad (open: F2)
  { id: 'gs2', x: xAsc(0.062), h: 0.064, u: U_L, r: 0.0058, hole: 0.0026, style: 'back', closed: true, open: (f) => !!(f & (RGS | PGS)), by: RGS | PGS, rod: 0 },
  { id: 'g2h', x: xAsc(0.129), h: 0.146, u: 0.009, r: 0.0088, hole: 0.0052, style: 'cup', open: (f) => !(f & PF), by: PF, rod: 0.024 },
  { id: 'fs2', x: xAsc(0.233), h: 0.212, u: 0.015, r: 0.0058, hole: 0.0028, style: 'cup', closed: true, open: (f) => !!(f & (RFS | PFS)), by: RFS | PFS, rod: 0.024 },
  { id: 'f2h', x: xAsc(0.343), h: 0.343, u: U_L, r: 0.0072, hole: 0.0042, style: 'back', open: (f) => !(f & RE), by: RE, rod: 0 },
  // the long joint: the left thumb's low D pad on its back (open: E2), the E♭ key's pad on its side (the
  // left little finger), the low C pad (open: D2), the C♯ pad on its side, the low B pad on its side at
  // the top (open: C2); a lower key shuts those above it with its own
  { id: 'e2h', x: xAsc(0.475), h: 0.475, u: U_L + 0.004, r: 0.0085, hole: 0.0055, style: 'back', corr: BS_LOW_CORR, open: (f) => !(f & LOWS), by: LOWS, rod: 0 },
  { id: 'eb2', x: xAsc(0.584), h: 0.584, u: U_L + R_LONG + 0.0012, r: 0.0062, hole: 0.0028, style: 'side', closed: true, open: (f) => !!(f & LEB), by: LEB, rod: 0 },
  { id: 'd2h', x: xAsc(0.73), h: 0.73, u: U_L + 0.004, r: 0.0085, hole: 0.0055, style: 'back', corr: BS_LOW_CORR, open: (f) => !(f & (LC | LB | LBB)), by: LC | LB | LBB, rod: 0 },
  { id: 'cs2', x: xAsc(0.854), h: 0.854, u: U_L + R_LONG + 0.0012, r: 0.0062, hole: 0.0028, style: 'side', closed: true, open: (f) => !!(f & LCS), by: LCS, rod: 0 },
  { id: 'c2h', x: xAsc(0.985), h: 0.973, u: U_L + R_LONG + 0.0012, r: 0.0085, hole: 0.006, style: 'side', corr: BS_LOW_CORR, open: (f) => !(f & (LB | LBB)), by: LB | LBB, rod: 0 },
  // the bell: the low B♭ key's pad on its back (open: B1)
  { id: 'b1h', x: xAsc(1.172), h: 1.172, u: U_L, r: 0.0095, hole: 0.0065, style: 'back', corr: BS_LOW_CORR, open: (f) => !(f & LBB), by: LBB, rod: 0 },
];
/** which of the keys stand open for a note (the tests hold them to the chart) */
export const bassoonKeysOpen = (m: number): { id: string; x: number; open: boolean }[] => {
  const f = bassoonFingersFor(m);
  return BS_KEYS.map((k) => ({ id: k.id, x: k.x, open: k.open(f) }));
};
/** the holes that end the tube, in order down the bore, and the chain of open-standing ones */
const TONE = BS_KEYS.filter((k) => !k.vent).sort((a, b) => a.x - b.x);
const CHAIN = TONE.filter((k) => !k.closed);
const endOf = (k: BsKey) => k.x + (k.corr ?? BS_HOLE_CORR);
/** the first open hole that ends the tube (vents aside), or null for the bell */
export function bsFirstOpen(f: number): BsKey | null {
  for (const k of TONE) if (k.open(f)) return k;
  return null;
}
/** The standing wave's span along the bore for a fingering and a sounding frequency: it leaves the tube an
 *  end correction past the first open hole (or the bell's), `end` m from the reed's tip; in the first
 *  register a forked fingering (the first open hole with the next one shut: E♭3) leaves half way to the
 *  next. `n` half-waves (with the cone's missing apex, n·c/2f long: one in the first register, two in the
 *  second, more in the third), its nodes inside the tube at `nodes`. */
export function bsWaveSpan(f: number, f1: number, register: 1 | 2 | 3 = 1): { end: number; n: number; nodes: number[] } {
  const k = bsFirstOpen(f);
  let end = k ? endOf(k) : BS_BORE + BS_BELL_CORR;
  if (k && register === 1 && !k.closed) {
    const next = CHAIN.find((c) => c.x > k.x + 1e-6);
    if (next && !next.open(f)) end = (end + endOf(next)) / 2;
  }
  const n = Math.max(1, Math.round((end + BS_APEX) / (343 / (2 * f1))));
  const nodes: number[] = [];
  for (let j = 1; j < n; j++) nodes.push(Math.max(0, (j * (end + BS_APEX)) / n - BS_APEX));
  return { end, n, nodes };
}

/** The touches the fingers press (spatulas, root to round end: x the height, v across). The thumbs' on the
 *  back (faint through the wood): the left thumb's upper row on the wing (the D, B and A flick keys, the
 *  C♯ key, the whisper key) and lower row on the long joint (low B♭, B, C, D), the right thumb's four on
 *  the boot (B♭, E, F♯, G♯). In front: the left hand's slivers and little-finger keys, the right hand's
 *  B♭ sliver, R3's plate and the little finger's F♯, F and G♯. */
const thumbL = (id: string, bit: number, h: number): ClTouch => ({ id, bit, x0: h, v0: -0.0315, x1: h - 0.0055, v1: -0.0115, w: 0.0027, back: true });
const thumbLow = (id: string, bit: number, h: number): ClTouch => ({ id, bit, x0: h, v0: 0.024, x1: h - 0.007, v1: 0.0405, w: 0.0032, back: true });
const thumbR = (id: string, bit: number, h: number): ClTouch => ({ id, bit, x0: h, v0: -0.031, x1: h - 0.006, v1: -0.0105, w: 0.0034, back: true });
export const BS_TOUCHES: ClTouch[] = [
  thumbL('fd', FD, 0.746),
  thumbL('fb', FB, 0.727),
  thumbL('fa', FA, 0.708),
  thumbL('tcs', TCS, 0.689),
  thumbL('w', WK, 0.668),
  thumbLow('lbb', LBB, 0.706),
  thumbLow('lb', LB, 0.69),
  thumbLow('lc', LC, 0.674),
  thumbLow('ld', LD, 0.658),
  thumbR('rbb', RBB, 0.37),
  thumbR('re', RE, 0.346),
  thumbR('rfs', RFS, 0.322),
  thumbR('rgs', RGS, 0.298),
  { id: 'se', bit: SE, x0: 0.676, v0: -0.0125, x1: 0.671, v1: 0.0135, w: 0.0024, fixed: true },
  { id: 'seb', bit: SEB, x0: 0.622, v0: -0.0125, x1: 0.618, v1: 0.0155, w: 0.0027 },
  { id: 'leb', bit: LEB, x0: 0.558, v0: 0.0215, x1: 0.546, v1: 0.0395, w: 0.005 },
  { id: 'lcs', bit: LCS, x0: 0.539, v0: 0.0215, x1: 0.529, v1: 0.0382, w: 0.0045 },
  { id: 'sbb', bit: SBB, x0: 0.29, v0: -0.0105, x1: 0.288, v1: 0.0125, w: 0.0026, fixed: true },
  { id: 'r3', bit: R3, x0: 0.271, v0: -0.0105, x1: 0.267, v1: 0.0195, w: 0.0054 },
  { id: 'pfs', bit: PFS, x0: 0.259, v0: 0.025, x1: 0.251, v1: 0.0435, w: 0.004 },
  { id: 'pf', bit: PF, x0: 0.247, v0: 0.026, x1: 0.232, v1: 0.0478, w: 0.0052 },
  { id: 'pgs', bit: PGS, x0: 0.231, v0: 0.027, x1: 0.214, v1: 0.0462, w: 0.0042 },
];
/** the rods (across at v, from height a to b) and the pillars (v, h) */
const ROD_WL = -0.0365;
const BS_RODS: [number, number, number][] = [
  [ROD_WL, 0.618, 0.92],
  [-0.0428, 0.445, 0.872],
  [-0.017, 0.47, 0.708],
  [-0.0395, 0.43, 0.6],
  [U_L + R_LONG + 0.0022, 0.5, 0.995],
  [0.024, 0.08, 0.318],
  [-0.022, 0.072, 0.3],
  [0.013, 0.292, 0.322],
];
const BS_POSTS: [number, number][] = [
  [ROD_WL, 0.62], [ROD_WL, 0.76], [ROD_WL, 0.9], [-0.017, 0.472], [-0.017, 0.59], [-0.017, 0.706], [-0.0395, 0.432], [-0.0395, 0.598],
  [U_L + R_LONG + 0.0022, 0.502], [U_L + R_LONG + 0.0022, 0.7], [U_L + R_LONG + 0.0022, 0.92], [U_L + R_LONG + 0.0022, 0.993],
  [0.024, 0.082], [0.024, 0.2], [0.024, 0.316], [-0.022, 0.074], [-0.022, 0.19], [-0.022, 0.298], [0.013, 0.32],
  [-0.0428, 0.447], [-0.0428, 0.66], [-0.0428, 0.87],
];
/** fixed linkage across the front (the boot's ladder between its two rods, the R3 plate's link to the F♯
 *  pad, the wing's slivers' cross-arms): (h, u) polylines */
const BS_LINKS: [number, number][][] = [
  [[0.196, -0.022], [0.196, 0.024]],
  [[0.178, -0.022], [0.178, 0.012]],
  [[0.264, 0.004], [0.232, 0.014], [0.218, 0.015]],
  [[0.104, -0.022], [0.104, 0.024]],
  [[0.704, -0.0365], [0.704, -0.017]],
  [[0.6, -0.0395], [0.6, -0.017]],
];
/** the plan's reach across (m): the reed's tip on the left, the keys and pads on the right */
export const U_LO = -0.236;
export const U_HI = 0.05;
/** where the wave's envelope stands off each leg: left of the wing and boot, right of the long joint */
const LOBE_L = -0.041;
export const LOBE_R = 0.0475;

// ---------------------------------------------------------------- the layout (cached per box)
/** the box (m) the bassoon is drawn in at one px per metre (an ensemble sizes it from the strings' scale):
 *  its height over the share of the box it fills, and across it the bocal, the keys and the wave */
export const bassoonBox = (): { w: number; h: number } => ({ w: BS_H / 0.9, h: 0.39 });
export interface BsLayout {
  key: string;
  vertical: boolean;
  W: number;
  H: number;
  top: number;
  sc: number;
  /** along: x0 + h·sc; across: c + u·sc (the lying frame; standing, the box is turned) */
  x0: number;
  c: number;
  /** the lobes' greatest height off the body (px) */
  Hm: number;
  boot: Path2D;
  bootRing: Path2D;
  cap: Path2D;
  capRim: Path2D;
  long: Path2D;
  bellRing: Path2D;
  lip: Path2D;
  wing: Path2D;
  wingCap: Path2D;
  /** everything but the wing (the wide bore's glow is kept off its face) */
  offWing: Path2D;
  /** the wood's lit and shaded bands, its flame figure and grain, the joints' seams */
  sheen: Path2D;
  spec: Path2D;
  shade: Path2D;
  flame: Path2D;
  grain: Path2D;
  seams: Path2D;
  /** the wing's ridge (its lit edge) and its shadow on the long joint */
  ridge: Path2D;
  ridgeShadow: Path2D;
  /** the bell's mouth seen a little from above */
  mouth: Path2D;
  mouthIn: Path2D;
  /** the bocal: its tube, its lit edge, the nipple; the reed: the blades, the scraped tip, the spine, the
   *  bark's collar, the wires, the thread and its wraps */
  bocal: Path2D;
  bocalLit: Path2D;
  nipple: Path2D;
  blades: Path2D;
  tip: Path2D;
  spine: Path2D;
  collar: Path2D;
  wires: Path2D;
  thread: Path2D;
  wraps: Path2D;
  /** the hand rest: its wood and its stem */
  rest: Path2D;
  restStem: Path2D;
  /** the finger holes' chimneys, down through the wood to the bore */
  chimneys: Path2D;
  rods: Path2D;
  posts: Path2D;
  hinges: Path2D;
  touches: Path2D[];
  /** the bore's glow: curved pieces (each a short quad, its bore position) and the two straight legs */
  glowQ: { x: number; p: Path2D; pi: Path2D }[];
  desc: { p: Path2D; pi: Path2D; a: number; b: number };
  asc: { p: Path2D; pi: Path2D; a: number; b: number };
  /** the reed's tip (px) and the reed's axis out of it (unit, px) */
  tipX: number;
  tipY: number;
  tdx: number;
  tdy: number;
}
const layouts = new Map<string, BsLayout>();
/** a repeatable scatter in 0..1 */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** px kept beside the instrument on a stage it stands on, and above the reed's tip lying (the breath) */
const STAND_ABOVE = 10;
const STAND_BELOW = 8;
const breath = (sc: number) => Math.min(22, 0.035 * sc);

/** The layout for a W×H box (the file player's `top` px kept clear at its top): lying (the boot to the
 *  left, the bell to the right, the bocal rising) on a wide box, standing (bell up) on a portrait one (a
 *  phone held upright) and in a tall Orchestra cell. A cell (bassoonBox at the group's px/m) is filled to
 *  90 % of its length; on a phone's stage it stands as tall as fits between the player and the keys. */
export function bassoonLayout(W: number, H: number, top = 0): BsLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const vertical = H - top > W * 0.75;
  const Lw = vertical ? H - top : W;
  const Cw = vertical ? W : H - top;
  const standing = vertical && W > 0.5 * (H - top);
  let len = standing ? Math.min(0.94 * Lw, Lw - STAND_ABOVE - STAND_BELOW) : 0.9 * Lw;
  let sc = len / BS_H;
  let Hm = Math.min(Cw * 0.14, 0.05 * sc);
  // across: the reed (and the breath's room past it) to the keys and the wide leg's envelope
  const span = (s: number, hm: number) => (U_HI - U_LO) * s + Math.max(0, (LOBE_R - U_HI) * s + hm) + breath(s);
  if (span(sc, Hm) > Cw - 4) {
    sc *= (Cw - 4) / span(sc, Hm);
    Hm = Math.min(Cw * 0.14, 0.05 * sc);
    len = sc * BS_H;
  }
  const x0 = vertical ? (standing ? STAND_BELOW + (Lw - STAND_ABOVE - STAND_BELOW - len) / 2 : (Lw - len) / 2) : (Lw - len) / 2;
  const c = (vertical ? 0 : top) + (Cw - span(sc, Hm)) / 2 + breath(sc) - U_LO * sc;
  const X = (h: number) => x0 + h * sc;
  const Y = (u: number) => c + u * sc;
  // ---- the wood: an outline between two edges along h
  const outline = (a: number, b: number, lo: (h: number) => number, hi: (h: number) => number, step = 0.002) => {
    const p = new Path2D();
    const hs: number[] = [];
    for (let h = a; h < b; h += step) hs.push(h);
    hs.push(b);
    hs.forEach((h, i) => (i ? p.lineTo(X(h), Y(lo(h))) : p.moveTo(X(h), Y(lo(h)))));
    for (let i = hs.length - 1; i >= 0; i--) p.lineTo(X(hs[i]), Y(hi(hs[i])));
    p.closePath();
    return p;
  };
  const boot = outline(H_CAP, H_BOOT, (h) => -bootHW(h), (h) => bootHW(h));
  const bootRing = outline(H_BOOT, H_RING, () => -BOOT_RING_HW, () => BOOT_RING_HW);
  const cap = outline(0, H_CAP, (h) => -bootHW(h), (h) => bootHW(h), 0.001);
  const capRim = new Path2D();
  for (const h of [0.004, H_CAP - 0.004]) {
    capRim.moveTo(X(h), Y(-bootHW(h)));
    capRim.lineTo(X(h), Y(bootHW(h)));
  }
  const long = outline(H_RING, BS_H, (h) => U_L - bellR(h), (h) => U_L + bellR(h), 0.0015);
  const bellRing = outline(H_BR0, H_BR1, () => U_L - 0.0253, () => U_L + 0.0253);
  const lip = outline(H_LIP, BS_H, (h) => U_L - bellR(h), (h) => U_L + bellR(h), 0.001);
  const wing = outline(H_RING, H_WCAP, () => U_W - R_WING, wingRight, 0.002);
  const wingCap = outline(H_WCAP, H_WTOP, () => U_W - R_WCAP, () => U_W + R_WCAP);
  const offWing = new Path2D();
  offWing.rect(-1e4, -1e4, 3e4, 3e4);
  offWing.addPath(wing);
  // the lit bands: on each tube, a soft sheen and a sharper highlight towards the light (the audience's
  // upper left), a darker band on the far side
  const sheen = new Path2D();
  const spec = new Path2D();
  const shade = new Path2D();
  const tubes: [number, number, number, (h: number) => number][] = [
    [H_CAP + 0.002, H_BOOT - 0.002, 0, bootHW],
    [H_RING + 0.002, H_BR0 - 0.002, U_L, bellR],
    [H_BR1 + 0.002, H_LIP - 0.002, U_L, bellR],
    [H_RING + 0.002, H_WCAP - 0.002, U_W, () => R_WING],
  ];
  for (const [a, b, u0, r] of tubes) {
    sheen.addPath(outline(a, b, (h) => u0 - 0.8 * r(h), (h) => u0 - 0.36 * r(h)));
    spec.addPath(outline(a, b, (h) => u0 - 0.64 * r(h), (h) => u0 - 0.53 * r(h)));
    shade.addPath(outline(a, b, (h) => u0 + 0.55 * r(h), (h) => u0 + 0.97 * r(h)));
  }
  // the flame figure: fine curls across the maple, close together and broken, the grain along it
  const flame = new Path2D();
  const grain = new Path2D();
  const parts: [number, number, (h: number) => number, (h: number) => number][] = [
    [H_CAP + 0.004, H_BOOT - 0.003, (h) => -bootHW(h), (h) => bootHW(h)],
    [H_RING + 0.004, H_BR0 - 0.003, (h) => U_L - bellR(h), (h) => U_L + bellR(h)],
    [H_BR1 + 0.004, H_LIP - 0.003, (h) => U_L - bellR(h), (h) => U_L + bellR(h)],
    [H_RING + 0.004, H_WCAP - 0.003, () => U_W - R_WING, wingRight],
  ];
  parts.forEach(([a, b, lo, hi], pi) => {
    let h = a + hash(pi * 7) * 0.004;
    let k = 0;
    while (h < b) {
      const l = lo(h);
      const r = hi(h);
      const n = 7;
      // (each curl a little arched, broken at random, the light side fainter)
      const bend = (hash(k * 3.7 + pi * 31) - 0.5) * 0.004;
      let on = false;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const u = l + (r - l) * (0.06 + 0.88 * f);
        const hh = h + bend * Math.sin(Math.PI * f) + 0.0012 * Math.sin(f * 9 + k);
        if (hash(k * 13 + i * 5 + pi) < 0.22) {
          on = false;
          continue;
        }
        if (on) flame.lineTo(X(hh), Y(u));
        else flame.moveTo(X(hh), Y(u));
        on = true;
      }
      h += 0.0028 + 0.006 * hash(k * 1.3 + pi * 17);
      k++;
    }
    for (let g = 0; g < 9; g++) {
      const f = -0.8 + (1.6 * (g + 0.5)) / 9 + (hash(g + pi * 5) - 0.5) * 0.08;
      let on = false;
      for (let hh = a + hash(g * 3 + pi) * 0.03; hh < b; hh += 0.004) {
        if (hash(g * 41 + Math.floor(hh * 50) + pi * 7) < 0.25) {
          on = false;
          continue;
        }
        const l = lo(hh);
        const r = hi(hh);
        const u = (l + r) / 2 + ((r - l) / 2) * (f + 0.02 * Math.sin(hh * 60 + g));
        if (on) grain.lineTo(X(hh), Y(u));
        else grain.moveTo(X(hh), Y(u));
        on = true;
      }
    }
  });
  const seams = new Path2D();
  for (const [h, hw] of [[H_CAP, bootHW(H_CAP)], [H_BOOT, BOOT_RING_HW], [H_BR0, 0.0253], [H_BR1, 0.0253], [H_LIP, bellR(H_LIP + 1e-5)]] as const) {
    const u0 = h > 0.5 ? U_L : 0;
    seams.moveTo(X(h), Y(u0 - hw));
    seams.lineTo(X(h), Y(u0 + hw));
  }
  // where the long joint and the wing go into the boot's ring, the line between them up the stage
  seams.moveTo(X(H_RING), Y(U_W - R_WING));
  seams.lineTo(X(H_RING), Y(U_L + R_LONG));
  // the wing's ridge (its front face's lit edge) and its shadow on the long joint beside it
  const ridge = new Path2D();
  const ridgeShadow = new Path2D();
  for (let h = H_RING + 0.004; h < 0.778; h += 0.002) {
    const u = wingRight(h) - 0.0024;
    if (h < H_RING + 0.005) ridge.moveTo(X(h), Y(u));
    else ridge.lineTo(X(h), Y(u));
  }
  ridgeShadow.addPath(outline(H_RING + 0.002, 0.8, (h) => wingRight(h) - 0.0008, (h) => wingRight(h) + 0.003 * smooth(0.81, 0.76, h) + 0.0008));
  // the bell's mouth, seen a little from above: its rim's face and the dark of the bore
  const mouth = new Path2D();
  mouth.ellipse(X(BS_H), Y(U_L), 0.0045 * sc, bellR(BS_H) * sc, 0, 0, 2 * Math.PI);
  const mouthIn = new Path2D();
  mouthIn.ellipse(X(BS_H) + 0.0004 * sc, Y(U_L), 0.0036 * sc, 0.0198 * sc, 0, 0, 2 * Math.PI);
  // ---- the bocal: a tube along the bore's path, from its tip (under the reed) to the wing's cap
  const ribbon = (a: number, b: number, hw: (x: number) => number, step = 0.001) => {
    const p = new Path2D();
    const A: [number, number][] = [];
    const B: [number, number][] = [];
    for (let x = a; ; x += step) {
      const xx = Math.min(x, b);
      const [h0, u0] = boreHU(Math.max(0, xx - 0.0005));
      const [h1, u1] = boreHU(xx + 0.0005);
      const tx = (h1 - h0) * sc;
      const ty = (u1 - u0) * sc;
      const l = Math.hypot(tx, ty) || 1;
      const [h, u] = boreHU(xx);
      const w = hw(xx) * sc;
      A.push([X(h) - (ty / l) * w, Y(u) + (tx / l) * w]);
      B.push([X(h) + (ty / l) * w, Y(u) - (tx / l) * w]);
      if (xx >= b) break;
    }
    [...A, ...B.reverse()].forEach(([px, py], i) => (i ? p.lineTo(px, py) : p.moveTo(px, py)));
    p.closePath();
    return p;
  };
  const xCapTop = X_UPLEG + (H_UP - H_WTOP);
  const bocal = ribbon(X_BOCAL + 0.006, xCapTop, bocalR);
  const bocalLit = ribbon(X_BOCAL + 0.008, xCapTop - 0.002, (x) => bocalR(x) * 0.35, 0.0015);
  const nipple = new Path2D();
  {
    const k = BS_KEYS[0];
    const hn = k.h;
    nipple.rect(X(hn - 0.0018), Y(U_W - bocalR(k.x) - 0.0016), 0.0036 * sc, 0.0018 * sc);
  }
  // ---- the reed, from its tip back along its axis (its face to us): the blades, the scraped tip, the
  // spine, the bark's collar by the first wire, two wires, the thread's turban over the bocal's tip
  const [hT, uT] = boreHU(0);
  const tdx = REED_DIR[1];
  const tdy = REED_DIR[0];
  // (the reed's axis in px, from its tip inwards: along −REED_DIR; across: its normal)
  const RX = (s: number, w: number) => X(hT - s * REED_DIR[1] + w * REED_DIR[0]);
  const RY = (s: number, w: number) => Y(uT - s * REED_DIR[0] - w * REED_DIR[1]);
  // (the blades fan from the tube to their 14.5 mm tip; the tube rounds in to the wires)
  const reedHW = (s: number) => {
    if (s < 0.027) return (0.0073 - 0.002 * Math.pow(s / 0.027, 1.25)) * (s < 0.0012 ? 0.86 + 0.14 * Math.sqrt(s / 0.0012) : 1);
    if (s < 0.034) return 0.0053 - (0.0011 * (s - 0.027)) / 0.007;
    return 0.0042;
  };
  const rOutline = (a: number, b: number, hw: (s: number) => number, step = 0.0004) => {
    const p = new Path2D();
    const ss: number[] = [];
    for (let s = a; s < b; s += step) ss.push(s);
    ss.push(b);
    ss.forEach((s, i) => (i ? p.lineTo(RX(s, -hw(s)), RY(s, -hw(s))) : p.moveTo(RX(s, -hw(s)), RY(s, -hw(s)))));
    for (let i = ss.length - 1; i >= 0; i--) p.lineTo(RX(ss[i], hw(ss[i])), RY(ss[i], hw(ss[i])));
    p.closePath();
    return p;
  };
  const blades = rOutline(0, 0.04, reedHW);
  const tip = rOutline(0, 0.0055, (s) => reedHW(s) * 0.97);
  const collar = rOutline(0.0215, 0.027, (s) => reedHW(s) * 0.98);
  const spine = new Path2D();
  spine.moveTo(RX(0.006, 0), RY(0.006, 0));
  spine.lineTo(RX(0.026, 0), RY(0.026, 0));
  const wires = new Path2D();
  for (const s of [0.027, 0.033]) {
    const w = reedHW(s) + 0.0004;
    wires.moveTo(RX(s, -w), RY(s, -w));
    wires.lineTo(RX(s, w), RY(s, w));
  }
  const turban = (s: number) => 0.0044 + 0.0009 * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.04) / 0.015)));
  const thread = rOutline(0.04, REED_LEN, turban, 0.0005);
  const wraps = new Path2D();
  for (let s = 0.0408; s < REED_LEN - 0.0004; s += 0.0009) {
    const w = turban(s);
    wraps.moveTo(RX(s, -w), RY(s, -w));
    wraps.lineTo(RX(s + 0.0006, w), RY(s + 0.0006, w));
  }
  // ---- the hand rest on the boot's left (the right hand's palm), on its stem
  const rest = new Path2D();
  rest.moveTo(X(0.243), Y(-0.0362));
  rest.bezierCurveTo(X(0.233), Y(-0.042), X(0.232), Y(-0.0525), X(0.243), Y(-0.0556));
  rest.bezierCurveTo(X(0.254), Y(-0.0585), X(0.272), Y(-0.055), X(0.2755), Y(-0.047));
  rest.bezierCurveTo(X(0.278), Y(-0.041), X(0.271), Y(-0.0372), X(0.264), Y(-0.0378));
  rest.bezierCurveTo(X(0.262), Y(-0.0455), X(0.25), Y(-0.0455), X(0.243), Y(-0.0362));
  rest.closePath();
  const restStem = new Path2D();
  restStem.rect(X(0.249), Y(-0.036), 0.007 * sc, 0.004 * sc);
  // ---- the chimneys: each finger hole's (and the plates' pads') channel down through the wood to the bore
  const chimneys = new Path2D();
  for (const k of BS_KEYS) {
    if (k.style === 'back' || k.style === 'side' || k.vent) continue;
    const [hb, ub] = boreHU(k.x);
    chimneys.moveTo(X(k.h), Y(k.u));
    chimneys.lineTo(X(hb), Y(ub));
  }
  // ---- the mechanism: rods, pillars, hinge tubes, the touches
  const rods = new Path2D();
  for (const [v, a, b] of BS_RODS) {
    rods.moveTo(X(a), Y(v));
    rods.lineTo(X(b), Y(v));
  }
  for (const l of BS_LINKS) l.forEach(([h, u], i) => (i ? rods.lineTo(X(h), Y(u)) : rods.moveTo(X(h), Y(u))));
  // (the whisper key's arm from its rod to its pad by the bocal)
  rods.moveTo(X(0.918), Y(ROD_WL));
  rods.quadraticCurveTo(X(0.924), Y(ROD_WL + 0.004), X(0.92), Y(U_W - 0.0085));
  const posts = new Path2D();
  for (const [v, h] of BS_POSTS) {
    posts.moveTo(X(h) + 0.0019 * sc, Y(v));
    posts.arc(X(h), Y(v), 0.0019 * sc, 0, 2 * Math.PI);
  }
  const hinges = new Path2D();
  for (const k of BS_KEYS) {
    if (!k.rod) continue;
    const hl = Math.max(0.006, k.r * 1.5);
    capsule(hinges, X(k.h - hl / 2), X(k.h + hl / 2), Y(k.rod), 0.0016 * sc);
  }
  const touches = BS_TOUCHES.map((t) => {
    const p = new Path2D();
    spatula(p, X, Y, t, sc);
    return p;
  });
  // ---- the bore's glow: the curved parts in short quads, the two straight legs as bands
  const glowW = (x: number, k: number) => Math.max(0.0006, Math.min(wallR(x), (boreD(x) / 2) * k + 0.0012 * k));
  const glowQ: { x: number; p: Path2D; pi: Path2D }[] = [];
  const quad = (a: number, b: number) => ({ x: (a + b) / 2, p: ribbon(a, b + 0.0003, (x) => glowW(x, 1), b - a), pi: ribbon(a, b + 0.0003, (x) => glowW(x, 0.5), b - a) });
  for (let x = 0.0004; x < X_DESC - 1e-6; x += 0.004) glowQ.push(quad(x, Math.min(X_DESC, x + 0.004)));
  for (let x = X_U; x < X_ASC - 1e-6; x += 0.004) glowQ.push(quad(x, Math.min(X_ASC, x + 0.004)));
  const leg = (a: number, b: number) => ({ p: ribbon(a, b, (x) => glowW(x, 1), 0.004), pi: ribbon(a, b, (x) => glowW(x, 0.5), 0.004), a, b });
  const desc = leg(X_DESC, X_U);
  const asc = leg(X_ASC, BS_BORE - 0.002);
  const L: BsLayout = {
    key, vertical, W, H, top, sc, x0, c, Hm, boot, bootRing, cap, capRim, long, bellRing, lip, wing, wingCap, offWing, sheen, spec, shade, flame, grain, seams, ridge, ridgeShadow, mouth, mouthIn,
    bocal, bocalLit, nipple, blades, tip, spine, collar, wires, thread, wraps, rest, restStem, chimneys, rods, posts, hinges, touches, glowQ, desc, asc,
    tipX: X(hT), tipY: Y(uT), tdx, tdy,
  };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
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

// ---------------------------------------------------------------- the live state (both styles)
export interface BsLive {
  /** the fingering held (0: all lifted) */
  fingers: number;
  /** each key's spring: 1 its hole open, 0 shut */
  keyPos: number[];
  /** each touch's (BS_TOUCHES) and each finger hole's or ring's press, 0..1; L1's roll off (the half-hole) */
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
export function bassoonLive(fr: VisualFrame | null, st: BassoonState, now: number): BsLive {
  const focus = fr?.focus ?? null;
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  // ---- the fingering: the engine's note while it sounds and a moment after, then the fingers lift
  const nk = BS_KEYS.length;
  const nt = BS_TOUCHES.length;
  const ks = (st.keys ??= { pos: new Float32Array(nk).fill(-1), vel: new Float32Array(nk), press: new Float32Array(nk + nt), half: 0, t: now, quiet: 10 });
  if (ks.pos[0] < 0) BS_KEYS.forEach((k, i) => (ks.pos[i] = k.open(0) ? 1 : 0));
  const dt = Math.min(0.1, Math.max(0, (now - ks.t) / 1000));
  ks.t = now;
  ks.quiet = blow > 0.015 ? 0 : ks.quiet + dt;
  const fingers = focus && ks.quiet < 0.8 ? bassoonFingersFor(focus.midi) : 0;
  const keyPos = BS_KEYS.map((k, i) => spring01(ks.pos, ks.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62));
  // (the fingers' press: quick, no bounce; a finger hole or a ring under its own finger)
  const ease = 1 - Math.exp(-dt / 0.035);
  const keyPress = BS_KEYS.map((k, i) => (ks.press[i] += (pressOf(fingers, k.style === 'hole' || k.style === 'ring' ? k.by : 0) - ks.press[i]) * ease));
  const touchPress = BS_TOUCHES.map((t, i) => (ks.press[nk + i] += (pressOf(fingers, t.bit) - ks.press[nk + i]) * ease));
  ks.half += ((fingers & HALF ? 1 : 0) - ks.half) * (1 - Math.exp(-dt / 0.05));
  // ---- the bore's standing wave
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  const f1 = focus?.f1 ?? 220;
  const ph = Math.cos(slowPhase(f1, now));
  const span = focus ? bsWaveSpan(bassoonFingersFor(focus.midi), f1, bassoonOctave(focus.midi)) : { end: BS_BORE + BS_BELL_CORR, n: 1, nodes: [] };
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
  return { fingers, keyPos, touchPress, keyPress, half: ks.half, blow, vib, lvl, ph, sounding, end: span.end, n: span.n, nodes: span.nodes, ampAt, open };
}

/** a point of the bassoon's own frame (h up, u across, m) in the box's px */
export function bsToBox(L: BsLayout, h: number, u: number): { x: number; y: number } {
  const lx = L.x0 + h * L.sc;
  const ly = L.c + u * L.sc;
  return L.vertical ? { x: ly, y: L.H - lx } : { x: lx, y: ly };
}
/** turn the context into the lying frame (standing: the bell up) */
export function bsFrame(ctx: CanvasRenderingContext2D, L: BsLayout): void {
  if (!L.vertical) return;
  ctx.translate(0, L.H);
  ctx.rotate(-Math.PI / 2);
}
/** record where it was drawn (and the fingering it showed) and where its sound leaves */
export function bsRecord(L: BsLayout, st: BassoonState, fingers: number): void {
  const box = (ha: number, hb: number, ua: number, ub: number): Box => {
    const a = bsToBox(L, ha, ua);
    const b = bsToBox(L, hb, ub);
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  };
  const tip = bsToBox(L, ...(boreHU(0) as [number, number]));
  st.drawn = { body: box(0, BS_H, U_LO, U_HI), reed: tip, reedBox: box(0.815, 0.975, U_LO - 0.004, -0.004), keys: box(0.04, 0.78, -0.058, 0.05), vertical: L.vertical, fingers };
  st.src = bsToBox(L, BS_H + 0.006, U_L);
}
/** a point on the bore at x, in the lying frame's px, and its normal (unit, px) */
export function borePx(L: BsLayout, x: number): { px: number; py: number; nx: number; ny: number } {
  const [h, u] = boreHU(x);
  const [h0, u0] = boreHU(Math.max(0, x - 0.001));
  const [h1, u1] = boreHU(x + 0.001);
  const tx = h1 - h0;
  const ty = u1 - u0;
  const l = Math.hypot(tx, ty) || 1;
  return { px: L.x0 + h * L.sc, py: L.c + u * L.sc, nx: -ty / l, ny: tx / l };
}

// ---------------------------------------------------------------- the classic drawing
const silver = (a: number) => rgba('240,230,212', a);
const SILVER_BODY = 'rgb(72,66,58)';
const WOOD = '#3a140e';
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);

/** the envelope's base and side for each leg: (lying frame) the narrow bore's to the left of the wing and
 *  boot (up, lying), the wide bore's to the right of the long joint (down) */
export const LEGS: { a: number; b: number; base: number; sgn: number }[] = [
  { a: X_DESC, b: X_U, base: LOBE_L, sgn: -1 },
  { a: X_ASC, b: BS_BORE, base: LOBE_R, sgn: 1 },
];

/** The bassoon from the front: the boot with its silver ring and cap, the wing joint and its ridge, the
 *  long joint and the bell, flamed maple; the bocal and the reed, its opening following the engine's reed
 *  (drawn slowed); the keys closing for the engine's note by the chart (each on a spring), the thumbs'
 *  faint through the wood; and the bore's standing wave glowing along the folded bore from the reed to
 *  where it leaves the tube, its envelope beside each leg. `top`: the file player's px over the box's top. */
export function drawBassoon(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: BassoonState, top = 0): void {
  const L = bassoonLayout(W, H, top);
  const { sc, Hm } = L;
  const X = (h: number) => L.x0 + h * sc;
  const Y = (u: number) => L.c + u * sc;
  const now = performance.now();
  const lv = bassoonLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  ctx.save();
  bsFrame(ctx, L);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- behind the bassoon: the pressure's envelope beside each leg, pinched at the nodes
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    for (const g of LEGS) {
      const b = Math.min(end, g.b);
      if (b <= g.a) continue;
      const M = Math.max(8, Math.round(((b - g.a) / 2.6) * 120));
      ctx.beginPath();
      const [ha] = boreHU(g.a);
      const A0 = Math.min(1, Math.abs(lv.ampAt(g.a))) * hm;
      ctx.moveTo(X(ha), Y(g.base));
      ctx.lineTo(X(ha), Y(g.base) + g.sgn * A0);
      for (let i = 0; i <= M; i++) {
        const x = g.a + ((b - g.a) * i) / M;
        const [h] = boreHU(x);
        ctx.lineTo(X(h), Y(g.base) + g.sgn * hm * Math.min(1, Math.abs(lv.ampAt(x))));
      }
      const [hb] = boreHU(b);
      ctx.lineTo(X(hb), Y(g.base));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.vermilion, 0.07 * lvl + 0.03);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.vermilion, 0.16 + 0.22 * lvl);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // ---- the wood: the long joint and bell first, the boot, then the wing over the long joint
  const woodGrad = (u0: number, r: number) => {
    const g = ctx.createLinearGradient(0, Y(u0 - r), 0, Y(u0 + r));
    g.addColorStop(0, '#1f0906');
    g.addColorStop(0.22, '#4a1a11');
    g.addColorStop(0.5, '#33110b');
    g.addColorStop(1, '#140504');
    return g;
  };
  ctx.fillStyle = woodGrad(U_L, 0.026);
  ctx.fill(L.long);
  ctx.fillStyle = woodGrad(0, 0.037);
  ctx.fill(L.boot);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill(L.ridgeShadow);
  ctx.fillStyle = woodGrad(U_W + 0.012, 0.0265);
  ctx.fill(L.wing);
  ctx.strokeStyle = 'rgba(160,70,44,0.17)';
  ctx.lineWidth = Math.max(0.6, 0.00055 * sc);
  ctx.stroke(L.flame);
  ctx.strokeStyle = 'rgba(30,8,4,0.35)';
  ctx.lineWidth = 0.7;
  ctx.stroke(L.grain);
  ctx.fillStyle = 'rgba(255,214,186,0.07)';
  ctx.fill(L.sheen);
  ctx.fillStyle = 'rgba(255,224,200,0.16)';
  ctx.fill(L.spec);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill(L.shade);
  ctx.strokeStyle = 'rgba(255,220,196,0.22)';
  ctx.lineWidth = Math.max(0.8, 0.0007 * sc);
  ctx.stroke(L.ridge);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke(L.wing);
  // the hand rest (dark rosewood on its stem), the bell's pale lip
  ctx.fillStyle = SILVER_BODY;
  ctx.fill(L.restStem);
  ctx.fillStyle = metalGrad(ctx, Y, -0.036, -0.032);
  ctx.fill(L.restStem);
  const gr = ctx.createLinearGradient(0, Y(-0.058), 0, Y(-0.036));
  gr.addColorStop(0, '#5a2a18');
  gr.addColorStop(0.35, '#2a120a');
  gr.addColorStop(1, '#120705');
  ctx.fillStyle = gr;
  ctx.fill(L.rest);
  ctx.strokeStyle = 'rgba(236,206,180,0.34)';
  ctx.lineWidth = 1;
  ctx.stroke(L.rest);
  const gl = ctx.createLinearGradient(0, Y(U_L - 0.027), 0, Y(U_L + 0.027));
  gl.addColorStop(0, '#9c9384');
  gl.addColorStop(0.25, '#efe6d2');
  gl.addColorStop(0.6, '#c4b9a4');
  gl.addColorStop(1, '#6d665a');
  ctx.fillStyle = gl;
  ctx.fill(L.lip);
  // the silver: the boot's ring and cap, the bell's ring, the wing's cap
  for (const [p, u0, r] of [[L.bootRing, 0, BOOT_RING_HW], [L.cap, 0, 0.031], [L.bellRing, U_L, 0.0253], [L.wingCap, U_W, R_WCAP]] as const) {
    ctx.fillStyle = SILVER_BODY;
    ctx.fill(p);
    ctx.fillStyle = metalGrad(ctx, Y, u0 - r, u0 + r);
    ctx.fill(p);
    ctx.strokeStyle = silver(0.45);
    ctx.lineWidth = 0.9;
    ctx.stroke(p);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke(L.capRim);
  ctx.stroke(L.seams);
  ctx.strokeStyle = rgba(INK.ivory, 0.2);
  ctx.lineWidth = 1;
  ctx.stroke(L.long);
  ctx.stroke(L.boot);
  ctx.strokeStyle = rgba(INK.ivory, 0.26);
  ctx.stroke(L.wing);
  ctx.strokeStyle = 'rgba(255,248,232,0.5)';
  ctx.stroke(L.lip);
  // the bell's mouth: its rim's face, the dark of the bore
  ctx.fillStyle = '#d9cfbb';
  ctx.fill(L.mouth);
  ctx.fillStyle = '#060303';
  ctx.fill(L.mouthIn);
  ctx.strokeStyle = 'rgba(255,248,232,0.4)';
  ctx.stroke(L.mouth);
  // ---- the chimneys (dark, down through the wood) and the finger holes and pads' holes in it
  ctx.strokeStyle = 'rgba(6,1,0,0.24)';
  ctx.lineWidth = Math.max(1, 0.0028 * sc);
  ctx.stroke(L.chimneys);
  BS_KEYS.forEach((k, i) => {
    if (k.style === 'back' || k.style === 'side') return;
    const p = keyPos[i];
    if (k.style === 'cup' && p < 0.03) return;
    ctx.beginPath();
    ctx.arc(X(k.h), Y(k.u), k.hole * sc, 0, 2 * Math.PI);
    ctx.fillStyle = k.style === 'cup' ? `rgba(3,1,1,${Math.min(1, p * 1.5).toFixed(3)})` : '#030101';
    ctx.fill();
  });
  // ---- the bocal: nickel silver, lit along its upper edge; its nipple under the whisper pad
  ctx.fillStyle = 'rgb(92,88,82)';
  ctx.fill(L.bocal);
  ctx.fillStyle = silver(0.5);
  ctx.fill(L.bocalLit);
  ctx.strokeStyle = silver(0.55);
  ctx.lineWidth = 0.9;
  ctx.stroke(L.bocal);
  ctx.fillStyle = silver(0.6);
  ctx.fill(L.nipple);
  // ---- the reed: the cane's blades, the scraped tip lighter, the bark's collar, the wires, the thread
  ctx.fillStyle = '#c8a25e';
  ctx.fill(L.blades);
  ctx.fillStyle = 'rgba(250,226,170,0.55)';
  ctx.fill(L.tip);
  ctx.fillStyle = 'rgba(120,80,34,0.6)';
  ctx.fill(L.collar);
  ctx.strokeStyle = 'rgba(120,84,40,0.5)';
  ctx.lineWidth = Math.max(0.6, 0.0005 * sc);
  ctx.stroke(L.spine);
  ctx.strokeStyle = 'rgba(255,240,206,0.6)';
  ctx.lineWidth = 0.8;
  ctx.stroke(L.blades);
  ctx.fillStyle = '#7a1e2a';
  ctx.fill(L.thread);
  ctx.strokeStyle = 'rgba(30,4,8,0.55)';
  ctx.lineWidth = Math.max(0.5, 0.0003 * sc);
  ctx.stroke(L.wraps);
  ctx.strokeStyle = 'rgba(255,190,200,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke(L.thread);
  ctx.strokeStyle = silver(0.85);
  ctx.lineWidth = Math.max(1, 0.0007 * sc);
  ctx.stroke(L.wires);
  // ---- the standing wave inside the bore: compression warm, rarefaction cool, the nodes dark
  if (lv.sounding) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const q of L.glowQ) {
      const A = lv.ampAt(q.x);
      if (Math.abs(A) < 0.02) continue;
      ctx.fillStyle = rgba(INK.vermilion, 0.36 * Math.min(1, Math.pow(Math.abs(A), 1.5)));
      ctx.fill(q.p);
      ctx.fillStyle = rgba(waveInk(A * ph), 0.56 * Math.min(1, Math.pow(Math.abs(A * ph), 1.15)));
      ctx.fill(q.pi);
    }
    for (const g of [L.desc, L.asc]) {
      if (end <= g.a) continue;
      const [ha] = boreHU(g.a);
      const [hb] = boreHU(g.b);
      const ge = ctx.createLinearGradient(X(ha), 0, X(hb), 0);
      const gw = ctx.createLinearGradient(X(ha), 0, X(hb), 0);
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const A = lv.ampAt(g.a + ((g.b - g.a) * i) / N);
        ge.addColorStop(i / N, rgba(INK.vermilion, 0.36 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
        gw.addColorStop(i / N, rgba(waveInk(A * ph), 0.56 * Math.min(1, Math.pow(Math.abs(A * ph), 1.15))));
      }
      ctx.save();
      // (the wide bore runs behind the wing: its glow kept off the wing's face)
      if (g === L.asc) ctx.clip(L.offWing, 'evenodd');
      ctx.fillStyle = ge;
      ctx.fill(g.p);
      ctx.fillStyle = gw;
      ctx.fill(g.pi);
      ctx.restore();
    }
    ctx.restore();
  }
  // ---- through the wood: the pads on the back and the thumbs' touches (faint; lit under the thumbs)
  BS_KEYS.forEach((k, i) => {
    if (k.style !== 'back') return;
    ghostPad(ctx, X(k.h), Y(k.u), k.r * sc, 1 - keyPos[i], k.closed ? keyPos[i] : 1 - keyPos[i], sc);
  });
  BS_TOUCHES.forEach((t, i) => {
    if (!t.back) return;
    const q = lv.touchPress[i];
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.amber, 0.22 * q);
      ctx.fill(L.touches[i]);
    }
    ctx.save();
    ctx.setLineDash([0.0016 * sc, 0.0012 * sc]);
    ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.4 + 0.4 * q) : rgba(INK.ivory, 0.2);
    ctx.lineWidth = 1;
    ctx.stroke(L.touches[i]);
    ctx.restore();
  });
  // ---- the mechanism: rods (polished axles), hinge tubes
  ctx.strokeStyle = 'rgb(52,51,50)';
  ctx.lineWidth = Math.max(1, 0.0021 * sc);
  ctx.stroke(L.rods);
  ctx.strokeStyle = silver(0.55);
  ctx.lineWidth = Math.max(0.6, 0.0007 * sc);
  ctx.save();
  ctx.translate(0, -0.0004 * sc);
  ctx.stroke(L.rods);
  ctx.restore();
  ctx.fillStyle = '#2a2826';
  ctx.fill(L.hinges);
  ctx.strokeStyle = silver(0.5);
  ctx.lineWidth = 1;
  ctx.stroke(L.hinges);
  // ---- the keys: arms from their hinges, cups lifting and seating on springs, the rings and holes
  // under the fingers, the side pads lifting outwards
  for (const k of BS_KEYS) {
    if (!k.rod || k.style === 'side' || k.style === 'back') continue;
    const cy = Y(k.u);
    const ry = k.r * sc;
    const rod = Y(k.rod);
    if (Math.abs(rod - cy) > ry) bsArm(ctx, X(k.h), cy + Math.sign(rod - cy) * ry * 0.75, rod, k.r * sc * 0.34, 0.0013 * sc);
  }
  BS_KEYS.forEach((k, i) => {
    const p = keyPos[i];
    const moved = k.closed ? p : 1 - p;
    const cx = X(k.h);
    const cy = Y(k.u);
    if (k.style === 'hole') bsHole(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], k.id === 'l1' ? lv.half : 0);
    else if (k.style === 'ring') bsRing(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], p);
    else if (k.style === 'cup') bsCup(ctx, cx, cy, k.r * sc, k.r * sc, p, moved, p * 0.0025 * sc);
    else if (k.style === 'side') {
      // edge-on: a narrow ellipse beside the tube, lifting outwards
      const out = (k.left ? -1 : 1) * p * 0.0024 * sc;
      bsCup(ctx, cx, cy + out, k.r * sc, Math.max(0.6, 0.0013 * sc), p, moved, 0);
    }
  });
  // the touches: levers and spatulas, lit amber under a finger
  BS_TOUCHES.forEach((t, i) => {
    if (t.back) return;
    const q = lv.touchPress[i];
    const path = L.touches[i];
    ctx.fillStyle = 'rgb(60,59,58)';
    ctx.fill(path);
    const g = ctx.createLinearGradient(0, Y(Math.min(t.v0, t.v1) - 0.003), 0, Y(Math.max(t.v0, t.v1) + 0.003));
    g.addColorStop(0, silver(t.fixed ? 0.42 : 0.58));
    g.addColorStop(0.5, silver(0.24));
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
  ctx.fillStyle = '#2c2a27';
  ctx.fill(L.posts);
  ctx.strokeStyle = silver(0.6);
  ctx.lineWidth = 1;
  ctx.stroke(L.posts);
  // ---- the reed's tip: the opening between the blades, seen a little from its end (twice its 1 mm at
  // rest, shut once a cycle when the note is loud)
  reedEye(ctx, L, lv.open * 0.001 * sc);
  // the breath into the reed: a faint stream from the lips, flowing in
  if (lv.blow > 0.02) {
    const a = Math.min(1, 0.3 + lv.blow) * (1 + 2.5 * lv.vib);
    ctx.save();
    ctx.setLineDash([0.003 * sc, 0.0025 * sc]);
    ctx.lineDashOffset = -((now / 1000) * 0.03 * sc);
    ctx.strokeStyle = rgba(INK.steel, 0.45 * a);
    ctx.lineWidth = 1;
    const nx = -L.tdy;
    const ny = L.tdx;
    for (const j of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(L.tipX + L.tdx * 0.017 * sc + nx * j * 0.0052 * sc, L.tipY + L.tdy * 0.017 * sc + ny * j * 0.0052 * sc);
      ctx.quadraticCurveTo(L.tipX + L.tdx * 0.007 * sc + nx * j * 0.003 * sc, L.tipY + L.tdy * 0.007 * sc + ny * j * 0.003 * sc, L.tipX + L.tdx * 0.0016 * sc + nx * j * 0.001 * sc, L.tipY + L.tdy * 0.0016 * sc + ny * j * 0.001 * sc);
      ctx.stroke();
    }
    ctx.restore();
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still)
  if (lv.sounding) {
    ctx.beginPath();
    const n = 260;
    const e = Math.min(end, BS_BORE);
    for (let i = 0; i <= n; i++) {
      const x = (e * i) / n;
      const b = borePx(L, x);
      const v = lv.ampAt(x) * ph * Math.min(0.0045, 0.3 * boreD(x) + 0.0012) * sc;
      if (i) ctx.lineTo(b.px + b.nx * v, b.py + b.ny * v);
      else ctx.moveTo(b.px + b.nx * v, b.py + b.ny * v);
    }
    ctx.strokeStyle = rgba(INK.ivory, 0.75 * Math.min(1, 3 * lvl));
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
  bsRecord(L, st, lv.fingers);
}

/** polished silver across a part from u0 to u1 */
function metalGrad(ctx: CanvasRenderingContext2D, Y: (u: number) => number, u0: number, u1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, Y(u0), 0, Y(u1));
  g.addColorStop(0, silver(0.2));
  g.addColorStop(0.2, silver(0.72));
  g.addColorStop(0.34, silver(0.36));
  g.addColorStop(0.64, silver(0.12));
  g.addColorStop(0.9, silver(0.26));
  g.addColorStop(1, silver(0.08));
  return g;
}
/** a key's arm: from its cup's edge (y0, half-width w0) narrowing to its hinge tube (y1, w1) */
function bsArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number): void {
  const m = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w0, y0);
  ctx.bezierCurveTo(x - w0 * 0.5, m, x - w1, m, x - w1, y1);
  ctx.lineTo(x + w1, y1);
  ctx.bezierCurveTo(x + w1, m, x + w0 * 0.5, m, x + w0, y0);
  ctx.closePath();
  ctx.fillStyle = '#2c2a27';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.ivory, 0.4);
  ctx.lineWidth = 0.9;
  ctx.stroke();
}
/** a pad's cup from the front (or edge-on): a silver dome, lifted `p` (1 open), lit amber where a finger
 *  or a linkage has moved it off its rest (`moved`), the pad's leather showing under its rim as it lifts */
function bsCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: number, moved: number, lift: number): void {
  const s = 0.965 + 0.035 * p;
  rx *= s;
  ry *= s;
  if (p > 0.02 && lift > 0) {
    ctx.beginPath();
    ctx.ellipse(cx + lift * 0.3, cy + lift * 0.4, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(0,0,0,${(0.4 * p).toFixed(3)})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(0.5, ry), 0, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgb(52,52,54)';
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
  if (ry > 2.5 && rx > 2.5) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.74, ry * 0.74, 0, 0, 2 * Math.PI);
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
/** an open finger hole with its metal bushing: under the finger (`q`) the fingertip covers it; L1's
 *  rolled down (`half`) uncovers the upper half (towards the reed) */
function bsHole(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, half: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.moveTo(cx + hole, cy);
  ctx.arc(cx, cy, hole, 0, 2 * Math.PI, true);
  ctx.fillStyle = 'rgb(70,68,64)';
  ctx.fill('evenodd');
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, silver(0.7));
  g.addColorStop(0.5, silver(0.25));
  g.addColorStop(1, silver(0.12));
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.5 + 0.35 * q) : rgba(INK.ivory, 0.45);
  ctx.lineWidth = 1 + 0.4 * q;
  ctx.stroke();
  if (q > 0.01) {
    // the fingertip: over the whole hole, or rolled down off its upper half (towards the reed: +h, +x)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.25, 0, 2 * Math.PI);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cx - half * r * 0.9, cy, r * 1.25 * (1 - 0.45 * half), r * 1.2, 0, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.amber, 0.72 * q);
    ctx.fill();
    ctx.restore();
  }
}
/** a ring key from the front: a thin silver ring round its hole; under the finger (`q`) the ring goes
 *  down and the fingertip covers the hole */
function bsRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, p: number): void {
  const s = 0.965 + 0.035 * p;
  const ro = r * s;
  const ri = r * 0.72;
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.fillStyle = '#1a0805';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, hole, 0, 2 * Math.PI);
  ctx.fillStyle = '#010000';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.moveTo(cx + ri, cy);
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI, true);
  ctx.fillStyle = 'rgb(62,62,62)';
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
/** a pad on the back, seen through the wood: its outline dashed and faint, darker shut (`shut`), amber
 *  while its key has moved it (`moved`) */
function ghostPad(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, shut: number, moved: number, sc: number): void {
  ctx.save();
  ctx.setLineDash([0.0016 * sc, 0.0012 * sc]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  if (moved > 0.01) {
    ctx.fillStyle = rgba(INK.amber, 0.18 * moved);
    ctx.fill();
  }
  ctx.strokeStyle = moved > 0.5 ? rgba(INK.amber, 0.38 + 0.35 * moved) : rgba(INK.ivory, 0.16 + 0.1 * shut);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
/** the opening between the blades at the reed's tip, an eye across the tip (half-opening `o` px; shut:
 *  the blades' edges meet in one line), as a path in the lying frame's px (shared with the vector look) */
export function reedEyePath(L: BsLayout, o: number): Path2D {
  const hl = 0.0066 * L.sc;
  const nx = -L.tdy;
  const ny = L.tdx;
  const cx = L.tipX;
  const cy = L.tipY;
  const p = new Path2D();
  const at = (a: number, b: number): [number, number] => [cx + nx * a + L.tdx * b, cy + ny * a + L.tdy * b];
  const k = Math.max(0, o) * 1.33;
  p.moveTo(...at(-hl, 0));
  p.bezierCurveTo(...at(-hl * 0.45, k), ...at(hl * 0.45, k), ...at(hl, 0));
  p.bezierCurveTo(...at(hl * 0.45, -k), ...at(-hl * 0.45, -k), ...at(-hl, 0));
  p.closePath();
  return p;
}
function reedEye(ctx: CanvasRenderingContext2D, L: BsLayout, o: number): void {
  const p = reedEyePath(L, o);
  ctx.fillStyle = '#080604';
  ctx.fill(p);
  ctx.strokeStyle = 'rgba(250,232,190,0.9)';
  ctx.lineWidth = Math.max(0.8, 0.00035 * L.sc);
  ctx.stroke(p);
}
