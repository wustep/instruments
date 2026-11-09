// The two pianos in 3D, as instruments rather than diagrams. Each is built once from the engine's
// own string scale (speaking lengths, unisons, which notes have dampers, strike points) and posed
// every frame from the live state: keys, wippens, jacks, repetition levers, hammers and dampers
// move per key, the pedals and the lid follow the engine, the soundboard glows with its modes and
// every sounding string vibrates.
//
// Geometry (metres; x across the keyboard, bass at −x; y up from the floor; z from the key fronts
// towards the tail / back). Proportions follow standard references:
//   * keyboard: white keys 23.5 mm pitch (52 → 1.222 m), black keys 13.7 mm wide, 12.5 mm higher,
//     95 mm long; key dip 10 mm; white key tops 725 mm from the floor (typical keyboard height);
//   * grand action (Renner/Steinway pattern, as in Reblitz, "Piano Servicing, Tuning and
//     Rebuilding", ch. 2, and the repetition action of the site's action view): key ≈ 520 mm on its
//     balance rail at 240 mm; capstan behind the balance rail lifting the wippen (its flange at the
//     front); jack and repetition lever on the wippen; hammer flange towards the player, the head
//     at the back end of a ≈120 mm shank, the knuckle ≈18 mm from the centre pin; backcheck on the
//     key's tail; damper underlever behind the key, its wire up to a damper head on the strings
//     behind the strike point; blow distance 47 mm, let-off ≈2.5 mm;
//   * upright action: key ≈380 mm on its balance rail at 200 mm; wippen flanged at the back on the
//     main rail, capstan under its front; jack up to the hammer butt; a vertical shank (≈150 mm) and
//     the head striking towards the strings; catcher on the butt, backcheck and bridle wire on the
//     wippen; damper lever pushed by the spoon, its head pressing the strings above the hammers;
//     blow distance 45 mm;
//   * grand case: rim 340 mm deep, lid hinged on the bass side (spine), propped on the treble side,
//     three legs and a lyre with three pedals; strings straight back from the agraffes, the bass
//     (wound) section overstrung across the tenor, bridges on a spruce soundboard, a gilt cast-iron
//     plate with struts; tuning pins in the pin block under the plate's front web;
//   * upright case: about 1.24 m tall; strings vertical with the bass cross-strung in front; plate
//     and soundboard behind; the upper front panel is off (as a technician sees it) so the action
//     shows; kneeboard, legs and two pedals below.
// Approximations: one string scale per piano from the engine (its lengths and unisons; bridge and
// case shapes follow them), action parts drawn as simplified solids in the right places and
// proportions, the hammer's flight from the stage's action state (strike, rebound, check) rather
// than a lever-ratio simulation, and the grand's treble cheek cut away so the action can be seen.
import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { stepAction, type PianoState, type Pt } from '../piano-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, about, chain, ink, lerp3, mul, plateModes, rotX, rotZ, scaleM, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, bbox, box, cyl, ellipsoid, extrude, lathe, offset, spline, tube, type Mat } from './mesh.ts';
import { INK } from '../stage-draw.ts';

// ---------------------------------------------------------------- keyboard
export const WHITE = 0.0235;
const BLACK_W = 0.0137;
const KEY_TOP = 0.725;
const X0 = -26 * WHITE;
/** the action's pitch: the key sticks fan to a uniform spacing behind the key tops */
const PITCH = (52 * WHITE) / 88;
export const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
function whiteIndex(m: number): number {
  let n = 0;
  for (let k = 21; k < m; k++) if (!isBlack(k)) n++;
  return n;
}
/** x of a key top's centre (A0 at the left) */
export function keyX3(m: number): number {
  if (!isBlack(m)) return X0 + (whiteIndex(m) + 0.5) * WHITE;
  return X0 + whiteIndex(m) * WHITE;
}
/** x of a key's action (hammer, strings at the strike line) */
export const actX = (m: number) => X0 + (m - 21 + 0.5) * PITCH;
/** strike point as a fraction of the speaking length (the engine's scale: 1/8.3 in the bass,
 *  falling to about 1/15 at the top) */
export const strikeBeta = (m: number) => (m <= 60 ? 0.12 : 0.12 - ((m - 60) / 48) * 0.055);
const isWound = (k: KeySummary) => k.midi < 48 && k.nStrings <= 2;

/** one key (key top, stick, capstan and — grand — backcheck), in place; it turns about its balance pin */
function keyMesh(m: number, len: number, stickTop: number, capZ: number, capH: number, back: { z: number; h: number } | null): Mesh {
  const mb = new MeshBuilder();
  const xc = keyX3(m);
  const xa = actX(m);
  const yT = KEY_TOP;
  if (!isBlack(m)) {
    const half = WHITE / 2 - 0.0005;
    const l = isBlack(m - 1) && m > 21 ? xc - WHITE / 2 + BLACK_W / 2 + 0.0006 : xc - half;
    const r = isBlack(m + 1) && m < 108 ? xc + WHITE / 2 - BLACK_W / 2 - 0.0006 : xc + half;
    // the front (full width) and the narrow part between the black keys: ivory top, ivory front
    bbox(mb, [xc - half, yT - 0.022, 0], [xc + half, yT, 0.05], M.ivory, 0.0012);
    box(mb, [l, yT - 0.022, 0.05], [r, yT, 0.147], M.ivory);
  } else {
    // ebony: tapered sides, the top shorter and narrower than the base
    const b0 = BLACK_W / 2;
    const t0 = 0.0048;
    const y0 = yT - 0.002;
    const y1 = yT + 0.0125;
    const z0 = 0.05;
    const z1 = 0.145;
    const zt = 0.06;
    const A: Vec3 = [xc - b0, y0, z0];
    const B: Vec3 = [xc + b0, y0, z0];
    const C: Vec3 = [xc + b0, y0, z1];
    const D: Vec3 = [xc - b0, y0, z1];
    const a: Vec3 = [xc - t0, y1, zt];
    const bb: Vec3 = [xc + t0, y1, zt];
    const c: Vec3 = [xc + t0, y1, z1];
    const d: Vec3 = [xc - t0, y1, z1];
    mb.quad(a, bb, c, d, M.ebony);
    mb.quad(A, B, bb, a, M.ebony);
    mb.quad(B, C, c, bb, M.ebony);
    mb.quad(D, A, a, d, M.ebony);
    mb.quad(C, D, d, c, M.ebony);
  }
  // the key stick, from under the key top back to the tail, fanning to the action's pitch
  const w = isBlack(m) ? 0.0095 : 0.0115;
  const zs = 0.147;
  const yb = stickTop - 0.022;
  const sx = (z: number) => xc + ((xa - xc) * (z - zs)) / (len - zs);
  const quadS = (z0: number, z1: number) => {
    const p = (x: number, y: number, z: number): Vec3 => [sx(z) + x, y, z];
    mb.quad(p(-w / 2, stickTop, z0), p(-w / 2, stickTop, z1), p(w / 2, stickTop, z1), p(w / 2, stickTop, z0), M.keyWood);
    mb.quad(p(-w / 2, yb, z0), p(w / 2, yb, z0), p(w / 2, yb, z1), p(-w / 2, yb, z1), M.keyWood);
    mb.quad(p(-w / 2, yb, z0), p(-w / 2, yb, z1), p(-w / 2, stickTop, z1), p(-w / 2, stickTop, z0), M.keyWood);
    mb.quad(p(w / 2, yb, z0), p(w / 2, stickTop, z0), p(w / 2, stickTop, z1), p(w / 2, yb, z1), M.keyWood);
  };
  quadS(zs, len);
  mb.quad([sx(len) - w / 2, yb, len], [sx(len) + w / 2, yb, len], [sx(len) + w / 2, stickTop, len], [sx(len) - w / 2, stickTop, len], M.keyWood);
  // capstan (brass)
  cyl(mb, [sx(capZ), stickTop, capZ], [sx(capZ), stickTop + capH, capZ], capH > 0.03 ? 0.004 : 0.0035, capH > 0.03 ? 0.004 : 0.0035, 10, capH > 0.03 ? M.hornbeam : M.brassDull);
  // grand: the backcheck on its wire, its felt facing the hammer's tail
  if (back) {
    const x = sx(back.z);
    cyl(mb, [x, stickTop, back.z], [x, back.h - 0.012, back.z - 0.006], 0.0012, 0.0012, 6, M.steel, false);
    box(mb, [x - 0.0055, back.h - 0.026, back.z - 0.012], [x + 0.0055, back.h, back.z - 0.004], M.actionWood);
    box(mb, [x - 0.0056, back.h - 0.024, back.z - 0.0135], [x + 0.0056, back.h - 0.002, back.z - 0.012], M.buckskin);
  }
  return mb.build();
}

