// The stage in 3D: a WebGL2 canvas over the instrument area, an orbit camera (drag to turn,
// pinch or wheel to zoom, double-click to reset), and the instruments drawn from the live frames
// (three.js, `three3d.ts`; this module and three.js load only when 3D is first switched on).
// On the pianos, a click on a key (its strings or its key top) flies the camera to that key's own
// action, a section cutting away the keys in front of it (`zoomTo`, `zoomOut`; the stage wires them).
// Where WebGL2 is missing the toggle never appears and the 2D stage carries on (`webgl2.ts`).
import { Batch, project, type Mat4, type Mesh, type Vec3 } from './gl3d.ts';
import { buildScene, newScene3State, viewFor, type SceneIn, type View3 } from './scenes3d.ts';
import { fitView, screenBox } from './fit3d.ts';
import { lidKnobPoints, lidPoint, lidRay, zoomFrame, type PianoModel } from './piano3d.ts';
import { Renderer3 } from './three3d.ts';
import { blocked, invert4, lidFor, rayAt } from './handles3d.ts';
import { tromboneSizeIn } from './trombone3d.ts';

/** the lens: a 24° vertical field (about a 55 mm lens on full frame at the stage's aspect), not the
 *  wide 34° the views were first set for; the views' distances are scaled to keep the framing */
const FOV = 24;
const FRAME = Math.tan(0.3) / Math.tan(((FOV / 2) * Math.PI) / 180);
/** A narrow stage (its width under this many times its height) or a small one (under this many px
 *  wide): a phone held upright. It frames its instrument to fit: as large as the stage allows, whole,
 *  and clear of what lies over its top. A wide stage keeps the scenes' own views, which crop like a
 *  photograph (the grand's lid runs out of the top, the cello's endpin out of the bottom). */
const NARROW = 1.4;
const SMALL = 600;
/** that framing's margins, as shares of the picture: at each side, at the bottom, and under whatever
 *  lies over the top */
const FIT = { side: 0.04, bottom: 0.02, top: 0.015 };

