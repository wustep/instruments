// The timpani on the vector display (see kit.ts): the stage's own drawing (timpani-draw.ts), as lines.
import type { VisualFrame } from '@piano-model/engine';
import { drawTimpani, type TimpaniState } from '../timpani-draw.ts';

export function drawTimpaniV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TimpaniState, top = 0): void {
  drawTimpani(ctx, W, H, fr, st, top, true);
}