/** a profile in the (z, y) plane extruded across x from x0 to x1 */
function prismX(mb: MeshBuilder, prof: [number, number][], x0: number, x1: number, m: Mat): void {
  // local (a, b, c) → world (x, y, z) = (b, c, a): the profile's (z, y) become extrude's (x, z)
  const T = new Float32Array([0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  mb.with(T, () => extrude(mb, prof, x0, x1, m, { smooth: 0.8 }));
}

// ---------------------------------------------------------------- the model
interface StringRun {
  /** tuning pin, agraffe (speaking length starts), bridge (ends), hitch pin */
  pin: Vec3;
  a: Vec3;
  b: Vec3;
  hitch: Vec3;
}
interface KeyGeo {
  midi: number;
  i: number;
  k: KeySummary;
  wound: boolean;
  strings: StringRun[];
  /** where the hammer meets the strings (centre of the unison), and the damper's place */
  strike: Vec3;
  damper: Vec3 | null;
  key: Mesh;
  /** hammer head scale (bass hammers are bigger) */
  hs: number;
}
export interface PianoModel {
  kind: 'grand' | 'upright';
  sig: string;
  statics: Mesh[];
  board: Mesh;
  boardAspect: number;
  keys: KeyGeo[];
  parts: Record<string, Mesh>;
  lid: Mesh | null;
  lidHinge: Vec3;
  prop: { base: Vec3; tipLocal: Vec3 } | null;
  pedals: { mesh: Mesh; pivot: Vec3 }[];
  bounds: { c: Vec3; r: number };
  floorY: number;
  /** where sound leaves (for the room) */
  src: Vec3;
}

// grand heights and depths (from the key front, z = 0)
const G = {
  keyLen: 0.52,
  balZ: 0.24,
  stickTop: KEY_TOP - 0.003,
  capZ: 0.29,
  wipZ: 0.255,
  wipY: 0.752,
  jackZ: 0.328,
  repZ: 0.3,
  flangeZ: 0.31,
  shankY: 0.8,
  shankLen: 0.12,
  strikeZ: 0.43,
  strY: 0.895,
  bassStrY: 0.922,
  damperZ: 0.54,
  ulPivotZ: 0.625,
  ulY: 0.735,
  bellyZ: 0.585,
  boardY: 0.845,
  rimBottom: 0.62,
  rimTop: 0.96,
  plateY: 0.878,
  blow: 0.047,
};

function sigOf(keys: KeySummary[]): string {
  return keys.map((k) => `${k.lengthM.toFixed(3)}${k.nStrings}${k.hasDamper ? 1 : 0}`).join('');
}

/** half-plane clip (keep z ≥ z0) of a closed polygon in (x, z) */
function clipZ(poly: [number, number][], z0: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const pin = p[1] >= z0;
    const qin = q[1] >= z0;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (z0 - p[1]) / (q[1] - p[1]);
      out.push([p[0] + (q[0] - p[0]) * t, z0]);
    }
  }
  return out;
}
/** a flat band along an open polyline (x, z): width w to its left, from y0 to y1 */
function band(mb: MeshBuilder, line: [number, number][], w: number, y0: number, y1: number, m: Mat): void {
  const o = offset(line, w);
  for (let i = 0; i < line.length - 1; i++) {
    const quadPoly: [number, number][] = [line[i], line[i + 1], o[i + 1], o[i]];
    extrude(mb, quadPoly, y0, y1, m, { smooth: 0.5 });
  }
}

/** the lit glow for a sounding key */
const VERM: RGBA = [1, 0.37, 0.22, 0.32];