export interface Stage3D {
  el: HTMLCanvasElement;
  /** draw one frame; `inputs` are read fresh each time. `clear`: how far down from the stage's top
   *  something lies over it (px: the file player), which a narrow stage's framing keeps clear of */
  frame(now: number, top: number, si: Omit<SceneIn, 'now' | 'dt' | 'lite'>, clear?: number): void;
  resetView(): void;
  /** set the camera (shots, tests) */
  setView(v: Partial<View3>): void;
  /** the piano key whose strings are nearest (x, y) (CSS px in the canvas), if close enough */
  pick(x: number, y: number): number | null;
  /** an ensemble's seat under (x, y) (CSS px in the canvas): the nearest whose instrument, a column from
   *  the floor to its height and as wide as its footprint, is under the point; null if none */
  seatAt(x: number, y: number): number | null;
  /** tests and review shots: where an ensemble's seat is on screen (CSS px in the canvas: the middle of its
   *  instrument), null if it is not drawn */
  seatScreen(i: number): [number, number] | null;
  /** the bowed strings' hair on screen (CSS px in the canvas: frog end, tip end) and the contact point along it */
  bowLine(): { fx: number; fy: number; tx: number; ty: number; pos: number } | null;
  /** asked first on every pointer down: true takes the pointer away from the orbit (the bow in the hand) */
  grab: ((e: PointerEvent) => boolean) | null;
  /** tests: where a key's strings are on screen (CSS px in the canvas: the middle of the speaking length) */
  screenOf(midi: number): [number, number] | null;
  /** pianos: fly to a key's action (eased, ≈0.9 s), a section cutting away the keys in front of it */
  zoomTo(midi: number): void;
  /** back to the whole instrument (eased) */
  zoomOut(): void;
  /** the key seen close up (null: none, or flying back out) */
  readonly zoomed: number | null;
  /** tests: where the camera was last frame (world, m) */
  readonly eye: Vec3;
  /** tests and review shots: the box of the instrument as drawn last frame (CSS px in the canvas,
   *  every vertex projected) */
  box(): { x0: number; y0: number; x1: number; y1: number } | null;
  /** tests and review shots: where the zoomed key's action (its box, `zoomFrame`) is on the canvas, in CSS pixels */
  zoomBox(): { x0: number; y0: number; x1: number; y1: number } | null;
  /** the view the instrument is first seen from, and comes back to (tests) */
  readonly home: View3 | null;
  /** tests: a close-up's section as drawn last frame (everything with side·(x − at) > 0 is cut away), and
   *  how far from its target the camera is, over the close-up's own framing distance */
  readonly section: { at: number; side: 1 | -1; zoom: number } | null;
  dispose(): void;
  /** frame build + draw time (ms, smoothed, without one-off model building), vertices, whether
   *  the light scene / shadows are in use, the total time spent building models, and whether the
   *  last frame drew the grand's lid as a mirror */
  stats: { ms: number; vertices: number; lite: boolean; frames: number; lit: number; sum: number; buildMs: number; shadows: boolean; ao: boolean; mirror: boolean; mirrors: number };
  /** tests: read back the next frames' pixels (lit count and a checksum) */
  probe: boolean;
  /** the renderer (debugging) */
  r3: Renderer3;
  /** The grand's lid, taken in the hand on the picture (CSS px in the canvas): whether the lid is
   *  under (x, y) and shows there (nothing stands in front of it). False when this stage has no lid to
   *  take (not a grand, its case hidden, a key's close-up, an ensemble). */
  lidAt(x: number, y: number): boolean;
  /** take the lid at (x, y), if it is there: the point taken stays under the pointer (`dragLid`) until
   *  it is let go (`dropLid`) */
  takeLid(x: number, y: number): boolean;
  /** the opening (0 … 1) that keeps the point of the lid taken under (x, y): the lid follows the hand
   *  continuously (the view puts it onto its nearest rest when it is let go); null when it is not held */
  dragLid(x: number, y: number): number | null;
  dropLid(): void;
  /** the lid is in the hand */
  readonly lidHeld: boolean;
  /** Where the lid's knob sits on the picture (CSS px in the canvas): beside the lid's front corner
   *  on the treble side, level with the rim (piano3d `lidKnobPoints`: it does not move with the lid, so
   *  it stays under the finger turning it), clear of what lies over the stage's top; null when there is
   *  no lid to set. */
  lidKnob(): [number, number] | null;
  /** tests and review shots: a point on the picture where the lid can be taken (near its free edge,
   *  showing, clear of what lies over the canvas) */
  lidHandle(): [number, number] | null;
  /** the room's light pool brightens at its rim (its knob under the pointer, turned or focused) */
  roomHot: boolean;
  /** Where the room's knob sits on the picture (CSS px in the canvas): on the floor, where the pool of
   *  light at its largest (the largest room) ends on the right of the picture (it does not move as
   *  the room is turned); null when there is no pool (an ensemble, a close-up) */
  roomKnob(): [number, number] | null;
  /** tests: the grand's prop sticks' swing as posed last frame (the long, the short: 0 folded … 1 up) */
  readonly sticks: number[];
}

/** a box as a scene of its eight corners (the framing reads positions only) */
function boxBatch(lo: Vec3, hi: Vec3): Batch {
  const data = new Float32Array(8 * 14);
  for (let i = 0; i < 8; i++) {
    data[i * 14] = i & 1 ? hi[0] : lo[0];
    data[i * 14 + 1] = i & 2 ? hi[1] : lo[1];
    data[i * 14 + 2] = i & 4 ? hi[2] : lo[2];
  }
  const b = new Batch();
  const mesh: Mesh = { data, count: 8 };
  b.mesh(mesh, null);
  return b;
}

