// The flute and the trumpet in 3D, built once and posed from the live state.
//
// Flute (Boehm C flute with a C foot; dimensions after Boehm's "Die Flöte und das Flötenspiel"
// and modern Powell/Muramatsu drawings): 19 mm bore, about 670 mm long; headjoint with crown,
// lip plate and embouchure hole (≈12 × 10 mm) 37 mm from the closed end; body and foot with tone
// holes placed at the engine's own sounding lengths (tubeFor), each closed by a padded cup on an
// arm from a rod running along the tube on posts; five open-hole (French) cups; the foot's keys
// on rollers; the thumb key underneath. Live: cups closing for the fingering (covered up to the
// sounding end, open beyond, pulsing with the breath vibrato), the breath jet across the
// embouchure hole, and the bore's standing wave as a glow along the silver.
//
// Trumpet (B♭, after the Bach Stradivarius 37 layout as described in Bach's and Yamaha's
// anatomy guides): mouthpiece in the receiver, leadpipe to the main tuning slide in front of the
// valves, three piston valves (casings, top and bottom caps, stems, pearl buttons), the first
// slide forward with its thumb saddle, the third slide back towards the player with its ring, the
// short second slide, the bell tail back to the bell bow and the bell pipe forward to a 123 mm
// bell (a Bessel-like flare). 11.7 mm bore. Live: pistons pressed for the engine's fingering
// ("valves 1+3 · partial 4"), the pressed valves' slides joining the glowing air path, the lips
// buzzing at the rim, and the bore's standing wave glowing along the brass.
// Approximations: keywork is simplified (no needle springs, trill keys or clutches); the
// trumpet's wrap is laid out from typical proportions, not measured from one instrument.
import type { VisualFrame } from '@piano-model/engine';
import { INK, VALVE_DOWN, tubeFor } from '../stage-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, about, add, chain, ink, rotX, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, grid, lathe, tube, type Mat } from './mesh.ts';

const C = {
  verm: (a: number) => ink(INK.vermilion, a),
  amber: (a: number) => ink(INK.amber, a),
  steel: (a: number) => ink(INK.steel, a),
};

