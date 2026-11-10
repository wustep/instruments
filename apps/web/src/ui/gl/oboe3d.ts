// The oboe in 3D. PLACEHOLDER: the flute's model stands in until the oboe is built (a conservatoire
// oboe: reed and staple, top and lower joints, bell; keywork after the fingering chart, oboe-fingering.ts).
import type { VisualFrame } from '@piano-model/engine';
import type { Batch } from './gl3d.ts';
import { buildFluteModel, poseFlute, type FluteModel, type WindPose } from './winds3d.ts';

export type OboeModel = FluteModel;
export function buildOboeModel(): OboeModel {
  return buildFluteModel();
}
export function poseOboe(b: Batch, om: OboeModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, _rms: number): void {
  poseFlute(b, om, fr, pose, dt, now);
}
