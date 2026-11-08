// A small WebGL2 renderer for the 3D stage, in the 2D stage's language: thin glowing lines on a
// dark ground, faint translucent fills, and plates (soundboard, violin top) shaded by the
// instrument's own vibration modes. Raw WebGL2: three tiny programs and per-frame batches.
//   lines — camera-facing ribbons of a given pixel width with a soft edge (strings, outlines)
//   fills — flat translucent triangles (cases, felts, keys)
//   plates — triangle fans whose colour is Σ aₖ·sin(mₖπu)·sin(nₖπv) from the engine's mode amplitudes

export type Vec3 = [number, number, number];
export type RGBA = [number, number, number, number];

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
const FILL_VS = `#version 300 es
in vec3 aPos; in vec4 aColor; uniform mat4 uVP; out vec4 vColor;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vColor = aColor; }`;
const FILL_FS = `#version 300 es
precision mediump float;
in vec4 vColor; out vec4 o;
void main() { o = vColor; }`;
const PLATE_VS = `#version 300 es
in vec3 aPos; in vec2 aUV; uniform mat4 uVP; out vec2 vUV;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vUV = aUV; }`;
const PLATE_FS = `#version 300 es
precision mediump float;
in vec2 vUV; out vec4 o;
uniform float uAmp[16]; uniform vec2 uMN[16]; uniform vec4 uBase; uniform vec3 uHot; uniform float uGain;
void main() {
  float s = 0.0;
  for (int k = 0; k < 16; k++) s += uAmp[k] * sin(uMN[k].x * 3.14159 * vUV.x) * sin(uMN[k].y * 3.14159 * vUV.y);
  float e = clamp(abs(s) * uGain, 0.0, 1.0);
  o = vec4(mix(uBase.rgb, uHot, e), uBase.a + 0.35 * e);
}`;

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
class Buf {
  a = new Float32Array(4096);
  n = 0;
  push(...v: number[]): void {
    if (this.n + v.length > this.a.length) {
      const b = new Float32Array(Math.max(this.a.length * 2, this.n + v.length));
      b.set(this.a);
      this.a = b;
    }
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

export interface Plate {
  /** outline in 3D (a convex-ish fan around its first point) and each point's (u, v) in 0..1 */
  pts: Vec3[];
  uv: [number, number][];
  amps: Float32Array;
  base: RGBA;
  hot: [number, number, number];
  gain: number;
}

/** what a scene draws into, each frame */
export class Batch {
  lv = new Buf();
  li = new IBuf();
  private lvN = 0;
  fv = new Buf();
  private fvN = 0;
  plates: Plate[] = [];
  /** vertex count (for the performance budget) */
  get vertices(): number {
    return this.lvN + this.fvN;
  }
  clear(): void {
    this.lv.n = this.li.n = this.fv.n = 0;
    this.lvN = this.fvN = 0;
    this.plates = [];
  }
  /** a polyline of `width` px; colour per point or one for all */
  line(pts: Vec3[], color: RGBA | RGBA[], width = 1.2): void {
    const n = pts.length;
    if (n < 2) return;
    const base = this.lvN;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pr = pts[i > 0 ? i - 1 : 0];
      const nx = pts[i < n - 1 ? i + 1 : n - 1];
      const c = Array.isArray(color[0]) ? (color as RGBA[])[i] : (color as RGBA);
      for (const side of [-1, 1]) this.lv.push(p[0], p[1], p[2], pr[0], pr[1], pr[2], nx[0], nx[1], nx[2], side, c[0], c[1], c[2], c[3], width);
      this.lvN += 2;
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + 2 * i;
      this.li.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  /** a closed loop */
  loop(pts: Vec3[], color: RGBA, width = 1.2): void {
    this.line([...pts, pts[0], pts[1]].slice(0, pts.length + 1), color, width);
  }
  tri(a: Vec3, b: Vec3, c: Vec3, color: RGBA): void {
    for (const p of [a, b, c]) this.fv.push(p[0], p[1], p[2], color[0], color[1], color[2], color[3]);
    this.fvN += 3;
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: RGBA): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  /** a filled polygon as a fan (fine for the convex-ish outlines used here) */
  fan(pts: Vec3[], color: RGBA): void {
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const p of pts) {
      cx += p[0];
      cy += p[1];
      cz += p[2];
    }
    const c: Vec3 = [cx / pts.length, cy / pts.length, cz / pts.length];
    for (let i = 0; i < pts.length; i++) this.tri(c, pts[i], pts[(i + 1) % pts.length], color);
  }
  plate(p: Plate): void {
    this.plates.push(p);
  }
}

// ---------------------------------------------------------------- math
export type Mat4 = Float32Array;
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
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

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

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private line: WebGLProgram;
  private fill: WebGLProgram;
  private plateP: WebGLProgram;
  private vao: { line: WebGLVertexArrayObject; fill: WebGLVertexArrayObject; plate: WebGLVertexArrayObject };
  private bufs: { lv: WebGLBuffer; li: WebGLBuffer; fv: WebGLBuffer; pv: WebGLBuffer };
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private mn = plateModes(0.6);

  static create(canvas: HTMLCanvasElement): Renderer | null {
    try {
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
      return gl ? new Renderer(gl) : null;
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.line = compile(gl, LINE_VS, LINE_FS);
    this.fill = compile(gl, FILL_VS, FILL_FS);
    this.plateP = compile(gl, PLATE_VS, PLATE_FS);
    this.bufs = { lv: gl.createBuffer()!, li: gl.createBuffer()!, fv: gl.createBuffer()!, pv: gl.createBuffer()! };
    const attr = (p: WebGLProgram, name: string, size: number, stride: number, off: number) => {
      const l = gl.getAttribLocation(p, name);
      if (l < 0) return;
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4);
    };
    const line = gl.createVertexArray()!;
    gl.bindVertexArray(line);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.lv);
    attr(this.line, 'aPos', 3, 15, 0);
    attr(this.line, 'aPrev', 3, 15, 3);
    attr(this.line, 'aNext', 3, 15, 6);
    attr(this.line, 'aSide', 1, 15, 9);
    attr(this.line, 'aColor', 4, 15, 10);
    attr(this.line, 'aWidth', 1, 15, 14);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufs.li);
    const fill = gl.createVertexArray()!;
    gl.bindVertexArray(fill);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.fv);
    attr(this.fill, 'aPos', 3, 7, 0);
    attr(this.fill, 'aColor', 4, 7, 3);
    const plate = gl.createVertexArray()!;
    gl.bindVertexArray(plate);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.pv);
    attr(this.plateP, 'aPos', 3, 5, 0);
    attr(this.plateP, 'aUV', 2, 5, 3);
    gl.bindVertexArray(null);
    this.vao = { line, fill, plate };
    for (const [p, names] of [
      [this.line, ['uVP', 'uHalf']],
      [this.fill, ['uVP']],
      [this.plateP, ['uVP', 'uAmp', 'uMN', 'uBase', 'uHot', 'uGain']],
    ] as const)
      for (const n of names) this.loc[`${p === this.line ? 'l' : p === this.fill ? 'f' : 'p'}.${n}`] = gl.getUniformLocation(p, n);
  }

  draw(b: Batch, vp: Mat4, w: number, h: number, ground: [number, number, number]): void {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(ground[0], ground[1], ground[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // plates and fills: ordinary transparency
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (b.plates.length) {
      gl.useProgram(this.plateP);
      gl.uniformMatrix4fv(this.loc['p.uVP'], false, vp);
      gl.bindVertexArray(this.vao.plate);
      for (const p of b.plates) {
        const n = p.pts.length;
        const data = new Float32Array(n * 5);
        p.pts.forEach((q, i) => data.set([q[0], q[1], q[2], p.uv[i][0], p.uv[i][1]], i * 5));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.pv);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.uniform1fv(this.loc['p.uAmp'], p.amps);
        gl.uniform2fv(this.loc['p.uMN'], this.mn);
        gl.uniform4f(this.loc['p.uBase'], p.base[0], p.base[1], p.base[2], p.base[3]);
        gl.uniform3f(this.loc['p.uHot'], p.hot[0], p.hot[1], p.hot[2]);
        gl.uniform1f(this.loc['p.uGain'], p.gain);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, n);
      }
    }
    if (b.fv.n) {
      gl.useProgram(this.fill);
      gl.uniformMatrix4fv(this.loc['f.uVP'], false, vp);
      gl.bindVertexArray(this.vao.fill);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.fv);
      gl.bufferData(gl.ARRAY_BUFFER, b.fv.a.subarray(0, b.fv.n), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, b.fv.n / 7);
    }
    // lines glow: additive
    if (b.li.n) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(this.line);
      gl.uniformMatrix4fv(this.loc['l.uVP'], false, vp);
      gl.uniform2f(this.loc['l.uHalf'], w / 2, h / 2);
      gl.bindVertexArray(this.vao.line);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.lv);
      gl.bufferData(gl.ARRAY_BUFFER, b.lv.a.subarray(0, b.lv.n), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufs.li);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.li.a.subarray(0, b.li.n), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, b.li.n, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    for (const b of Object.values(this.bufs)) gl.deleteBuffer(b);
    for (const p of [this.line, this.fill, this.plateP]) gl.deleteProgram(p);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** an ink colour ('255,94,56') and alpha as RGBA 0..1 */
export function ink(c: string, a: number): RGBA {
  const [r, g, b] = c.split(',').map((x) => Number(x) / 255);
  return [r, g, b, Math.max(0, Math.min(1, a))];
}
