// Evening Hall in 3D: a recital, the instrument on a stage in a concert hall at night. One warm spot
// from above and in front (a key light with a deep, fairly hard shadow, and the lantern itself in the
// image-based light, so lacquer and brass catch one hot light), very little fill, a dim warm bounce off
// the stage's boards, a faint gold back light, and the house's glow far behind the camera (`hall`). The
// floor is a stage's: dark boards that show where the spot's pool falls. Behind it a velvet curtain
// takes the spill, and the spot's beam hangs in the air (the last pass). Before the first sound the
// stage waits under a low light; the light comes up with the sound (`lights.wait`).
import * as THREE from 'three';
import type { Vec3 } from '../../ui/gl/gl3d.ts';
import { panel, walls, type World } from '../../ui/gl/world.ts';
import { eveningHall } from './theme.ts';

/** the stage's own key light: towards it from the instrument (the scenes' frame), from above and in front */
const KEY_DIR: Vec3 = [0.4, 0.86, -0.32];
/** the lights of an instrument shown whole (a key's close-up has its own: three3d CLOSE) */
const STAGE = {
  /** the spot: tungsten, the one light that models the instrument */
  keyI: 4.1,
  /** from behind: a thin gold edge that keeps a black case off the dark */
  rimI: 0.9,
  /** from below and in front: what the lit boards send back up */
  bounceI: 0.34,
  bounce: [-0.2, -0.78, -0.6] as Vec3,
  /** the pool's light on the boards past its rim, as a share of the pool's */
  spill: 0.17,
  /** the light before the first sound (a share of the spot's, of the beam's and of the curtain's) */
  wait: 0.5,
  /** the beam's and the curtain's strengths, come up */
  beam: 0.085,
  curtain: 1,
};

/** the hall to light the scene with (and to see reflected in lacquer and brass): dark, with one lantern */
function hall(): THREE.Scene {
  const s = new THREE.Scene();
  // the house: near black, warm
  walls(s, [0.011, 0.006, 0.006], [34, 16, 34], 6);
  // the lantern: one small, very bright source where the key light comes from (the world is mirrored in
  // x: the scenes' +x is this scene's −x), so lacquer and brass show one hot light and not a ring of cards
  panel(s, 1.5, 1.5, [1, 0.87, 0.68], 46, [-KEY_DIR[0] * 12, KEY_DIR[1] * 12, KEY_DIR[2] * 12], [0, 0.6, 0], 0.75);
  // the boards in the spot's pool, under the instrument and out towards the house: what a case's black
  // front, a bell's underside and a rib's lower edge look down at
  panel(s, 13, 13, [1, 0.64, 0.36], 0.62, [0, -1.85, -2.2], [0, 10, -2.2], 0.95);
  // the spot's own haze and the proscenium over the stage: a broad, low glow high in front, which keeps a
  // lid's top and a tube's upper side from being holes
  panel(s, 18, 9, [1, 0.8, 0.6], 0.2, [-3, 10, -6], [0, 0, 0], 0.95);
  // the house, far behind the camera: a balcony front's gilt in a low light, and a row of wall lamps
  panel(s, 30, 1.3, [1, 0.72, 0.42], 0.85, [0, 3.0, -15], [0, 1.6, 0], 0.6);
  for (let i = -3; i <= 3; i++) panel(s, 0.42, 0.6, [1, 0.74, 0.44], 3.4, [i * 3.6, 2.3 + 0.25 * Math.abs(i), -15.5], [0, 1.6, 0], 0.9);
  // the curtain behind the stage, in the spill: velvet, low
  panel(s, 26, 5, [0.62, 0.07, 0.1], 0.075, [0, 1.6, 13], [0, 1.4, 0], 0.9);
  // a thin gold light from behind, where the back light hangs: the edge on a case, the line down a tube
  panel(s, 1.1, 5, [1, 0.78, 0.5], 4.2, [8, 5, 8], [0, 1, 0], 0.6);
  return s;
}