// ================================================================ flute
const EMB = 0.037;
const R = 0.0098;
const FULL = EMB + tubeFor(60) + 0.01;
export interface FluteModel {
  T: Mat4;
  statics: Mesh[];
  cup: Mesh;
  ring: Mesh;
  holes: { x: number; m: number; ang: number; ring: boolean }[];
  bounds: { c: Vec3; r: number };
  src: Vec3;
}
/** a cup and its arm, in the frame of its hole (cup centre above the hole at the origin, the rod at −z) */
function cupMesh(ring: boolean): Mesh {
  const mb = new MeshBuilder();
  const rc = 0.0088;
  mb.with(translate(0, R + 0.0016, 0), () => {
    lathe(mb, [[ring ? 0.0028 : 0, 0.0], [rc - 0.0006, 0.0], [rc, 0.0005], [rc, 0.0026], [rc - 0.0008, 0.0034], [ring ? 0.0034 : 0, 0.0034]], 22, M.silver);
    if (ring) lathe(mb, [[0.0028, 0.0], [0.0028, 0.0034]], 14, M.silver);
    lathe(mb, [[ring ? 0.0028 : 0, -0.0006], [rc - 0.0008, -0.0006], [rc - 0.0008, 0.0]], 22, M.pad);
  });
  // the arm to the rod
  tube(mb, [[0, R + 0.0034, -0.006], [0, R + 0.002, -0.0095], [0, R - 0.002, -0.0118]], 0.0011, 6, M.silver);
  return mb.build();
}
export function buildFluteModel(): FluteModel {
  const mb = new MeshBuilder();
  // the tube: headjoint tapering to the crown; body and foot cylindrical; tenons and rings
  const sil: Mat = M.silverGlow;
  const prof: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const x = 0.012 + (i / 20) * (0.2 - 0.012);
    const t = (x - 0.012) / (0.2 - 0.012);
    prof.push([R * (0.9 + 0.1 * Math.sqrt(t)), x]);
  }
  // headjoint (lathe along y, laid along x): uv along the bore from the embouchure (0) to the foot (1)
  const toX = new Float32Array([0, 1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
  mb.with(toX, () => lathe(mb, prof, 28, M.silver));
  const glowTube = (x0: number, x1: number) => {
    const path: Vec3[] = [];
    for (let i = 0; i <= 24; i++) path.push([x0 + ((x1 - x0) * i) / 24, 0, 0]);
    tube(mb, path, R, 28, sil, { uv0: (x0 - EMB) / (FULL - EMB), uv1: (x1 - EMB) / (FULL - EMB) });
  };
  glowTube(0.2, FULL);
  // crown and cap
  mb.with(toX, () => lathe(mb, [[0, -0.006], [0.0065, -0.006], [0.0085, -0.002], [R * 0.93, 0.0], [R * 0.93, 0.012], [R * 0.9, 0.012]], 24, M.silver));
  // joint rings
  for (const x of [0.2, 0.545]) mb.with(chain(translate(x, 0, 0), toX), () => lathe(mb, [[R, -0.006], [R + 0.0008, -0.0055], [R + 0.0008, 0.0055], [R, 0.006]], 28, M.silver));
  mb.with(chain(translate(FULL, 0, 0), toX), () => lathe(mb, [[R, -0.004], [R + 0.0007, -0.0035], [R + 0.0007, 0.0], [0.0082, 0.0], [0.0082, -0.003]], 28, M.silver));
  // lip plate on its riser, around the embouchure hole
  grid(mb, 16, 12, (s, v) => {
    const a = (v - 0.5) * 1.9;
    const x = EMB - 0.0135 + s * 0.027;
    const ell = Math.sqrt(Math.max(0, 1 - ((s - 0.5) / 0.5) ** 2));
    const rr = R + 0.0026 + 0.0006 * ell;
    const span = a * (0.25 + 0.75 * ell);
    return [x + (s - 0.5) * 0.004 * Math.abs(a), Math.cos(span) * rr, Math.sin(span) * rr];
  }, M.silver, { flip: true });
  // the embouchure hole: a dark oval in the plate
  {
    const c: Vec3 = [EMB, R + 0.0034, 0];
    for (let k = 0; k < 18; k++) {
      const a0 = (k / 18) * Math.PI * 2;
      const a1 = ((k + 1) / 18) * Math.PI * 2;
      mb.tri(c, [EMB + 0.0058 * Math.cos(a1), R + 0.0033, 0.0049 * Math.sin(a1)], [EMB + 0.0058 * Math.cos(a0), R + 0.0033, 0.0049 * Math.sin(a0)], M.hole);
    }
  }
  // tone holes (chimneys) at the engine's lengths; rods along the side on posts
  const holes: FluteModel['holes'] = [];
  const rings = new Set([63, 65, 68, 70, 72]);
  for (let m = 61; m <= 73; m++) {
    const x = EMB + tubeFor(m) + 0.006;
    if (x > FULL - 0.01) continue;
    const foot = x > 0.545;
    const ang = foot ? -0.75 : 0; // the foot's keys face the player's side
    holes.push({ x, m, ang, ring: rings.has(m) });
    mb.with(chain(translate(x, 0, 0), rotX(ang)), () => cyl(mb, [0, R - 0.002, 0], [0, R + 0.0016, 0], 0.0068, 0.0068, 18, M.silver, false));
  }
  for (const [x0, x1] of [[0.235, 0.53], [0.555, FULL - 0.006]] as [number, number][]) {
    cyl(mb, [x0, R - 0.002, -0.0118], [x1, R - 0.002, -0.0118], 0.0015, 0.0015, 8, M.silver);
    // posts on a rib soldered to the tube
    for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 0.07))) {
      cyl(mb, [x, 0, -0.0085], [x, R - 0.002, -0.0118], 0.0018, 0.0016, 8, M.silver);
      ellipsoid(mb, [x, R - 0.002, -0.0118], [0.0024, 0.0024, 0.0024], 10, M.silver);
    }
    cyl(mb, [x0, -0.0005, -0.0094], [x1, -0.0005, -0.0094], 0.0012, 0.0012, 6, M.silver);
  }
  // the thumb key underneath, foot rollers
  mb.with(translate(0.29, 0, 0), () => mb.with(rotX(Math.PI), () => cyl(mb, [0, R + 0.0014, 0], [0, R + 0.004, 0], 0.0062, 0.0062, 16, M.silver)));
  for (const x of [0.62, 0.645]) cyl(mb, [x, -R * 0.4, -R - 0.006], [x + 0.012, -R * 0.4, -R - 0.006], 0.0022, 0.0022, 10, M.pearl);
  const T = chain(translate(-FULL / 2, 0.17, 0), rotX(-0.32));
  return { T, statics: [mb.build()], cup: cupMesh(false), ring: cupMesh(true), holes, bounds: { c: xform(T, [FULL / 2, 0, 0]), r: 0.42 }, src: xform(T, [FULL, 0, 0]) };
}

