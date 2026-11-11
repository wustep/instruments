// The tuba on the 3D stage. STUB: the horn's model until the tuba's own lands, so the page runs end to end.
// The API below is what scenes3d.ts uses (the single stage, a seat in the Orchestra, the camera).
import type { VisualFrame } from '@piano-model/engine';
import type { Batch, Mat4 } from './gl3d.ts';
import { HORN_HELD, HORN_SEAT, HORN_VIEW, buildHornModel, poseHorn, type HornModel } from './horn3d.ts';
import type { WindPose } from './winds3d.ts';

export type TubaModel = HornModel;
/** the camera for the tuba alone: yaw, pitch, and how far a narrow stage may swing round */
export const TUBA_VIEW = HORN_VIEW;
/** a seated player's tuba: the height it is held at (m), its turn from the seat's facing, its top (m) and
 *  the radius of its footprint (m) */
export const TUBA_SEAT = { ...HORN_SEAT, r: 0.42 };
/** the pose of a tuba held by a seated player (in the seat's frame) */
export const TUBA_HELD: Mat4 = HORN_HELD;
export const buildTubaModel = (): TubaModel => buildHornModel();
export function poseTuba(b: Batch, tm: TubaModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number, T: Mat4 = tm.T): void {
  poseHorn(b, tm, fr, pose, dt, now, rms, T);
}
