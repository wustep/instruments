// The 3D instruments' geometry, without WebGL: every model builds, has finite vertices and the
// dimensions of the real instrument, and the pianos' parts line up (each key's hammer under its
// own strings, dampers behind the strike line). Posing a frame with a key down moves its key and
// hammer and lifts its damper.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, PRESETS, buildKeySpecs } from '../../../packages/engine/src/core/design.ts';
import { BOWED } from '../../../packages/engine/src/core/bowed.ts';
import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { buildGrandModel, buildUprightModel, newPianoPose, pianoStrings, posePiano, zoomFrame, type PianoModel } from '../src/ui/gl/piano3d.ts';
import { M, MAT_LIST } from '../src/ui/gl/mesh.ts';
import { buildBowedModel } from '../src/ui/gl/strings3d.ts';
import { buildFluteModel, buildTrumpetModel, newWindPose, poseFlute, poseTrumpet } from '../src/ui/gl/winds3d.ts';
import { newPianoState } from '../src/ui/piano-draw.ts';

const keysOf = (preset: string): KeySummary[] => {
  const d = PRESETS[preset];
  return buildKeySpecs(d, { ...DEFAULT_PARAMS, ...d.defaults }).map((s) => ({ midi: s.midi, f1: s.f1, B: s.B, nStrings: s.nStrings, lengthM: s.L, hasDamper: s.hasDamper, preparation: null }));
};
/** bounds of meshes placed by a transform */
function bounds(ms: Mesh[], T: Float32Array | null = null): { lo: number[]; hi: number[] } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of ms) {
    // every vertex finite (one assertion per mesh: the meshes have hundreds of thousands)
    let bad = 0;
    for (let k = 0; k < m.count * 14; k++) if (!Number.isFinite(m.data[k])) bad++;
    expect(bad).toBe(0);
  }
  for (const m of ms)
    for (let i = 0; i < m.count; i++) {
      const o = i * 14;
      let p: [number, number, number] = [m.data[o], m.data[o + 1], m.data[o + 2]];
      if (T) p = xform(T, p);
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
    }
  return { lo, hi };
}

