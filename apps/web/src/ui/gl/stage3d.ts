// The stage in 3D: a WebGL2 canvas over the instrument area, an orbit camera (drag to turn,
// pinch or wheel to zoom, double-click to reset), and the scenes drawn from the live frames.
// Where WebGL2 is missing the toggle never appears and the 2D stage carries on.
import { Batch, Renderer, lookAt, mul, perspective, type Vec3 } from './gl3d.ts';
import { buildBowed, buildFlute, buildGrand, buildRoom, buildTrumpet, buildUpright, bowedView, fluteView, grandView, newScene3State, trumpetView, uprightView, type SceneIn, type View3 } from './scenes3d.ts';

export function webgl2Available(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export interface Stage3D {
  el: HTMLCanvasElement;
  /** draw one frame; `inputs` are read fresh each time */
  frame(now: number, top: number, si: Omit<SceneIn, 'now' | 'dt' | 'lite'>): void;
  resetView(): void;
  dispose(): void;
  /** frame build + draw time (ms, smoothed), vertices, and whether the light scene is in use */
  stats: { ms: number; vertices: number; lite: boolean; frames: number; lit: number; sum: number };
  /** tests: read back the next frames' pixels (lit count and a checksum) */
  probe: boolean;
}

export function createStage3D(host: HTMLElement): Stage3D | null {
  const el = document.createElement('canvas');
  el.className = 'stage-3d';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'The instrument in 3D, moving as the simulation computes it. Drag to turn, pinch or scroll to zoom, double-click to reset.');
  const r = Renderer.create(el);
  if (!r) return null;
  host.append(el);
  const batch = new Batch();
  const st = newScene3State();
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600 || matchMedia('(pointer: coarse)').matches;
  let view: View3 | null = null;
  let viewKey = '';
  let yaw = 0;
  let pitch = 0;
  let dist = 1;
  let last = 0;
  const stats = { ms: 0, vertices: 0, lite: phone, frames: 0, lit: 0, sum: 0 };
  let probe = false;
  const px = new Uint8Array(4);

  // ---- orbit: one pointer turns, two pinch, the wheel zooms
  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch0 = 0;
  let dist0 = 1;
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      dist0 = dist;
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 1) {
      yaw += (e.clientX - p.x) * 0.006;
      pitch = Math.max(-0.2, Math.min(1.45, pitch + (e.clientY - p.y) * 0.005));
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size === 2 && pinch0 > 0) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) dist = clampDist(dist0 * (pinch0 / d));
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
      dist = clampDist(dist * Math.exp(e.deltaY * 0.0015));
    },
    { passive: false },
  );
  el.addEventListener('dblclick', () => resetView());
  const clampDist = (d: number) => (view ? Math.max(view.dist * 0.25, Math.min(view.dist * 3, d)) : d);
  function resetView(): void {
    if (!view) return;
    yaw = view.yaw;
    pitch = view.pitch;
    dist = view.dist;
  }

  return {
    el,
    stats,
    get probe() {
      return probe;
    },
    set probe(v: boolean) {
      probe = v;
    },
    resetView,
    dispose() {
      r.dispose();
      el.remove();
    },
    frame(now, topPx, si0) {
      const t0 = performance.now();
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const si: SceneIn = { ...si0, now, dt, lite: stats.lite };
      // the view for this instrument (and preset); reset when it changes
      const key = si.family === 'piano' ? si.kind : si.family === 'bowed' ? (si.bowed?.id ?? 'bowed') : si.family;
      if (key !== viewKey) {
        viewKey = key;
        view = si.family === 'piano' ? (si.kind === 'grand' ? grandView() : uprightView()) : si.family === 'bowed' && si.bowed ? bowedView(si.bowed) : si.family === 'brass' ? trumpetView() : fluteView();
        resetView();
      }
      // size: the instrument area under the top band; phones draw at ≤1.5× pixels
      const host = el.parentElement!;
      const W = host.clientWidth;
      const H = Math.max(10, host.clientHeight - topPx);
      el.style.top = `${topPx}px`;
      el.style.height = `${H}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
      const pw = Math.round(W * dpr);
      const ph = Math.round(H * dpr);
      if (el.width !== pw || el.height !== ph) {
        el.width = pw;
        el.height = ph;
      }
      // scene
      batch.clear();
      let src: Vec3 = [0, 0, 0];
      let span = 1;
      let floor = 0;
      if (si.family === 'piano' && si.kind === 'grand') {
        buildGrand(batch, si, st);
        src = [0, 0, 0.9];
        span = 1.3;
      } else if (si.family === 'piano') {
        buildUpright(batch, si, st);
        src = [0, 0, 0.15];
        span = 1.0;
      } else if (si.family === 'bowed' && si.bowed) {
        buildBowed(batch, si, st);
        src = [0.25 * si.bowed.L, 0, 0];
        span = si.bowed.L * 1.6;
        floor = -0.08 * (si.bowed.L / 0.33);
      } else if (si.family === 'brass') {
        buildTrumpet(batch, si, st);
        src = [0.3, 0, 0];
        span = 0.45;
        floor = -0.12;
      } else {
        buildFlute(batch, si, st);
        src = [0.33, 0, 0];
        span = 0.5;
        floor = -0.08;
      }
      buildRoom(batch, si, st, src, span, floor);
      // camera
      const v = view!;
      const eye: Vec3 = [v.target[0] + dist * Math.cos(pitch) * Math.sin(yaw), v.target[1] + dist * Math.sin(pitch), v.target[2] - dist * Math.cos(pitch) * Math.cos(yaw)];
      // mirrored in x: the scenes are laid out with the bass at −x, and a pianist facing the
      // strings (+z) sees the bass on the left
      const mirror = new Float32Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const vp = mul(mirror, mul(perspective(0.7, pw / ph, 0.02, 60), lookAt(eye, v.target, [0, 1, 0])));
      const g = getComputedStyle(document.body).getPropertyValue('--ground').trim() || '#0e0d0b';
      const hex = /^#([0-9a-f]{6})$/i.exec(g)?.[1] ?? '0e0d0b';
      const ground: [number, number, number] = [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
      r.draw(batch, vp, pw, ph, ground);
      // budget: if a frame costs more than ~9 ms, draw the light scene (every other string, fewer parts)
      const ms = performance.now() - t0;
      stats.ms = stats.frames ? stats.ms * 0.95 + ms * 0.05 : ms;
      stats.vertices = batch.vertices;
      stats.frames++;
      if (stats.frames > 30 && stats.ms > 9) stats.lite = true;
      if (probe) {
        // sample a grid of pixels straight after drawing (the buffer is not kept for later)
        let lit = 0;
        let sum = 0;
        const gl = r.gl;
        for (let y = 0; y < 24; y++)
          for (let x = 0; x < 40; x++) {
            gl.readPixels(Math.floor(((x + 0.5) / 40) * pw), Math.floor(((y + 0.5) / 24) * ph), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const v = px[0] + px[1] + px[2];
            if (v > 90) lit++;
            sum = (sum * 31 + v) % 1000003;
          }
        stats.lit = lit;
        stats.sum = sum;
      }
    },
  };
}

