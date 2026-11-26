// Night Bench in 3D: a studio product shot. An image-based light from a generated studio (a large
// overhead softbox, a key softbox, two strip lights for the rims, dark walls), a warm key light with a
// soft shadow, a cool rim light, a low fill, and a floor that takes the shadow and occlusion and fades
// into the page's own ground; behind the instrument a seamless wall lit softly. What sounds is a line of
// light added over the picture. The look the 3D stage was built in: its numbers are the measure for the
// other three.
import * as THREE from 'three';
import { GLOW_PARS, glowBox, glowUniforms, ground, panel, walls, type World } from '../../ui/gl/world.ts';
import { nightBench } from './theme.ts';

/** a studio to light the scene with (and to see reflected in lacquer and brass) */
function studio(): THREE.Scene {
  const s = new THREE.Scene();
  // dark walls: polished metal and lacquer read through contrast, bright cards against black
  walls(s, [0.02, 0.019, 0.018], [30, 14, 30], 5);
  // a floor a little lighter than the walls (the bounce under an instrument)
  ground(s, [0.07, 0.06, 0.05]);
  // as a product studio lights lacquer and metal: a large overhead softbox; a key softbox front
  // left; a wide, feathered card behind the camera (a piano's black front and a bell's flare need
  // something bright to reflect, or they read as holes); tall strips behind left and right for the
  // rims, and two beside the camera for the long highlights down tubes and case edges; a low cool
  // card in front
  panel(s, 10, 7, [1, 0.96, 0.9], 2.4, [0, 9, -0.5], [0, 0, 0], 0.45);
  panel(s, 5, 4, [1, 0.9, 0.78], 6.5, [-6, 5, -6], [0, 0, 0], 0.4);
  panel(s, 20, 7, [1, 0.97, 0.93], 1.5, [0, 3.6, -11], [0, 1.4, 0], 0.9);
  panel(s, 1.3, 9, [0.85, 0.9, 1], 7, [-8, 3, 7], [0, 1, 0], 0.5);
  panel(s, 1.3, 9, [0.85, 0.9, 1], 5.5, [8, 3, 6], [0, 1, 0], 0.5);
  panel(s, 1.6, 8, [1, 0.95, 0.88], 3.2, [-10, 3, -3], [0, 1, 0], 0.6);
  panel(s, 1.6, 8, [0.9, 0.94, 1], 2.4, [10, 3, -4], [0, 1, 0], 0.6);
  panel(s, 9, 1.8, [0.7, 0.78, 0.9], 0.9, [0, 0.4, -9], [0, 1, 0], 0.6);
  // the lit floor in front of the instrument: what a piano's vertical black front, a bell's underside
  // and a rib's lower edge reflect (they face down and out, at the floor, not at the softboxes)
  panel(s, 22, 16, [1, 0.93, 0.84], 0.55, [0, -1.85, -5], [0, 10, -5], 1.0);
  return s;
}

export const nightBenchWorld: World = {
  id: 'night-bench',
  room: studio,
  // the key from the front left, above (warm, a soft shadow); the rim from behind right (cool); a soft
  // fill from the other side, low (in a key's close-up warm: a cool fill turned pale wood in the key's
  // shadow olive)
  lights: {
    key: { dir: [0.55, 0.78, -0.5], color: [1, 0.93, 0.84], intensity: 2.6 },
    rim: { dir: [-0.6, 0.5, 0.75], color: [0.8, 0.88, 1], intensity: 1.6 },
    fill: { dir: [-0.8, 0.25, -0.55], color: [0.9, 0.92, 1], intensity: 0.55, close: [1, 0.9, 0.78] },
    env: 1,
    shadow: { radius: 5, lite: 3, depth: 1 },
    wait: 1,
  },
  exposure: 1,
  bloom: { over: 2.2, strength: 0.35 },
  mirror: { most: 0.42, gain: 1.3 },
  glow: 'added',
  // the floor: on it the room's light, a pool as large as the room; its rim brightened while the
  // room's knob is under the pointer, turned or focused
  floor: {
    color: [0.075, 0.062, 0.05],
    roughness: 0.8,
    specular: 0.25,
    env: 0.35,
    past: 0.5,
    lift: 1,
    wash: 0,
    pars: '',
    body: /* glsl */ `
{
  float rr = length((vWorldP - uFloorC).xz);
  float inPool = 1.0 - smoothstep(uPool.x - uPool.y, uPool.x + uPool.y, rr);
  float e = (rr - uPool.x) / max(uPool.y, 1e-3);
  float k = mix(uPool.z, 1.0 + uPool.w, inPool) + uPoolHot * 0.3 * exp(-e * e);
  gl_FragColor.rgb *= k;
  gl_FragColor.a *= 1.0 - smoothstep(uFloorR.x, uFloorR.y, rr);
}`,
  },
  final: {
    pars: GLOW_PARS,
    body: /* glsl */ `
  // the backdrop: a seamless studio wall lit softly behind the instrument, falling off to the page's
  // own ground at the edges (so the canvas still meets the page without a seam)
  vec2 q = (vUv - uGlowC) / uGlowR;
  vec3 back = uGround + vec3(0.085, 0.077, 0.068) * uGlow * exp(-dot(q, q));
  gl_FragColor = vec4(mix(back, s, a) + d / 255.0, 1.0);`,
    uniforms: glowUniforms,
  },
  frame(u, f) {
    glowBox(u.final, f);
  },
  materials: {},
  // a dark stained wood top over a black fascia
  riser: { top: 'caseInner', side: 'caseRaw' },
  // one warm light, kept with the app's other 3D light (a trumpet's pressed piston: [1, 0.62, 0.34])
  ring: [1, 0.78, 0.5],
  // (a ringing string catches the light: brighter the wider it swings, dying with it)
  harp: { mark: [1, 0.94, 0.82], lit: [0.5, 0.45, 0.35], own: 0.5 },
  // vermilion for the bowed string, amber for a string ringing on and the stopping point's glowing bar
  bowed: {
    sound: nightBench.ink.sound,
    ring: nightBench.ink.warm,
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