export interface WindPose {
  env: Float32Array;
  cups: Float32Array;
  valves: Float32Array;
}
export const newWindPose = (): WindPose => ({ env: new Float32Array(48), cups: new Float32Array(16), valves: new Float32Array(3) });

const ease = (v: number, t: number, dt: number, tau: number) => v + (t - v) * (1 - Math.exp(-dt / tau));

/** the bore's standing wave, enveloped (nodes dark, antinodes glowing), into the tube-glow overlay
 *  over the first `frac` of the tube (the rest beyond the sounding end stays dark) */
function waveOverlay(b: Batch, fr: VisualFrame | null, pose: WindPose, frac: number, scale: { of(v: number): number }): void {
  const s = fr?.focus?.shapes[0];
  const out = b.ov.wave;
  if (!s || !s.length) {
    for (let i = 0; i < 48; i++) out[i] = pose.env[i] *= 0.9;
    return;
  }
  let mx = 0;
  for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
  const sc = scale.of(mx);
  for (let i = 0; i < 48; i++) {
    const x = i / 47;
    let v = 0;
    if (x <= frac) v = Math.abs(s[Math.min(s.length - 1, Math.round((x / Math.max(1e-3, frac)) * (s.length - 1)))] / sc);
    pose.env[i] = 0.8 * pose.env[i] + 0.2 * Math.min(1.2, v);
    out[i] = pose.env[i] * 0.85;
  }
}

export function poseFlute(b: Batch, fm: FluteModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, scale: { of(v: number): number }): void {
  const T = fm.T;
  for (const s of fm.statics) b.mesh(s, T);
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  const focus = fr?.focus ?? null;
  const end = EMB + (focus ? focus.lengthM : tubeFor(60));
  waveOverlay(b, fr, pose, (end - EMB) / (FULL - EMB), scale);
  b.ov.waveCol = [1, 0.37, 0.22];
  fm.holes.forEach((h, k) => {
    const open = h.x >= end - 0.004;
    pose.cups[k] = ease(pose.cups[k], open ? 1 : 0, dt, 0.025);
    // the cup turns about the rod (at −z, just below the tube's top) to open
    const lift = pose.cups[k] * 0.26;
    const m = chain(T, translate(h.x, 0, 0), rotX(h.ang), about([0, R - 0.002, -0.0118], rotX(-lift)));
    const glow: RGBA | null = open ? null : [0.95, 0.65, 0.27, Math.min(0.6, 0.1 + 0.15 * blow + 2.5 * vib)];
    b.mesh(h.ring ? fm.ring : fm.cup, m, focus ? glow : null);
  });
  // the breath across the embouchure hole: its strength from the engine's breath pressure
  if (blow > 0.02) {
    for (let j = -2; j <= 2; j++) {
      const z = j * 0.0016;
      const jet: Vec3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        jet.push(xform(T, [EMB - 0.03 + 0.036 * t, R + 0.012 - 0.0095 * t + 0.0018 * Math.sin(now / 40 + j + t * 6) * blow, z]));
      }
      b.line(jet, C.steel(0.25 + 0.5 * blow * (1 + 4 * vib)), 1.3);
    }
  }
}

// ================================================================ trumpet
export interface TrumpetModel {
  T: Mat4;
  statics: Mesh[];
  slides: { plain: Mesh; glow: Mesh }[];
  piston: Mesh;
  valveX: number[];
  bounds: { c: Vec3; r: number };
  src: Vec3;
  rim: number;
}
const TR = 0.0062;
const VX = [0.027, 0.051, 0.075];
const CAS = 0.0105;
/** a circular arc in a plane through c, from angle a0 to a1 (radians), axes u and v */
function arc(c: Vec3, u: Vec3, v: Vec3, r: number, a0: number, a1: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([c[0] + r * (u[0] * Math.cos(a) + v[0] * Math.sin(a)), c[1] + r * (u[1] * Math.cos(a) + v[1] * Math.sin(a)), c[2] + r * (u[2] * Math.cos(a) + v[2] * Math.sin(a))]);
  }
  return out;
}
const seg = (a: Vec3, b: Vec3, n: number): Vec3[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, a[2] + ((b[2] - a[2]) * i) / n] as Vec3);
const join = (...ps: Vec3[][]): Vec3[] => ps.reduce((acc, p) => (acc.length ? [...acc, ...p.slice(1)] : p), [] as Vec3[]);

