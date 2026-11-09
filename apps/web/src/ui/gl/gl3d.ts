// A small WebGL2 renderer for the 3D stage. Raw WebGL2, no libraries.
//   meshes — static, lit geometry (wood, lacquer, felt, ivory, steel, brass, silver), built once per
//            instrument and drawn instanced with a model matrix each (keys, hammers, pistons…).
//            Shading: a warm key light with a soft shadow map, a cool fill, a hemisphere ambient,
//            GGX specular and reflections of a dim studio (one overhead softbox, one strip light),
//            ACES tone mapping. Two live overlays are computed in the shader: a plate's vibration
//            Σ aₖ·sin(mₖπu)·sin(nₖπv) from the engine's mode amplitudes (soundboard, violin top) and
//            a glow along a tube from the bore's standing wave (flute, trumpet).
//   lines  — camera-facing ribbons of a given pixel width: `ink` (strings, purfling: ordinary
//            blending) and `line` (the live glow: additive). Both depth-tested.
//   floor  — a soft floor that takes the shadow and fades into the page's ground.

export type Vec3 = [number, number, number];
export type RGBA = [number, number, number, number];
export type Mat4 = Float32Array;

// ---------------------------------------------------------------- shaders
const LINE_VS = `#version 300 es
in vec3 aPos; in vec3 aPrev; in vec3 aNext; in float aSide; in vec4 aColor; in float aWidth;
uniform mat4 uVP; uniform vec2 uHalf;
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
  c.xy += nrm * aSide * aWidth * 0.5 / uHalf * c.w;
  c.z -= 0.0004 * c.w;
  gl_Position = c;
  vColor = aColor;
  vSide = aSide;
}`;
const LINE_FS = `#version 300 es
precision mediump float;
in vec4 vColor; in float vSide; out vec4 o;
void main() {
  float a = 1.0 - smoothstep(0.25, 1.0, abs(vSide));
  o = vec4(vColor.rgb, vColor.a * a);
}`;

