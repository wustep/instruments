// The clarinet on the 2D stage. PLACEHOLDER (the foundation commit): the oboe's drawing stands in until
// the clarinet's own lands; the API below is the one the stage, the Orchestra and the vector look use.
import type { VisualFrame } from '@piano-model/engine';
import { drawOboe, newOboeState, oboeBox, type OboeState } from './oboe-draw.ts';

export type ClarinetState = OboeState;
export const newClarinetState = (): ClarinetState => newOboeState();
/** the box (m) the clarinet is drawn in at one px per metre (an ensemble sizes it from the strings' scale) */
export const clarinetBox = (): { w: number; h: number } => oboeBox();
/** `top`: the file player's px over the box's top */
export function drawClarinet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: ClarinetState, top = 0): void {
  drawOboe(ctx, W, H, fr, st, top);
}