describe('3D instruments', () => {
  const grand = buildGrandModel(keysOf('grand'));
  const upright = buildUprightModel(keysOf('upright'));

  it('the grand is a grand: about 2 m long, 1.5 m wide, a 1 m tall case on legs, 88 keys at 725 mm', () => {
    const b = bounds([...grand.statics, ...grand.cases, grand.board]);
    // the case (rim, legs, lyre) is its own mesh, to dissolve; what stays starts at the keybed
    expect(grand.cases.every((m) => m.fade)).toBe(true);
    expect(bounds(grand.statics).lo[1]).toBeGreaterThan(0.6);
    expect(b.hi[2] - b.lo[2]).toBeGreaterThan(1.8);
    expect(b.hi[2] - b.lo[2]).toBeLessThan(2.5);
    expect(b.hi[0] - b.lo[0]).toBeGreaterThan(1.3);
    expect(b.hi[0] - b.lo[0]).toBeLessThan(1.7);
    expect(b.lo[1]).toBeLessThan(0.01); // legs to the floor
    expect(b.hi[1]).toBeGreaterThan(0.9);
    expect(b.hi[1]).toBeLessThan(1.05);
    expect(grand.keys).toHaveLength(88);
    // the key top (its front 15 cm; behind it rise the capstan and backcheck)
    const k = grand.keys[39].key;
    let top = 0;
    for (let i = 0; i < k.count; i++) if (k.data[i * 14 + 2] < 0.15) top = Math.max(top, k.data[i * 14 + 1]);
    expect(top).toBeCloseTo(0.725, 3);
  });

  it('each hammer strikes its own strings; dampers sit behind the strike line (the upright: below it, an underdamper action), none above the top octaves', () => {
    for (const m of [grand, upright] as PianoModel[]) {
      for (const g of m.keys) {
        const s = g.strings[Math.floor(g.strings.length / 2)];
        // the strike point lies on the speaking length, at the key's strike ratio
        const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
        const d = Math.hypot(g.strike[0] - s.a[0], g.strike[1] - s.a[1], g.strike[2] - s.a[2]);
        expect(d / L).toBeGreaterThan(0.05);
        expect(d / L).toBeLessThan(0.14);
        expect(!!g.damper).toBe(g.k.hasDamper);
      }
      expect(m.keys.filter((g) => g.damper).length).toBeGreaterThan(60);
    }
    for (const g of grand.keys) if (g.damper) expect(g.damper[2]).toBeGreaterThan(g.strike[2]);
    for (const g of upright.keys)
      if (g.damper) {
        // on the speaking length, 3–8 cm below the strike line, behind the shanks
        const s = g.strings[Math.floor(g.strings.length / 2)];
        expect(g.damper[1]).toBeLessThan(g.strike[1] - 0.03);
        expect(g.damper[1]).toBeGreaterThan(g.strike[1] - 0.08);
        expect(g.damper[1]).toBeGreaterThan(s.b[1]);
      }
  });

  it('a key held: its key dips, its hammer rises to the string and its damper lifts; the pedal lifts all', () => {
    const ps = newPianoState();
    const pose = newPianoPose();
    const b = new Batch();
    const keys = keysOf('grand');
    const run = (down: Set<number>, sustain: number, frames: number) => {
      ps.down = down;
      ps.sustain = sustain;
      for (let f = 0; f < frames; f++) {
        b.clear();
        posePiano(b, grand, { piano: ps, keys, dt: 1 / 60, lid: 1, down: (m) => down.has(m), lite: false }, pose);
      }
    };
    ps.strikes.set(60, 1);
    run(new Set([60]), 0, 3);
    expect(pose.keyPos[39]).toBeGreaterThan(0.5);
    expect(ps.hammer[39]).toBeGreaterThan(0.5);
    run(new Set([60]), 0, 30);
    expect(ps.damper[39]).toBeGreaterThan(0.9);
    expect(ps.damper[20]).toBeLessThan(0.05);
    run(new Set(), 1, 30);
    expect(pose.keyPos[39]).toBeLessThan(0.05);
    expect(ps.damper[20]).toBeGreaterThan(0.9);
    expect(b.vertices).toBeGreaterThan(50_000);
  });

  it('a key’s close-up cuts the long parts within 1.5 mm of a web, whichever key and end (their cut faces: no hollow shells)', () => {
    for (const [kind, pm] of [['grand', grand], ['upright', upright]] as const) {
      // the webs: cross-walls inside the parts that run across the keyboard, marked in uv.x; inside the
      // fixed parts' own bounds
      const xs = new Set<number>();
      let n = 0;
      const b = bounds([...pm.statics, ...pm.cases]);
      for (const m of [...pm.statics, ...pm.cases])
        for (let i = 0; i < m.count; i++) {
          const o = i * 14;
          if (m.data[o + 12] < 8.5) continue;
          n++;
          xs.add(Math.round(m.data[o] * 1e5) / 1e5);
          for (let k = 0; k < 3; k++) expect(m.data[o + k] > b.lo[k] && m.data[o + k] < b.hi[k]).toBe(true);
        }
      expect(n, kind).toBeGreaterThan(1000);
      expect(xs.size, kind).toBe(89);
      const web = [...xs];
      for (let midi = 21; midi <= 108; midi++) {
        const f = zoomFrame(kind, midi);
        // the nearest web on the side that is kept (side·(x − cut) ≤ 0)
        const d = Math.min(...web.map((x) => f.side * (f.cut - x)).filter((v) => v >= 0));
        expect(d, `${kind} key ${midi}`).toBeGreaterThan(0.0002);
        expect(d, `${kind} key ${midi}`).toBeLessThan(0.0015);
      }
    }
  });

  it('the upright stands about 1.25 m tall, its strings vertical behind the action', () => {
    const b = bounds(upright.statics);
    expect(b.hi[1]).toBeGreaterThan(1.15);
    expect(b.hi[1]).toBeLessThan(1.35);
    const s = upright.keys[60].strings[0];
    expect(Math.abs(s.a[2] - s.b[2])).toBeLessThan(1e-9);
    expect(s.a[1] - s.b[1]).toBeGreaterThan(0.1);
  });

  // A sharp is a block of ebony on its key stick, and it overhangs the stick (13.7 mm over 10.4): its
  // underside shows from below and wherever a key's close-up cuts through it. It was lofted with a top
  // and no bottom (open below, the shell showed its inside); now every face is ebony and it is closed.
  it('a sharp is ebony on every face and closed: its underside covers its whole footprint (grand and upright)', () => {
    for (const pm of [grand, upright]) {
      for (const midi of [22, 61, 106]) {
        const m = pm.keys[midi - 21].key;
        const d = m.data;
        expect(Array.from(m.mats).every((id) => MAT_LIST[id] === M.ebony), `${pm.kind} ${midi}`).toBe(true);
        // the faces turned down (by their normals: the renderer winds each face by them), their plan area
        let down = 0;
        let y0 = Infinity;
        for (let t = 0; t < m.count; t += 3) {
          const o = t * 14;
          if (d[o + 4] > -0.9) continue;
          const p = [0, 1, 2].map((k) => [d[o + k * 14], d[o + k * 14 + 2]]);
          down += Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])) / 2;
          y0 = Math.min(y0, d[o + 1]);
        }
        // 13.7 × 95 mm, less its rounded corners
        expect(down, `${pm.kind} ${midi}`).toBeGreaterThan(0.97 * 0.0137 * 0.095);
        expect(down).toBeLessThan(0.0137 * 0.095);
        // at the sharp's foot, under the white keys' tops (0.725 m)
        expect(y0).toBeCloseTo(0.723, 4);
        // closed: every edge is shared by two faces
        const edges = new Map<string, number>();
        const key = (o: number) => `${d[o].toFixed(6)},${d[o + 1].toFixed(6)},${d[o + 2].toFixed(6)}`;
        for (let t = 0; t < m.count; t += 3)
          for (let k = 0; k < 3; k++) {
            const a = key((t + k) * 14);
            const b = key((t + ((k + 1) % 3)) * 14);
            const e = a < b ? `${a}|${b}` : `${b}|${a}`;
            edges.set(e, (edges.get(e) ?? 0) + 1);
          }
        const open = [...edges.values()].filter((n) => n % 2).length;
        expect(open, `${pm.kind} ${midi}: open edges`).toBe(0);
      }
    }
  });

  // Stephen: "for the pianos on 3d, don't turn the string/key/etc red when playing them (just on 3d)".
  // In 3D the played parts keep their own materials and show the playing by their motion: a held,
  // sounding chord of white and black keys, struck, with both pedals down, tints no key, stick, jack,
  // hammer, damper or pedal, and lays no vermilion or amber line over its strings; its strings
  // (struck and sympathetic) are the wires themselves in their live shapes. (2D keeps its highlights.)
  it('in 3D a played piano tints nothing: keys, action, dampers, pedals and strings keep their materials; the strings move as wires', () => {
    const chord = [55, 58, 60, 61, 64, 66];
    for (const pm of [grand, upright]) {
      const keys = keysOf(pm.kind);
      const ps = newPianoState();
      const pose = newPianoPose();
      const b = new Batch();
      const down = new Set(chord);
      ps.down = down;
      ps.sustain = 1;
      ps.soft = 1;
      for (const m of chord) ps.strikes.set(m, 1);
      let tint = 0;
      let hammer = 0;
      let damper = 0;
      for (let f = 0; f < 40; f++) {
        b.clear();
        posePiano(b, pm, { piano: ps, keys, dt: 1 / 60, lid: 1, down: (m) => down.has(m), lite: false }, pose);
        hammer = Math.max(hammer, ps.hammer[61 - 21]);
        damper = Math.max(damper, ps.damper[61 - 21]);
        // (each instance: its matrix, then its glow: rgb, amount)
        for (const mesh of b.meshes()) {
          const buf = b.inst.get(mesh)!;
          for (let o = 0; o < buf.n; o += 20) tint = Math.max(tint, buf.a[o + 16], buf.a[o + 17], buf.a[o + 18], buf.a[o + 19]);
        }
      }
      // (the frames went through the strike and the damper's lift)
      expect(hammer, pm.kind).toBeGreaterThan(0.6);
      expect(damper, pm.kind).toBeGreaterThan(0.9);
      expect(tint, `${pm.kind}: a played part tinted`).toBe(0);
      expect(b.glow.nv, pm.kind).toBe(0);

      // the strings: the chord's keys sounding (half-sine shapes, 32 points), C5 sympathetic
      const P = 32;
      const live = [...chord, 72];
      const levels = new Float32Array(88);
      const symLevels = new Float32Array(88);
      for (const m of chord) levels[m - 21] = 1;
      symLevels[72 - 21] = 0.5;
      const shapes = new Float32Array(live.length * P);
      live.forEach((_, j) => {
        for (let i = 0; i < P; i++) shapes[j * P + i] = Math.sin((Math.PI * i) / (P - 1)) * (j === live.length - 1 ? 0.3 : 1);
      });
      const fr = { levels, symLevels, pianoShapes: { points: P, midi: Int16Array.from(live), light: Uint8Array.from(live.map((m) => (m === 72 ? 1 : 0))), level: new Float32Array(live.length), shapes } } as unknown as VisualFrame;
      b.clear();
      pianoStrings(b, pm, null, (mx) => mx, false);
      const still = b.wireL.nv;
      b.clear();
      pianoStrings(b, pm, fr, (mx) => mx, false);
      expect(b.glow.nv, `${pm.kind}: a line over the strings`).toBe(0);
      expect(b.wireL.nv, pm.kind).toBeGreaterThan(still);
      // the wire itself swings, a few of its diameters: 4 mm at the loudest string's antinode (a
      // grand's strings up, an upright's towards the keys), 1.2 mm for the sympathetic one
      const swing = (midi: number): number => {
        const g = pm.keys[midi - 21];
        const r = g.strings[0];
        const lv = b.wireL.lv.a;
        let mx = 0;
        for (let v = 0; v < b.wireL.nv; v++) {
          const o = v * 15;
          const x = lv[o];
          const y = lv[o + 1];
          const z = lv[o + 2];
          if (Math.abs(x - g.strike[0]) > 0.005) continue;
          if (pm.kind === 'grand') {
            if (z > r.a[2] + 0.01 && z < r.b[2] - 0.01) mx = Math.max(mx, Math.abs(y - r.a[1]));
          } else if (y < r.a[1] - 0.01 && y > r.b[1] + 0.01) mx = Math.max(mx, Math.abs(z - r.a[2]));
        }
        return mx;
      };
      expect(swing(61), pm.kind).toBeGreaterThan(0.0039);
      expect(swing(61), pm.kind).toBeLessThan(0.0041);
      expect(swing(72), pm.kind).toBeGreaterThan(0.0011);
      expect(swing(72), pm.kind).toBeLessThan(0.0013);
      expect(swing(84), pm.kind).toBeLessThan(1e-6);
    }
  });

  it('violin < viola < cello, with the real body lengths; the cello stands on its endpin', () => {
    const len: Record<string, number> = {};
    for (const id of ['violin', 'viola', 'cello'] as const) {
      const d = BOWED[id];
      const m = buildBowedModel({ id, L: d.L, bowLength: d.bowLength, strings: d.strings.map((s) => ({ name: s.name, open: s.open })) });
      const b = bounds([m.top]);
      len[id] = b.hi[0] - b.lo[0];
      expect(m.xb - m.xn).toBeCloseTo(d.L, 6);
      if (id === 'cello') {
        const w = bounds(m.meshes, m.T);
        expect(w.lo[1]).toBeLessThan(0.01);
        expect(w.hi[1]).toBeGreaterThan(1.1);
      }
    }
    expect(len.violin).toBeCloseTo(0.356, 2);
    expect(len.viola).toBeCloseTo(0.406, 2);
    expect(len.cello).toBeCloseTo(0.755, 2);
  });

  // The varnish is a mirror coat: where one facet of the top turns its normal far, the studio's
  // reflection breaks along the mesh in steps (a hard, stepped smear across a bout's highlight: the
  // facets over the arch's shoulder turned up to 17° on the cello, 20° on the viola, 22° on the violin).
  // Above the edge's round and the channel (which do turn), no facet turns more than 12° (they are at
  // 8° to 9°).
  it('a bowed instrument’s top is a smooth arch: no facet turns the reflection by more than 12°', () => {
    for (const id of ['violin', 'viola', 'cello'] as const) {
      const d = BOWED[id];
      const m = buildBowedModel({ id, L: d.L, bowLength: d.bowLength, strings: d.strings.map((s) => ({ name: s.name, open: s.open })) });
      const v = m.top.data;
      let hi = 0;
      for (let i = 0; i < m.top.count; i++) hi = Math.max(hi, v[i * 14 + 1]);
      let worst = 1;
      for (let t = 0; t < m.top.count; t += 3) {
        const o = [t * 14, (t + 1) * 14, (t + 2) * 14];
        if (o.some((k) => v[k + 1] < 0.4 * hi)) continue;
        for (let a = 0; a < 3; a++) {
          const b = (a + 1) % 3;
          worst = Math.min(worst, v[o[a] + 3] * v[o[b] + 3] + v[o[a] + 4] * v[o[b] + 4] + v[o[a] + 5] * v[o[b] + 5]);
        }
      }
      expect((Math.acos(worst) * 180) / Math.PI, id).toBeLessThan(12);
    }
  });

  // The double bass (docs/3d-reference.md, "Double bass"): a 3/4 orchestral bass of 1110 mm, built as
  // a bass is, not a cello scaled up: its back flat, bent towards the top at the break so that the
  // ribs are shallowest at the neck block (the Met's Plumerel bass: ribs 156 / 200 / 197 mm, upper /
  // centre / tail); worm-and-cog machines in place of pegs, four rollers through the pegbox; standing
  // on its endpin, 1.9–2 m to the scroll's top. Its varnished top is as smooth an arch as the others'.
  it('the double bass: 1110 mm, taller than the cello, a flat back with its break, four machine rollers and no pegs, on its endpin, its top a smooth arch', () => {
    const mk = (id: 'cello' | 'bass') => {
      const d = BOWED[id];
      return buildBowedModel({ id, L: d.L, bowLength: d.bowLength, strings: d.strings.map((s) => ({ name: s.name, open: s.open })) });
    };
    const bass = mk('bass');
    const cello = mk('cello');
    expect(bass.xb - bass.xn).toBeCloseTo(BOWED.bass.L, 6);
    const top = bounds([bass.top]);
    expect(top.hi[0] - top.lo[0]).toBeCloseTo(1.11, 2);
    const wb = bounds([...bass.meshes, bass.top], bass.T);
    const wc = bounds([...cello.meshes, cello.top], cello.T);
    expect(wb.hi[1] - wc.hi[1]).toBeGreaterThan(0.35);
    expect(wb.hi[1]).toBeGreaterThan(1.85);
    expect(wb.hi[1]).toBeLessThan(2.02);
    // the endpin's rubber on the floor
    let tip = Infinity;
    for (const m of bass.meshes)
      for (let i = 0; i < m.count; i++) if (MAT_LIST[m.mats![i]] === M.rubber) tip = Math.min(tip, xform(bass.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]])[1]);
    expect(tip).toBeGreaterThan(-0.005);
    expect(tip).toBeLessThan(0.005);
    // machines: four rollers at four heights along the pegbox, each string leaving its own; no pegs
    // (the cello's are rosewood: the bass has none), brass plates and cogs
    expect(cello.rollers).toBeNull();
    expect(bass.rollers).toHaveLength(4);
    const along = bass.rollers!.map((c) => c[0]);
    for (let k = 1; k < 4; k++) expect(along[k - 1] - along[k]).toBeGreaterThan(0.03);
    expect(new Set(bass.pegEnd.map((p) => p.map((v) => v.toFixed(4)).join())).size).toBe(4);
    const mats = new Set<unknown>();
    for (const m of bass.meshes) for (let i = 0; i < m.count; i += 3) mats.add(MAT_LIST[m.mats![i]]);
    expect(mats.has(M.rosewood)).toBe(false);
    expect(mats.has(M.brass)).toBe(true);
    expect(mats.has(M.brassHandled)).toBe(true);
    // the back: its outer surface (facing away from the top) below the break is flat — a plane in x
    // within 6 mm (the bars' slight crown) — and above it bent towards the top, 30 mm and more by the
    // neck block, where the ribs are 140–165 mm against 190–210 at the tail (the depth along the
    // centre line, less the plates' 7 mm edge; the back's crown adds its few millimetres)
    const pts: number[][] = [];
    for (const m of bass.meshes)
      for (let i = 0; i < m.count; i++) {
        const mat = MAT_LIST[m.mats![i]];
        const o = i * 14;
        if (mat.paint?.key === 'bass-back' && m.data[o + 4] < -0.95) pts.push([m.data[o], m.data[o + 1], m.data[o + 2]]);
      }
    expect(pts.length).toBeGreaterThan(1000);
    const B = 1.11;
    const low = pts.filter((p) => p[0] > 0.36 * B && p[0] < 0.95 * B);
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const [x, y] of low) {
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
    }
    const n = low.length;
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const icpt = (sy - slope * sx) / n;
    const dev = Math.max(...low.map(([x, y]) => Math.abs(y - (icpt + slope * x))));
    expect(dev).toBeLessThan(0.006);
    const neck = pts.filter((p) => p[0] < 0.06 * B && Math.abs(p[2]) < 0.03);
    expect(neck.length).toBeGreaterThan(5);
    const lift = Math.min(...neck.map(([x, y]) => y - (icpt + slope * x)));
    expect(lift).toBeGreaterThan(0.03);
    const depth = (x0: number, x1: number) => -Math.max(...pts.filter((p) => p[0] > x0 && p[0] < x1 && Math.abs(p[2]) < 0.03).map((p) => p[1]));
    const ribTop = depth(0.0, 0.03 * B) - 0.007;
    const ribTail = depth(0.9 * B, 0.97 * B) - 0.007;
    expect(ribTop).toBeGreaterThan(0.14);
    expect(ribTop).toBeLessThan(0.165);
    expect(ribTail).toBeGreaterThan(0.19);
    expect(ribTail).toBeLessThan(0.21);
    // the top: no facet over the arch turns the varnish's reflection by more than 12°
    const v = bass.top.data;
    let hi = 0;
    for (let i = 0; i < bass.top.count; i++) hi = Math.max(hi, v[i * 14 + 1]);
    let worst = 1;
    for (let t = 0; t < bass.top.count; t += 3) {
      const o = [t * 14, (t + 1) * 14, (t + 2) * 14];
      if (o.some((k) => v[k + 1] < 0.4 * hi)) continue;
      for (let a = 0; a < 3; a++) {
        const b = (a + 1) % 3;
        worst = Math.min(worst, v[o[a] + 3] * v[o[b] + 3] + v[o[a] + 4] * v[o[b] + 4] + v[o[a] + 5] * v[o[b] + 5]);
      }
    }
    expect((Math.acos(worst) * 180) / Math.PI).toBeLessThan(12);
  });

  // the measured sizes in docs/3d-reference.md, within ~3%: a Boehm C flute is 670–672 mm overall
  // (McGee); the Bach Strad B♭ is 480 mm from the receiver to the bell rim (NMM 9107) with a 122 mm
  // bell, and its 7C mouthpiece (88 mm long, 22 mm of it in the receiver) adds 66 mm
  it('the flute is 670 mm with a key on every tone hole; the trumpet 480 mm to a 122 mm bell, 546 mm with its mouthpiece', () => {
    const f = buildFluteModel();
    const fb = bounds(f.statics);
    expect(fb.hi[0] - fb.lo[0]).toBeGreaterThan(0.65);
    expect(fb.hi[0] - fb.lo[0]).toBeLessThan(0.69);
    expect(f.holes.length).toBeGreaterThanOrEqual(12);
    expect(f.keys.length).toBe(f.holes.length);
    const t = buildTrumpetModel();
    const body = bounds([t.statics[0]]);
    expect(body.hi[0] - body.lo[0]).toBeGreaterThan(0.466);
    expect(body.hi[0] - body.lo[0]).toBeLessThan(0.494);
    const all = bounds(t.statics);
    expect(all.hi[0] - all.lo[0]).toBeGreaterThan(0.53);
    expect(all.hi[0] - all.lo[0]).toBeLessThan(0.562);
    expect(2 * t.rim).toBeCloseTo(0.122, 2);
  });

  it('the flute closes every hole above the note it sounds; the trumpet presses its valves and kicks the 3rd slide for low D', () => {
    const scale = { of: (v: number) => v || 1 };
    const f = buildFluteModel();
    const pose = newWindPose();
    const b = new Batch();
    // G4 on the bore: c / 2f (the engine's own focus length), its shape a half sine
    const g4 = 440 * 2 ** ((67 - 69) / 12);
    const fr = { focus: { lengthM: 343 / (2 * g4), shapes: [Float32Array.from({ length: 32 }, (_, i) => Math.sin((Math.PI * i) / 31))] }, breath: { pressure: 0.6, vib: 0 } } as unknown as VisualFrame;
    for (let k = 0; k < 40; k++) {
      b.clear();
      poseFlute(b, f, fr, pose, 1 / 60, k * 16, scale);
    }
    f.keys.forEach((k, i) => {
      // above G (and the G♯ key, closed-standing) closed; G and below open; the D♯ key pressed open
      const open = k.closed ? k.note === 63 : k.note <= 67;
      if (open) expect(pose.cups[i]).toBeGreaterThan(0.9);
      else expect(pose.cups[i]).toBeLessThan(0.1);
    });
    const t = buildTrumpetModel();
    const tp = newWindPose();
    const tf = { excite: { meta: 'valves 1+3 · partial 3' }, focus: null } as unknown as VisualFrame;
    for (let k = 0; k < 90; k++) {
      b.clear();
      poseTrumpet(b, t, tf, tp, 1 / 60, k * 16, 0.01, scale);
    }
    expect(tp.valves[0]).toBeGreaterThan(0.9);
    expect(tp.valves[1]).toBeLessThan(0.1);
    expect(tp.valves[2]).toBeGreaterThan(0.9);
    expect(tp.slide[2]).toBeGreaterThan(0.5);
    expect(tp.slide[0]).toBeLessThan(0.05);
  });
});

