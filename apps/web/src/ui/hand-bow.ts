// The bow in the player's hand: a finger (or the mouse) on the bow drags it along its own line, and
// the string sounds while it moves — faster is louder, back and forth changes the bow, and when the
// hair runs out it stops, as it does. The keys held meanwhile only stop the strings. One pointer
// holds the bow; the others are free for the keys.
//
// The engine's bow follows controllers 128–130 (BowedCore.hand): the picture is the engine's own, so
// the bow on the stage is where the engine has it, a frame behind the finger.
import { CC_HAND_BOW_OFF, CC_HAND_BOW_POS, CC_HAND_BOW_SPEED } from '@piano-model/engine';
import { audio } from '../audio.ts';

/** the hair on screen (client px): its frog end, its tip end, and the contact point along it (0…1) */
export interface BowLine {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  pos: number;
  /** the hair's real length, m */
  hair: number;
}

/** A finger's speed over the glass is several times an arm's with a bow, drawn at this size: the
 *  bow is heard at this fraction of the drawn speed (it is drawn where the finger is). */
const SPEED = 0.45;
/** no pointer event for this long: the finger is resting, the bow is still */
const REST_MS = 60;

export interface HandBow {
  /** the pointer went down at (x, y): take the bow? (true: the caller leaves this pointer alone) */
  down(e: PointerEvent): boolean;
  /** would a pointer here take the bow? (for the cursor) */
  over(e: PointerEvent): boolean;
  /** let go (an instrument switch, the page hidden) */
  drop(): void;
  readonly held: boolean;
}

/**
 * @param el the surface the bow is dragged on (it captures the pointer)
 * @param line where the hair is now, or null if there is no bow to take
 * @param reach how near the hair a pointer must land (px; Infinity: anywhere on el)
 */
export function createHandBow(el: HTMLElement, line: () => BowLine | null, reach: (e: PointerEvent) => number): HandBow {
  let h: { id: number; x: number; y: number; ux: number; uy: number; len: number; hair: number; pos0: number; pos: number; t: number; rest: number } | null = null;
  const still = () => {
    if (!h) return;
    h.rest = 0;
    audio.control(CC_HAND_BOW_SPEED, 0);
  };
  const drop = () => {
    if (!h) return;
    window.clearTimeout(h.rest);
    try {
      el.releasePointerCapture(h.id);
    } catch {
      /* already released */
    }
    h = null;
    el.classList.remove('bowing');
    audio.control(CC_HAND_BOW_OFF, 0);
  };
  el.addEventListener('pointermove', (e) => {
    if (!h || e.pointerId !== h.id) return;
    // the finger's travel along the hair moves the whole bow: the contact point goes the other way
    const d = (e.clientX - h.x) * h.ux + (e.clientY - h.y) * h.uy;
    const pos = Math.min(1, Math.max(0, h.pos0 - d / h.len));
    const now = e.timeStamp || performance.now();
    const dt = Math.max(1, now - h.t) / 1000;
    const v = ((pos - h.pos) * h.hair) / dt;
    h.pos = pos;
    h.t = now;
    audio.control(CC_HAND_BOW_POS, pos);
    audio.control(CC_HAND_BOW_SPEED, v * SPEED);
    window.clearTimeout(h.rest);
    h.rest = window.setTimeout(still, REST_MS);
    e.preventDefault();
  });
  /** the hair's line, if there is a bow and the pointer is within reach of it */
  const within = (e: PointerEvent): BowLine | null => {
    const l = line();
    if (!l) return null;
    const dx = l.tx - l.fx;
    const dy = l.ty - l.fy;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const r = reach(e);
    if (Number.isFinite(r)) {
      // the distance to the hair's line (the stick and frog reach a little past its ends)
      const t = Math.min(1.08, Math.max(-0.12, ((e.clientX - l.fx) * dx + (e.clientY - l.fy) * dy) / (len * len)));
      if (Math.hypot(e.clientX - (l.fx + t * dx), e.clientY - (l.fy + t * dy)) > r) return null;
    }
    return l;
  };
  const end = (e: PointerEvent) => {
    if (h && e.pointerId === h.id) drop();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  return {
    down(e) {
      if (h || (e.pointerType === 'mouse' && e.button !== 0)) return false;
      const l = within(e);
      if (!l) return false;
      const dx = l.tx - l.fx;
      const dy = l.ty - l.fy;
      const len = Math.hypot(dx, dy);
      h = { id: e.pointerId, x: e.clientX, y: e.clientY, ux: dx / len, uy: dy / len, len, hair: l.hair, pos0: l.pos, pos: l.pos, t: e.timeStamp || performance.now(), rest: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer */
      }
      el.classList.add('bowing');
      // the bow is in the hand from now on, still until it moves
      audio.control(CC_HAND_BOW_POS, l.pos);
      audio.control(CC_HAND_BOW_SPEED, 0);
      e.preventDefault();
      return true;
    },
    over: (e) => within(e) !== null,
    drop,
    get held() {
      return h !== null;
    },
  };
}
