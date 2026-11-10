// The 3D stage's scene description: what a scene draws into each frame (a `Batch`: static meshes
// posed by model matrices with a glow each, and camera-facing lines), and the small vector/matrix
// helpers the scenes use. The renderer that draws a Batch is `three3d.ts` (three.js).
//   meshes — static, lit geometry built once per instrument (mesh.ts), drawn instanced.
//   lines  — camera-facing ribbons of a given pixel width: `ink` (ordinary blending) and `line` (the
//            live glow: additive), drawn over the picture and hidden behind nearer surfaces.

export type Vec3 = [number, number, number];
export type RGBA = [number, number, number, number];
export type Mat4 = Float32Array;

// ---------------------------------------------------------------- the lines' shaders (GLSL 3, raw)
export const LINE_VS = `precision highp float;
in vec3 aPos; in vec3 aPrev; in vec3 aNext; in float aSide; in vec4 aColor; in float aWidth;
uniform mat4 uVP; uniform vec2 uHalf; uniform float uProjY; uniform float uProjZ;
out vec4 vColor; out float vSide;
void main() {
  vec4 c = uVP * vec4(aPos, 1.0);
  vec4 p = uVP * vec4(aPrev, 1.0);
  vec4 n = uVP * vec4(aNext, 1.0);
  vec2 ps = p.xy / max(p.w, 1e-4) * uHalf;
  vec2 ns = n.xy / max(n.w, 1e-4) * uHalf;
  vec2 d = ns - ps;
  float l = length(d);
  vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  // a negative width is in metres (a wire seen in perspective), at least ~1 px; thinner than that
  // it fades instead of shrinking
  float w = aWidth;
  float cover = 1.0;
  if (w < 0.0) {
    float px = -w * uProjY * uHalf.y / max(c.w, 1e-4);
    w = max(px, 1.1);
    cover = clamp(px / 1.1, 0.55, 1.0);
  }
  c.xy += nrm * aSide * w * 0.5 / uHalf * c.w;
  // pulled towards the eye by a few millimetres (a wire on its bridge or in its notch still shows),
  // in metres, not in depth-buffer units: a fixed NDC offset grows with the square of the distance
  // (9 cm at 3 m), which let the strings show through the hammers in front of them
  c.z += uProjZ * (0.002 + 0.0006 * c.w) / max(c.w, 1e-4);
  gl_Position = c;
  vColor = vec4(aColor.rgb, aColor.a * cover);
  vSide = aSide;
}`;
export const LINE_FS = `precision highp float;
in vec4 vColor; in float vSide; out vec4 o;
uniform sampler2D tDepth; uniform vec2 uRes; uniform float uWire;
void main() {
  // hidden behind the scene's nearer surfaces
  float d = texture(tDepth, gl_FragCoord.xy / uRes).r;
  if (gl_FragCoord.z > d + 2e-6) discard;
  if (uWire > 0.5) {
    // a metal wire: lit like a cylinder (darker at its silhouette, a bright specular stripe)
    float s = vSide;
    float cz = sqrt(max(0.0, 1.0 - s * s));
    float a = 1.0 - smoothstep(0.7, 1.0, abs(s));
    vec3 col = vColor.rgb * (0.35 + 0.65 * cz) + vec3(1.0, 0.97, 0.92) * pow(max(0.0, 1.0 - abs(s + 0.25) * 2.2), 3.0) * 0.55;
    o = vec4(col, vColor.a * a);
    return;
  }
  float a = 1.0 - smoothstep(0.25, 1.0, abs(vSide));
  o = vec4(vColor.rgb, vColor.a * a);
}`;

/** a growable float array, reused frame to frame */
export class Buf {
  a: Float32Array;
  n = 0;
  constructor(size = 4096) {
    this.a = new Float32Array(size);
  }
  need(k: number): void {
    if (this.n + k > this.a.length) {
      const b = new Float32Array(Math.max(this.a.length * 2, this.n + k));
      b.set(this.a);
      this.a = b;
    }
  }
  push(...v: number[]): void {
    this.need(v.length);
    for (let i = 0; i < v.length; i++) this.a[this.n++] = v[i];
  }
}
class IBuf {
  a = new Uint32Array(4096);
  n = 0;
  push(...v: number[]): void {
    if (this.n + v.length > this.a.length) {
      const b = new Uint32Array(Math.max(this.a.length * 2, this.n + v.length));
      b.set(this.a);
      this.a = b;
    }
    for (let i = 0; i < v.length; i++) this.a[this.n++] = v[i];
  }
}

