// The harp in the vector (line) style. STUB: the strings as lines until the harp's own line drawing lands.
import type { VisualFrame } from '@piano-model/engine';
import { drawHarp, type HarpState } from '../harp-draw.ts';

export function drawHarpV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: HarpState, top = 0): void {
  drawHarp(ctx, W, H, fr, st, top, true);
}