describe('pedals in the action (2D and 3D share it)', () => {
  it('the sostenuto holds the dampers of the keys down as it goes down; the upright soft pedal raises its hammers', async () => {
    const { newPianoState, stepAction } = await import('../src/ui/piano-draw.ts');
    const keys = keysOf('grand');
    const pts = keys.map((k) => ({ midi: k.midi, i: k.midi - 21, x: 0, w: 1, L: k.lengthM, k, wound: false }));
    const st = newPianoState();
    st.down = new Set([60]);
    for (let f = 0; f < 30; f++) stepAction(pts, st);
    st.middle = 1; // sostenuto down while C4 is held
    for (let f = 0; f < 5; f++) stepAction(pts, st);
    st.down = new Set([64]); // C4 released, E4 pressed after the pedal
    for (let f = 0; f < 5; f++) stepAction(pts, st);
    st.down = new Set();
    for (let f = 0; f < 60; f++) stepAction(pts, st);
    expect(st.damper[60 - 21]).toBeGreaterThan(0.95);
    expect(st.damper[64 - 21]).toBeLessThan(0.05);
    // an upright's soft pedal: the hammers rest part way to the strings, with no shift
    const up = newPianoState();
    up.upright = true;
    up.soft = 1;
    for (let f = 0; f < 60; f++) stepAction(pts, up);
    expect(up.hammer[60 - 21]).toBeGreaterThan(0.4);
    expect(up.shift).toBeLessThan(0.01);
  });
});