/** static geometry: 14 floats per vertex (pos, normal, sRGB colour, rough/metal/kind, uv), triangles */
export interface Mesh {
  data: Float32Array;
  count: number;
  /** each vertex's material id (`MAT_LIST` in mesh.ts) */
  mats?: Uint16Array;
  /** each vertex's position in its part's own frame (for solid textures) */
  loc?: Float32Array;
  /** can dissolve (a piano's case): drawn with a glow alpha of 2 + visibility (0..1), its shadow too */
  fade?: boolean;
}
const ISTRIDE = 20;
/** the glow that dissolves a `fade` mesh to visibility v (0..1): set [3] = 2 + v before each call */
export const dissolve = (v: number, out: RGBA): RGBA => {
  out[0] = out[1] = out[2] = 0;
  out[3] = 2 + Math.max(0, Math.min(1, v));
  return out;
};

export class LineSet {
  lv = new Buf();
  li = new IBuf();
  nv = 0;
  clear(): void {
    this.lv.n = this.li.n = 0;
    this.nv = 0;
  }
  /** `world`: a transform for every point (an ensemble's instrument placed on the stage) */
  add(pts: Vec3[], color: RGBA | RGBA[], width: number, world: Mat4 | null = null): void {
    const n = pts.length;
    if (n < 2) return;
    const base = this.nv;
    this.lv.need(n * 30);
    const a = this.lv.a;
    let o = this.lv.n;
    const W = world;
    const put = (q: Vec3) => {
      if (!W) {
        a[o++] = q[0];
        a[o++] = q[1];
        a[o++] = q[2];
        return;
      }
      a[o++] = W[0] * q[0] + W[4] * q[1] + W[8] * q[2] + W[12];
      a[o++] = W[1] * q[0] + W[5] * q[1] + W[9] * q[2] + W[13];
      a[o++] = W[2] * q[0] + W[6] * q[1] + W[10] * q[2] + W[14];
    };
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pr = pts[i > 0 ? i - 1 : 0];
      const nx = pts[i < n - 1 ? i + 1 : n - 1];
      const c = Array.isArray(color[0]) ? (color as RGBA[])[i] : (color as RGBA);
      for (let side = -1; side <= 1; side += 2) {
        put(p);
        put(pr);
        put(nx);
        a[o++] = side;
        a[o++] = c[0];
        a[o++] = c[1];
        a[o++] = c[2];
        a[o++] = c[3];
        a[o++] = width;
      }
    }
    this.lv.n = o;
    this.nv += 2 * n;
    for (let i = 0; i < n - 1; i++) {
      const b = base + 2 * i;
      this.li.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
}

/** what a scene draws into, each frame */
export class Batch {
  glow = new LineSet();
  inkL = new LineSet();
  wireL = new LineSet();
  /** mesh → its instances this frame (model matrix + glow) */
  inst = new Map<Mesh, Buf>();
  private used: Mesh[] = [];
  /** shadow casters' bounds (centre, radius) and the floor */
  bounds: { c: Vec3; r: number } = { c: [0, 0, 0], r: 1 };
  floor: { y: number; c: Vec3; r0: number; r1: number } | null = null;
  /** a section: everything with side·(x − at) > 0 is cut away (a piano key's action, close up) */
  clip: { at: number; side: 1 | -1 } | null = null;
  /** a box the orbit camera may not enter (an instrument's case: its target is inside it) */
  keepOut: { lo: Vec3; hi: Vec3 } | null = null;
  /** a planar mirror (the underside of a grand's lid): its plan outline [x, z] at height y in the frame
   *  `m` (a model matrix), facing −y there; k scales the reflection (the case's dissolve); `body` is the mesh
   *  the mirror is the face of (left out of its own reflection) */
  mirror: { m: Float32Array; poly: [number, number][]; y: number; k: number; body?: Mesh } | null = null;
  /** a transform applied to everything added while it is set (an ensemble places each instrument on
   *  its seat; null: the instrument's own frame is the world) */
  world: Mat4 | null = null;
  /** vertex count (for the performance budget) */
  get vertices(): number {
    let n = this.glow.nv + this.inkL.nv + this.wireL.nv;
    for (const m of this.used) n += m.count * (this.inst.get(m)!.n / ISTRIDE);
    return n;
  }
  clear(): void {
    this.glow.clear();
    this.inkL.clear();
    this.wireL.clear();
    for (const m of this.used) this.inst.get(m)!.n = 0;
    this.used = [];
    this.floor = null;
    this.clip = null;
    this.keepOut = null;
    this.mirror = null;
    this.world = null;
  }
  /** a glowing polyline (additive) of `width` px; colour per point or one for all */
  line(pts: Vec3[], color: RGBA | RGBA[], width = 1.2): void {
    this.glow.add(pts, color, width, this.world);
  }
  /** an ordinary (alpha-blended) polyline: strings, purfling */
  ink(pts: Vec3[], color: RGBA | RGBA[], width = 1): void {
    this.inkL.add(pts, color, width, this.world);
  }
  /** a wire (string): `diameter` in metres, shaded as a metal cylinder */
  wire(pts: Vec3[], color: RGBA | RGBA[], diameter: number): void {
    this.wireL.add(pts, color, -diameter, this.world);
  }
  loop(pts: Vec3[], color: RGBA, width = 1.2): void {
    this.line([...pts, pts[0]], color, width);
  }
  /** draw a mesh with model matrix `m` (identity if null) and an optional glow (rgb 0..1, amount) */
  mesh(mesh: Mesh, m: Mat4 | null = null, glow: RGBA | null = null): void {
    let b = this.inst.get(mesh);
    if (!b) {
      b = new Buf(ISTRIDE * 8);
      this.inst.set(mesh, b);
    }
    if (b.n === 0) this.used.push(mesh);
    b.need(ISTRIDE);
    const a = b.a;
    const o = b.n;
    const w = this.world;
    if (w) mulInto(a, o, w, m ?? IDENT);
    else if (m) a.set(m, o);
    else a.set(IDENT, o);
    a[o + 16] = glow ? glow[0] : 0;
    a[o + 17] = glow ? glow[1] : 0;
    a[o + 18] = glow ? glow[2] : 0;
    a[o + 19] = glow ? glow[3] : 0;
    b.n += ISTRIDE;
  }
  meshes(): Mesh[] {
    return this.used;
  }
}

// ---------------------------------------------------------------- math
export const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}
export function lookAt(eye: Vec3, at: Vec3, up: Vec3): Mat4 {
  const z = norm(sub(eye, at));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0];
  m[4] = x[1];
  m[8] = x[2];
  m[1] = y[0];
  m[5] = y[1];
  m[9] = y[2];
  m[2] = z[0];
  m[6] = z[1];
  m[10] = z[2];
  m[12] = -dot(x, eye);
  m[13] = -dot(y, eye);
  m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}
