// The clarinet on the vector display. PLACEHOLDER (the foundation commit): the oboe's lines stand in.
import type { VisualFrame } from '@piano-model/engine';
import type { ClarinetState } from '../clarinet-draw.ts';
import { drawOboeV } from './oboe.ts';

export function drawClarinetV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: ClarinetState, top = 0): void {
  drawOboeV(ctx, W, H, fr, st, top);
}