// meshes: per vertex position, normal, colour (sRGB), material (roughness, metalness, kind), uv;
// per instance a model matrix and a glow (rgb, amount)
const MESH_ATTRS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
layout(location=3) in vec3 aMat; layout(location=4) in vec2 aUV;
layout(location=5) in vec4 iM0; layout(location=6) in vec4 iM1; layout(location=7) in vec4 iM2; layout(location=8) in vec4 iM3;
layout(location=9) in vec4 iGlow;`;
const LIT_VS = `#version 300 es
${MESH_ATTRS}
uniform mat4 uVP; uniform mat4 uLVP;
out vec3 vW; out vec3 vN; out vec3 vCol; out vec3 vMat; out vec2 vUV; out vec4 vGlow; out vec4 vL;
void main() {
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec4 w = M * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = mat3(M) * aNrm;
  vCol = aCol; vMat = aMat; vUV = aUV; vGlow = iGlow;
  vL = uLVP * vec4(w.xyz + normalize(vN) * 0.0025, 1.0);
  gl_Position = uVP * w;
}`;
const LIT_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec3 vCol; in vec3 vMat; in vec2 vUV; in vec4 vGlow; in vec4 vL;
uniform vec3 uEye; uniform vec3 uLdir; uniform vec3 uLcol; uniform vec3 uFdir; uniform vec3 uFcol;
uniform vec3 uSky; uniform vec3 uGnd; uniform float uShadowOn; uniform sampler2DShadow uShadow; uniform float uTexel;
uniform float uAmp[16]; uniform vec2 uMN[16]; uniform vec3 uModalHot; uniform float uModalGain;
uniform float uWave[48]; uniform vec3 uWaveCol;
uniform vec3 uBg; uniform vec3 uFloorC; uniform vec2 uFloorR; uniform float uExposure;
out vec4 o;
const float PI = 3.14159265;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// a dim studio: dark walls, an overhead softbox (towards the key light), a long strip light behind
vec3 env(vec3 r, float rough) {
  vec3 c = mix(uGnd, uSky, smoothstep(-0.4, 0.7, r.y));
  // the room's walls: a soft warm glow around the horizon
  c += vec3(0.22, 0.19, 0.16) * exp(-pow(r.y / (0.35 + 0.4 * rough), 2.0)) * (0.6 + 0.4 * rough);
  float w = 0.08 + 0.55 * rough;
  float sb = smoothstep(1.0 - w * 0.6 - 0.12, 1.0 - w * 0.2, dot(r, normalize(vec3(0.25, 1.0, -0.35))));
  c += vec3(1.0, 0.9, 0.76) * sb * mix(3.2, 0.5, rough);
  float strip = exp(-pow((r.y - 0.22) / (0.035 + 0.35 * rough), 2.0)) * smoothstep(-0.2, 0.7, r.z);
  c += vec3(0.65, 0.72, 0.85) * strip * mix(1.6, 0.25, rough);
  return c;
}
float shadowAt(vec3 n, vec3 l) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0006 + 0.0025 * (1.0 - clamp(dot(n, l), 0.0, 1.0));
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    s += texture(uShadow, vec3(p.xy + vec2(float(i), float(j)) * uTexel * 1.25, p.z - bias));
  return s / 9.0;
}
void main() {
  vec3 V = normalize(uEye - vW);
  vec3 N = normalize(vN);
  float nv0 = dot(N, V);
  if (nv0 < -0.25) N = -N;
  else if (nv0 < 0.0) N = normalize(N - V * nv0 * 1.02);
  vec3 base = pow(vCol, vec3(2.2));
  float rough = clamp(vMat.x, 0.04, 1.0);
  float metal = vMat.y;
  float kind = vMat.z;
  vec3 emis = vec3(0.0);
  if (kind > 0.5 && kind < 1.5) {
    // spruce: the grain along the plate (annual rings ≈ 1.5 mm apart on a violin top), wavering
    float gx = vUV.y * 110.0 + 0.7 * sin(vUV.x * 8.0 + vUV.y * 11.0) + 0.25 * sin(vUV.x * 31.0);
    float gr = fract(gx);
    base *= 0.84 + 0.16 * smoothstep(0.0, 0.35, gr) * smoothstep(1.0, 0.55, gr);
    float s = 0.0;
    for (int k = 0; k < 16; k++) s += uAmp[k] * sin(uMN[k].x * PI * vUV.x) * sin(uMN[k].y * PI * vUV.y);
    float e = clamp(abs(s) * uModalGain, 0.0, 1.0);
    emis += pow(uModalHot, vec3(2.2)) * e * e * 0.45;
  } else if (kind > 1.5 && kind < 2.5) {
    float x = clamp(vUV.x, 0.0, 1.0) * 47.0;
    int i = int(floor(x));
    float e = mix(uWave[i], uWave[min(i + 1, 47)], fract(x));
    emis += pow(uWaveCol, vec3(2.2)) * e * e * 0.32;
  }
  vec3 L = normalize(uLdir);
  float ndl = max(dot(N, L), 0.0);
  float sh = shadowAt(N, L);
  float ndv = max(dot(N, V), 1e-3);
  vec3 F0 = mix(vec3(0.04), base, metal);
  vec3 H = normalize(L + V);
  float a = rough * rough;
  float nh = max(dot(N, H), 0.0);
  float d = a * a / (PI * pow(nh * nh * (a * a - 1.0) + 1.0, 2.0));
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float vis = 1.0 / ((ndl * (1.0 - k) + k) * (ndv * (1.0 - k) + k) * 4.0);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 spec = d * vis * F * ndl * sh * uLcol;
  vec3 diff = base * (1.0 - metal) / PI * PI;
  float fdl = max(dot(N, normalize(uFdir)), 0.0);
  vec3 hemi = mix(uGnd, uSky, 0.5 + 0.5 * N.y);
  vec3 col = diff * (uLcol * ndl * sh + uFcol * fdl + hemi);
  // sheen for felt (rough dielectrics): a soft rim
  col += base * pow(1.0 - ndv, 3.0) * 0.35 * smoothstep(0.75, 1.0, rough) * (0.4 + 0.6 * sh);
  vec3 R = reflect(-V, N);
  vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - ndv, 5.0);
  col += spec + env(R, rough) * Fe * mix(0.55, 1.0, sh) * (1.0 - 0.6 * rough * (1.0 - metal));
  col += emis + pow(vGlow.rgb, vec3(2.2)) * vGlow.a;
  vec3 c = aces(col * uExposure);
  c = pow(c, vec3(1.0 / 2.2));
  if (kind > 2.5) {
    // the floor: fades into the page's ground away from the instrument
    float r = length((vW - uFloorC).xz);
    c = mix(c, uBg, smoothstep(uFloorR.x, uFloorR.y, r));
  }
  o = vec4(c, 1.0);
}`;
const DEPTH_VS = `#version 300 es
${MESH_ATTRS}
uniform mat4 uLVP;
void main() { gl_Position = uLVP * mat4(iM0, iM1, iM2, iM3) * vec4(aPos, 1.0); }`;
const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

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
}
const VSTRIDE = 14;
const ISTRIDE = 20;

