// The volute in 3D, built once from its plan (volute-plan.ts: the engine's own sizes) and posed
// from the live state. A horizontal spiral frame of varnished maple at table height on three brass
// legs; the spruce hub on a turned pedestal at its centre, with the round bridge, the rosined band
// and the twelve sympathetic strings; 49 steel strings from the bridge out to the frame; 37 brass
// pipes standing on the frame, the tallest (C3, 1.25 m) at the widest turn; 37 aluminium bars on two
// rails beyond them, a felt mallet under each. Units are metres; y is up.
import type { VisualFrame } from '@piano-model/engine';
import { AutoScale, INK } from '../stage-draw.ts';
import { volutePlan, type P2 } from '../volute-plan.ts';
import { ink, translate, type Batch, type Mesh, type RGBA, type Vec3 } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, lathe, tube } from './mesh.ts';

/** the strings' plane above the floor */
export const VOLUTE_H = 0.82;
const STR_Y = VOLUTE_H + 0.02;

export interface VoluteModel {
  statics: Mesh[];
  pipes: { midi: number; mesh: Mesh; top: Vec3 }[];
  bars: { midi: number; mesh: Mesh; mid: Vec3 }[];
  mallet: Mesh;
  bounds: { c: Vec3; r: number };
  /** the plan's centre and half-size on the floor, and the tallest pipe's top */
  centre: Vec3;
  half: number;
  top: number;
}
export interface VolutePose {
  str: AutoScale;
  pipe: AutoScale;
  bar: AutoScale;
  halo: AutoScale;
  barLvl: Float32Array;
  pipeLvl: Float32Array;
}
export const newVolutePose = (): VolutePose => ({ str: new AutoScale(1e-5, 0.995), pipe: new AutoScale(1e-4, 0.995), bar: new AutoScale(1e-3, 0.995), halo: new AutoScale(1e-3, 0.998), barLvl: new Float32Array(128), pipeLvl: new Float32Array(128) });

const at = (p: P2, y: number): Vec3 => [p[0], y, p[1]];