// ================================================================ grand
export function buildGrandModel(keys: KeySummary[]): PianoModel {
  const geo: KeyGeo[] = [];
  const BASS_ANGLE = 0.18; // the overstrung bass fans towards the treble at the tail
  for (const k of keys) {
    const m = k.midi;
    const wound = isWound(k);
    const L = Math.max(0.04, k.lengthM);
    const beta = strikeBeta(m);
    const y = wound ? G.bassStrY : G.strY;
    const dir: Vec3 = wound ? [Math.sin(BASS_ANGLE), 0, Math.cos(BASS_ANGLE)] : [0, 0, 1];
    const strike: Vec3 = [actX(m), y, G.strikeZ];
    const n = Math.max(1, k.nStrings);
    const strings: StringRun[] = [];
    for (let j = 0; j < n; j++) {
      const dx = (j - (n - 1) / 2) * (wound ? 0.0042 : 0.0034);
      const a: Vec3 = [strike[0] + dx - dir[0] * beta * L, y, strike[2] - dir[2] * beta * L];
      const b: Vec3 = [a[0] + dir[0] * L, y, a[2] + dir[2] * L];
      const pin: Vec3 = [a[0] + dx * 0.4, G.plateY + 0.03, 0.2 + 0.03 * (j % 2) + (wound ? -0.01 : 0)];
      const hitch: Vec3 = [b[0] + dir[0] * 0.07, y - 0.008, b[2] + dir[2] * 0.07];
      strings.push({ pin, a, b, hitch });
    }
    // dampers sit on the strings behind the hammer, at most at the damper line
    const along = Math.min(G.damperZ - G.strikeZ, 0.6 * (1 - beta) * L) / dir[2];
    const damper: Vec3 | null = k.hasDamper ? [strike[0] + dir[0] * along, y, strike[2] + dir[2] * along] : null;
    const hs = 1.25 - 0.4 * ((m - 21) / 87);
    geo.push({ midi: m, i: m - 21, k, wound, strings, strike, damper, hs, key: keyMesh(m, G.keyLen, G.stickTop, G.capZ, 0.018, { z: 0.468, h: 0.79 }) });
  }
  // ---- the case outline (outer, in x/z), from the bridges
  const xL = -0.68;
  const xR = 0.68;
  const treble = geo.filter((g) => !g.wound);
  const bass = geo.filter((g) => g.wound);
  const tb = (g: KeyGeo) => g.strings[g.strings.length - 1].b;
  const bassEnd = bass.length ? tb(bass[0]) : [-0.3, 0, 1.6];
  const zTail = Math.max(...geo.map((g) => tb(g)[2])) + 0.16;
  const ctrl: [number, number][] = [[xR, 0.2], [xR, 0.5]];
  for (const m of [100, 90, 80, 70, 60, 52]) {
    const g = treble.find((t) => t.midi === m);
    if (g) {
      const b = tb(g);
      ctrl.push([b[0] + 0.1, b[2] + 0.09]);
    }
  }
  if (bass.length) {
    const lastB = tb(bass[bass.length - 1]);
    ctrl.push([lastB[0] + 0.1, lastB[2] + 0.06]);
  }
  ctrl.push([bassEnd[0] + 0.05, zTail - 0.02], [xL + 0.2, zTail], [xL + 0.02, zTail - 0.16], [xL, zTail - 0.45], [xL, 0.2]);
  const outer = spline(ctrl, 6, false);
  const RIM = 0.05;
  // the outline runs treble front → tail → bass front, counter-clockwise in (x, z): inside is to its left
  const inner = offset(outer, RIM);
  const mb = new MeshBuilder();
  // rim: outer wall (lacquer), inner wall (wood), top; the treble side cut away by the action
  const cutZ = 0.6;
  for (let i = 0; i < outer.length - 1; i++) {
    const [x0, z0] = outer[i];
    const [x1, z1] = outer[i + 1];
    const [u0, w0] = inner[i];
    const [u1, w1] = inner[i + 1];
    const cut = x0 > 0 && z1 < cutZ;
    if (cut) {
      // the section where the cut ends: a face of bare rim laminations
      const nxt = outer[i + 1];
      if (i + 2 < outer.length && !(nxt[0] > 0 && outer[i + 2][1] < cutZ)) mb.quad([x1, G.rimBottom, z1], [u1, G.rimBottom, w1], [u1, G.rimTop, w1], [x1, G.rimTop, z1], M.maple);
      continue;
    }
    const yb = G.rimBottom;
    mb.quad([x0, yb, z0], [x1, yb, z1], [x1, G.rimTop, z1], [x0, G.rimTop, z0], M.lacquer);
    mb.quad([u0, yb, w0], [u0, G.rimTop, w0], [u1, G.rimTop, w1], [u1, yb, w1], M.caseInner);
    mb.quad([x0, G.rimTop, z0], [x1, G.rimTop, z1], [u1, G.rimTop, w1], [u0, G.rimTop, w0], M.lacquer);
    mb.quad([x0, yb, z0], [u0, yb, w0], [u1, yb, w1], [x1, yb, z1], M.lacquerSatin);
  }
  // the front ends of the rim, and the case bottom under the soundboard
  for (const i of [0, outer.length - 1]) {
    const [x, z] = outer[i];
    const [u, w] = inner[i];
    mb.quad([x, G.rimBottom, z], [u, G.rimBottom, w], [u, G.rimTop, w], [x, G.rimTop, z], M.lacquer);
  }
  const closedInner: [number, number][] = [...inner, [inner[inner.length - 1][0], 0.2], [inner[0][0], 0.2]];
  extrude(mb, clipZ(closedInner, 0.62), G.rimBottom, G.rimBottom + 0.018, M.lacquerSatin);
  // keybed, key slip, cheeks, the fallboard (open, standing behind the keys)
  box(mb, [xL, G.rimBottom + 0.035, -0.014], [xR, 0.693, 0.66], M.lacquerSatin);
  bbox(mb, [xL + 0.07, 0.69, -0.016], [xR - 0.07, 0.712, 0.0], M.lacquer, 0.002);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? xL : 0.611 + 0.001;
    const x1 = s < 0 ? -0.611 - 0.001 : xR;
    bbox(mb, [x0, G.rimBottom + 0.035, -0.016], [x1, 0.775, 0.2], M.lacquer, 0.004);
  }
  // the treble cheek's side, cut: an edge band so the cut reads as a section
  box(mb, [xL + 0.07, 0.735, 0.152], [xR - 0.07, 0.8, 0.166], M.lacquer);
  // key frame rails: front rail, balance rail, back rail; and the underlever rail
  box(mb, [-0.611, 0.693, 0.01], [0.611, 0.7, 0.03], M.redFelt);
  box(mb, [-0.611, 0.693, G.balZ - 0.012], [0.611, 0.7, G.balZ + 0.012], M.actionWood);
  box(mb, [-0.611, 0.693, 0.49], [0.611, 0.699, 0.51], M.redFelt);
  box(mb, [-0.62, 0.705, G.ulPivotZ - 0.008], [0.62, 0.729, G.ulPivotZ + 0.02], M.actionWood);
  // the action frame: brackets (cast) and rails — wippen rail, shank (flange) rail, let-off rail, hammer rest rail
  for (const x of [-0.6, -0.31, -0.03, 0.27]) {
    const prof: [number, number][] = [[0.22, 0.7], [0.27, 0.7], [0.33, 0.775], [0.32, 0.815], [0.28, 0.815], [0.22, 0.74]];
    prismX(mb, prof, x - 0.004, x + 0.004, M.castAction);
  }
  box(mb, [-0.61, 0.74, 0.235], [0.61, 0.752, 0.26], M.actionWood);
  box(mb, [-0.61, 0.79, 0.29], [0.61, 0.812, 0.315], M.actionWood);
  box(mb, [-0.61, 0.765, 0.318], [0.61, 0.774, 0.33], M.actionWood);
  box(mb, [-0.61, 0.772, 0.4], [0.61, 0.79, 0.44], M.actionWood);
  box(mb, [-0.61, 0.79, 0.4], [0.61, 0.793, 0.44], M.redFelt);
  // per key: the hammer flange on the rail, the let-off button
  for (const g of geo) {
    const x = actX(g.midi);
    box(mb, [x - 0.0045, 0.792, G.flangeZ - 0.012], [x + 0.0045, 0.806, G.flangeZ + 0.004], M.hornbeam);
    box(mb, [x - 0.003, 0.758, 0.322], [x + 0.003, 0.765, 0.33], M.redFelt);
  }
  // the damper guide rail, behind the hammers
  box(mb, [-0.61, 0.84, G.damperZ - 0.012], [0.61, 0.856, G.damperZ + 0.012], M.actionWood);
  // legs (turned, on brass casters) and the lyre
  const leg = (x: number, z: number) => {
    mb.with(translate(x, 0, z), () => {
      lathe(mb, [[0.0, 0.03], [0.028, 0.03], [0.03, 0.06], [0.024, 0.12], [0.03, 0.28], [0.042, 0.44], [0.05, 0.52], [0.05, 0.6], [0.06, 0.62], [0, 0.62]], 20, M.lacquer);
      ellipsoid(mb, [0, 0.022, 0], [0.022, 0.022, 0.012], 14, M.brass);
    });
  };
  leg(xL + 0.08, 0.36);
  leg(xR - 0.08, 0.36);
  leg(-0.2, zTail - 0.35);
  // lyre: two posts and the pedal box
  for (const x of [-0.11, 0.11]) mb.with(translate(x, 0, 0.32), () => lathe(mb, [[0, 0.1], [0.018, 0.1], [0.012, 0.3], [0.016, 0.5], [0.02, 0.6], [0, 0.6]], 14, M.lacquer));
  bbox(mb, [-0.16, 0.035, 0.24], [0.16, 0.115, 0.36], M.lacquer, 0.01);
  bbox(mb, [-0.13, 0.6, 0.28], [0.13, 0.63, 0.36], M.lacquer, 0.006);
  // ---- the plate (gilt cast iron): front web over the pin block, rim flange, struts, capo bar
  const web: [number, number][] = [[xL + RIM, 0.17], [xR - RIM, 0.17]];
  const backEdge = geo
    .filter((_, i) => i % 3 === 0 || i === geo.length - 1)
    .map((g) => {
      const a = g.strings[0].a;
      return [a[0], Math.max(0.24, a[2] - 0.014)] as [number, number];
    })
    .sort((p, q) => q[0] - p[0]);
  web.push([xR - RIM, backEdge[0][1]], ...backEdge, [xL + RIM, backEdge[backEdge.length - 1][1]]);
  extrude(mb, web, G.plateY - 0.012, G.plateY, M.plate, { smooth: 0.95 });
  band(mb, inner.slice(4, -2), 0.075, G.plateY - 0.018, G.plateY - 0.004, M.plate);
  const strut = (a: [number, number], b: [number, number], w: number) => {
    const dz = b[1] - a[1];
    const dx = b[0] - a[0];
    const l = Math.hypot(dx, dz);
    const nx = (-dz / l) * w;
    const nz = (dx / l) * w;
    extrude(mb, [[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]], G.plateY - 0.03, G.plateY - 0.006, M.plate, { smooth: 0.5 });
  };
  const treb = (m: number) => geo[m - 21];
  for (const m of [66, 87]) {
    const g0 = treb(m);
    const g1 = treb(m + 1);
    const x = (g0.strike[0] + g1.strike[0]) / 2;
    const zEnd = Math.max(tb(g0)[2], tb(g1)[2]) + 0.05;
    strut([x, 0.3], [x, zEnd], 0.016);
  }
  if (bass.length) {
    const g = bass[bass.length - 1];
    const s = g.strings[g.strings.length - 1];
    strut([s.a[0] + 0.012, s.a[2] - 0.02], [s.b[0] + 0.03, s.b[2] + 0.06], 0.014);
    strut([xL + 0.08, 0.3], [bassEnd[0] - 0.08, zTail - 0.12], 0.016);
  }
  // capo d'astro bar over the treble strings
  const capo = treb(70).strings[0].a;
  box(mb, [capo[0] - 0.004, G.strY + 0.003, capo[2] - 0.022], [xR - RIM, G.strY + 0.02, capo[2] - 0.004], M.plate);
  // tuning pins (one per string) and the bridges
  for (const g of geo)
    for (const s of g.strings) {
      cyl(mb, [s.pin[0], G.plateY - 0.01, s.pin[2]], [s.pin[0], s.pin[1] + 0.012, s.pin[2]], 0.0034, 0.0034, 8, M.steel, false);
      cyl(mb, [s.pin[0], s.pin[1] - 0.004, s.pin[2]], [s.pin[0], s.pin[1] + 0.003, s.pin[2]], 0.0042, 0.0042, 8, M.steel, false);
    }
  const bridgeLine = (gs: KeyGeo[]) =>
    spline(
      gs.filter((_, i) => i % 4 === 0 || i === gs.length - 1).map((g) => {
        const s = g.strings[Math.floor(g.strings.length / 2)];
        return [s.b[0], s.b[2]] as [number, number];
      }),
      3,
    );
  band(mb, bridgeLine(treble).map(([x, z]) => [x, z - 0.01] as [number, number]), 0.022, G.boardY, G.strY - 0.003, M.maple);
  if (bass.length > 1) band(mb, bridgeLine(bass).map(([x, z]) => [x - 0.012, z - 0.004] as [number, number]), 0.026, G.boardY, G.bassStrY - 0.003, M.maple);
  // ---- the action parts (instanced per key)
  const parts: Record<string, Mesh> = {};
  {
    // wippen (in its pivot's frame): body, its flange, the repetition lever's support post
    const w = new MeshBuilder();
    box(w, [-0.004, -0.008, -0.01], [0.004, 0.006, 0.006], M.hornbeam);
    prismX(w, [[0.0, -0.006], [0.13, -0.004], [0.13, 0.008], [0.0, 0.006]], -0.0042, 0.0042, M.actionWood);
    box(w, [-0.0043, -0.012, 0.032], [0.0043, -0.004, 0.045], M.buckskin); // the heel on the capstan
    box(w, [-0.0035, 0.008, G.repZ - G.wipZ - 0.004], [0.0035, 0.024, G.repZ - G.wipZ + 0.004], M.actionWood);
    parts.wippen = w.build();
    // jack (in its heel's frame): an upright piece with a toe towards the let-off button
    const j = new MeshBuilder();
    prismX(j, [[-0.004, 0], [0.004, 0], [0.004, 0.036], [-0.003, 0.036], [-0.009, 0.016], [-0.004, 0.013]], -0.0035, 0.0035, M.hornbeam);
    parts.jack = j.build();
    // repetition lever (in its pivot's frame), with the window the jack passes through
    const r = new MeshBuilder();
    prismX(r, [[-0.012, -0.003], [0.052, 0.0], [0.052, 0.006], [-0.012, 0.004]], -0.003, 0.003, M.hornbeam);
    cyl(r, [0.003, 0.001, -0.008], [0.003, 0.001, 0.008], 0.0012, 0.0012, 6, M.steel, false);
    parts.rep = r.build();
    // hammer shank and knuckle (in the centre pin's frame; the shank runs towards +z)
    const s = new MeshBuilder();
    cyl(s, [0, 0, -0.004], [0, 0.0005, G.shankLen + 0.004], 0.0036, 0.0033, 8, M.hornbeam);
    cyl(s, [-0.0045, -0.0055, 0.018], [0.0045, -0.0055, 0.018], 0.0055, 0.0055, 12, M.buckskin);
    parts.shank = s.build();
    // hammer head (moulding + felt), its centre on the shank's end; scaled per key
    const h = new MeshBuilder();
    prismX(h, [[-0.009, 0.0], [0.016, 0.0], [0.016, 0.006], [0.008, 0.016], [-0.008, 0.016]], -0.0055, 0.0055, M.maple);
    const felt: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (i / 12);
      felt.push([Math.cos(a) * 0.0065, 0.039 + Math.sin(a) * 0.0065]);
    }
    prismX(h, [[-0.0105, 0.012], [0.0105, 0.012], ...felt], -0.0058, 0.0058, M.hammerFelt);
    parts.head = h.build();
    // damper underlever (in its pivot's frame, extending forward to −z) with the wire and the head
    const u = new MeshBuilder();
    box(u, [-0.0045, -0.004, -0.13], [0.0045, 0.008, 0.008], M.actionWood);
    box(u, [-0.0046, -0.008, -0.115], [0.0046, -0.004, -0.1], M.redFelt);
    parts.under = u.build();
    const d = new MeshBuilder();
    cyl(d, [0, -0.17, 0], [0, 0.0, 0], 0.0011, 0.0011, 6, M.steel, false);
    box(d, [-0.0062, 0.004, -0.014], [0.0062, 0.03, 0.014], M.actionWood);
    box(d, [-0.006, 0.0, -0.013], [0.006, 0.004, 0.013], M.damperFelt);
    parts.damper = d.build();
  }
  // ---- soundboard (lives: its modes) under the strings, behind the belly rail
  const sb = new MeshBuilder();
  const boardPoly = clipZ(closedInner, G.bellyZ);
  const bx0 = Math.min(...boardPoly.map((p) => p[0]));
  const bx1 = Math.max(...boardPoly.map((p) => p[0]));
  const bz0 = G.bellyZ;
  const bz1 = Math.max(...boardPoly.map((p) => p[1]));
  extrude(sb, boardPoly, G.boardY - 0.01, G.boardY, M.spruce, { top: true, uv: (x, z) => [(x - bx0) / (bx1 - bx0), (z - bz0) / (bz1 - bz0)] });
  // ---- the lid (hinged on the spine) and its prop; the pedals
  const lidPoly: [number, number][] = clipZ([...outer, [xL, 0.16], [xR, 0.16]] as [number, number][], 0.165);
  const lm = new MeshBuilder();
  extrude(lm, lidPoly, G.rimTop + 0.001, G.rimTop + 0.022, M.lacquer, { smooth: 0.95 });
  const pedals: { mesh: Mesh; pivot: Vec3 }[] = [];
  for (const x of [-0.055, 0, 0.055]) {
    const p = new MeshBuilder();
    tube(p, [[x, 0.075, 0.3], [x, 0.075, 0.2], [x, 0.07, 0.14], [x, 0.068, 0.1]], 0.006, 10, M.brass, { caps: true, flat: 0.5 });
    bbox(p, [x - 0.017, 0.062, 0.07], [x + 0.017, 0.074, 0.115], M.brass, 0.004);
    pedals.push({ mesh: p.build(), pivot: [x, 0.075, 0.3] });
  }
  const prop = { base: [xR - 0.18, G.rimTop, 0.95] as Vec3, tipLocal: [xR - 0.2, G.rimTop, 0.98] as Vec3 };
  return {
    kind: 'grand',
    sig: sigOf(keys),
    statics: [mb.build()],
    board: sb.build(),
    boardAspect: (bz1 - bz0) / (bx1 - bx0),
    keys: geo,
    parts,
    lid: lm.build(),
    lidHinge: [xL, G.rimTop + 0.011, 0],
    prop,
    pedals,
    bounds: { c: [0, 0.6, (zTail - 0.1) / 2], r: Math.max(1.3, zTail * 0.62) },
    floorY: 0,
    src: [0, 1.0, 0.9],
  };
}