class LineSet {
  lv = new Buf();
  li = new IBuf();
  nv = 0;
  clear(): void {
    this.lv.n = this.li.n = 0;
    this.nv = 0;
  }
  add(pts: Vec3[], color: RGBA | RGBA[], width: number): void {
    const n = pts.length;
    if (n < 2) return;
    const base = this.nv;
    this.lv.need(n * 30);
    const a = this.lv.a;
    let o = this.lv.n;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pr = pts[i > 0 ? i - 1 : 0];
      const nx = pts[i < n - 1 ? i + 1 : n - 1];
      const c = Array.isArray(color[0]) ? (color as RGBA[])[i] : (color as RGBA);
      for (let side = -1; side <= 1; side += 2) {
        a[o++] = p[0];
        a[o++] = p[1];
        a[o++] = p[2];
        a[o++] = pr[0];
        a[o++] = pr[1];
        a[o++] = pr[2];
        a[o++] = nx[0];
        a[o++] = nx[1];
        a[o++] = nx[2];
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

/** the live overlays the lit shader computes: plate modes and a tube's standing wave */
export interface Overlays {
  amps: Float32Array;
  mn: Float32Array;
  modalHot: [number, number, number];
  modalGain: number;
  wave: Float32Array;
  waveCol: [number, number, number];
}

/** what a scene draws into, each frame */
export class Batch {
  glow = new LineSet();
  inkL = new LineSet();
  /** mesh → its instances this frame (model matrix + glow) */
  inst = new Map<Mesh, Buf>();
  private used: Mesh[] = [];
  /** shadow casters' bounds (centre, radius) and the floor */
  bounds: { c: Vec3; r: number } = { c: [0, 0, 0], r: 1 };
  floor: { y: number; c: Vec3; r0: number; r1: number } | null = null;
  ov: Overlays = { amps: new Float32Array(16), mn: new Float32Array(32), modalHot: [0.95, 0.65, 0.27], modalGain: 0, wave: new Float32Array(48), waveCol: [1, 0.37, 0.22] };
  /** vertex count (for the performance budget) */
  get vertices(): number {
    let n = this.glow.nv + this.inkL.nv;
    for (const m of this.used) n += m.count * (this.inst.get(m)!.n / ISTRIDE);
    return n;
  }
  clear(): void {
    this.glow.clear();
    this.inkL.clear();
    for (const m of this.used) this.inst.get(m)!.n = 0;
    this.used = [];
    this.ov.modalGain = 0;
    this.ov.wave.fill(0);
    this.floor = null;
  }
  /** a glowing polyline (additive) of `width` px; colour per point or one for all */
  line(pts: Vec3[], color: RGBA | RGBA[], width = 1.2): void {
    this.glow.add(pts, color, width);
  }
  /** an ordinary (alpha-blended) polyline: strings, purfling */
  ink(pts: Vec3[], color: RGBA | RGBA[], width = 1): void {
    this.inkL.add(pts, color, width);
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
    if (m) a.set(m, o);
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

// ---------------------------------------------------------------- renderer
/** plate modes in order of frequency for a plate of aspect `ar` (first 16 (m, n) pairs) */
export function plateModes(ar: number): Float32Array {
  const pairs: [number, number, number][] = [];
  for (let m = 1; m <= 7; m++) for (let n = 1; n <= 7; n++) pairs.push([m, n, m * m + (n * ar) ** 2]);
  pairs.sort((a, b) => a[2] - b[2]);
  const out = new Float32Array(32);
  pairs.slice(0, 16).forEach(([m, n], i) => {
    out[2 * i] = m;
    out[2 * i + 1] = n;
  });
  return out;
}

/** the light: from above, in front and to the treble side (world space, towards the light) */
const LIGHT: Vec3 = norm([0.35, 1.0, -0.45]);
const FILL: Vec3 = norm([-0.7, 0.35, 0.5]);

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private lineP: WebGLProgram;
  private litP: WebGLProgram;
  private depthP: WebGLProgram;
  private lineVao: WebGLVertexArrayObject;
  private meshVao: WebGLVertexArrayObject;
  private lbuf: { lv: WebGLBuffer; li: WebGLBuffer };
  private ibuf: WebGLBuffer;
  private vbos = new WeakMap<Mesh, WebGLBuffer>();
  private allVbos: WebGLBuffer[] = [];
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private shadowTex: WebGLTexture;
  private shadowFbo: WebGLFramebuffer;
  private shadowSize: number;
  private instData = new Buf(4096);
  /** whether shadows are drawn (off in the light scene) */
  shadows = true;

  static create(canvas: HTMLCanvasElement, shadowSize = 2048): Renderer | null {
    try {
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
      return gl ? new Renderer(gl, shadowSize) : null;
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext, shadowSize: number) {
    this.gl = gl;
    this.lineP = compile(gl, LINE_VS, LINE_FS);
    this.litP = compile(gl, LIT_VS, LIT_FS);
    this.depthP = compile(gl, DEPTH_VS, DEPTH_FS);
    this.lbuf = { lv: gl.createBuffer()!, li: gl.createBuffer()! };
    this.ibuf = gl.createBuffer()!;
    const attr = (p: WebGLProgram, name: string, size: number, stride: number, off: number) => {
      const l = gl.getAttribLocation(p, name);
      if (l < 0) return;
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4);
    };
    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf.lv);
    attr(this.lineP, 'aPos', 3, 15, 0);
    attr(this.lineP, 'aPrev', 3, 15, 3);
    attr(this.lineP, 'aNext', 3, 15, 6);
    attr(this.lineP, 'aSide', 1, 15, 9);
    attr(this.lineP, 'aColor', 4, 15, 10);
    attr(this.lineP, 'aWidth', 1, 15, 14);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lbuf.li);
    this.meshVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.meshVao);
    for (let l = 0; l < 10; l++) gl.enableVertexAttribArray(l);
    for (let l = 5; l < 10; l++) gl.vertexAttribDivisor(l, 1);
    gl.bindVertexArray(null);
    const names: [string, WebGLProgram, string[]][] = [
      ['l', this.lineP, ['uVP', 'uHalf']],
      ['m', this.litP, ['uVP', 'uLVP', 'uEye', 'uLdir', 'uLcol', 'uFdir', 'uFcol', 'uSky', 'uGnd', 'uShadowOn', 'uShadow', 'uTexel', 'uAmp', 'uMN', 'uModalHot', 'uModalGain', 'uWave', 'uWaveCol', 'uBg', 'uFloorC', 'uFloorR', 'uExposure']],
      ['d', this.depthP, ['uLVP']],
    ];
    for (const [k, p, ns] of names) for (const n of ns) this.loc[`${k}.${n}`] = gl.getUniformLocation(p, n);
    // the shadow map
    this.shadowSize = shadowSize;
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, shadowSize, shadowSize);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private vbo(m: Mesh): WebGLBuffer {
    let b = this.vbos.get(m);
    if (!b) {
      const gl = this.gl;
      b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW);
      this.vbos.set(m, b);
      this.allVbos.push(b);
    }
    return b;
  }

