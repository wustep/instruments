// The stage in 3D: a WebGL2 canvas over the instrument area, an orbit camera (drag to turn,
// pinch or wheel to zoom, double-click to reset), and the instruments drawn from the live frames
// (three.js, `three3d.ts`; this module and three.js load only when 3D is first switched on).
// On the pianos, a click on a key (its strings or its key top) flies the camera to that key's own
// action, a section cutting away the keys in front of it (`zoomTo`, `zoomOut`; the stage wires them).
// Where WebGL2 is missing the toggle never appears and the 2D stage carries on (`webgl2.ts`).
import { Batch, project, type Mat4, type Vec3 } from './gl3d.ts';
import { buildScene, narrowStep, newScene3State, viewFor, type SceneIn, type View3 } from './scenes3d.ts';
import { zoomFrame } from './piano3d.ts';
import { Renderer3 } from './three3d.ts';

/** the lens: a 24° vertical field (about a 55 mm lens on full frame at the stage's aspect), not the
 *  wide 34° the views were first set for; the views' distances are scaled to keep the framing */
const FOV = 24;
const FRAME = Math.tan(0.3) / Math.tan(((FOV / 2) * Math.PI) / 180);

export interface Stage3D {
  el: HTMLCanvasElement;
  /** draw one frame; `inputs` are read fresh each time */
  frame(now: number, top: number, si: Omit<SceneIn, 'now' | 'dt' | 'lite'>): void;
  resetView(): void;
  /** set the camera (shots, tests) */
  setView(v: Partial<View3>): void;
  /** the piano key whose strings are nearest (x, y) (CSS px in the canvas), if close enough */
  pick(x: number, y: number): number | null;
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
  dispose(): void;
  /** frame build + draw time (ms, smoothed, without one-off model building), vertices, whether
   *  the light scene / shadows are in use, the total time spent building models, and whether the
   *  last frame drew the grand's lid as a mirror */
  stats: { ms: number; vertices: number; lite: boolean; frames: number; lit: number; sum: number; buildMs: number; shadows: boolean; ao: boolean; mirror: boolean };
  /** tests: read back the next frames' pixels (lit count and a checksum) */
  probe: boolean;
  /** the renderer (debugging) */
  r3: Renderer3;
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
  // the camera eases towards where the input puts it (damped orbit); setView/reset jump there
  let yaw = 0;
  let pitch = 0;
  let dist = 1;
  let yawT = 0;
  let pitchT = 0;
  let distT = 1;
  let last = 0;
  const stats = { ms: 0, vertices: 0, lite: phone, frames: 0, lit: 0, sum: 0, buildMs: 0, shadows: true, ao: !phone, mirror: false };
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
  let zoom: { midi: number; side: 1 | -1; cut: number } | null = null;
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
  const clampDist = (d: number) => (view ? Math.max(view.dist * 0.12, Math.min(view.dist * 3, d)) : d);
  function resetView(): void {
    if (!view) return;
    zoom = null;
    fly = null;
    target = [...view.target] as Vec3;
    yaw = yawT = view.yaw;
    pitch = pitchT = view.pitch;
    dist = distT = view.dist;
  }
  function zoomTo(midi: number): void {
    if (family !== 'piano' || !view || (zoom && zoom.midi === midi && !fly)) return;
    const f = zoomFrame(kind, midi);
    // framed to the action's extents on this canvas: its height, or its depth across the width
    const tanH = Math.tan(((FOV / 2) * Math.PI) / 180);
    const aspect = cssW / Math.max(1, cssH);
    const d = 1.04 * Math.max(f.h / (2 * tanH), (f.w * 0.99) / (2 * tanH * aspect));
    // from the nearer end, nearly in profile (the action reads as a side drawing; the keys behind
    // the cut recede a little), a little above the keys
    const to: Cam = { target: f.target, yaw: f.side * 1.4, pitch: 0.1, dist: d, cut: f.cut };
    // the section starts at the case's end (or where it already is) and sweeps in to the key
    if (!zoom || zoom.side !== f.side) cutAt = f.edge;
    zoom = { midi, side: f.side, cut: f.cut };
    flyTo(to, false);
  }
  function zoomOut(): void {
    if (!zoom || !view) return;
    flyTo({ target: [...view.target] as Vec3, yaw: view.yaw, pitch: view.pitch, dist: view.dist, cut: zoom.side * 0.85 }, true, 0.8);
  }

  const api: Stage3D = {
    el,
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
    setView(v) {
      if (!view) return;
      zoom = null;
      fly = null;
      if (v.target) {
        view = { ...view, target: v.target };
        target = [...v.target] as Vec3;
      }
      if (v.yaw !== undefined) yaw = yawT = v.yaw;
      if (v.pitch !== undefined) pitch = pitchT = v.pitch;
      // (distances in the views' units: scaled by the lens like the default views)
      if (v.dist !== undefined) dist = distT = v.dist * FRAME;
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
    frame(now, topPx, si0) {
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
      // scene (the models are built on first use; that time is kept out of the frame budget)
      batch.clear();
      const built0 = st.buildMs;
      buildScene(batch, si, st);
      const buildMs = st.buildMs - built0;
      stats.buildMs = st.buildMs;
      // the view for this instrument (and preset); reset when it changes
      const key = si.ensemble?.length ? `ens:${W / H < 1.1 ? 'tall' : 'wide'}:${si.ensemble.map((p) => (p.family === 'piano' ? p.kind : p.family === 'bowed' ? (p.bowed?.id ?? 'bowed') : p.family)).join(',')}` : si.family === 'piano' ? si.kind : si.family === 'bowed' ? (si.bowed?.id ?? 'bowed') : si.family;
      if (key !== viewKey) {
        viewKey = key;
        view = viewFor(si, st);
        view.dist *= FRAME;
        // a narrow or square screen: step back so the instrument fits the width
        const aspect = W / H;
        if (aspect < 1.4 && !si.ensemble?.length) view.dist *= Math.min(2.6, 1.4 / Math.max(0.45, aspect)) * 0.92 * narrowStep(si);
        resetView();
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
        if (t >= 1) {
          if (fly.out) zoom = null;
          fly = null;
        }
      }
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
      const eye: Vec3 = [target[0] + dist * dir[0], target[1] + dist * dir[1], target[2] + dist * dir[2]];
      lastEye = eye;
      const g = getComputedStyle(document.body).getPropertyValue('--ground').trim() || '#0e0d0b';
      const hex = /^#([0-9a-f]{6})$/i.exec(g)?.[1] ?? '0e0d0b';
      const ground: [number, number, number] = [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
      r.shadows = stats.shadows;
      r.ao = stats.ao;
      const progs = r.r.info.programs?.length ?? 0;
      r.draw(batch, eye, target, FOV, pw, ph, ground);
      lastVP = r.vp.elements as unknown as Mat4;
      stats.mirror = r.mirrored;
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