// ================================================================ upright
const U = {
  keyLen: 0.38,
  balZ: 0.2,
  stickTop: KEY_TOP - 0.003,
  capZ: 0.33,
  wipPivot: [0.42, 0.805] as [number, number],
  buttPivot: [0.4, 0.885] as [number, number],
  shank: 0.155,
  strZ: 0.475,
  plateZ: 0.49,
  boardZ: 0.535,
  back: 0.64,
  top: 1.245,
  dampPivot: [0.442, 0.87] as [number, number],
  blow: 0.045,
};
export function buildUprightModel(keys: KeySummary[]): PianoModel {
  const geo: KeyGeo[] = [];
  const yStrike = U.buttPivot[1] + U.shank;
  const CROSS = 0.3; // the bass strings lean towards the treble at the bottom
  for (const k of keys) {
    const m = k.midi;
    const wound = isWound(k);
    const L = Math.min(1.12, Math.max(0.04, k.lengthM));
    const beta = strikeBeta(m);
    const z = wound ? U.strZ - 0.012 : U.strZ;
    const dir: Vec3 = wound ? [Math.sin(CROSS), -Math.cos(CROSS), 0] : [0, -1, 0];
    const strike: Vec3 = [actX(m), yStrike, z];
    const n = Math.max(1, k.nStrings);
    const strings: StringRun[] = [];
    for (let j = 0; j < n; j++) {
      const dx = (j - (n - 1) / 2) * (wound ? 0.0042 : 0.0034);
      const a: Vec3 = [strike[0] + dx - dir[0] * beta * L, strike[1] - dir[1] * beta * L, z];
      const b: Vec3 = [a[0] + dir[0] * L, a[1] + dir[1] * L, z];
      const pin: Vec3 = [a[0] + dx * 0.3, Math.max(a[1] + 0.035, 1.12 + 0.03 * (j % 2)), z - 0.012];
      const hitch: Vec3 = [b[0] + dir[0] * 0.06, b[1] + dir[1] * 0.06, z + 0.006];
      strings.push({ pin, a, b, hitch });
    }
    const damper: Vec3 | null = k.hasDamper ? [strike[0] - dir[0] * 0.035, strike[1] + 0.035, z] : null;
    const hs = 1.2 - 0.35 * ((m - 21) / 87);
    geo.push({ midi: m, i: m - 21, k, wound, strings, strike, damper, hs, key: keyMesh(m, U.keyLen, U.stickTop, U.capZ, 0.065, null) });
  }
  const xL = -0.655;
  const xR = 0.655;
  const mb = new MeshBuilder();
  // case: sides (with the arms at the keyboard), top, back, plinth, kneeboard, legs
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? xL : xR - 0.03;
    const x1 = s < 0 ? xL + 0.03 : xR;
    bbox(mb, [x0, 0.04, 0.09], [x1, U.top - 0.02, U.back], M.lacquer, 0.006);
    bbox(mb, [x0, 0.66, -0.03], [x1, 0.79, 0.09], M.lacquer, 0.006);
    bbox(mb, [s < 0 ? xL : 0.611, 0.66, -0.03], [s < 0 ? -0.611 : xR, 0.775, 0.09], M.lacquer, 0.004);
    // the leg under the arm, on a toe
    bbox(mb, [x0 + 0.002, 0.02, -0.02], [x1 - 0.002, 0.66, 0.02], M.lacquer, 0.006);
    bbox(mb, [x0, 0.0, -0.04], [x1, 0.03, 0.09], M.lacquer, 0.006);
  }
  bbox(mb, [xL - 0.012, U.top - 0.022, 0.0], [xR + 0.012, U.top, U.back + 0.01], M.lacquer, 0.006);
  box(mb, [xL, 0.04, U.back - 0.02], [xR, U.top - 0.02, U.back], M.lacquerSatin);
  box(mb, [xL, 0.0, 0.08], [xR, 0.04, U.back], M.lacquer);
  box(mb, [xL + 0.03, 0.06, 0.09], [xR - 0.03, 0.655, 0.11], M.lacquer);
  // keybed, key slip, rails
  box(mb, [xL + 0.03, 0.655, -0.03], [xR - 0.03, 0.693, 0.44], M.lacquerSatin);
  bbox(mb, [-0.611, 0.69, -0.032], [0.611, 0.712, -0.016], M.lacquer, 0.002);
  box(mb, [-0.611, 0.693, 0.01], [0.611, 0.7, 0.03], M.redFelt);
  box(mb, [-0.611, 0.693, U.balZ - 0.012], [0.611, 0.7, U.balZ + 0.012], M.actionWood);
  // the fallboard, open, folded up under the top
  bbox(mb, [xL + 0.03, 0.78, 0.04], [xR - 0.03, 0.8, 0.16], M.lacquer, 0.003);
  // pedals (two) come through the kneeboard; the pin block, plate, soundboard and back posts
  const pedals: { mesh: Mesh; pivot: Vec3 }[] = [];
  for (const x of [-0.045, 0.045]) {
    const p = new MeshBuilder();
    tube(p, [[x, 0.07, 0.1], [x, 0.068, 0.04], [x, 0.064, -0.02]], 0.006, 10, M.brass, { caps: true, flat: 0.5 });
    bbox(p, [x - 0.016, 0.056, -0.06], [x + 0.016, 0.068, -0.015], M.brass, 0.004);
    pedals.push({ mesh: p.build(), pivot: [x, 0.07, 0.1] });
  }
  box(mb, [xL + 0.03, 1.08, U.plateZ + 0.005], [xR - 0.03, U.top - 0.025, U.boardZ + 0.02], M.maple);
  const plateFront = U.plateZ - 0.004;
  const frame = (x0: number, y0: number, x1: number, y1: number) => box(mb, [x0, y0, plateFront], [x1, y1, U.plateZ + 0.012], M.plate);
  frame(xL + 0.035, 1.07, xR - 0.035, 1.2);
  frame(xL + 0.035, 0.07, xR - 0.035, 0.16);
  frame(xL + 0.035, 0.07, xL + 0.085, 1.2);
  frame(xR - 0.085, 0.07, xR - 0.035, 1.2);
  const bassBreak = (actX(45) + actX(46)) / 2 + 0.02;
  // struts along the string directions
  const strutLine = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const T = chain(translate(x0, y0, 0), rotZ(Math.atan2(y1 - y0, x1 - x0)));
    mb.with(T, () => box(mb, [0, -w, plateFront - 0.006], [Math.hypot(x1 - x0, y1 - y0), w, U.plateZ + 0.012], M.plate));
  };
  strutLine(bassBreak, 1.08, bassBreak + 0.16, 0.16, 0.014);
  strutLine((actX(66) + actX(67)) / 2, 1.08, (actX(66) + actX(67)) / 2, 0.55, 0.013);
  strutLine((actX(84) + actX(85)) / 2, 1.08, (actX(84) + actX(85)) / 2, 0.8, 0.012);
  const ub = new MeshBuilder();
  const ux0 = xL + 0.03;
  const ux1 = xR - 0.03;
  const uy0 = 0.08;
  const uy1 = 1.1;
  // the soundboard, a vertical plate behind the strings (its modes live)
  ub.with(new Float32Array([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, U.boardZ, 1]), () =>
    extrude(ub, [[ux0, uy0], [ux1, uy0], [ux1, uy1], [ux0, uy1]], -0.01, 0, M.spruce, { uv: (x, y) => [(x - ux0) / (ux1 - ux0), (y - uy0) / (uy1 - uy0)] }),
  );
  box(mb, [xL + 0.03, 0.04, U.boardZ + 0.012], [xR - 0.03, U.top - 0.025, U.boardZ + 0.03], M.spruceBare);
  for (const x of [-0.45, -0.15, 0.15, 0.45]) box(mb, [x - 0.03, 0.04, U.boardZ + 0.03], [x + 0.03, U.top - 0.025, U.back - 0.02], M.spruceBare);
  // bridges on the soundboard (vertical bands along the bridge pins)
  const ub2 = (gs: KeyGeo[], dz: number) => {
    const pts = gs.filter((_, i) => i % 3 === 0 || i === gs.length - 1).map((g) => g.strings[0].b);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const T = chain(translate(a[0], a[1], 0), rotZ(Math.atan2(b[1] - a[1], b[0] - a[0])));
      mb.with(T, () => box(mb, [-0.004, -0.012, a[2] + 0.004 + dz], [Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.004, 0.012, U.boardZ - 0.01], M.maple));
    }
  };
  ub2(geo.filter((g) => !g.wound), 0);
  ub2(geo.filter((g) => g.wound), 0);
  // tuning pins: out of the pin block through the plate, towards the player
  for (const g of geo)
    for (const s of g.strings) cyl(mb, [s.pin[0], s.pin[1], U.plateZ - 0.004], [s.pin[0], s.pin[1], s.pin[2] - 0.012], 0.0034, 0.0034, 8, M.steel);
  // pressure bar over the treble strings' tops
  const pTop = Math.min(...geo.filter((g) => !g.wound).map((g) => g.strings[0].a[1]));
  void pTop;
  // action: brackets, main rail, hammer rail (the shanks rest on it), damper rail, let-off rail
  for (const x of [-0.6, -0.3, 0.0, 0.3, 0.6]) {
    const prof: [number, number][] = [[0.38, 0.7], [0.46, 0.7], [0.46, 0.73], [0.43, 0.96], [0.4, 1.02], [0.37, 0.96], [0.39, 0.73]];
    prismX(mb, prof, x - 0.004, x + 0.004, M.castAction);
  }
  box(mb, [-0.615, 0.85, 0.405], [0.615, 0.875, 0.435], M.actionWood);
  box(mb, [-0.615, 0.95, 0.372], [0.615, 0.97, 0.385], M.actionWood);
  box(mb, [-0.615, 0.952, 0.385], [0.615, 0.968, 0.389], M.redFelt);
  box(mb, [-0.615, 0.83, 0.358], [0.615, 0.838, 0.37], M.actionWood);
  box(mb, [-0.615, 1.008, 0.45], [0.615, 1.02, 0.46], M.actionWood);
  // parts
  const parts: Record<string, Mesh> = {};
  {
    // wippen (pivot at its back on the main rail): body forward to the capstan, the jack's seat,
    // the backcheck wire and felt at the front, the spoon behind, the bridle wire
    const w = new MeshBuilder();
    prismX(w, [[-0.095, -0.012], [0.004, -0.008], [0.006, 0.006], [-0.03, 0.014], [-0.095, 0.004]], -0.0045, 0.0045, M.actionWood);
    box(w, [-0.0046, -0.018, -0.095], [0.0046, -0.012, -0.08], M.buckskin);
    cyl(w, [0, 0.004, -0.07], [0, 0.07, -0.062], 0.0011, 0.0011, 6, M.steel, false);
    box(w, [-0.004, 0.064, -0.07], [0.004, 0.084, -0.06], M.actionWood);
    box(w, [-0.0041, 0.066, -0.06], [0.0041, 0.082, -0.0565], M.buckskin);
    tube(w, [[0, 0.004, 0.0], [0, 0.03, 0.012], [0, 0.055, 0.022]], 0.0013, 6, M.nickel);
    cyl(w, [0.004, 0.006, -0.045], [0.004, 0.05, -0.05], 0.0007, 0.0007, 5, M.steel, false);
    parts.wippen = w.build();
    const j = new MeshBuilder();
    prismX(j, [[-0.004, 0], [0.004, 0], [0.004, 0.062], [-0.004, 0.062], [-0.004, 0.024], [-0.012, 0.02], [-0.012, 0.015], [-0.004, 0.015]], -0.0035, 0.0035, M.hornbeam);
    parts.jack = j.build();
    // hammer (pivot on the butt flange): butt, catcher (towards the player), shank up, head
    const s = new MeshBuilder();
    prismX(s, [[-0.012, -0.01], [0.012, -0.01], [0.012, 0.016], [-0.012, 0.016]], -0.005, 0.005, M.hornbeam);
    box(s, [-0.0051, -0.012, -0.006], [0.0051, -0.01, 0.01], M.buckskin);
    cyl(s, [0, 0.004, -0.012], [0, 0.0, -0.034], 0.0016, 0.0016, 6, M.hornbeam, false);
    ellipsoid(s, [0, -0.002, -0.036], [0.0045, 0.008, 0.004], 10, M.buckskin);
    cyl(s, [0, 0.014, 0], [0, U.shank - 0.012, 0.0], 0.0034, 0.0032, 8, M.hornbeam);
    parts.shank = s.build();
    const h = new MeshBuilder();
    // head on the shank's top: moulding, then felt facing +z (the strings)
    prismX(h, [[-0.006, -0.016], [0.006, -0.016], [0.012, -0.008], [0.012, 0.008], [0.006, 0.016], [-0.006, 0.016]], -0.0055, 0.0055, M.maple);
    const felt: [number, number][] = [[0.01, -0.012], [0.03, -0.006]];
    for (let i = 1; i < 12; i++) {
      const a = -Math.PI / 2 + Math.PI * (i / 12);
      felt.push([0.033 + Math.cos(a) * 0.006, Math.sin(a) * 0.006]);
    }
    felt.push([0.03, 0.006], [0.01, 0.012]);
    prismX(h, felt, -0.0058, 0.0058, M.hammerFelt);
    parts.head = h.build();
    // damper lever (pivot near the main rail): lever up behind the hammer, its wire, the head and felt
    const d = new MeshBuilder();
    box(d, [-0.004, -0.006, -0.004], [0.004, 0.11, 0.008], M.actionWood);
    box(d, [-0.0041, -0.004, -0.008], [0.0041, 0.014, -0.004], M.redFelt);
    cyl(d, [0.0068, 0.1, 0.004], [0.0068, 0.205, 0.016], 0.001, 0.001, 6, M.steel, false);
    box(d, [-0.006, 0.192, 0.01], [0.0075, 0.226, 0.024], M.actionWood);
    box(d, [-0.0058, 0.194, 0.024], [0.0072, 0.224, 0.031], M.damperFelt);
    parts.damper = d.build();
  }
  return {
    kind: 'upright',
    sig: sigOf(keys),
    statics: [mb.build()],
    board: ub.build(),
    boardAspect: (uy1 - uy0) / (ux1 - ux0),
    keys: geo,
    parts,
    lid: null,
    lidHinge: [0, 0, 0],
    prop: null,
    pedals,
    bounds: { c: [0, 0.62, 0.3], r: 1.0 },
    floorY: 0,
    src: [0, 1.1, 0.3],
  };
}