export function buildTrumpetModel(): TrumpetModel {
  const mb = new MeshBuilder();
  const X: Vec3 = [1, 0, 0];
  const Y: Vec3 = [0, 1, 0];
  // ---- the air path, mouthpiece → bell, for the glow coordinate
  const lead = seg([-0.222, 0.052, 0], [0.1, 0.038, 0], 24);
  // main slide arc: from the top through the front to the bottom
  const mainArc = arc([0.14, 0.012, 0], Y, X, 0.026, 0, Math.PI, 14);
  const mainPath = join(seg([0.1, 0.038, 0], [0.14, 0.038, 0], 3), mainArc, seg([0.14, -0.014, 0], [0.075 + CAS, -0.014, 0], 4));
  const bellTail = join(seg([VX[0], -0.025, CAS], [0.016, -0.025, 0.022], 2), seg([0.016, -0.025, 0.022], [-0.16, -0.025, 0.022], 12));
  const bow = arc([-0.16, 0.0, 0.022], [0, -1, 0], [-1, 0, 0], 0.025, 0, Math.PI, 16);
  const bellPipe = seg([-0.16, 0.025, 0.022], [0.17, 0.025, 0.022], 20);
  const len = (p: Vec3[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1], q[2] - p[i][2]), 0);
  const parts = [lead, mainPath, bellTail, bow, bellPipe];
  const valveLen = 0.07;
  const lens = parts.map(len);
  const flareLen = 0.13;
  const total = lens.reduce((a, b) => a + b, 0) + valveLen + flareLen + 0.09;
  let acc = 0.09; // the mouthpiece
  const U = (l: number) => {
    const u0 = acc / total;
    acc += l;
    return [u0, acc / total] as [number, number];
  };
  // mouthpiece (lathe along x): rim, cup, throat, backbore, shank
  const toX = new Float32Array([0, 1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
  mb.with(chain(translate(-0.312, 0.052, 0), toX), () =>
    lathe(mb, [[0.0085, 0.0], [0.0128, 0.0008], [0.0134, 0.004], [0.012, 0.009], [0.0085, 0.016], [0.0058, 0.022], [0.0058, 0.03], [0.0068, 0.05], [0.0072, 0.084], [0.0062, 0.09]], 26, M.silver),
  );
  // inside of the cup (dark)
  mb.with(chain(translate(-0.312, 0.052, 0), toX), () => lathe(mb, [[0.0085, 0.0003], [0.0072, 0.006], [0.0035, 0.014], [0.0022, 0.016]], 20, M.hole));
  const [l0, l1] = U(lens[0]);
  tube(mb, lead, (i) => 0.0046 + (TR - 0.0046) * (i / (lead.length - 1)), 18, M.brassGlow, { uv0: l0, uv1: l1 });
  // receiver ring
  cyl(mb, [-0.226, 0.052, 0], [-0.2, 0.0517, 0], 0.0078, 0.0074, 18, M.brass);
  const [m0, m1] = U(lens[1]);
  tube(mb, mainPath, TR, 18, M.brassGlow, { uv0: m0, uv1: m1 });
  // main slide's outer tubes (slightly larger, where the slide is) and the water key
  cyl(mb, [0.105, 0.038, 0], [0.128, 0.038, 0], TR + 0.0009, TR + 0.0009, 18, M.brass);
  cyl(mb, [0.105, -0.014, 0], [0.128, -0.014, 0], TR + 0.0009, TR + 0.0009, 18, M.brass);
  tube(mb, [[0.155, -0.016, 0.0], [0.16, -0.022, 0.0], [0.15, -0.028, 0.0]], 0.0018, 6, M.brass);
  const [v0, v1] = U(valveLen);
  // valve casings with top and bottom caps
  for (const x of VX) {
    const path = seg([x, -0.04, 0], [x, 0.03, 0], 6);
    tube(mb, path, CAS, 24, M.brassGlow, { uv0: v0 + ((v1 - v0) * (x - VX[0])) / 0.05, uv1: v0 + ((v1 - v0) * (x - VX[0])) / 0.05 + 0.002 });
    mb.with(translate(x, 0.03, 0), () => lathe(mb, [[CAS, 0], [CAS + 0.0014, 0.0005], [CAS + 0.0014, 0.0055], [0.0062, 0.0062], [0.0035, 0.0068], [0, 0.0068]], 24, M.brass));
    mb.with(translate(x, -0.047, 0), () => lathe(mb, [[0, -0.002], [0.007, -0.002], [CAS + 0.0013, 0.0015], [CAS + 0.0013, 0.007], [CAS, 0.0072]], 24, M.brass));
  }
  // knuckles between the casings and the braces of the valve block
  for (let k = 0; k < 2; k++) cyl(mb, [VX[k] + CAS * 0.8, -0.031, 0.0], [VX[k + 1] - CAS * 0.8, -0.031, 0.0], 0.0042, 0.0042, 12, M.brass);
  const [t0, t1] = U(lens[2]);
  tube(mb, bellTail, TR, 18, M.brassGlow, { uv0: t0, uv1: t1 });
  const [b0, b1] = U(lens[3]);
  tube(mb, bow, TR, 18, M.brassGlow, { uv0: b0, uv1: b1 });
  const [p0, p1] = U(lens[4]);
  tube(mb, bellPipe, TR, 18, M.brassGlow, { uv0: p0, uv1: p1 });
  // the bell flare (a Bessel-like horn) and its rolled rim
  const [f0, f1] = U(flareLen);
  const rimR = 0.0615;
  {
    const prof: [number, number][] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = 0.17 + t * flareLen;
      const r = TR + (rimR - TR) * Math.pow(t, 3.6) * 0.92 + (rimR - TR) * 0.08 * Math.pow(t, 12);
      prof.push([r, x]);
    }
    mb.with(chain(translate(0, 0.025, 0.022), toX), () => lathe(mb, prof, 40, M.brassGlow, [f0, f1]));
    mb.with(chain(translate(0.17 + flareLen, 0.025, 0.022), toX), () => {
      const ring: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ring.push([rimR + 0.002 * Math.cos(a), 0.002 * Math.sin(a)]);
      }
      lathe(mb, ring, 40, M.brass);
    });
  }
  // braces: leadpipe ↔ bell pipe, bell pipe ↔ valve block; finger hook on the leadpipe
  cyl(mb, [-0.12, 0.05, 0.0], [-0.12, 0.025, 0.022], 0.0028, 0.0028, 10, M.brass);
  cyl(mb, [0.13, 0.025, 0.022], [0.14, 0.036, 0.0], 0.0025, 0.0025, 10, M.brass);
  cyl(mb, [VX[2], 0.012, CAS * 0.9], [VX[2] + 0.008, 0.025, 0.017], 0.0025, 0.0025, 10, M.brass);
  tube(mb, [[0.004, 0.047, 0.0], [0.004, 0.056, 0.0], [0.0, 0.064, 0.0], [-0.008, 0.062, 0.0]], 0.0016, 8, M.brass);
  // ---- valve slides (glow when their valve sends the air through them)
  const slidePaths: Vec3[][] = [
    // 1st: forward along the far side, with the thumb saddle
    join(seg([VX[0], 0.012, CAS], [VX[0], 0.012, 0.02], 2), seg([VX[0], 0.012, 0.02], [0.112, 0.012, 0.02], 10), arc([0.112, 0.001, 0.02], Y, X, 0.011, 0, Math.PI, 10), seg([0.112, -0.01, 0.02], [VX[0], -0.01, 0.02], 10), seg([VX[0], -0.01, 0.02], [VX[0], -0.01, CAS], 2)),
    // 2nd: short, below on the near side
    join(seg([VX[1], -0.02, -CAS], [VX[1], -0.02, -0.018], 2), seg([VX[1], -0.02, -0.018], [0.03, -0.02, -0.018], 4), arc([0.03, -0.028, -0.018], Y, [-1, 0, 0], 0.008, 0, Math.PI, 8), seg([0.03, -0.036, -0.018], [VX[1], -0.036, -0.018], 4), seg([VX[1], -0.036, -0.018], [VX[1], -0.036, -CAS], 2)),
    // 3rd: back towards the player on the near side, with the ring
    join(seg([VX[2], 0.016, -CAS], [VX[2], 0.016, -0.021], 2), seg([VX[2], 0.016, -0.021], [-0.045, 0.016, -0.021], 14), arc([-0.045, 0.002, -0.021], Y, [-1, 0, 0], 0.014, 0, Math.PI, 10), seg([-0.045, -0.012, -0.021], [VX[2], -0.012, -0.021], 14), seg([VX[2], -0.012, -0.021], [VX[2], -0.012, -CAS], 2)),
  ];
  const slides = slidePaths.map((p, k) => {
    const mk = (glow: boolean) => {
      const s = new MeshBuilder();
      const u = v0 + ((v1 - v0) * k) / 2;
      tube(s, p, TR * 0.92, 14, glow ? M.brassGlow : M.brass, { uv0: u, uv1: u + 0.002 });
      if (k === 0) tube(s, [[0.07, 0.012 + TR, 0.02], [0.074, 0.012 + TR + 0.009, 0.021], [0.082, 0.012 + TR + 0.012, 0.021]], 0.0018, 6, M.brass);
      if (k === 2) {
        const ring = arc([-0.02, 0.016, -0.021 - TR - 0.008], [1, 0, 0], [0, 0, 1], 0.0075, 0, Math.PI * 2, 18);
        tube(s, ring, 0.0013, 6, M.brass);
      }
      return s.build();
    };
    return { plain: mk(false), glow: mk(true) };
  });
  // piston: stem from the top cap up to the finger button with its pearl, in the casing's frame
  const pm = new MeshBuilder();
  cyl(pm, [0, 0.0365, 0], [0, 0.058, 0], 0.0021, 0.0021, 10, M.nickel);
  pm.with(translate(0, 0.058, 0), () => lathe(pm, [[0.0025, 0], [0.0082, 0.0], [0.0086, 0.0045], [0.0075, 0.006], [0, 0.0062]], 22, M.brass));
  pm.with(translate(0, 0.0645, 0), () => lathe(pm, [[0, -0.0004], [0.0066, -0.0004], [0.0066, 0.0003], [0, 0.0012]], 22, M.pearl));
  // place it: bell forward (+x), floating a little above the floor, turned to show the valves
  const T = chain(translate(-0.02, 0.2, 0), rotX(-0.18));
  return { T, statics: [mb.build()], slides, piston: pm.build(), valveX: VX, bounds: { c: xform(T, [0.0, 0.0, 0.01]), r: 0.38 }, src: xform(T, [0.31, 0.025, 0.022]), rim: rimR };
}

