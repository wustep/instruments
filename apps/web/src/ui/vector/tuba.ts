// The tuba in the vector (line) style. STUB: the horn's line drawing until the tuba's own lands.
import type { VisualFrame } from '@piano-model/engine';
import type { TubaState } from '../tuba-draw.ts';
import { drawHornV } from './horn.ts';

export function drawTubaV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TubaState, top = 0): void {
  drawHornV(ctx, W, H, fr, st, top);
}