// ================================================================ posing, per frame
export interface PianoPose {
  keyPos: Float32Array;
  /** smoothed jack escape per key (0 under the knuckle … 1 tipped out) */
  jack: Float32Array;
  pedal: [number, number];
}
export const newPianoPose = (): PianoPose => ({ keyPos: new Float32Array(88), jack: new Float32Array(88), pedal: [0, 0] });

export interface PianoIn {
  piano: PianoState;
  keys: KeySummary[];
  dt: number;
  lid: number;
  down: (m: number) => boolean;
  sounding: (m: number) => boolean;
  lite: boolean;
}

const C = {
  verm: (a: number) => ink(INK.vermilion, a),
  amber: (a: number) => ink(INK.amber, a),
};

function ptsOf(keys: KeySummary[]): Pt[] {
  return keys.map((k) => ({ midi: k.midi, i: k.midi - 21, x: actX(k.midi), w: PITCH, L: k.lengthM, k, wound: isWound(k) }));
}

/** ease towards a target with a time constant (s), frame-rate independent */
const ease = (v: number, target: number, dt: number, tau: number) => v + (target - v) * (1 - Math.exp(-dt / tau));

export function posePiano(b: Batch, pm: PianoModel, si: PianoIn, pose: PianoPose): void {
  const ps = si.piano;
  stepAction(ptsOf(si.keys), ps);
  for (const s of pm.statics) b.mesh(s);
  b.mesh(pm.board);
  const grand = pm.kind === 'grand';
  for (const g of pm.keys) {
    const i = g.i;
    const held = si.down(g.midi);
    pose.keyPos[i] = ease(pose.keyPos[i], held ? 1 : 0, si.dt, held ? 0.018 : 0.04);
    const kp = pose.keyPos[i];
    const sounding = si.sounding(g.midi);
    const hr = ps.hammer[i]; // 0 rest … 1 at the string
    // the jack tips out as the hammer leaves it (escapement) and resets as the key rises
    pose.jack[i] = ease(pose.jack[i], hr > 0.45 || (held && hr > 0.2) ? 1 : held ? pose.jack[i] : 0, si.dt, 0.03);
    const glow = sounding ? VERM : held ? ([0.95, 0.65, 0.27, 0.12] as RGBA) : null;
    if (grand) {
      // key about its balance pin (front down)
      const kA = (kp * 0.01) / G.balZ;
      const keyM = about([0, G.stickTop - 0.011, G.balZ], rotX(-kA));
      b.mesh(g.key, keyM, glow);
      if (si.lite && g.midi % 2 && !held && hr < 0.05) continue;
      const x = g.strike[0];
      // wippen: lifted by the capstan
      const capRise = kA * (G.capZ - G.balZ);
      const wA = capRise / (G.capZ - G.wipZ);
      const wipM = chain(translate(x, G.wipY, G.wipZ), rotX(-wA));
      b.mesh(pm.parts.wippen, wipM);
      const jackM = mul(wipM, chain(translate(0, -0.002, G.jackZ - G.wipZ), rotX(0.32 * pose.jack[i])));
      b.mesh(pm.parts.jack, jackM, hr > 0.05 && pose.jack[i] < 0.5 ? [1, 0.37, 0.22, 0.25] : null);
      // hammer: the stage's action state sets its rise; bass hammers have further to go
      const blow = g.strike[1] - (G.shankY + 0.0035 + 0.0455 * g.hs);
      const sA = Math.atan2(hr * blow, G.shankLen);
      const shankM = chain(translate(x, G.shankY, G.flangeZ), rotX(-sA));
      // repetition lever: spring-loaded up under the knuckle
      const repA = Math.min(0.18, Math.max(0, hr * blow * 0.15) / 0.045 + wA * 0.3);
      b.mesh(pm.parts.rep, mul(wipM, chain(translate(0, 0.026, G.repZ - G.wipZ), rotX(-repA))));
      b.mesh(pm.parts.shank, shankM);
      const headM = mul(shankM, chain(translate(0, 0.0035, G.shankLen), scaleM(1, g.hs, g.hs)));
      b.mesh(pm.parts.head, headM, hr > 0.6 ? [1, 0.37, 0.22, 0.6 * hr] : null);
      // damper: the underlever lifted by the key's tail (or the pedal), the head off the string
      if (g.damper) {
        const lift = ps.damper[i] * 0.009;
        const ulM = chain(translate(g.damper[0], G.ulY, G.ulPivotZ), rotX(lift / 0.1));
        b.mesh(pm.parts.under, ulM);
        b.mesh(pm.parts.damper, translate(g.damper[0], g.damper[1] + 0.0012 + lift, g.damper[2]), ps.damper[i] > 0.3 ? [0.95, 0.65, 0.27, 0.18] : null);
      }
    } else {
      const kA = (kp * 0.01) / U.balZ;
      const keyM = about([0, U.stickTop - 0.011, U.balZ], rotX(-kA));
      b.mesh(g.key, keyM, glow);
      if (si.lite && g.midi % 2 && !held && hr < 0.05) continue;
      const x = g.strike[0];
      const capRise = kA * (U.capZ - U.balZ);
      const wA = capRise / (U.wipPivot[0] - U.capZ);
      const wipM = chain(translate(x, U.wipPivot[1], U.wipPivot[0]), rotX(wA));
      b.mesh(pm.parts.wippen, wipM);
      b.mesh(pm.parts.jack, mul(wipM, chain(translate(0, 0.004, -0.024), rotX(-0.3 * pose.jack[i]))), hr > 0.05 && pose.jack[i] < 0.5 ? [1, 0.37, 0.22, 0.25] : null);
      const reach = g.strike[2] - (U.buttPivot[0] + 0.039 * g.hs);
      const hA = Math.asin(Math.min(0.9, (hr * reach) / U.shank));
      const shankM = chain(translate(x, U.buttPivot[1], U.buttPivot[0]), rotX(hA));
      b.mesh(pm.parts.shank, shankM);
      b.mesh(pm.parts.head, mul(shankM, chain(translate(0, U.shank, 0), scaleM(1, g.hs, g.hs))), hr > 0.6 ? [1, 0.37, 0.22, 0.6 * hr] : null);
      if (g.damper) {
        const off = ps.damper[i] * 0.07;
        b.mesh(pm.parts.damper, chain(translate(x, U.dampPivot[1], U.dampPivot[0] + g.strike[2] - U.strZ), rotX(-off * 0.5)), ps.damper[i] > 0.3 ? [0.95, 0.65, 0.27, 0.18] : null);
      }
    }
  }
  // pedals: soft (left) and sustain (right) from the engine
  pose.pedal[0] = ease(pose.pedal[0], ps.soft, si.dt, 0.05);
  pose.pedal[1] = ease(pose.pedal[1], ps.sustain, si.dt, 0.05);
  pm.pedals.forEach((p, k) => {
    const v = k === 0 ? pose.pedal[0] : k === pm.pedals.length - 1 ? pose.pedal[1] : 0;
    b.mesh(p.mesh, about(p.pivot, rotX(-0.12 * v)), v > 0.3 ? [0.95, 0.65, 0.27, 0.15] : null);
  });
  // the lid on its hinge, and its prop
  if (pm.lid) {
    const ang = si.lid * 0.7;
    const h = pm.lidHinge;
    const lidM = about(h, rotZ(ang));
    b.mesh(pm.lid, lidM);
    if (pm.prop && si.lid > 0.03) {
      const tip = xform(lidM, pm.prop.tipLocal);
      propStick(b, pm.prop.base, tip);
    }
  }
}