export function buildVoluteModel(): VoluteModel {
  const plan = volutePlan();
  const mb = new MeshBuilder();
  const wood = M.varnish;
  // ---- the frame: the plan's outline (inner edge out, outer edge back) as a band 42 mm deep
  const F = plan.frame;
  const half = F.length / 2;
  const y0 = VOLUTE_H - 0.03;
  const y1 = VOLUTE_H + 0.012;
  for (let k = 0; k < half - 1; k++) {
    const i0 = F[k];
    const i1 = F[k + 1];
    const o0 = F[F.length - 1 - k];
    const o1 = F[F.length - 2 - k];
    mb.quad(at(i0, y1), at(o0, y1), at(o1, y1), at(i1, y1), wood);
    mb.quad(at(i0, y0), at(i1, y0), at(o1, y0), at(o0, y0), wood);
    mb.quad(at(i0, y0), at(i0, y1), at(i1, y1), at(i1, y0), wood);
    mb.quad(at(o0, y0), at(o1, y0), at(o1, y1), at(o0, y1), wood);
  }
  for (const k of [0, half - 1]) {
    const i = F[k];
    const o = F[F.length - 1 - k];
    mb.quad(at(i, y0), at(o, y0), at(o, y1), at(i, y1), wood);
  }
  // the column that closes the turn
  cyl(mb, at(plan.column[0], VOLUTE_H - 0.009), at(plan.column[1], VOLUTE_H - 0.009), 0.021, 0.021, 16, wood);
  // ---- three legs under the frame, and a spoke from each to the pedestal (under the strings)
  const mids = [3, 19, 35].map((i): P2 => {
    const s = plan.strings[i];
    return [s.b[0] + s.dir[0] * 0.02, s.b[1] + s.dir[1] * 0.02];
  });
  for (const p of mids) {
    const l = Math.hypot(p[0], p[1]);
    const foot: P2 = [p[0] * (1 + 0.1 / l), p[1] * (1 + 0.1 / l)];
    cyl(mb, at(foot, 0), at(p, y0), 0.012, 0.017, 14, M.brassDull);
    ellipsoid(mb, at(foot, 0.006), [0.03, 0.006, 0.03], 12, M.brassDull);
    cyl(mb, [0, VOLUTE_H - 0.07, 0], at(p, y0 + 0.006), 0.009, 0.009, 10, M.darkSteel, false);
  }
  // ---- the pedestal and the hub: a spruce disc 8 mm thick, its edge bound in maple
  lathe(
    mb,
    [
      [0.19, 0], [0.19, 0.012], [0.07, 0.03], [0.04, 0.08], [0.032, 0.4], [0.04, 0.66], [0.075, VOLUTE_H - 0.075], [0.09, VOLUTE_H - 0.06], [0.06, VOLUTE_H - 0.012],
    ],
    28,
    M.lacquerSatin,
  );
  lathe(mb, [[0, VOLUTE_H - 0.008], [plan.hubR, VOLUTE_H - 0.008], [plan.hubR, VOLUTE_H]], 72, M.maple);
  lathe(mb, [[plan.hubR, VOLUTE_H], [0, VOLUTE_H]], 72, M.spruceBare);
  const ring = (r: number | ((i: number) => number), y: number, n = 96): Vec3[] => Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    const rr = typeof r === 'number' ? r : r(i);
    return [rr * Math.cos(a), y, rr * Math.sin(a)];
  });
  // the bridge: a maple hoop the strings cross; the band, rosined leather, just outside it
  tube(mb, ring(plan.bridgeR, VOLUTE_H + 0.008), (i) => (i >= 0 ? 0.0085 : 0), 8, M.bridgeMaple, { flat: 1.4 });
  tube(mb, [...plan.strings.map((s) => at(s.band, STR_Y - 0.0045)), at(plan.strings[plan.strings.length - 1].band, STR_Y - 0.0045)], 0.0035, 6, M.leather);
  // the band's posts on the hub
  for (const i of [0, 12, 24, 36, 48]) cyl(mb, at(plan.strings[i].band, VOLUTE_H), at(plan.strings[i].band, STR_Y - 0.007), 0.003, 0.003, 6, M.brassDull, false);
  // the strings' hitch pins, and the sympathetic strings' pins on the hub
  for (const s of plan.strings) cyl(mb, at(s.b, y1), at(s.b, STR_Y + 0.004), 0.0022, 0.0022, 6, M.pinNickel);
  for (const h of plan.halo) for (const p of [h.a, h.b]) cyl(mb, at(p, VOLUTE_H), at(p, VOLUTE_H + 0.007), 0.0018, 0.0018, 5, M.pinNickel);
  // ---- the bars' two rails, on brackets from the frame
  for (const rail of plan.rails) tube(mb, rail.map((p) => at(p, VOLUTE_H - 0.012)), 0.004, 6, M.darkSteel);
  plan.bars.forEach((b, i) => {
    if (i % 6) return;
    const s = plan.strings.find((q) => q.midi === b.midi)!;
    const inner: P2 = [b.a[0] - s.dir[0] * 0.036, b.a[1] - s.dir[1] * 0.036];
    cyl(mb, at(inner, VOLUTE_H - 0.02), at(plan.rails[1][i], VOLUTE_H - 0.014), 0.003, 0.003, 6, M.darkSteel, false);
  });
  // ---- the pipes: brass tubes open at the top, a mouth cut low on the outer side, a short foot
  const pipes = plan.pipes.map((p) => {
    const pb = new MeshBuilder();
    const s = plan.strings.find((q) => q.midi === p.midi)!;
    const base = y1;
    cyl(pb, at(p.c, base), at(p.c, base + 0.05 + p.len), p.r, p.r, p.r > 0.012 ? 18 : 12, M.brassLacquer, false);
    cyl(pb, at(p.c, base + 0.05 + p.len - 0.004), at(p.c, base + 0.05 + p.len), p.r * 1.07, p.r * 1.07, p.r > 0.012 ? 18 : 12, M.brassLacquer, false);
    // the languid (the plate the wind sheet leaves) and the mouth
    cyl(pb, at(p.c, base + 0.048), at(p.c, base + 0.05), p.r * 0.96, p.r * 0.96, 12, M.boreDark);
    const mo: P2 = [p.c[0] + s.dir[0] * p.r * 0.86, p.c[1] + s.dir[1] * p.r * 0.86];
    ellipsoid(pb, at(mo, base + 0.05 + p.r * 0.55), [p.r * 0.5, p.r * 0.55, p.r * 0.5], 10, M.hole);
    return { midi: p.midi, mesh: pb.build(), top: at(p.c, base + 0.05 + p.len) };
  });
  // ---- the bars: aluminium, 11 mm thick, their ends a little rounded
  const bars = plan.bars.map((b) => {
    const bb = new MeshBuilder();
    const dx = b.b[0] - b.a[0];
    const dz = b.b[1] - b.a[1];
    const len = Math.hypot(dx, dz);
    const ux: P2 = [dx / len, dz / len];
    const vx: P2 = [-ux[1], ux[0]];
    const P = (u: number, w: number, y: number): Vec3 => [b.a[0] + ux[0] * u + vx[0] * w, y, b.a[1] + ux[1] * u + vx[1] * w];
    const yb = VOLUTE_H - 0.008;
    const yt = VOLUTE_H + 0.003;
    const w = b.w / 2;
    const c = 0.003;
    const m = M.nickelSatin;
    bb.quad(P(c, -w + c, yt), P(c, w - c, yt), P(len - c, w - c, yt), P(len - c, -w + c, yt), m);
    bb.quad(P(0, -w, yb), P(len, -w, yb), P(len, w, yb), P(0, w, yb), m);
    bb.quad(P(0, -w, yb), P(0, w, yb), P(c, w - c, yt), P(c, -w + c, yt), m);
    bb.quad(P(len, w, yb), P(len, -w, yb), P(len - c, -w + c, yt), P(len - c, w - c, yt), m);
    bb.quad(P(0, w, yb), P(len, w, yb), P(len - c, w - c, yt), P(c, w - c, yt), m);
    bb.quad(P(len, -w, yb), P(0, -w, yb), P(c, -w + c, yt), P(len - c, -w + c, yt), m);
    return { midi: b.midi, mesh: bb.build(), mid: P(len / 2, 0, yb) };
  });
  // a mallet: a felt ball on a short stem, built at the origin (its top at y = 0)
  const mm = new MeshBuilder();
  ellipsoid(mm, [0, -0.009, 0], [0.009, 0.009, 0.009], 10, M.hammerFelt);
  cyl(mm, [0, -0.05, 0], [0, -0.016, 0], 0.002, 0.002, 6, M.hornbeam, false);
  const bx = plan.box;
  const centre: Vec3 = [(bx.x0 + bx.x1) / 2, 0, (bx.z0 + bx.z1) / 2];
  const halfSize = Math.max(bx.x1 - bx.x0, bx.z1 - bx.z0) / 2;
  const top = Math.max(...pipes.map((p) => p.top[1]));
  return { statics: [mb.build()], pipes, bars, mallet: mm.build(), bounds: { c: [centre[0], 0.9, centre[2]], r: Math.max(halfSize, 1.2) }, centre, half: halfSize, top };
}