export function poseTrumpet(b: Batch, tm: TrumpetModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number, scale: { of(v: number): number }): void {
  const T = tm.T;
  for (const s of tm.statics) b.mesh(s, T);
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  tm.valveX.forEach((x, k) => {
    pose.valves[k] = ease(pose.valves[k], down[k] ? 1 : 0, dt, 0.018);
    b.mesh(tm.piston, chain(T, translate(x, -0.016 * pose.valves[k], 0)), down[k] ? [1, 0.37, 0.22, 0.35] : null);
    b.mesh(down[k] ? tm.slides[k].glow : tm.slides[k].plain, T);
  });
  waveOverlay(b, fr, pose, 1, scale);
  b.ov.waveCol = [1, 0.37, 0.22];
  // the lips at the rim: they buzz at the note (drawn slowed), opening with the level
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  const f = fr?.focus?.f1 ?? 0;
  const gap = lvl > 0.02 ? 0.0012 + 0.0018 * lvl * (0.5 + 0.5 * Math.sin(now * 0.001 * Math.min(f, 18) * 6.283)) : 0.0005;
  for (const sgn of [-1, 1]) {
    const lip: Vec3[] = [];
    for (let k = 0; k <= 10; k++) {
      const z = -0.011 + (k / 10) * 0.022;
      lip.push(xform(T, [-0.316, 0.052 + sgn * (gap + 0.0032 * (1 - (z / 0.011) ** 2)), z]));
    }
    b.line(lip, lvl > 0.02 ? C.verm(0.85) : C.amber(0.35), 2.6);
  }
}
export { add };