export const eveningHallWorld: World = {
  id: 'evening-hall',
  room: hall,
  // the spot from above and in front, a little to the left (tungsten, a deep and fairly hard shadow);
  // the back light from behind right (gold, thin); the boards' bounce from below, warm and low. There is
  // no other fill. Before the first sound the spot and its bounce wait low.
  lights: {
    key: { dir: KEY_DIR, color: [1, 0.86, 0.66], intensity: STAGE.keyI, waits: true },
    rim: { dir: [-0.6, 0.5, 0.75], color: [1, 0.78, 0.5], intensity: STAGE.rimI },
    // (warm in a key's close-up too: a cool fill turned pale wood in the key's shadow olive)
    fill: { dir: STAGE.bounce, color: [1, 0.68, 0.42], intensity: STAGE.bounceI, close: [1, 0.9, 0.78], waits: true },
    env: 1,
    shadow: { radius: 3.4, lite: 2.4, depth: 1 },
    wait: STAGE.wait,
  },
  exposure: 1,
  bloom: { over: 2.2, strength: 0.35 },
  mirror: { most: 0.42, gain: 1.3 },
  glow: 'added',
  // The floor: a stage's boards, stained under a worn varnish, lit and shadowed; on it the spot's pool
  // (as large as the room). uUp: the light come up (0 … 1). The boards run up and down the stage, 14 cm
  // wide, each a little its own tone, butted at lengths of their own (3.4 m); their seams go as they
  // grow finer than the picture can draw. With no pool (an orchestra's) a wash over the whole floor, a
  // little under a solo's pool so the players stand out of it.
  floor: {
    color: [0.125, 0.064, 0.032],
    roughness: 0.46,
    specular: 0.55,
    env: 0.45,
    past: STAGE.spill,
    lift: 1,
    wash: -0.3,
    pars: 'uniform float uUp;',
    body: /* glsl */ `
{
  float rr = length((vWorldP - uFloorC).xz);
  float bu = vWorldP.x / 0.14;
  float bi = floor(bu);
  float h1 = fract(sin(bi * 12.9898) * 43758.5453);
  float fu = fwidth(bu);
  float eu = min(fract(bu), 1.0 - fract(bu));
  float seam = (1.0 - smoothstep(fu * 0.5, fu * 1.5 + 0.02, eu)) * (1.0 - smoothstep(0.16, 0.5, fu));
  float bv = vWorldP.z / 3.4 + h1 * 7.0;
  float fv = fwidth(bv);
  float ev = min(fract(bv), 1.0 - fract(bv));
  float butt = (1.0 - smoothstep(fv * 0.5, fv * 1.5 + 0.002, ev)) * (1.0 - smoothstep(0.01, 0.035, fv));
  float h2 = fract(sin((bi + floor(bv) * 57.0) * 78.233) * 12543.123);
  gl_FragColor.rgb *= (0.84 + 0.2 * h1 + 0.1 * h2) * (1.0 - max(0.46 * seam, 0.3 * butt));
  float inPool = 1.0 - smoothstep(uPool.x - uPool.y, uPool.x + uPool.y, rr);
  float e = (rr - uPool.x) / max(uPool.y, 1e-3);
  float k = mix(uPool.z, (1.0 + uPool.w) * mix(0.62, 1.0, uUp), inPool) + uPoolHot * 0.3 * exp(-e * e);
  gl_FragColor.rgb *= k;
  gl_FragColor.a *= 1.0 - smoothstep(uFloorR.x, uFloorR.y, rr);
}`,
    uniforms: () => ({ uUp: { value: 1 } }),
  },
  final: {
    pars: /* glsl */ `// the hall behind the stage: the camera's rays (uInvVP, uEye), the stage's middle on its floor and
// its size (uStage: xyz, radius), how much of the hall shows (uHall: 0 in a key's close-up)
uniform mat4 uInvVP; uniform vec3 uEye; uniform vec4 uStage; uniform float uHall;
// the spot's beam on the picture: where its axis meets the floor and a point up it (uv), its
// half-width at the floor (in picture heights), its strength
uniform vec2 uBeamB; uniform vec2 uBeamA; uniform float uBeamW; uniform float uBeam;`,
    body: /* glsl */ `
  // the backdrop: a velvet curtain hung round the back of the stage, a cylinder about its middle, down
  // to the boards. It is lit only by what the spot spills: most just above the boards, less with height,
  // and its pleats catch it on their ridges. It turns with the camera, as a curtain there would. Towards
  // the picture's top it has gone to the page's own ground (so the canvas meets the page without a seam).
  vec3 back = uGround;
  if (uHall > 0.001) {
    vec4 pw = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize(pw.xyz / pw.w - uEye);
    float R = uStage.w * 3.4 + 2.4;
    vec2 o = uEye.xz - uStage.xz;
    float qa = dot(dir.xz, dir.xz);
    float qb = dot(o, dir.xz);
    float qc = dot(o, o) - R * R;
    float disc = qb * qb - qa * qc;
    if (qa > 1e-6 && disc > 0.0) {
      float t = (-qb + sqrt(disc)) / qa;
      vec3 P = uEye + dir * t;
      float h = P.y - uStage.y;
      float th = atan(P.z - uStage.z, P.x - uStage.x);
      // pleats, no two alike: their phase wanders (so their widths do), and their depth with it
      float u0 = th * R * 6.2832 / (0.3 + 0.06 * uStage.w);
      float u = u0 + 1.5 * sin(u0 * 0.173 + 1.1) + 0.9 * sin(u0 * 0.071 + 2.3);
      float deep = 0.72 + 0.28 * sin(u0 * 0.113 + 0.7);
      float f = sin(u) + 0.34 * sin(u * 2.31 + 1.7);
      float pleat = pow(clamp(0.5 + 0.36 * deep * f, 0.0, 1.0), 1.8);
      float H = 1.2 * uStage.w + 0.8;
      // it hangs to the boards: lit most just over them, a darker hem where it meets them
      float fall = exp(-max(h, 0.0) / H) * smoothstep(-0.004 * H, 0.004 * H, h) * (0.38 + 0.62 * smoothstep(0.0, 0.08 * H, h));
      float top = smoothstep(1.0, 0.5, vUv.y);
      back += vec3(0.2, 0.034, 0.05) * (0.22 + 0.78 * pleat) * fall * top * uHall;
    }
  }
  vec3 outc = mix(back, s, a);
  // the beam: the spot's light in the hall's air, a soft cone down to its pool (over the picture, and
  // fainter over what stands in it)
  if (uBeam > 0.001) {
    vec2 asp = vec2(uRes.x / uRes.y, 1.0);
    vec2 ab = (uBeamA - uBeamB) * asp;
    float L = max(length(ab), 1e-4);
    vec2 n = ab / L;
    vec2 q = (vUv - uBeamB) * asp;
    float t = dot(q, n) / L;
    float dd = abs(q.x * n.y - q.y * n.x);
    // one cone, wider towards its pool, feathered right across; gone before the picture's top (the band
    // over the canvas never cuts it), and not drawn where the camera would see it lying across the picture
    float w = uBeamW * (0.26 + 0.74 * clamp(1.0 - t / 2.6, 0.0, 1.0));
    float e = dd / w;
    float cone = exp(-e * e * 1.7) * smoothstep(-0.05, 0.3, t) * (0.6 + 0.25 * clamp(t, 0.0, 2.0));
    cone *= smoothstep(1.0, 0.82, vUv.y) * smoothstep(0.6, 0.3, abs(n.x));
    outc += vec3(1.0, 0.84, 0.6) * cone * uBeam * mix(1.0, 0.28, a);
  }
  // the house's falloff: the picture's far corners sink towards the ground
  vec2 vq = (vUv - 0.5) * vec2(1.7, 2.0);
  outc = mix(outc, uGround, 0.42 * smoothstep(0.6, 1.5, length(vq)));
  gl_FragColor = vec4(outc + d / 255.0, 1.0);`,
    uniforms: () => ({
      uInvVP: { value: new THREE.Matrix4() },
      uEye: { value: new THREE.Vector3() },
      uStage: { value: new THREE.Vector4(0, 0, 0, 1) },
      uHall: { value: 1 },
      uBeamB: { value: new THREE.Vector2(0.5, 0.3) },
      uBeamA: { value: new THREE.Vector2(0.5, 1) },
      uBeamW: { value: 0.3 },
      uBeam: { value: 0 },
    }),
  },
  // the hall: the curtain round the back of the stage, and the spot's beam down to its pool (none in a
  // key's close-up, where the camera is inside the instrument)
  frame(u, { cam, w, h, c, rad, floor: f, key, k, up, lit }) {
    u.floor.uUp.value = up;
    const fu = u.final;
    const fy = f ? f.y : c[1] - rad;
    const fx = f ? -f.c[0] : -c[0];
    const fz = f ? f.c[2] : c[2];
    (fu.uInvVP.value as THREE.Matrix4).multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    (fu.uEye.value as THREE.Vector3).copy(cam.position);
    (fu.uStage.value as THREE.Vector4).set(fx, fy, fz, rad);
    // (the curtain is drawn only where a fair share of it shows: a camera looking down on a grand has a
    // strip of it along the picture's top, which reads as smudges. The point watched is behind the
    // stage on the curtain, at the height where its light has fallen to a third)
    const ax = fx - cam.position.x;
    const az = fz - cam.position.z;
    const al = Math.hypot(ax, az) || 1;
    const Rc = rad * 3.4 + 2.4;
    const up3 = new THREE.Vector3(fx + (ax / al) * Rc, fy + 1.2 * rad + 0.8, fz + (az / al) * Rc).project(cam);
    const show = up3.z < 1 ? Math.max(0, Math.min(1, (1.08 - (up3.y * 0.5 + 0.5)) / 0.3)) : 0;
    fu.uHall.value = (1 - k) * STAGE.curtain * lit * show;
    // the beam's axis: from the pool's middle on the floor up towards the lantern (three's world: x mirrored)
    const kd = key ?? KEY_DIR;
    const pb = new THREE.Vector3(fx, fy, fz).project(cam);
    const pa = new THREE.Vector3(fx - kd[0] * rad * 2, fy + kd[1] * rad * 2, fz + kd[2] * rad * 2).project(cam);
    const R = f?.pool ? f.pool.R : rad * 1.1;
    // (the pool's radius as the picture sees it, across the beam: a point R to the camera's right)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const pe = new THREE.Vector3(fx + right.x * R, fy, fz + right.z * R).project(cam);
    const ok = pb.z < 1 && pa.z < 1 && !!f;
    fu.uBeamB.value.set(pb.x * 0.5 + 0.5, pb.y * 0.5 + 0.5);
    fu.uBeamA.value.set(pa.x * 0.5 + 0.5, pa.y * 0.5 + 0.5);
    // (what is seen of a beam in the air is its core: half the pool's width, and never most of the picture)
    fu.uBeamW.value = Math.max(0.04, Math.min(0.3, Math.abs(pe.x - pb.x) * 0.5 * (w / h) * 0.55));
    // (an orchestra stands in a wash, not in one spot: no beam)
    fu.uBeam.value = ok && f?.pool ? (1 - k) * STAGE.beam * up : 0;
  },
  materials: {},
  riser: { top: 'caseInner', side: 'caseRaw' },
  ring: [1, 0.78, 0.5],
  harp: { mark: [1, 0.94, 0.82], lit: [0.5, 0.45, 0.35], own: 0.5 },
  // the stage's light for the bowed string, amber for a string ringing on and the stopping point's bar
  bowed: {
    sound: eveningHall.ink.sound,
    ring: eveningHall.ink.warm,
    bowing: [0.18, 0.45],
    ringing: [0.12, 0.4],
    stop: [
      [0.24, 14],
      [0.9, 6],
      [0.7, 2.5],
    ],
    shape: 0.85,
  },
};