const STEEL: RGBA = [0.82, 0.84, 0.87, 1];
const COPPER: RGBA = [0.78, 0.5, 0.32, 1];

export function poseVolute(b: Batch, vm: VoluteModel, fr: VisualFrame | null, pose: VolutePose): void {
  const plan = volutePlan();
  for (const s of vm.statics) b.mesh(s);
  const v = fr?.volute ?? null;
  const live = new Map<number, NonNullable<VisualFrame['volute']>['notes'][number]>();
  if (v) for (const n of v.notes) live.set(n.midi, n);
  // ---- pipes: the air column's level as a warm light in the brass
  let ppk = 0;
  for (const p of vm.pipes) {
    let lv = 0;
    for (const n of live.values()) if (n.pipeMidi === p.midi) lv = Math.max(lv, n.pLevel);
    pose.pipeLvl[p.midi] = lv = Math.max(lv, pose.pipeLvl[p.midi] * 0.85);
    ppk = Math.max(ppk, lv);
  }
  const pref = pose.pipe.of(ppk);
  for (const p of vm.pipes) {
    const lv = Math.min(1, pose.pipeLvl[p.midi] / pref);
    b.mesh(p.mesh, null, lv > 0.02 ? [1, 0.62, 0.3, 0.75 * lv] : null);
  }
  // ---- bars and mallets: a bar lights as it rings; its mallet is thrown up and falls back
  let bpk = 0;
  for (const q of vm.bars) {
    let lv = 0;
    for (const n of live.values()) if (n.pipeMidi === q.midi) lv = Math.max(lv, n.bar);
    pose.barLvl[q.midi] = lv = Math.max(lv, pose.barLvl[q.midi] * 0.9);
    bpk = Math.max(bpk, lv);
  }
  const bref = pose.bar.of(bpk);
  for (const q of vm.bars) {
    const lv = Math.min(1, Math.sqrt(pose.barLvl[q.midi] / bref));
    b.mesh(q.mesh, null, lv > 0.02 ? [1, 0.45, 0.25, 0.8 * lv] : null);
    let t = -1;
    for (const n of live.values()) if (n.pipeMidi === q.midi && n.struck >= 0) t = t < 0 ? n.struck : Math.min(t, n.struck);
    // up in 12 ms, back in 120 (the rest: 30 mm under the bar)
    const up = t < 0 || t > 0.14 ? 0 : t < 0.012 ? t / 0.012 : 1 - (t - 0.012) / 0.128;
    b.mesh(vm.mallet, translate(q.mid[0], q.mid[1] - 0.03 * (1 - up), q.mid[2]));
  }
  // ---- strings: at rest a wire; held, the engine's displacement (drawn up and down)
  let spk = 0;
  for (const n of live.values()) if (n.string) for (let i = 0; i < n.string.length; i++) spk = Math.max(spk, Math.abs(n.string[i]));
  const sref = pose.str.of(spk);
  for (const s of plan.strings) {
    const n = live.get(s.midi);
    const d = s.wound ? 0.0016 : 0.0009;
    const a: Vec3 = [s.a[0], STR_Y, s.a[1]];
    const e: Vec3 = [s.b[0], STR_Y, s.b[1]];
    if (!n?.string) {
      b.wire([a, e], s.wound ? COPPER : STEEL, d);
      continue;
    }
    const sh = n.string;
    const amp = 0.012 / sref;
    const pts: Vec3[] = [];
    for (let i = 0; i < sh.length; i++) {
      const u = i / (sh.length - 1);
      pts.push([a[0] + (e[0] - a[0]) * u, STR_Y + sh[i] * amp, a[2] + (e[2] - a[2]) * u]);
    }
    b.wire(pts, s.wound ? COPPER : STEEL, d);
    b.line(pts, ink(INK.vermilion, 0.75), 1.6);
  }
  // ---- the sympathetic strings on the hub
  const halo = v?.halo;
  let hpk = 0;
  if (halo) for (let j = 0; j < halo.length; j++) hpk = Math.max(hpk, halo[j]);
  const href = pose.halo.of(hpk);
  plan.halo.forEach((h, j) => {
    const pts: Vec3[] = [[h.a[0], VOLUTE_H + 0.006, h.a[1]], [h.b[0], VOLUTE_H + 0.006, h.b[1]]];
    b.wire(pts, STEEL, 0.0008);
    const lv = halo ? Math.min(1, Math.sqrt(halo[j] / href)) : 0;
    if (lv > 0.03) b.line(pts, ink(INK.steel, 0.85 * lv), 1.2 + 2 * lv);
  });
}