export function createStage3D(host: HTMLElement): Stage3D | null {
  const el = document.createElement('canvas');
  el.className = 'stage-3d';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'The instrument in 3D, moving as the simulation computes it. Drag to turn, pinch or scroll to zoom, double-click to reset.');
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600 || matchMedia('(pointer: coarse)').matches;
  const r = Renderer3.create(el, phone);
  if (!r) return null;
  host.append(el);
  const batch = new Batch();
  const st = newScene3State();
  let view: View3 | null = null;
  let viewKey = '';
  /** what the home view was framed for: the instrument, the stage's size, what lies over its top */
  let fitSig = '';
  // the camera eases towards where the input puts it (damped orbit); setView/reset jump there
  let yaw = 0;
  let pitch = 0;
  let dist = 1;
  let yawT = 0;
  let pitchT = 0;
  let distT = 1;
  let last = 0;
  const stats = { ms: 0, vertices: 0, lite: phone, frames: 0, lit: 0, sum: 0, buildMs: 0, shadows: true, ao: !phone, mirror: false, mirrors: 0 };
  let probe = false;
  const px = new Uint8Array(4);
  let lastVP: Mat4 | null = null;
  let lastEye: Vec3 = [0, 0, 0];
  let cssW = 1;
  let cssH = 1;
  // the target the orbit turns about (the view's, or a zoomed key's), and a flight between views
  let target: Vec3 = [0, 0, 0];
  interface Cam {
    target: Vec3;
    yaw: number;
    pitch: number;
    dist: number;
    cut: number;
  }
  /** `dist`: the close-up's own framing distance (the wheel and the pinch move about it) */
  let zoom: { midi: number; side: 1 | -1; cut: number; dist: number; sig: string } | null = null;
  /** the stage a close-up is framed for (the piano, the stage's size, what lies over its top), as of
   *  the last frame; and a close-up to frame again because that changed under it */
  let stageSig = '';
  let clearNow = 0;
  let rezoom: number | null = null;
  /** how far into a key's close-up the camera is (0 the whole piano … 1 there), eased with its flight */
  let closeK = 0;
  let fly: { t0: number; dur: number; from: Cam; to: Cam; out: boolean } | null = null;
  let cutAt = 0;
  let kind: 'grand' | 'upright' = 'grand';
  let family = '';
  /** ease in and out (a camera move that starts and lands softly) */
  const smooth = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const camNow = (): Cam => ({ target: [...target] as Vec3, yaw, pitch, dist, cut: cutAt });
  const flyTo = (to: Cam, out: boolean, dur = 0.9) => {
    const from = camNow();
    // turn the short way round
    while (to.yaw - from.yaw > Math.PI) to.yaw -= 2 * Math.PI;
    while (to.yaw - from.yaw < -Math.PI) to.yaw += 2 * Math.PI;
    fly = { t0: performance.now(), dur: dur * 1000, from, to, out };
  };

  // ---- orbit: one pointer turns, two pinch, the wheel zooms
  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch0 = 0;
  let dist0 = 1;
  el.addEventListener('pointerdown', (e) => {
    if (api.grab?.(e)) return;
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      dist0 = distT;
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 1) {
      yawT += (e.clientX - p.x) * 0.006;
      pitchT = Math.max(-0.2, Math.min(1.45, pitchT + (e.clientY - p.y) * 0.005));
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size === 2 && pinch0 > 0) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) distT = clampDist(dist0 * (pinch0 / d));
    }
  });
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = 0;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      distT = clampDist(distT * Math.exp(e.deltaY * 0.0015));
    },
    { passive: false },
  );
  el.addEventListener('dblclick', () => (zoom ? zoomOut() : resetView()));
  // (in a key's close-up: from a third of its framing distance, where one part fills the stage, to
  // twice it)
  const clampDist = (d: number) => (zoom && !fly ? Math.max(zoom.dist * 0.33, Math.min(zoom.dist * 2, d)) : view ? Math.max(view.dist * 0.12, Math.min(view.dist * 3, d)) : d);
  function resetView(): void {
    if (!view) return;
    zoom = null;
    fly = null;
    closeK = 0;
    target = [...view.target] as Vec3;
    yaw = yawT = view.yaw;
    pitch = pitchT = view.pitch;
    dist = distT = view.dist;
  }
  /** the camera is where the home view put it (the user has not turned or zoomed it) */
  const atHome = () => !!view && !zoom && !fly && Math.abs(yawT - view.yaw) < 1e-4 && Math.abs(pitchT - view.pitch) < 1e-4 && Math.abs(distT / view.dist - 1) < 1e-4;
  /** The view an instrument is first seen from, and comes back to: the scenes' own (scenes3d.ts). On
   *  a phone held upright (a narrow or a small stage), or wherever the view asks to be whole (the
   *  double bass: `whole`), it is the nearest view on the same bearing that
   *  shows the whole instrument, in the middle of the stage that is free: exact, from the scene as
   *  built this frame (fit3d.ts). `w`, `h`: the stage (px); `clear`: how far down from its top
   *  something lies over it. */
  const homeView = (si: SceneIn, w: number, h: number, clear: number): View3 => {
    const v = viewFor(si, st);
    v.dist *= FRAME;
    const aspect = w / h;
    if (si.ensemble?.length || (aspect >= NARROW && w >= SMALL && !v.whole)) return v;
    const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
    const rect = { l: -1 + 2 * FIT.side, r: 1 - 2 * FIT.side, b: -1 + 2 * FIT.bottom, t: 1 - 2 * (clear / h + FIT.top) };
    // (a view that may turn on a narrow stage: the bearing it is nearest from, and of those within a
    // hundredth of the nearest, the one least turned)
    const turns = aspect < NARROW && v.swing ? 6 : 0;
    const fits: View3[] = [];
    for (let k = 0; k <= turns; k++) {
      const at = { ...v, yaw: v.yaw + (turns ? (v.swing! * k) / turns : 0) };
      const fit = fitView(batch, at, tanV, aspect, rect);
      if (fit) fits.push({ ...at, target: fit.target, dist: fit.dist });
    }
    const nearest = Math.min(...fits.map((f) => f.dist));
    return fits.find((f) => f.dist <= nearest * 1.01) ?? v;
  };
  function zoomTo(midi: number, again = false): void {
    if (family !== 'piano' || !view || (!again && zoom && zoom.midi === midi && !fly)) return;
    const f = zoomFrame(kind, midi);
    // framed to the action's extents on this canvas: its height, or its depth across the width
    const tanH = Math.tan(((FOV / 2) * Math.PI) / 180);
    const aspect = cssW / Math.max(1, cssH);
    let d = 1.04 * Math.max(f.h / (2 * tanH), (f.w * 0.99) / (2 * tanH * aspect));
    // from the nearer end, nearly in profile (the action reads as a side drawing; the keys behind
    // the cut recede a little), a little above the keys
    const to: Cam = { target: f.target, yaw: f.side * 1.4, pitch: 0.1, dist: d, cut: f.cut };
    // A narrow stage (a phone held upright) frames the key's action exactly, as it frames the whole
    // instrument: every corner of its box inside the stage's margins and under what lies over the
    // top. (The rule above measures the depth across the width as if seen square on and from far
    // away; from 80° and this near, the key's front and the damper ran out of the two sides.)
    if (aspect < NARROW || cssW < SMALL) {
      const rect = { l: -1 + 2 * FIT.side, r: 1 - 2 * FIT.side, b: -1 + 2 * FIT.bottom, t: 1 - 2 * (clearNow / Math.max(1, cssH) + FIT.top) };
      const fit = fitView(boxBatch(f.lo, f.hi), to, tanH, aspect, rect);
      if (fit) {
        to.target = fit.target;
        to.dist = d = fit.dist;
      }
    }
    // the section starts at the case's end (or where it already is) and sweeps in to the key
    if (!zoom || zoom.side !== f.side) cutAt = f.edge;
    zoom = { midi, side: f.side, cut: f.cut, dist: d, sig: stageSig };
    flyTo(to, false);
  }
  function zoomOut(): void {
    if (!zoom || !view) return;
    flyTo({ target: [...view.target] as Vec3, yaw: view.yaw, pitch: view.pitch, dist: view.dist, cut: zoom.side * 0.85 }, true, 0.8);
  }

  // ---- the lid: taken in the hand on the picture, and where its knob sits (handles3d.ts; the stage
  // view wires them to the engine's lid and puts the lid onto its rests)
  /** what the last frame drew, as the lid needs it */
  const seen = { lid: 1, single: false, grand: false, caseShown: true };
  const lidModel = () => (seen.single && seen.grand && seen.caseShown && !zoom && !fly && st.grand?.lid ? st.grand : null);
  let invVP: Float64Array | null = null;
  let invFor: Mat4 | null = null;
  const ray = (x: number, y: number) => {
    if (!lastVP) return null;
    if (invFor !== lastVP) {
      invVP = invert4(lastVP);
      invFor = lastVP;
    }
    return invVP ? rayAt(invVP, x, y, cssW, cssH) : null;
  };
  /** the lid and its sticks are what is pointed at: they hide nothing from themselves */
  const lidParts = (pm: PianoModel): Set<Mesh> => {
    const out = new Set<Mesh>();
    if (pm.lid) out.add(pm.lid);
    for (const p of pm.props) out.add(p.mesh);
    return out;
  };
  /** the lid under (x, y), showing: the point there, in the lid's own frame */
  const lidUnder = (x: number, y: number): Vec3 | null => {
    const pm = lidModel();
    const r = pm && ray(x, y);
    if (!pm || !r) return null;
    const hit = lidRay(pm, seen.lid, r.o, r.d);
    if (!hit || blocked(batch, r, hit.t, lidParts(pm))) return null;
    return hit.local;
  };
  /** while the lid is in the hand: the point taken (the lid's own frame) and the opening last set */
  let held: { at: Vec3; v: number } | null = null;
  const knobPts = new WeakMap<PianoModel, Vec3[]>();
  /** a point on the picture a control can sit on: inside the canvas and below what lies over its top */
  const clear = (q: [number, number] | null, m: number): q is [number, number] => !!q && q[0] >= m && q[0] <= cssW - m && q[1] >= Math.max(m, clearNow + m) && q[1] <= cssH - m;
  let roomHot = false;
  let hot = 0;

  const api: Stage3D = {
    el,
    lidAt(x, y) {
      return !!lidUnder(x, y);
    },
    takeLid(x, y) {
      const at = lidUnder(x, y);
      held = at ? { at, v: seen.lid } : null;
      return !!held;
    },
    dragLid(x, y) {
      const pm = st.grand;
      if (!held || !pm || !lastVP) return null;
      const at = held.at;
      held.v = lidFor((u) => lidPoint(pm, at, u), lastVP, cssW, cssH, x, y, held.v);
      return held.v;
    },
    dropLid() {
      held = null;
    },
    get lidHeld() {
      return !!held;
    },
    lidKnob() {
      const pm = lidModel();
      if (!pm || !lastVP) return null;
      let pts = knobPts.get(pm);
      if (!pts) knobPts.set(pm, (pts = lidKnobPoints(pm)));
      for (const p of pts) {
        const q = project(lastVP, p, cssW, cssH);
        if (clear(q, 26)) return [q[0], q[1]];
      }
      return null;
    },
    lidHandle() {
      const pm = lidModel();
      const sl = pm?.lidSlab;
      if (!pm || !sl || !lastVP) return null;
      // (the point of the lid nearest its free edge that shows on the picture, clear of what lies over
      // it: a grid over the lid every 10 cm, on whichever face the camera sees)
      const box = el.getBoundingClientRect();
      const xs = sl.poly.map((q) => q[0]);
      const zs = sl.poly.map((q) => q[1]);
      let best: { q: [number, number]; x: number } | null = null;
      for (let x = Math.max(...xs) - 0.06; x > Math.min(...xs); x -= 0.1)
        for (let z = Math.min(...zs) + 0.05; z < Math.max(...zs); z += 0.1) {
          if (best && x < best.x - 1e-6) continue;
          for (const y of [sl.y1, sl.y0]) {
            const q = project(lastVP, lidPoint(pm, [x, y, z], seen.lid), cssW, cssH);
            if (!clear(q, 16) || document.elementFromPoint(box.left + q[0], box.top + q[1]) !== el) continue;
            const hit = lidUnder(q[0], q[1]);
            if (!hit || Math.hypot(hit[0] - x, hit[2] - z) > 0.03) continue;
            if (!best || x > best.x + 1e-6 || q[1] > best.q[1]) best = { q, x };
          }
        }
      return best?.q ?? null;
    },
    get roomHot() {
      return roomHot;
    },
    roomKnob() {
      const f = batch.floor;
      const R = f?.pool?.Rmax;
      if (!f || !R || !lastVP || !seen.single || zoom || fly) return null;
      let best: [number, number] | null = null;
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const q = project(lastVP, [f.c[0] + R * Math.cos(a), f.y, f.c[2] + R * Math.sin(a)], cssW, cssH);
        if (q && (!best || q[0] > best[0])) best = [q[0], q[1]];
      }
      return best;
    },
    set roomHot(v: boolean) {
      roomHot = v;
    },
    get sticks() {
      return [...st.pianoPose.props];
    },
    stats,
    r3: r,
    get probe() {
      return probe;
    },
    set probe(v: boolean) {
      probe = v;
    },
    resetView,
    zoomTo,
    zoomOut,
    get zoomed() {
      return zoom && !(fly && fly.out) ? zoom.midi : null;
    },
    get eye() {
      return [...lastEye] as Vec3;
    },
    get section() {
      return zoom ? { at: cutAt, side: zoom.side, zoom: dist / zoom.dist } : null;
    },
    zoomBox() {
      if (!zoom || !lastVP) return null;
      const f = zoomFrame(kind, zoom.midi);
      const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let i = 0; i < 8; i++) {
        const q = project(lastVP, [i & 1 ? f.hi[0] : f.lo[0], i & 2 ? f.hi[1] : f.lo[1], i & 4 ? f.hi[2] : f.lo[2]], cssW, cssH);
        if (!q) return null;
        out.x0 = Math.min(out.x0, q[0]);
        out.x1 = Math.max(out.x1, q[0]);
        out.y0 = Math.min(out.y0, q[1]);
        out.y1 = Math.max(out.y1, q[1]);
      }
      return out;
    },
    box() {
      return lastVP ? screenBox(batch, lastVP, cssW, cssH) : null;
    },
    get home() {
      return view ? { ...view, target: [...view.target] as Vec3 } : null;
    },
    setView(v) {
      if (!view) return;
      zoom = null;
      fly = null;
      closeK = 0;
      if (v.target) {
        view = { ...view, target: v.target };
        target = [...v.target] as Vec3;
      }
      if (v.yaw !== undefined) yaw = yawT = v.yaw;
      if (v.pitch !== undefined) pitch = pitchT = v.pitch;
      // (distances in the views' units: scaled by the lens like the default views)
      if (v.dist !== undefined) dist = distT = v.dist * FRAME;
    },
    seatAt(x, y) {
      if (!lastVP || !st.seats.length) return null;
      let best: number | null = null;
      let bd = Infinity;
      st.seats.forEach((s, i) => {
        // (from the riser it stands on, c[1], to its top)
        const mid = (s.c[1] + s.top) / 2;
        const a = project(lastVP!, [s.c[0], s.c[1], s.c[2]], cssW, cssH);
        const b = project(lastVP!, [s.c[0], s.top, s.c[2]], cssW, cssH);
        const e = project(lastVP!, [s.c[0] + s.r, mid, s.c[2]], cssW, cssH);
        const m = project(lastVP!, [s.c[0], mid, s.c[2]], cssW, cssH);
        if (!a || !b || !e || !m) return;
        // the distance to the column's axis on the picture, over its half-width there
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const half = Math.max(12, Math.hypot(e[0] - m[0], e[1] - m[1]));
        const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) / half;
        if (d < 1 && d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    },
    seatScreen(i) {
      const s = st.seats[i];
      if (!lastVP || !s) return null;
      return project(lastVP, [s.c[0], s.c[1] + (s.top - s.c[1]) * 0.55, s.c[2]], cssW, cssH);
    },
    pick(x, y) {
      if (!lastVP || !st.picks.length) return null;
      let best: number | null = null;
      let bd = Infinity;
      for (const s of st.picks) {
        const a = project(lastVP, s.a, cssW, cssH);
        const b = project(lastVP, s.b, cssW, cssH);
        if (!a || !b) continue;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
        if (d < bd) {
          bd = d;
          best = s.midi;
        }
      }
      return bd < 7 ? best : null;
    },
    bowLine() {
      const l = st.bowLine;
      if (!lastVP || !l) return null;
      const a = project(lastVP, l.a, cssW, cssH);
      const b = project(lastVP, l.b, cssW, cssH);
      return a && b ? { fx: a[0], fy: a[1], tx: b[0], ty: b[1], pos: l.pos } : null;
    },
    grab: null,
    screenOf(midi) {
      const s = st.picks.find((p) => p.midi === midi);
      if (!lastVP || !s) return null;
      return project(lastVP, [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2], cssW, cssH);
    },
    dispose() {
      r.dispose();
      el.remove();
    },
    frame(now, topPx, si0, clearPx = 0) {
      const t0 = performance.now();
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      family = si0.family;
      kind = si0.kind;
      const si: SceneIn = { ...si0, now, dt, lite: stats.lite, zoomKey: zoom?.midi ?? null, cut: zoom ? { at: cutAt, side: zoom.side } : null };
      // size: the instrument area under the top band; phones draw at ≤1.5× pixels
      const host = el.parentElement!;
      const W = host.clientWidth;
      const H = Math.max(10, host.clientHeight - topPx);
      el.style.top = `${topPx}px`;
      el.style.height = `${H}px`;
      cssW = W;
      cssH = H;
      const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
      const pw = Math.round(W * dpr);
      const ph = Math.round(H * dpr);
      if (el.width !== pw || el.height !== ph) {
        el.width = pw;
        el.height = ph;
      }
      si.aspect = W / H;
      // the view for this instrument (and preset), framed for this stage: its size and what lies over
      // its top (a grand is framed with its lid wide open, whatever its opening: piano3d's posePiano,
      // so moving the lid never moves the camera)
      // (the reeds and the brass by instrument: the oboe, the clarinet, the trumpet, the horn are each
      // framed for themselves)
      // (a trombone by its size too: the Size knob makes another instrument, framed for itself)
      const key = si.ensemble?.length ? `ens:${W / H < 1.1 ? 'tall' : 'wide'}:${si.ensemble.map((p) => (p.family === 'piano' ? p.kind : p.family === 'bowed' ? (p.bowed?.id ?? 'bowed') : p.family === 'reed' ? (p.reed ?? 'oboe') : p.family === 'brass' ? (p.brass ?? 'trumpet') : p.family)).join(',')}` : si.family === 'piano' ? si.kind : si.family === 'bowed' ? (si.bowed?.id ?? 'bowed') : si.family === 'reed' ? (si.reed ?? 'oboe') : si.family === 'brass' ? (si.brass === 'trombone' ? `trombone:${tromboneSizeIn(si.fr, si.tromboneSize)}` : (si.brass ?? 'trumpet')) : si.family;
      const clear = Math.max(0, Math.min(0.4 * H, clearPx));
      si.clearTop = clear / H;
      const sig = `${key}|${W}|${H}|${Math.round(clear)}`;
      // a key's close-up outlives a change of piano (grand ↔ upright: the same key, the other
      // action) and of the stage (the phone turned): it is framed again, once the view is
      clearNow = clear;
      stageSig = `${key}|${W}|${H}|${Math.round(clear)}`;
      if (zoom && !(fly && fly.out) && zoom.sig !== stageSig) rezoom = zoom.midi;
      // scene (the models are built on first use; that time is kept out of the frame budget)
      batch.clear();
      batch.wantFit = sig !== fitSig && !si.ensemble?.length;
      const built0 = st.buildMs;
      buildScene(batch, si, st);
      const buildMs = st.buildMs - built0;
      stats.buildMs = st.buildMs;
      // A new instrument starts from its home view. The same one on a stage that has changed (the
      // phone turned) is framed again, and follows only if the camera was still at home.
      if (sig !== fitSig) {
        const home = key !== viewKey || atHome();
        viewKey = key;
        // (a piano has no model until its keys are known: framed when it has)
        if (si.ensemble?.length || batch.meshes().length) fitSig = sig;
        view = homeView(si, W, H, clear);
        if (home) resetView();
      }
      if (rezoom !== null) {
        if (si.family !== 'piano' || si.ensemble?.length) rezoom = null;
        else if (fitSig === sig && view) {
          const m = rezoom;
          rezoom = null;
          zoomTo(m, true);
        }
      }
      // camera: orbiting the target, eased (τ ≈ 70 ms), never below the floor; or flying (a key's
      // action, close up, and back), eased in and out, the section sweeping with it
      if (fly) {
        const t = Math.min(1, (performance.now() - fly.t0) / fly.dur);
        const e = smooth(t);
        const a = fly.from;
        const b = fly.to;
        for (let k = 0; k < 3; k++) target[k] = a.target[k] + (b.target[k] - a.target[k]) * e;
        yaw = yawT = a.yaw + (b.yaw - a.yaw) * e;
        pitch = pitchT = a.pitch + (b.pitch - a.pitch) * e;
        dist = distT = a.dist * (b.dist / a.dist) ** e;
        cutAt = a.cut + (b.cut - a.cut) * e;
        // (the close-up's light comes up with the flight in, from wherever an earlier one left it)
        closeK = fly.out ? Math.min(closeK, 1 - e) : Math.max(closeK, e);
        if (t >= 1) {
          if (fly.out) zoom = null;
          fly = null;
        }
      }
      if (!zoom) closeK = 0;
      const kE = 1 - Math.exp(-dt / 0.07);
      yaw += (yawT - yaw) * kE;
      pitch += (pitchT - pitch) * kE;
      dist += (distT - dist) * kE;
      const minPitch = Math.asin(Math.max(-1, Math.min(1, (0.04 - target[1]) / dist)));
      if (pitch < minPitch) pitch = pitchT = Math.max(pitchT, minPitch);
      // never into the instrument: a piano's orbit target is inside its case, so zooming in (wheel,
      // pinch) would carry the camera through the plate into the case. Outside a key's close-up
      // (beside its section) the camera stops 6 cm outside the case's box, along its own ray
      const dir: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
      const ko = batch.keepOut;
      if (ko && !zoom) {
        const m = 0.06;
        const inside = (p: Vec3) => p[0] > ko.lo[0] - m && p[0] < ko.hi[0] + m && p[1] > ko.lo[1] - m && p[1] < ko.hi[1] + m && p[2] > ko.lo[2] - m && p[2] < ko.hi[2] + m;
        const at = (d: number): Vec3 => [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d];
        if (inside(at(dist))) {
          // the ray's exit from the expanded box (the target may be inside it, or behind it)
          let tExit = Infinity;
          for (let k = 0; k < 3; k++) {
            if (Math.abs(dir[k]) < 1e-6) continue;
            const t = ((dir[k] > 0 ? ko.hi[k] + m : ko.lo[k] - m) - target[k]) / dir[k];
            if (t > 0) tExit = Math.min(tExit, t);
          }
          if (Number.isFinite(tExit)) dist = distT = Math.max(dist, distT, tExit + 0.01);
        }
      }
      // a key's close-up is seen from the open side of its section: the orbit stops 6 cm short of the
      // cut's plane (past it the camera would be inside the keys left standing, the near plane cutting
      // through their parts)
      if (zoom && !fly) {
        const reach = dist * Math.cos(pitch);
        const s0 = Math.min(0.98, (0.06 + zoom.side * (cutAt - target[0])) / Math.max(1e-3, reach));
        if (zoom.side * Math.sin(yaw) < s0) {
          // (towards the cut's side the yaw, times the side, lies within asin(s0) … π − asin(s0): the nearer end)
          const a0 = Math.asin(s0);
          const ys = yaw * zoom.side;
          const turn = Math.round(ys / (2 * Math.PI)) * 2 * Math.PI;
          const phi = ys - turn;
          yaw = yawT = zoom.side * (turn + (Math.abs(phi) < Math.PI / 2 ? a0 : Math.PI - a0));
          dir[0] = Math.cos(pitch) * Math.sin(yaw);
          dir[2] = -Math.cos(pitch) * Math.cos(yaw);
        }
      }
      const eye: Vec3 = [target[0] + dist * dir[0], target[1] + dist * dir[1], target[2] + dist * dir[2]];
      lastEye = eye;
      const g = getComputedStyle(document.body).getPropertyValue('--ground').trim() || '#0e0d0b';
      const hex = /^#([0-9a-f]{6})$/i.exec(g)?.[1] ?? '0e0d0b';
      const ground: [number, number, number] = [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
      // the lid: what this frame shows; the pool's rim brightens while the room's knob is under the
      // pointer, turned or focused (τ 0.1 s)
      seen.lid = si.lid;
      seen.single = !si.ensemble?.length;
      seen.grand = si.family === 'piano' && si.kind === 'grand';
      seen.caseShown = !si.caseHidden;
      hot += ((roomHot && seen.single ? 1 : 0) - hot) * (1 - Math.exp(-dt / 0.1));
      r.poolHot = hot;
      r.shadows = stats.shadows;
      r.ao = stats.ao;
      r.closeUp = zoom ? closeK : 0;
      const progs = r.r.info.programs?.length ?? 0;
      r.draw(batch, eye, target, FOV, pw, ph, ground);
      lastVP = r.vp.elements as unknown as Mat4;
      // (held back while a new instrument's shaders compile: nothing drawn, nothing to count)
      if (r.held) return;
      // (a piano shown whole: its key's close-up will draw a section; its shaders are compiled ahead)
      if (si.family === 'piano' && !si.ensemble?.length && !zoom && !fly) r.warmSection();
      stats.mirror = r.mirrored > 0;
      stats.mirrors = r.mirrored;
      // budget: if a frame costs more than ~9 ms, drop the occlusion, then draw the light scene
      // (every other string, fewer parts), then drop the shadows. A frame that compiled shaders
      // (the first of each instrument) is kept out of it, as the model building is.
      const compiled = (r.r.info.programs?.length ?? 0) !== progs;
      const ms = performance.now() - t0 - buildMs;
      if (!compiled) {
        stats.ms = stats.frames ? stats.ms * 0.95 + ms * 0.05 : ms;
        stats.frames++;
      }
      stats.vertices = batch.vertices;
      if (stats.frames > 30 && stats.ms > 9) {
        if (stats.ao) stats.ao = false;
        else if (stats.lite) stats.shadows = false;
        else stats.lite = true;
        stats.frames = 1;
      }
      if (probe) {
        // sample a grid of pixels straight after drawing (the buffer is not kept for later)
        let lit = 0;
        let sum = 0;
        for (let y = 0; y < 24; y++)
          for (let x = 0; x < 40; x++) {
            r.readPixel(Math.floor(((x + 0.5) / 40) * pw), Math.floor(((y + 0.5) / 24) * ph), px);
            const v = px[0] + px[1] + px[2];
            if (v > 90) lit++;
            sum = (sum * 31 + v) % 1000003;
          }
        stats.lit = lit;
        stats.sum = sum;
      }
    },
  };
  return api;
}
