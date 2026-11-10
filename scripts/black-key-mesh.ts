// Dump one piano key's 3D meshes (its top and its key stick, placed as at rest) as triangles, for
// scripts/black-key-underside.py (a geometry view from below). `MODEL` names the piano3d module to
// build from (default: the current one), so an older copy can be dumped for a before/after.
//   npx tsx scripts/black-key-mesh.ts [midi=61] [grand|upright] > key.json
import { DEFAULT_PARAMS, PRESETS, buildKeySpecs } from '../packages/engine/src/core/design.ts';
import { MAT_LIST } from '../apps/web/src/ui/gl/mesh.ts';
import type { KeySummary } from '@piano-model/engine';

const midi = Number(process.argv[2] ?? 61);
const kind = (process.argv[3] ?? 'grand') as 'grand' | 'upright';
const mod = await import(process.env.MODEL ?? '../apps/web/src/ui/gl/piano3d.ts');
const d = PRESETS[kind];
const keys: KeySummary[] = buildKeySpecs(d, { ...DEFAULT_PARAMS, ...d.defaults }).map((s) => ({ midi: s.midi, f1: s.f1, B: s.B, nStrings: s.nStrings, lengthM: s.L, hasDamper: s.hasDamper, preparation: null }));
const pm = kind === 'grand' ? mod.buildGrandModel(keys) : mod.buildUprightModel(keys);
const g = pm.keys[midi - 21];
const tris: number[][] = [];
const add = (m: { data: Float32Array; count: number; mats: Uint16Array }, T: Float32Array | null) => {
  for (let v = 0; v < m.count; v++) {
    const o = v * 14;
    let [x, y, z] = [m.data[o], m.data[o + 1], m.data[o + 2]];
    let [nx, ny, nz] = [m.data[o + 3], m.data[o + 4], m.data[o + 5]];
    if (T) {
      [x, y, z] = [T[0] * x + T[4] * y + T[8] * z + T[12], T[1] * x + T[5] * y + T[9] * z + T[13], T[2] * x + T[6] * y + T[10] * z + T[14]];
      [nx, ny, nz] = [T[0] * nx + T[4] * ny + T[8] * nz, T[1] * nx + T[5] * ny + T[9] * nz, T[2] * nx + T[6] * ny + T[10] * nz];
    }
    const c = MAT_LIST[m.mats[v]].col;
    tris.push([x, y, z, nx, ny, nz, c[0], c[1], c[2]]);
  }
};
// the key top at its place, the stick sheared to the action
add(g.key, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, g.xc, 0, 0, 1]));
add(pm.parts.stick, g.shear);
process.stdout.write(JSON.stringify({ midi, kind, xc: g.xc, v: tris }));
