// The clarinet in 3D. PLACEHOLDER (the foundation commit): the oboe's model stands in until the
// clarinet's own lands; scenes3d.ts uses this API.
import type { VisualFrame } from '@piano-model/engine';
import type { Batch } from './gl3d.ts';
import type { WindPose } from './winds3d.ts';
import { buildOboeModel, poseOboe, type OboeModel } from './oboe3d.ts';

export type ClarinetModel = OboeModel;
export function buildClarinetModel(): ClarinetModel {
  return buildOboeModel();
}
export function poseClarinet(b: Batch, cm: ClarinetModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number): void {
  poseOboe(b, cm, fr, pose, dt, now, rms);
}