/** a·b written into out[o…o+15] (no allocation) */
export function mulInto(out: Float32Array, o: number, a: Mat4, b: Mat4): void {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[o + c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
}
export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
export const translate = (x: number, y: number, z: number): Mat4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
export const scaleM = (x: number, y: number, z: number): Mat4 => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
export function rotX(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
export function rotY(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
export function rotZ(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
/** rotation `r` about the point p */
export const about = (p: Vec3, r: Mat4): Mat4 => mul(translate(p[0], p[1], p[2]), mul(r, translate(-p[0], -p[1], -p[2])));
/** compose, applied right to left */
export const chain = (...ms: Mat4[]): Mat4 => ms.reduce((a, b) => mul(a, b));
export function xform(m: Mat4, p: Vec3): Vec3 {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
export function xdir(m: Mat4, p: Vec3): Vec3 {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
}
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** project a world point to CSS pixels in a w×h canvas (null if behind the camera) */
export function project(vp: Mat4, p: Vec3, w: number, h: number): [number, number] | null {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const ww = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (ww <= 1e-5) return null;
  return [((x / ww) * 0.5 + 0.5) * w, (1 - ((y / ww) * 0.5 + 0.5)) * h];
}

/** an ink colour ('255,94,56') and alpha as RGBA 0..1 */
export function ink(c: string, a: number): RGBA {
  const [r, g, b] = c.split(',').map((x) => Number(x) / 255);
  return [r, g, b, Math.max(0, Math.min(1, a))];
}