  /** upload every instance of this frame into one buffer; returns each mesh's float offset */
  private uploadInstances(b: Batch): Map<Mesh, number> {
    const gl = this.gl;
    const offs = new Map<Mesh, number>();
    const d = this.instData;
    d.n = 0;
    for (const m of b.meshes()) {
      const ib = b.inst.get(m)!;
      d.need(ib.n);
      offs.set(m, d.n);
      d.a.set(ib.a.subarray(0, ib.n), d.n);
      d.n += ib.n;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, d.a.subarray(0, d.n), gl.DYNAMIC_DRAW);
    return offs;
  }

  private drawMeshes(b: Batch, offs: Map<Mesh, number>): void {
    const gl = this.gl;
    gl.bindVertexArray(this.meshVao);
    for (const m of b.meshes()) {
      const n = b.inst.get(m)!.n / ISTRIDE;
      if (!n || !m.count) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo(m));
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VSTRIDE * 4, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VSTRIDE * 4, 12);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, VSTRIDE * 4, 24);
      gl.vertexAttribPointer(3, 3, gl.FLOAT, false, VSTRIDE * 4, 36);
      gl.vertexAttribPointer(4, 2, gl.FLOAT, false, VSTRIDE * 4, 48);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      const o = offs.get(m)! * 4;
      for (let k = 0; k < 4; k++) gl.vertexAttribPointer(5 + k, 4, gl.FLOAT, false, ISTRIDE * 4, o + k * 16);
      gl.vertexAttribPointer(9, 4, gl.FLOAT, false, ISTRIDE * 4, o + 64);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, n);
    }
  }

  private drawLines(set: LineSet, vp: Mat4, w: number, h: number): void {
    if (!set.li.n) return;
    const gl = this.gl;
    gl.useProgram(this.lineP);
    gl.uniformMatrix4fv(this.loc['l.uVP'], false, vp);
    gl.uniform2f(this.loc['l.uHalf'], w / 2, h / 2);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf.lv);
    gl.bufferData(gl.ARRAY_BUFFER, set.lv.a.subarray(0, set.lv.n), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lbuf.li);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, set.li.a.subarray(0, set.li.n), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, set.li.n, gl.UNSIGNED_INT, 0);
  }

  draw(b: Batch, vp: Mat4, eye: Vec3, w: number, h: number, ground: [number, number, number]): void {
    const gl = this.gl;
    const offs = this.uploadInstances(b);
    // ---- shadow pass: an orthographic view from the light, fitted to the scene's bounds
    const { c, r } = b.bounds;
    const lEye = add(c, scale(LIGHT, r * 3));
    const lvp = mul(ortho(-r, r, -r, r, r * 0.5, r * 5.5), lookAt(lEye, c, Math.abs(LIGHT[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]));
    const shadowsOn = this.shadows && b.meshes().length > 0;
    if (shadowsOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 3);
      gl.useProgram(this.depthP);
      gl.uniformMatrix4fv(this.loc['d.uLVP'], false, lvp);
      this.drawMeshes(b, offs);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // ---- main pass
    gl.viewport(0, 0, w, h);
    gl.clearColor(ground[0], ground[1], ground[2], 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if (b.meshes().length) {
      gl.useProgram(this.litP);
      const L = this.loc;
      gl.uniformMatrix4fv(L['m.uVP'], false, vp);
      gl.uniformMatrix4fv(L['m.uLVP'], false, lvp);
      gl.uniform3f(L['m.uEye'], eye[0], eye[1], eye[2]);
      gl.uniform3f(L['m.uLdir'], LIGHT[0], LIGHT[1], LIGHT[2]);
      gl.uniform3f(L['m.uLcol'], 2.6, 2.35, 2.0);
      gl.uniform3f(L['m.uFdir'], FILL[0], FILL[1], FILL[2]);
      gl.uniform3f(L['m.uFcol'], 0.3, 0.32, 0.38);
      gl.uniform3f(L['m.uSky'], 0.16, 0.155, 0.16);
      gl.uniform3f(L['m.uGnd'], 0.05, 0.04, 0.032);
      gl.uniform1f(L['m.uShadowOn'], shadowsOn ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.uniform1i(L['m.uShadow'], 0);
      gl.uniform1f(L['m.uTexel'], 1 / this.shadowSize);
      gl.uniform1fv(L['m.uAmp'], b.ov.amps);
      gl.uniform2fv(L['m.uMN'], b.ov.mn);
      gl.uniform3f(L['m.uModalHot'], ...b.ov.modalHot);
      gl.uniform1f(L['m.uModalGain'], b.ov.modalGain);
      gl.uniform1fv(L['m.uWave'], b.ov.wave);
      gl.uniform3f(L['m.uWaveCol'], ...b.ov.waveCol);
      gl.uniform3f(L['m.uBg'], ground[0], ground[1], ground[2]);
      const f = b.floor ?? { c: [0, 0, 0] as Vec3, r0: 1, r1: 2 };
      gl.uniform3f(L['m.uFloorC'], f.c[0], f.c[1], f.c[2]);
      gl.uniform2f(L['m.uFloorR'], f.r0, f.r1);
      gl.uniform1f(L['m.uExposure'], 1.0);
      this.drawMeshes(b, offs);
    }
    // lines: depth-tested, not writing depth
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawLines(b.inkL, vp, w, h);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.drawLines(b.glow, vp, w, h);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    for (const b of [this.lbuf.lv, this.lbuf.li, this.ibuf, ...this.allVbos]) gl.deleteBuffer(b);
    for (const p of [this.lineP, this.litP, this.depthP]) gl.deleteProgram(p);
    gl.deleteTexture(this.shadowTex);
    gl.deleteFramebuffer(this.shadowFbo);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** an ink colour ('255,94,56') and alpha as RGBA 0..1 */
export function ink(c: string, a: number): RGBA {
  const [r, g, b] = c.split(',').map((x) => Number(x) / 255);
  return [r, g, b, Math.max(0, Math.min(1, a))];
}
