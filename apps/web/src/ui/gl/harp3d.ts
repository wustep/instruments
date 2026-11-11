// The harp on the 3D stage. STUB: a column, a neck, a soundbox and the 47 strings as plain solids, until the
// harp's own model lands, so the page runs end to end. The API below is what scenes3d.ts uses (the single
// stage, a seat in the Orchestra, the camera).
import { harpStrings, type VisualFrame } from '@piano-model/engine';
import { type Batch, type Mat4, type Mesh, type Vec3, translate } from './gl3d.ts';
import { M, box, cyl } from './mesh.ts';
import { make } from './horn3d.ts';

export interface HarpModel {
  /** the harp standing on the floor: its pose alone on the stage */
  T: Mat4;
  statics: Mesh[];
  bounds: { c: Vec3; r: number };
}
/** the camera for the harp alone: yaw, pitch, and how far a narrow stage may swing round */
export const HARP_VIEW = { yaw: 0.5, pitch: 0.12, swing: 0.4 };
/** a harp in the Orchestra stands on the floor by its player: the radius of its footprint (m) and its top (m) */
export const HARP_SEAT = { r: 0.6, top: 1.9, turn: 0 };

export function buildHarpModel(): HarpModel {
  const S = harpStrings();
  const mesh = make((mb) => {
    // the column at the bass end, the base, the soundbox rising to the player's shoulder, the neck over them
    cyl(mb, [-0.42, 0.1, 0], [-0.42, 1.82, 0], 0.035, 0.03, 16, M.maple);
    box(mb, [-0.5, 0, -0.2], [0.5, 0.1, 0.2], M.maple);
    S.forEach((s, i) => {
      const u = i / (S.length - 1);
      const x = -0.4 + 0.84 * u;
      const y1 = 0.14 + 0.95 * u;
      cyl(mb, [x, y1, 0], [x, y1 + s.length, 0], s.material === 'wire' ? 0.0012 : 0.0007, s.material === 'wire' ? 0.0012 : 0.0007, 5, s.colour === 'red' ? M.silk : s.colour === 'black' ? M.ebony : s.material === 'wire' ? M.copper : M.bowHair, false);
    });
    cyl(mb, [-0.42, 0.14, 0.02], [0.46, 1.1, 0.02], 0.09, 0.05, 14, M.spruce);
    cyl(mb, [-0.42, 1.8, 0], [0.46, 1.2, 0], 0.03, 0.025, 12, M.maple);
  });
  return { T: translate(0, 0, 0), statics: [mesh], bounds: { c: [0, 0.95, 0], r: 1.1 } };
}

export function poseHarp(b: Batch, hm: HarpModel, _fr: VisualFrame | null, _dt: number, _now: number, T: Mat4 = hm.T): void {
  for (const s of hm.statics) b.mesh(s, T);
}
