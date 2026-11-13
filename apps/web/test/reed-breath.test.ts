// The reeds' breath in 3D, as the brass have it (brass-breath.test.ts): while a note is blown, faint steel
// streams run into the reed's tip (winds3d breathIn); at rest nothing is drawn. The instrument's own meshes
// stay unlit while it sounds (oboe3d/clarinet3d/bassoon3d tests).
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { INK } from '../src/ui/stage-draw.ts';
import { Batch, xform, type Mat4, type Vec3 } from '../src/ui/gl/gl3d.ts';
import { buildOboeModel, poseOboe } from '../src/ui/gl/oboe3d.ts';
import { buildClarinetModel, poseClarinet } from '../src/ui/gl/clarinet3d.ts';
import { REED_TIP, buildBassoonModel, poseBassoon } from '../src/ui/gl/bassoon3d.ts';
import { newWindPose } from '../src/ui/gl/winds3d.ts';

const steel = INK.steel.split(',').map((c) => Number(c) / 255);
const frame = (midi: number | null): VisualFrame =>
  ({
    focus: midi === null ? null : { midi, lengthM: 1, f1: 440, shapes: [Float32Array.from({ length: 64 }, (_, i) => Math.cos((Math.PI / 2) * (i / 63)))] },
    breath: { pressure: midi === null ? 0 : 0.7, vib: 0 },
    reed: { open: 1, gamma: 0.5 },
  }) as unknown as VisualFrame;
const linesOf = (b: Batch): { p: Vec3; c: number[] }[] => {
  const out: { p: Vec3; c: number[] }[] = [];
  const a = b.glow.lv.a;
  for (let v = 0; v < b.glow.nv; v++) out.push({ p: [a[v * 15], a[v * 15 + 1], a[v * 15 + 2]], c: [a[v * 15 + 10], a[v * 15 + 11], a[v * 15 + 12], a[v * 15 + 13]] });
  return out;
};

const om = buildOboeModel();
const cm = buildClarinetModel();
const bm = buildBassoonModel();
const MODELS: { name: string; tip: Vec3; midi: number; pose: (b: Batch, fr: VisualFrame | null, p: ReturnType<typeof newWindPose>, k: number) => void }[] = [
  { name: 'oboe', tip: xform(om.T, [0, 0, 0]), midi: 69, pose: (b, fr, p, k) => poseOboe(b, om, fr, p, 1 / 60, k * 16.7, 0.05) },
  { name: 'clarinet', tip: xform(cm.T, [0, 0, 0]), midi: 62, pose: (b, fr, p, k) => poseClarinet(b, cm, fr, p, 1 / 60, k * 16.7, 0.05) },
  { name: 'bassoon', tip: xform(bm.T as Mat4, xform(bm.reedF, [REED_TIP.length * 0.001, 0, 0])), midi: 48, pose: (b, fr, p, k) => poseBassoon(b, bm, fr, p, 1 / 60, k * 16.7, 0.05) },
];

describe('the reeds’ breath in 3D: faint steel streams into the reed’s tip while a note is blown', () => {
  for (const md of MODELS)
    it(`${md.name}: no line at rest; blown, only faint steel streams within 18 mm of the tip`, () => {
      const pose = newWindPose();
      const b = new Batch();
      for (let k = 0; k < 20; k++) {
        b.clear();
        md.pose(b, null, pose, k);
      }
      expect(b.glow.nv, 'at rest').toBe(0);
      for (let k = 0; k < 30; k++) {
        b.clear();
        md.pose(b, frame(md.midi), pose, k);
      }
      const L = linesOf(b);
      expect(L.length, 'blown').toBeGreaterThan(12);
      for (const { p, c } of L) {
        expect(Math.hypot(p[0] - md.tip[0], p[1] - md.tip[1], p[2] - md.tip[2]), `${md.name}: a point (m) from the reed's tip`).toBeLessThan(0.018);
        expect(c[0]).toBeCloseTo(steel[0], 5);
        expect(c[3]).toBeLessThan(0.45);
      }
      // the note over: a moment later no stream
      for (let k = 0; k < 20; k++) {
        b.clear();
        md.pose(b, frame(null), pose, k);
      }
      expect(b.glow.nv, 'after').toBe(0);
    });
});
