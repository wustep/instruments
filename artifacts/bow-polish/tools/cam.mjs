// The camera for the v2 clips: views framed on what they are to show (a section's seats, the whole
// orchestra, one instrument), found by the camera's own arithmetic (stage3d.ts: the eye is the target
// plus the distance along (yaw, pitch); a 24° lens), and a track through them in the music's time:
// each quantity on a monotone cubic through its keys (no overshoot, no corner: the camera never
// starts, stops or turns suddenly). Installed in the page beside take.mjs's conductor (window.__lv).
// Untracked helper (artifacts/launch-videos/tools).

/** the lens's scale between the views' distances and metres (stage3d.ts FRAME) */
export const FRAME = Math.tan(0.3) / Math.tan((12 * Math.PI) / 180);

export async function installCam(page) {
  await page.evaluate((F) => {
    const lv = window.__lv;
    if (lv.frameOn) return;
    const TANV = Math.tan((12 * Math.PI) / 180);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => {
      const l = Math.hypot(...a) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    };
    /** the camera of a view ({ target, yaw, pitch, dist } in metres): its eye and axes */
    const rig = (v) => {
      const dir = [Math.cos(v.pitch) * Math.sin(v.yaw), Math.sin(v.pitch), -Math.cos(v.pitch) * Math.cos(v.yaw)];
      const eye = [v.target[0] + v.dist * dir[0], v.target[1] + v.dist * dir[1], v.target[2] + v.dist * dir[2]];
      const f = [-dir[0], -dir[1], -dir[2]];
      // (the stage's axes: x to the picture's right when the camera looks along +z, y up)
      const r = norm(cross([0, 1, 0], f));
      const u = cross(f, r);
      return { eye, f, r, u };
    };
    /** a world point on the picture (px) as a view sees it; null behind the camera */
    lv.proj = (v, p, W, H) => {
      const c = rig(v);
      const q = sub(p, c.eye);
      const z = dot(q, c.f);
      if (z < 0.05) return null;
      return [(dot(q, c.r) / (z * TANV * (W / H)) + 1) * 0.5 * W, (1 - dot(q, c.u) / (z * TANV)) * 0.5 * H, z];
    };
    /** the corners of the seats' boxes (stage3d `seats()`: a footprint's centre and radius, to the instrument's top) */
    lv.seatPoints = (ids) => {
      const seats = window.__stage3d.seats();
      const pts = [];
      for (const i of ids ?? seats.map((_, k) => k)) {
        const s = seats[i];
        if (!s) continue;
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (const y of [s.c[1], s.top]) pts.push([s.c[0] + dx * s.r, y, s.c[2] + dz * s.r]);
      }
      return pts;
    };
    /**
     * The view from a bearing that frames some points: their box on the picture as wide as fillW of it
     * or as high as fillH (whichever comes first), its middle at (cx, cy) of the picture (0.5, 0.5: the
     * middle). Metres; `F` goes to setView.
     */
    lv.frameOn = (pts, yaw, pitch, { fillW = 0.8, fillH = 0.8, cx = 0.5, cy = 0.5 } = {}) => {
      const cv = window.__stage3d.el;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      let target = [0, 0, 0];
      for (const p of pts) for (let k = 0; k < 3; k++) target[k] += p[k] / pts.length;
      let dist = 12;
      const box = (v) => {
        const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, z: 0 };
        for (const p of pts) {
          const q = lv.proj(v, p, W, H);
          if (!q) return null;
          b.x0 = Math.min(b.x0, q[0]);
          b.x1 = Math.max(b.x1, q[0]);
          b.y0 = Math.min(b.y0, q[1]);
          b.y1 = Math.max(b.y1, q[1]);
          b.z += q[2] / pts.length;
        }
        return b;
      };
      for (let k = 0; k < 14; k++) {
        const v = { target, yaw, pitch, dist };
        const b = box(v);
        if (!b) {
          dist *= 1.6;
          continue;
        }
        dist *= Math.max((b.x1 - b.x0) / (fillW * W), (b.y1 - b.y0) / (fillH * H)) ** 0.9;
        const c = rig({ target, yaw, pitch, dist });
        const b2 = box({ target, yaw, pitch, dist }) ?? b;
        // (a px on the picture at the points' depth, in metres)
        const m = (2 * b2.z * TANV) / H;
        const dx = ((b2.x0 + b2.x1) / 2 - cx * W) * m;
        const dy = ((b2.y0 + b2.y1) / 2 - cy * H) * m;
        target = [target[0] + c.r[0] * dx - c.u[0] * dy, target[1] + c.r[1] * dx - c.u[1] * dy, target[2] + c.r[2] * dx - c.u[2] * dy];
      }
      const v = { target, yaw, pitch, dist };
      return { ...v, box: box(v), stage: [W, H] };
    };
    /** the same for the seats of an ensemble (all of them with no ids) */
    lv.frameSeats = (ids, yaw, pitch, o) => lv.frameOn(lv.seatPoints(ids), yaw, pitch, o);
    /**
     * A track: keys { t, target, yaw, pitch, dist } in the music's seconds, in order. Each quantity runs
     * through its keys on a monotone cubic (Fritsch-Carlson: the slope at a key is the harmonic mean of
     * the slopes either side, zero where they change sign or where the track begins and ends), so the
     * camera is at rest at both ends, passes each key without a corner and never overshoots. Returns
     * the view at a time, as setView takes it.
     */
    lv.track = (keys) => {
      const n = keys.length;
      const ts = keys.map((k) => k.t);
      const curve = (ys) => {
        const d = [];
        for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i]));
        const m = ys.map((_, i) => {
          if (i === 0 || i === n - 1) return 0;
          if (d[i - 1] * d[i] <= 0) return 0;
          const w1 = 2 * (ts[i + 1] - ts[i]) + (ts[i] - ts[i - 1]);
          const w2 = (ts[i + 1] - ts[i]) + 2 * (ts[i] - ts[i - 1]);
          return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
        });
        return (t) => {
          if (t <= ts[0]) return ys[0];
          if (t >= ts[n - 1]) return ys[n - 1];
          let i = 0;
          while (t > ts[i + 1]) i++;
          const h = ts[i + 1] - ts[i];
          const q = (t - ts[i]) / h;
          return (2 * q ** 3 - 3 * q ** 2 + 1) * ys[i] + (q ** 3 - 2 * q ** 2 + q) * h * m[i] + (-2 * q ** 3 + 3 * q ** 2) * ys[i + 1] + (q ** 3 - q ** 2) * h * m[i + 1];
        };
      };
      const f = { x: curve(keys.map((k) => k.target[0])), y: curve(keys.map((k) => k.target[1])), z: curve(keys.map((k) => k.target[2])), yaw: curve(keys.map((k) => k.yaw)), pitch: curve(keys.map((k) => k.pitch)), ld: curve(keys.map((k) => Math.log(k.dist))) };
      return (t) => ({ target: [f.x(t), f.y(t), f.z(t)], yaw: f.yaw(t), pitch: f.pitch(t), dist: Math.exp(f.ld(t)) / F });
    };
    /** how far the camera's own arithmetic is from the stage's (px): every seat's middle, as a view shows it */
    lv.checkProj = (v) => {
      const s3 = window.__stage3d;
      const cv = s3.el;
      let worst = 0;
      s3.seats().forEach((s, i) => {
        const a = s3.seatScreen(i);
        const b = lv.proj(v, [s.c[0], s.c[1] + (s.top - s.c[1]) * 0.55, s.c[2]], cv.clientWidth, cv.clientHeight);
        if (a && b) worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
      });
      return worst;
    };
  }, FRAME);
}
