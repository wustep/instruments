// The tuba on the 2D stage (the drawn style). STUB: until the tuba's own drawing lands this draws the horn's
// (the same engine's lips and standing wave), so the page runs end to end. The API below is what the stage,
// the ensemble's rows and the tests use; the drawing module replaces the bodies.
import type { VisualFrame } from '@piano-model/engine';
import { drawHorn, hornBox, newHornState, type HornState } from './horn-draw.ts';

/** what the drawing keeps between frames, and what it last drew (for the room's source and the tests) */
export type TubaState = HornState;
export const newTubaState = (): TubaState => newHornState();
/** the tuba's box on the stage, m (width × height, with the margins its drawing keeps) */
export const tubaBox = (): { w: number; h: number } => hornBox();
/** draw the tuba in (W × H) px; `top`: px of the stage's top that something lies over (the file player) */
export function drawTuba(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TubaState, top = 0): void {
  drawHorn(ctx, W, H, fr, st, top);
}