const propCache = new Map<string, Mesh>();
function propStick(b: Batch, a: Vec3, c: Vec3): void {
  const key = `${a.map((v) => v.toFixed(3))}${c.map((v) => v.toFixed(3))}`;
  let m = propCache.get(key);
  if (!m) {
    const mb = new MeshBuilder();
    cyl(mb, a, c, 0.009, 0.008, 10, M.lacquer);
    m = mb.build();
    if (propCache.size > 32) propCache.clear();
    propCache.set(key, m);
  }
  b.mesh(m);
}

/** the strings: still ones as steel and copper lines, sounding ones glowing, every sounding
 *  string's live shape (the engine's) drawn along its speaking length */
export function pianoStrings(b: Batch, pm: PianoModel, fr: VisualFrame | null, sc: (mx: number) => number, lite: boolean): void {
  const lv = fr?.levels;
  const sym = fr?.symLevels;
  let lvMax = 0;
  if (lv) for (let i = 0; i < lv.length; i++) lvMax = Math.max(lvMax, lv[i]);
  const grand = pm.kind === 'grand';
  for (const g of pm.keys) {
    const l = lv && lvMax > 0 ? Math.sqrt(lv[g.i] / lvMax) : 0;
    const s = sym ? Math.min(1, sym[g.i]) : 0;
    const base: RGBA = g.wound ? [0.72, 0.5, 0.33, 0.7] : [0.72, 0.74, 0.77, 0.32];
    for (const r of g.strings) {
      if (!(lite && g.midi % 2)) b.ink([r.pin, r.a, r.b, r.hitch], base, g.wound ? 1.5 : 0.9);
      if (l > 0.03) b.line([r.a, r.b], C.verm(0.12 + 0.5 * l), 1.4);
      else if (s > 0.03) b.line([r.a, r.b], C.amber(0.06 + 0.35 * s), 1.2);
    }
  }
  const shapes = fr?.pianoShapes;
  if (shapes && shapes.midi.length) {
    let mx = 0;
    for (let i = 0; i < shapes.shapes.length; i++) mx = Math.max(mx, Math.abs(shapes.shapes[i]));
    const scl = sc(mx);
    const P = shapes.points;
    for (let j = 0; j < shapes.midi.length; j++) {
      const g = pm.keys[shapes.midi[j] - 21];
      if (!g) continue;
      const symS = shapes.light[j] === 1;
      const rel = symS ? (sym?.[g.i] ?? 0) : 1;
      if (symS && rel < 0.03) continue;
      const r = g.strings[Math.floor(g.strings.length / 2)];
      const line: Vec3[] = [];
      for (let i = 0; i < P; i++) {
        const q = lerp3(r.a, r.b, i / (P - 1));
        const d = (shapes.shapes[j * P + i] / scl) * 0.012;
        if (grand) q[1] += d;
        else q[2] -= d;
        line.push(q);
      }
      b.line(line, symS ? C.amber(Math.min(0.55, 0.1 + 0.6 * rel)) : C.verm(0.95), symS ? 1.2 : 2.2);
    }
  }
}

/** the soundboard's live modes onto the plate overlay */
export function boardOverlay(b: Batch, pm: PianoModel, amps: Float32Array): void {
  b.ov.amps.set(amps);
  b.ov.mn.set(plateModes(pm.boardAspect));
  b.ov.modalGain = 0.7;
}

/** for clicking a note's strings: each key's speaking length in world space */
export function pianoPickSegments(pm: PianoModel): { midi: number; a: Vec3; b: Vec3 }[] {
  return pm.keys.map((g) => {
    const r = g.strings[Math.floor(g.strings.length / 2)];
    return { midi: g.midi, a: r.a, b: r.b };
  });
}
export type { Mat4 };
