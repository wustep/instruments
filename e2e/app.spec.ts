// End-to-end checks in real Chrome: the page, the AudioWorklet, offline rendering
// through the worklet with spectral checks, the live views, MIDI input, phone layout.
import { test, expect, type Page } from '@playwright/test';
import { analyzePartials } from '../packages/engine/src/analysis/index.ts';
import { smf } from '../apps/web/test/smf.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};

/** everything the browser says about WebGL on its console, at any level (Chrome reports an invalid
 *  draw as a warning: "GL_INVALID_OPERATION: glDrawElements: Feedback loop formed between …") */
const collectGl = (page: Page) => {
  const msgs: string[] = [];
  page.on('console', (m) => {
    if (/webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) msgs.push(`${m.type()}: ${m.text()}`);
  });
  return msgs;
};
/** the 3D stage's own count: gl.getError() after each of the next `frames` frames */
const glErrors = (page: Page, frames = 30) =>
  page.evaluate(async (n) => {
    const gl = (window as any).__stage3d.r3.r.getContext() as WebGL2RenderingContext;
    let errs = 0;
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      for (let e = gl.getError(); e; e = gl.getError()) errs++;
    }
    return errs;
  }, frames);

async function startAudio(page: Page) {
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}

test('page loads with the keyboard and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  // no wordmark on the page; the name lives in the tab title
  await expect(page.locator('.inlay')).toHaveCount(0);
  await expect(page).toHaveTitle('instruments');
  await expect(page.locator('.instruments .pick')).toHaveCount(6);
  await expect(page.locator('.keyboard .key')).toHaveCount(88);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('the AudioWorklet runs and a note sounds at the right pitch', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const r = await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.noteOn(69, 100, 'keys');
    await new Promise((res) => setTimeout(res, 500));
    const d = new Float32Array(a.analyser.frequencyBinCount);
    a.analyser.getFloatFrequencyData(d);
    const binHz = a.ctx.sampleRate / a.analyser.fftSize;
    // strongest bin near A4
    let best = -Infinity;
    let at = 0;
    for (let i = Math.floor(400 / binHz); i < Math.ceil(480 / binHz); i++) if (d[i] > best) { best = d[i]; at = i; }
    a.noteOff(69, 'keys');
    return { db: best, hz: at * binHz, stats: a.lastStats, lat: a.latencyMs };
  });
  expect(r.db).toBeGreaterThan(-70);
  expect(Math.abs(r.hz - 440)).toBeLessThan(6); // analyser resolution ~5.9 Hz
  expect(r.stats.voices).toBeGreaterThanOrEqual(1);
  expect(r.stats.load).toBeGreaterThanOrEqual(0); // 1 ms clock in the worklet scope
  expect(r.stats.load).toBeLessThan(0.7);
  test.info().annotations.push({ type: 'latency', description: JSON.stringify(r.lat) });
  expect(errors).toEqual([]);
});

test('offline render through the real worklet: pitch, inharmonicity and partials', async ({ page }) => {
  await page.goto('/');
  for (const midi of [33, 60, 84]) {
    const out = await page.evaluate(async (m) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ sampleRate: 48000, duration: 2.2, params: { room: 0, unisonDetune: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 100 } }] });
      const x = buf.getChannelData(0);
      let peak = 0;
      let bad = 0;
      for (let i = 0; i < x.length; i++) {
        if (!Number.isFinite(x[i])) bad++;
        peak = Math.max(peak, Math.abs(x[i]));
      }
      return { x: Array.from(x), peak, bad };
    }, midi);
    expect(out.bad).toBe(0);
    expect(out.peak).toBeGreaterThan(0.01);
    expect(out.peak).toBeLessThanOrEqual(1);
    const target = await page.evaluate(async (m) => {
      // the instrument's own per-key summary (stretched tuning and B)
      const a = (window as any).__piano;
      if (!a.piano) await a.start();
      await a.piano.ready; // the engine is up before it has reported its keys
      return a.piano.keys.find((k: any) => k.midi === m);
    }, midi);
    const pa = analyzePartials(Float32Array.from(out.x), 48000, target.f1, { Bguess: target.B, startSec: 0.1, lenSec: 1.6 });
    expect(pa.partials.length, `m${midi}`).toBeGreaterThanOrEqual(midi < 80 ? 6 : 2);
    expect(Math.abs(1200 * Math.log2(pa.f1 / target.f1)), `m${midi} f1`).toBeLessThan(2.5);
    if (midi < 80) expect(Math.abs(Math.log(pa.B / target.B)), `m${midi} B`).toBeLessThan(Math.log(1.25));
  }
});

test('the stage: live strings, soundboard, hammer scope and spectrum draw', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = collectErrors(page);
  await page.goto('/#/inside');
  await startAudio(page);
  await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.sustain(1);
    for (const m of [36, 48, 60, 64, 67]) {
      a.noteOn(m, 100, 'keys');
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await page.waitForTimeout(900);
  const painted = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.stage canvas')).filter((c) => (c as HTMLElement).checkVisibility()).map((c) => {
      const cv = c as HTMLCanvasElement;
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    }),
  );
  expect(painted.length).toBe(phone ? 2 : 3); // instrument, spectrum, excitation scope (not on phones)
  for (const n of painted) expect(n).toBeGreaterThan(500);
  await expect(page.locator('.r-hz')).toContainText('Hz');
  if (!phone) await expect(page.locator('.scope-cap')).toContainText('m/s');
  // a physical control (knob) reaches the worklet; on phones the knobs fold out first
  if (phone) await page.getByRole('button', { name: 'Show the knobs' }).click();
  const slider = page.getByRole('slider', { name: 'Soundboard damping' });
  await slider.fill('0.9');
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => (window as any).__piano.piano.params.soundboardDamping);
  expect(p).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('measurements: charts render and the A/B model renders in the browser', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/#/measurements');
  await expect(page.locator('figure svg').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('figure svg').count()).toBeGreaterThanOrEqual(10);
  await expect(page.getByText('Where it falls short')).toBeVisible();
  // round 2: strings and flute compared with their own recordings
  await expect(page.getByRole('heading', { name: 'Strings and flute against recordings' })).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('.ensemble figure svg').count()).toBeGreaterThanOrEqual(8);
  const btn = page.locator('.ab-item').filter({ hasText: 'C#4' }).getByRole('button', { name: 'model' });
  await btn.click();
  await expect(btn).toHaveClass(/playing/, { timeout: 20_000 });
  const ref = await page.request.get('/ref/iowa-steinway-b-mf-Db4.mp3');
  expect(ref.ok()).toBe(true);
  expect(errors).toEqual([]);
});

test('Web MIDI: hot-plug, notes, continuous sustain (CC64), sostenuto (CC66) and soft pedal (CC67)', async ({ page }) => {
  // a fake MIDI device that is plugged in after the page has started listening
  await page.addInitScript(() => {
    const inputs = new Map<string, any>();
    const access: any = { inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false };
    (navigator as any).requestMIDIAccess = async () => access;
    (window as any).__midi = {
      plug() {
        const input = { id: 'fake', name: 'Test Keys', state: 'connected', onmidimessage: null as any };
        inputs.set('fake', input);
        access.onstatechange?.({ port: input });
      },
      send(bytes: number[]) {
        inputs.get('fake').onmidimessage?.({ data: new Uint8Array(bytes) });
      },
      unplug() {
        const input = inputs.get('fake');
        input.state = 'disconnected';
        inputs.delete('fake');
        access.onstatechange?.({ port: input });
      },
    };
  });
  await page.goto('/');
  await expect(page.locator('.status')).toHaveAttribute('data-midi', 'no MIDI device');
  await page.evaluate(() => (window as any).__midi.plug());
  await expect(page.locator('.status')).toHaveAttribute('data-midi', 'MIDI: Test Keys');
  await expect(page.locator('.status .midi')).toHaveText('midi');
  await startAudio(page);
  await page.evaluate(() => {
    const m = (window as any).__midi;
    m.send([0xb0, 64, 64]); // half pedal
    m.send([0xb0, 67, 127]); // una corda
    m.send([0xb0, 66, 127]); // sostenuto
    m.send([0x90, 60, 90]);
  });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => (window as any).__piano.lastStats);
  expect(st.sustain).toBeCloseTo(64 / 127, 2);
  expect(st.soft).toBeCloseTo(1, 2);
  expect(st.middle).toBeCloseTo(1, 2);
  await page.evaluate(() => (window as any).__midi.send([0xb0, 66, 0]));
  expect(st.voices).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.key[data-midi="60"]')).toHaveClass(/down/);
  await page.evaluate(() => (window as any).__midi.send([0x80, 60, 0]));
  await expect(page.locator('.key[data-midi="60"]')).not.toHaveClass(/down/);
  // strings: pitch bend, mod wheel (bow pressure), aftertouch (vibrato) reach the instrument
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('violin');
    const m = (window as any).__midi;
    m.send([0x90, 69, 100]);
    m.send([0xe0, 0x00, 0x60]); // bend up
    m.send([0xb0, 1, 120]); // mod wheel: press the bow
    m.send([0xd0, 90]); // aftertouch: vibrato
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__piano.piano.params.vibrato)).toBeGreaterThan(20);
  await page.evaluate(async () => {
    const m = (window as any).__midi;
    m.send([0x80, 69, 0]);
    m.send([0xe0, 0x00, 0x40]); // centre
    await (window as any).__piano.setInstrument('piano');
  });
  await expect(page.locator('.status .midi')).toHaveAttribute('title', 'MIDI: Test Keys');
  // unplugging a device mid-note releases what it held (it can no longer send note-offs)
  await page.evaluate(() => (window as any).__midi.send([0x90, 64, 90]));
  await expect(page.locator('.key[data-midi="64"]')).toHaveClass(/down/);
  await page.evaluate(() => (window as any).__midi.unplug());
  await expect(page.locator('.key[data-midi="64"]')).not.toHaveClass(/down/);
  await expect(page.locator('.status .midi')).toBeHidden();
});

test('without Web MIDI (Safari) the page works and shows no MIDI indicator', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    delete (Navigator.prototype as any).requestMIDIAccess;
  });
  await page.goto('/');
  await expect(page.locator('.status')).toHaveAttribute('data-midi', 'no Web MIDI');
  await expect(page.locator('.status .midi')).toBeHidden();
  await startAudio(page);
  expect(errors).toEqual([]);
});

test('layout fits the viewport (no horizontal page scroll) and keys respond to touch/click', async ({ page }, info) => {
  await page.goto('/');
  for (const route of ['#/', '#/play', '#/measurements', '#/notes']) {
    await page.goto(`/${route}`);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, route).toBeLessThanOrEqual(1);
  }
  // a phone held sideways (844×390): one slim band, the stage takes the rest, the page does not scroll
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.waitForTimeout(500);
  const land = await page.evaluate(() => ({
    overX: document.documentElement.scrollWidth - window.innerWidth,
    overY: document.documentElement.scrollHeight - window.innerHeight,
    stage: document.querySelector('.stage')!.getBoundingClientRect().height,
    band: document.querySelector('.stage-top')!.getBoundingClientRect().height,
    keysBottom: document.querySelector('.keyboard')!.getBoundingClientRect().bottom,
    knobs: getComputedStyle(document.querySelector('.knobs')!).display,
    toggle: getComputedStyle(document.querySelector('.knob-toggle')!).display,
  }));
  expect(land.overX, 'landscape: no horizontal scroll').toBeLessThanOrEqual(1);
  expect(land.overY, 'landscape: no vertical scroll').toBeLessThanOrEqual(1);
  expect(land.stage, 'landscape: the stage has the height').toBeGreaterThanOrEqual(200);
  expect(land.band, 'landscape: a slim band').toBeLessThanOrEqual(48);
  expect(land.keysBottom).toBeLessThanOrEqual(390);
  expect(land.knobs).toBe('none');
  expect(land.toggle).not.toBe('none');
  await page.locator('.knob-toggle').click();
  await expect(page.locator('.knobs')).toBeVisible();
  await page.locator('.knob-toggle').click();
  await page.setViewportSize(vp);
  await page.goto('/');
  const key = page.locator('.key[data-midi="60"]');
  await key.scrollIntoViewIfNeeded();
  const box = (await key.boundingBox())!;
  if (info.project.name === 'phone') await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.9);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.waitForFunction(() => (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  const notes = await page.evaluate(() => (window as any).__piano.lastStats?.voices ?? 0);
  expect(notes).toBeGreaterThanOrEqual(1);
});

test('phone keys: no computer-key letters on touch; a thin strip of all 88 keys over them, its window the keys in view, slides them; a drag on the keys is still a glissando', async ({ page, context }, info) => {
  await page.goto('/');
  const strip = page.locator('.keymap');
  const letter = page.locator('.key[data-midi="60"] .lbl');
  if (info.project.name !== 'phone') {
    // a wide window shows all 88 keys (no strip), and a computer has its letters
    await expect(strip).toBeHidden();
    await expect(letter).toHaveText('A');
    await expect(letter).toBeVisible();
    // a narrow window: the keys no longer all fit, so the strip is there; the letters stay
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(strip).toBeVisible();
    await expect(letter).toBeVisible();
    await page.setViewportSize(vp);
    return;
  }
  await startAudio(page);
  // touch: the letters are off the keys; each C keeps its name
  await expect(letter).toBeHidden();
  await expect(page.locator('.key[data-midi="60"] .cname')).toBeVisible();
  // the strip: a scrollbar for the keys, with no tooltip (like the file player's position line)
  await expect(strip).toBeVisible();
  expect(await strip.locator('.km-k').count()).toBe(88);
  await expect(strip).toHaveAttribute('role', 'scrollbar');
  await expect(strip).toHaveAttribute('aria-label', /position/i);
  expect(await strip.getAttribute('data-tip')).toBeNull();
  const geo = () =>
    page.evaluate(() => {
      const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
      const sc = document.querySelector('.kbd-scroll')!;
      const tr = r('.km-track');
      const win = r('.km-win');
      return {
        fall: r('.fallboard').bottom,
        strip: { top: r('.keymap').top, bottom: r('.keymap').bottom },
        keysTop: r('.keyboard').top,
        left: sc.scrollLeft,
        sw: sc.scrollWidth,
        cw: sc.clientWidth,
        winL: (win.left - tr.left) / tr.width,
        winW: win.width / tr.width,
        track: { x: tr.left, w: tr.width, y: tr.top + tr.height / 2 },
        overY: document.documentElement.scrollHeight - window.innerHeight,
        down: (window as any).__piano.down.size as number,
      };
    });
  const g = await geo();
  // thin, between the fallboard and the keys; the page does not scroll
  expect(g.strip.top).toBeGreaterThanOrEqual(g.fall - 1);
  expect(g.strip.bottom).toBeLessThanOrEqual(g.keysTop + 1);
  expect(g.strip.bottom - g.strip.top).toBeLessThanOrEqual(26);
  expect(g.overY).toBeLessThanOrEqual(1);
  // its window is the keys in view
  expect(Math.abs(g.winL - g.left / g.sw)).toBeLessThan(0.01);
  expect(Math.abs(g.winW - g.cw / g.sw)).toBeLessThan(0.01);
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  // a finger on the window, dragged 90 px right (and off the strip's own height): the keys slide by
  // that share of all 88, and nothing sounds
  const x0 = g.track.x + (g.winL + g.winW / 2) * g.track.w;
  await touch('touchStart', x0, g.track.y);
  for (let i = 1; i <= 6; i++) await touch('touchMove', x0 + i * 15, g.track.y - i * 6);
  // (touch moves are delivered with the next frame)
  await expect.poll(async () => Math.abs((await geo()).left - g.left - (90 / g.track.w) * g.sw)).toBeLessThan(4);
  const dragged = await geo();
  expect(Math.abs(dragged.winL - dragged.left / dragged.sw)).toBeLessThan(0.01);
  expect(dragged.down).toBe(0);
  await touch('touchEnd');
  // the octave is the one now in view (its arrows carry on from there): two octaves up from C4
  await expect(page.locator('.oct-label')).toHaveText(/^C[67]$/);
  expect((await geo()).left).toBe(dragged.left);
  // a tap off the window brings it under the finger: the strip's left end is the lowest keys
  await touch('touchStart', g.track.x + 2, g.track.y);
  await touch('touchEnd');
  await expect.poll(async () => (await geo()).left).toBe(0);
  // a drag across the keys themselves plays each one in turn (a glissando) and slides nothing
  const whites = await page.evaluate(() => {
    const out: { midi: number; x: number; y: number }[] = [];
    for (const k of Array.from(document.querySelectorAll<HTMLElement>('.key.white'))) {
      const r = k.getBoundingClientRect();
      if (r.left > 20 && r.right < window.innerWidth - 20) out.push({ midi: Number(k.dataset.midi), x: r.left + r.width / 2, y: r.bottom - 24 });
    }
    return out.slice(0, 5);
  });
  expect(whites.length).toBe(5);
  await page.evaluate(() => {
    const w = window as any;
    w.__ons = [];
    w.__piano.notes.on((n: { on: boolean; midi: number }) => n.on && w.__ons.push(n.midi));
  });
  await touch('touchStart', whites[0].x, whites[0].y);
  for (const k of whites.slice(1)) await touch('touchMove', k.x, k.y);
  await expect(page.locator(`.key[data-midi="${whites[4].midi}"]`)).toHaveClass(/down/);
  // (the strip lights the note too)
  await expect(strip.locator('.km-k.on')).toHaveCount(1);
  await touch('touchEnd');
  expect(await page.evaluate(() => (window as any).__ons)).toEqual(whites.map((k) => k.midi));
  expect((await geo()).left).toBe(0);
  await expect(strip.locator('.km-k.on')).toHaveCount(0, { timeout: 8000 });
  // a keyboard plugged into the phone: its first key brings the letters back (on the octave in view)
  const letterA = page.locator('.key .lbl', { hasText: /^A$/ });
  await expect(letterA).toBeHidden();
  await page.keyboard.press('KeyA');
  await expect(letterA).toBeVisible();
});

test('3D on a phone held upright: the cello and the upright fill the stage’s height, the grand is whole, all clear of the file player; a wide stage keeps its own views', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
  const seen = () =>
    page.evaluate(() => {
      const s = (window as any).__stage3d;
      const cv = s.el.getBoundingClientRect();
      return { box: s.box() as { x0: number; y0: number; x1: number; y1: number } | null, w: cv.width, h: cv.height, over: document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom - cv.top, home: s.home as { target: number[]; dist: number; yaw: number; pitch: number } };
    });
  const show = async (name: 'grand' | 'upright' | 'cello', yaw: number) => {
    if (name === 'cello') await page.evaluate(() => (window as any).__piano.setInstrument('cello'));
    else await page.locator('.presets button', { hasText: name }).click();
    // (its own view: the bearing is that instrument's)
    await expect.poll(async () => Math.abs((await seen()).home.yaw - yaw) < 0.2 && (await seen()).box !== null, { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(250);
    return seen();
  };
  if (info.project.name !== 'phone') {
    // a wide stage: the scenes' own views, which crop like a photograph (the lens scales their distances)
    const lens = Math.tan(0.3) / Math.tan((12 * Math.PI) / 180);
    const g = await show('grand', 0.74);
    expect(g.home.dist).toBeCloseTo(3.8 * lens, 3);
    expect(g.home.target).toEqual([-0.12, 0.58, 1.0]);
    const c = await show('cello', 0.62);
    expect(c.home.dist).toBeCloseTo(2.25 * lens, 3);
    expect(errors).toEqual([]);
    return;
  }
  const whole = (v: Awaited<ReturnType<typeof seen>>, name: string) => {
    const b = v.box!;
    expect(b.x0, `${name}: left`).toBeGreaterThanOrEqual(0);
    expect(b.x1, `${name}: right`).toBeLessThanOrEqual(v.w);
    expect(b.y1, `${name}: bottom`).toBeLessThanOrEqual(v.h);
    // under the file player's row, not behind it
    expect(b.y0, `${name}: top`).toBeGreaterThanOrEqual(v.over);
    return { fill: (b.y1 - b.y0) / v.h, free: (b.y1 - b.y0) / (v.h - v.over), width: (b.x1 - b.x0) / v.w };
  };
  // the grand: all of it, the lid's tip and the casters too (it is taller than the stage is wide)
  const grand = whole(await show('grand', 0.74), 'grand');
  expect(grand.fill).toBeGreaterThan(0.8);
  // the upright, turned further round its treble end: as tall as the stage that is free, edge to edge
  const upright = whole(await show('upright', 0.8), 'upright');
  expect(upright.free).toBeGreaterThan(0.9);
  expect(upright.width).toBeGreaterThan(0.9);
  // the cello: scroll to endpin, the free height of the stage
  const cello = whole(await show('cello', 0.62), 'cello');
  expect(cello.free).toBeGreaterThan(0.93);
  expect(cello.fill).toBeGreaterThan(0.8);
  test.info().annotations.push({ type: 'portrait framing', description: JSON.stringify({ grand, upright, cello }) });
  expect(errors).toEqual([]);
});

test('the picker: the ring on the selected instrument is whole, on every instrument, upright and sideways', async ({ page }, info) => {
  const vp = page.viewportSize()!;
  // this project's viewport (desktop, or a phone held upright) and a phone held sideways
  for (const size of [vp, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.waitForTimeout(400);
    const picks = page.locator('.instruments .pick');
    await expect(picks).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const pick = picks.nth(i);
      await pick.click();
      await expect(pick).toHaveAttribute('aria-pressed', 'true');
      // the ring is the keyboard-focus ring: it shows once the keyboard has been used (playing does that)
      await page.keyboard.press('Shift');
      await pick.focus();
      const r = await pick.evaluate((el) => {
        const cs = getComputedStyle(el);
        const grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
        const b = el.getBoundingClientRect();
        const ring = { l: b.left - grow, t: b.top - grow, r: b.right + grow, b: b.bottom + grow };
        // what can cut it: the viewport and every ancestor that clips its overflow
        let clip = { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight };
        const clippers: string[] = [];
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
          const q = p.getBoundingClientRect();
          clippers.push(p.className || p.tagName);
          clip = { l: Math.max(clip.l, q.left), t: Math.max(clip.t, q.top), r: Math.min(clip.r, q.right), b: Math.min(clip.b, q.bottom) };
        }
        // and nothing else lies over its top edge (the header above the stage)
        const over = document.elementFromPoint((b.left + b.right) / 2, Math.max(0, ring.t + 0.5));
        return { ring, clip, clippers, visible: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), own: over === el || el.contains(over) || !!over?.contains(el) };
      });
      const where = `${size.width}×${size.height} #${i}`;
      expect(r.visible, `${where}: ring shows`).toBe(true);
      expect(r.style, where).toBe('solid');
      expect(r.width, where).toBeGreaterThanOrEqual(1);
      expect(r.clippers.length, `${where}: the stage clips`).toBeGreaterThan(0);
      expect(r.ring.t, `${where}: top edge`).toBeGreaterThanOrEqual(r.clip.t);
      expect(r.ring.l, `${where}: left edge`).toBeGreaterThanOrEqual(r.clip.l);
      expect(r.ring.r, `${where}: right edge`).toBeLessThanOrEqual(r.clip.r);
      expect(r.ring.b, `${where}: bottom edge`).toBeLessThanOrEqual(r.clip.b);
      expect(r.own, `${where}: nothing over the ring's top edge`).toBe(true);
      if (i === 2) await page.screenshot({ path: info.outputPath(`picker-${size.width}x${size.height}-viola.png`), clip: { x: 0, y: 0, width: Math.min(size.width, 420), height: 110 } });
    }
  }
  await page.setViewportSize(vp);
});

test('all six instruments: selectable in the UI and rendered through the worklet at pitch', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  for (const [label, id] of [['Violin', 'violin'], ['Viola', 'viola'], ['Cello', 'cello'], ['Flute', 'flute'], ['Trumpet', 'trumpet'], ['Piano', 'piano']] as const) {
    await page.locator('.instruments').getByRole('button', { name: label }).click();
    await page.waitForFunction((x) => (window as any).__piano.piano?.instrument === x, id, { timeout: 15_000 });
    await expect(page.locator('.pick[aria-pressed="true"]')).toHaveAttribute('aria-label', label);
    await expect(page.locator('.knobs .knob').first()).toBeVisible({ visible: info.project.name !== 'phone' });
  }
  for (const [id, midi] of [['violin', 69], ['viola', 62], ['cello', 48], ['flute', 74], ['trumpet', 65]] as const) {
    const out = await page.evaluate(async ([inst, m]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: inst, sampleRate: 48000, duration: 1.6, params: { room: 0, vibrato: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 90 } }] });
      const x = buf.getChannelData(0);
      // autocorrelation pitch over 0.9–1.4 s
      const fs = 48000, f = 440 * 2 ** ((m - 69) / 12), s0 = Math.round(0.9 * fs), W = Math.round(0.4 * fs);
      const ac = (lag: number) => { let s = 0; for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag]; return s; };
      let best = -Infinity, bl = 0;
      for (let lag = Math.floor(fs / (f * 1.05)); lag <= Math.ceil(fs / (f * 0.95)); lag++) { const v = ac(lag); if (v > best) { best = v; bl = lag; } }
      const a = ac(bl - 1), b = ac(bl), c = ac(bl + 1);
      const fm = fs / (bl + (0.5 * (a - c)) / (a - 2 * b + c));
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
      return { cents: 1200 * Math.log2(fm / f), peak };
    }, [id, midi] as const);
    expect(out.peak, id).toBeGreaterThan(0.02);
    expect(out.peak, id).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), id).toBeLessThan(6);
  }
  expect(errors).toEqual([]);
});

test('a bowed string on the stage: the scope shows stick–slip and the bow', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the scope is hidden on phones; the stage still draws the bow');
  await page.goto('/#/inside');
  await startAudio(page);
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('violin');
    (window as any).__piano.noteOn(69, 90, 'keys');
  });
  await page.waitForTimeout(1200);
  // the scope caption names the bowed string, the bow's direction and the contact point along the hair
  const cap = page.locator('.scope-cap');
  await expect(cap).toContainText('A string');
  await expect(cap).toContainText(/down-bow|up-bow|bow change/);
  await expect(cap).toContainText('% from the frog');
  await page.evaluate(async () => (window as any).__piano.setInstrument('piano'));
});

test('start-up: a first click on a key sounds within 1.5 s; switching to the piano is quick', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('.status')).toContainText('tap a key to start');
  // let the page-load prefetch (designs, worklet) settle, as it would while a visitor looks
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window as any;
    w.__t = { click: 0, sound: 0 };
    const buf = new Float32Array(2048);
    window.addEventListener('pointerdown', () => (w.__t.click ||= performance.now()), { capture: true });
    const tick = () => {
      const a = w.__piano;
      if (w.__t.click && a?.analyser) {
        a.analyser.getFloatTimeDomainData(buf);
        let m = 0;
        for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
        if (m > 1e-3) w.__t.sound = performance.now();
      }
      if (!w.__t.sound) setTimeout(tick, 4);
    };
    tick();
  });
  const key = page.locator('.key[data-midi="60"]');
  await key.scrollIntoViewIfNeeded();
  const box = (await key.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85);
  await page.waitForFunction(() => (window as any).__t.sound > 0, null, { timeout: 10_000 });
  const t = await page.evaluate(() => {
    const w = window as any;
    return { firstSoundMs: w.__t.sound - w.__t.click, initMs: w.__piano.piano.initMs, startMs: w.__piano.startMs };
  });
  test.info().annotations.push({ type: 'startup', description: JSON.stringify(t) });
  expect(t.firstSoundMs).toBeLessThan(1500); // ~0.2 s on an M-series Mac; was ~0.5 s (7.8 s on a slow JS engine)
  expect(t.initMs).toBeLessThan(150); // worklet constructor: ~10 ms with shipped designs; was ~430 ms
  await expect(page.locator('.status')).toContainText('sound on');
  const switchMs = await page.evaluate(async () => {
    const a = (window as any).__piano;
    await a.setInstrument('cello');
    const t0 = performance.now();
    await a.setInstrument('piano');
    return performance.now() - t0;
  });
  expect(switchMs).toBeLessThan(400); // was ~1 s
  expect(errors).toEqual([]);
});

test('on-screen pedal: holding it sustains, releasing lets go', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  const pedal = page.getByRole('button', { name: /Sustain pedal/ });
  const box = (await pedal.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => (window as any).__piano.lastStats?.sustain > 0.99, null, { timeout: 5000 });
  await expect(pedal).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__piano.lastStats?.sustain < 0.01, null, { timeout: 5000 });
});

// ---------------------------------------------------------------- start-up never hangs silently
const forceRate = (rate: number) => () => {
  const AC = window.AudioContext;
  // a device the browser cannot (or will not) resample from: every context runs at `rate`
  (window as any).AudioContext = class extends AC {
    constructor(o: AudioContextOptions = {}) {
      super({ ...o, sampleRate: (window as any).__rate });
    }
  };
  (window as any).__rate = 0;
};
async function clickKey(page: Page) {
  const key = page.locator('.key[data-midi="60"]');
  await key.scrollIntoViewIfNeeded();
  const box = (await key.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85);
}

test('start-up at odd sample rates (96 kHz interface, 22.05 kHz headset) still reaches sound', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'desktop covers the start-up paths');
  for (const rate of [96000, 22050]) {
    await page.addInitScript(forceRate(rate));
    await page.addInitScript((r) => ((window as any).__rate = r), rate);
    await page.goto('/');
    await clickKey(page);
    await page.waitForFunction(() => (window as any).__piano?.status === 'running', null, { timeout: 8000 });
    expect(await page.evaluate(() => (window as any).__piano.ctx.sampleRate)).toBe(rate);
  }
});

test('start-up: a stalled or refused designs file falls back; a crashing engine says why and retries', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'desktop covers the start-up paths');
  // designs never answer: the page designs them itself after a 2.5 s timeout
  await page.route('**/designs/**', () => undefined);
  await page.goto('/');
  await clickKey(page);
  await page.waitForFunction(() => (window as any).__piano?.status === 'running', null, { timeout: 8000 });
  await page.unroute('**/designs/**');
  // designs refused (an expired login on a protected deployment answers 401)
  const p2 = await page.context().newPage();
  await p2.route('**/designs/**', (r) => r.fulfill({ status: 401, body: 'Unauthorized' }));
  await p2.goto('/');
  await clickKey(p2);
  await p2.waitForFunction(() => (window as any).__piano?.status === 'running', null, { timeout: 8000 });
  // the worklet's constructor throws: the lamp shows the reason and offers a retry, no silent hang
  const p3 = await page.context().newPage();
  await p3.addInitScript(() => {
    // worklet module requests are not routable, so swap the module itself
    const body = "registerProcessor('piano-model', class extends AudioWorkletProcessor { constructor() { super(); throw new Error('test crash'); } process() { return true; } });";
    const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
    const orig = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function () {
      return orig.call(this, url);
    };
  });
  await p3.goto('/');
  await clickKey(p3);
  await expect(p3.locator('.lamp-text')).toContainText('tap to retry', { timeout: 6000 });
  await expect(p3.locator('.lamp-text')).toContainText('crashed');
  // no retry on a timer (outside a gesture); a tap retries, on the same AudioContext
  await p3.waitForTimeout(800);
  expect(await p3.evaluate(() => (window as any).__diag.lines.filter((l: any) => l.step.startsWith('start (attempt')).length)).toBe(1);
  await p3.evaluate(() => ((window as any).__ctx0 = (window as any).__piano.ctx));
  await clickKey(p3);
  await p3.waitForFunction(() => (window as any).__diag.lines.some((l: any) => l.step === 'AudioContext reused'));
  expect(await p3.evaluate(() => (window as any).__piano.ctx === (window as any).__ctx0)).toBe(true);
});

test('octave control: buttons and Z/X/−/= shift the keys, within each instrument’s range', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  const label = page.locator('.oct-label');
  await expect(label).toHaveText('C4');
  await page.keyboard.press('x');
  await expect(label).toHaveText('C5');
  await page.keyboard.press('Minus');
  await expect(label).toHaveText('C4');
  await page.getByRole('button', { name: 'Octave down' }).click();
  await expect(label).toHaveText('C3');
  // the computer keys now play an octave lower
  await page.keyboard.down('KeyA');
  await expect(page.locator('.key[data-midi="48"]')).toHaveClass(/down/);
  await page.keyboard.up('KeyA');
  // violin: the rows still start on a C (A = C4, J = B4, U = A#4); G3, its lowest string,
  // is reached one octave down (A = C3 … G = G3), and it stops there
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  await expect(label).toHaveText('C4');
  await page.keyboard.down('KeyJ');
  await expect(page.locator('.key[data-midi="71"]')).toHaveClass(/down/);
  await page.keyboard.up('KeyJ');
  await page.keyboard.down('KeyU');
  await expect(page.locator('.key[data-midi="70"]')).toHaveClass(/down/);
  await page.keyboard.up('KeyU');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Octave down' }).click();
  await expect(label).toHaveText('C3');
  await page.getByRole('button', { name: 'Octave up' }).click();
  await expect(label).toHaveText('C4');
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
});

test('drop a .mid file: it plays on the current instrument, pauses, stops; a new file replaces it', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const drop = async (bytes: number[], name: string) =>
    page.evaluate(
      ([b, n]) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(b as number[])], n as string, { type: 'audio/midi' }));
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
      },
      [bytes, name] as const,
    );
  // a C major arpeggio, 8th notes at 120 bpm, sustained, then a held chord (5 s)
  const notes: [number, ...number[]][] = [[0, 0xb0, 64, 127]];
  for (let i = 0; i < 16; i++) notes.push([0, 0x90, [60, 64, 67, 72][i % 4], 80], [240, 0x80, [60, 64, 67, 72][i % 4], 0]);
  notes.push([0, 0x90, 48, 90], [3840, 0x80, 48, 0], [0, 0xb0, 64, 0]);
  await drop(Array.from(smf(480, [notes])), 'arpeggio.mid');
  const player = page.locator('.player');
  await expect(player).toBeVisible();
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.locator('.key.down')).not.toHaveCount(0, { timeout: 2000 });
  await page.waitForTimeout(600);
  expect(Number(await page.locator('.pl-bar').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  // pause: everything lifts, nothing more is scheduled
  await player.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('.key.down')).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator('.key.down')).toHaveCount(0);
  // play again from where it was, then stop
  await player.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('.key.down')).not.toHaveCount(0, { timeout: 2000 });
  await player.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.pl-bar')).toHaveAttribute('aria-valuenow', '0');
  // dropping another file replaces the first and plays it (a single long D3)
  await drop(Array.from(smf(480, [[[0, 0x90, 50, 90], [1920, 0x80, 50, 0]]])), 'd.mid');
  await expect(page.locator('.key[data-midi="50"]')).toHaveClass(/down/, { timeout: 2000 });
  await expect(page.locator('.key[data-midi="60"]')).not.toHaveClass(/down/);
  await player.getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('the MIDI file player sits at the top middle of the stage, over nothing it would hide, in 2D and 3D', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'd.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(smf(480, [[[0, 0x90, 50, 70], [7680, 0x80, 50, 0]]])));
  const player = page.locator('.player');
  await expect(player).toBeVisible();
  // the position hairline has no tooltip (it still scrubs: it is a slider)
  expect(await page.locator('.pl-bar').getAttribute('data-tip')).toBeNull();
  expect(await page.locator('.pl-bar').getAttribute('title')).toBeNull();
  const check = async (mode: string) => {
    const p = (await player.boundingBox())!;
    const stage = (await page.locator('.stage').boundingBox())!;
    const band = (await page.locator('.stage-top').boundingBox())!;
    // centred on the stage, just under its top band
    expect(Math.abs(p.x + p.width / 2 - (stage.x + stage.width / 2)), mode).toBeLessThan(3);
    expect(p.y, mode).toBeGreaterThanOrEqual(band.y + band.height);
    expect(p.y, mode).toBeLessThan(band.y + band.height + 30);
    const hit = (b: { x: number; y: number; width: number; height: number }) => p.x < b.x + b.width && b.x < p.x + p.width && p.y < b.y + b.height && b.y < p.y + p.height;
    for (const sel of ['.picker', '.readout', '.spec-wrap', '.scope', 'header nav', '.zoom-back']) {
      for (const b of await page.locator(sel).all()) {
        const r = await b.boundingBox();
        if (r && (await b.isVisible())) expect(hit(r), `${mode}: covers ${sel}`).toBe(false);
      }
    }
    // on top: its middle is the player's own
    const top = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.player'), [p.x + p.width / 2, p.y + p.height / 2]);
    expect(top, mode).toBe(true);
  };
  await check('2D');
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await check('3D');
  await player.getByRole('button', { name: 'Stop' }).click();
});

test('the app plays itself: at rest the overlay is play and open; play plays the instrument’s own piece, the next one’s when the instrument changes; stop comes back to rest', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const player = page.locator('.player');
  // at rest, before any sound: two icons, no words, no hairline
  await expect(player).toBeVisible();
  await expect(player).toHaveClass(/idle/);
  await expect(page.locator('.pl-play')).toBeVisible();
  await expect(page.locator('.pl-open')).toBeVisible();
  for (const sel of ['.pl-stop', '.pl-bar', '.pl-route', '.pl-lines']) await expect(page.locator(sel), sel).toBeHidden();
  expect((await player.innerText()).trim()).toBe('');
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Chopin/);
  // where the player sits: the top middle, just under the stage's top band, clear of the picker
  const p = (await player.boundingBox())!;
  const stage = (await page.locator('.stage').boundingBox())!;
  const band = (await page.locator('.stage-top').boundingBox())!;
  expect(Math.abs(p.x + p.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(3);
  expect(p.y).toBeGreaterThanOrEqual(band.y + band.height);
  const pk = (await page.locator('.picker').boundingBox())!;
  expect(p.x < pk.x + pk.width && pk.x < p.x + p.width && p.y < pk.y + pk.height && pk.y < p.y + p.height).toBe(false);
  // one tap: the sound starts and the piano plays its piece
  await page.locator('.pl-play').click();
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  await expect(player).not.toHaveClass(/idle/);
  await expect(page.locator('.key.down')).not.toHaveCount(0, { timeout: 4000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('piano');
  // (an instrument's own piece is a solo: no routing)
  await expect(page.locator('.pl-route')).toBeHidden();
  // another instrument while it plays: that instrument's own piece, on it
  await page.locator('.pick[aria-label="Cello"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__player.demo?.instrument ?? null), { timeout: 10_000 }).toBe('cello');
  await expect.poll(() => page.evaluate(() => (window as any).__player.playing)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__piano.piano.instrument)).toBe('cello');
  await expect(page.locator('.key.down')).not.toHaveCount(0, { timeout: 4000 });
  // stop: back to rest, the play icon now the cello's piece
  await player.getByRole('button', { name: 'Stop' }).click();
  await expect(player).toHaveClass(/idle/);
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Bach, Cello Suite No\. 1, Prélude/);
  await expect(page.locator('.key.down')).toHaveCount(0);
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
  expect(errors).toEqual([]);
});

test('the folder icon opens the device’s file picker (a phone has nothing to drop); the file chosen plays', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('.player input[type="file"]')).toHaveAttribute('accept', /\.mid,\.midi/);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.pl-open').click()]);
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles({ name: 'd.mid', mimeType: 'audio/midi', buffer: Buffer.from(smf(480, [[[0, 0x90, 50, 90], [3840, 0x80, 50, 0]]])) });
  await expect(page.locator('.key[data-midi="50"]')).toHaveClass(/down/, { timeout: 15_000 });
  await expect(page.locator('.player')).not.toHaveClass(/idle/);
  // a file is not an instrument's own piece: stopped, it stays, rewound
  expect(await page.evaluate(() => (window as any).__player.demo)).toBeNull();
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.pl-bar')).toBeVisible();
  await expect(page.locator('.pl-bar')).toHaveAttribute('aria-valuenow', '0');
  expect(errors).toEqual([]);
});

test('?debug shows the start-up log, step by step, ending in ready', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'desktop covers the diagnostics');
  await page.goto('/?debug');
  await expect(page.locator('.diag pre')).toContainText('environment');
  await clickKey(page);
  const log = page.locator('.diag pre');
  for (const step of ['start (attempt 1)', 'AudioContext created', 'worklet module: loaded', 'worklet node: created', 'worklet: ready', 'first stats']) await expect(log).toContainText(step, { timeout: 8000 });
  // without ?debug nothing is shown
  await page.goto('/');
  await expect(page.locator('.diag')).toHaveCount(0);
});

test('piano presets on the stage: grand and upright only (honky-tonk and prepared are hidden)', async ({ page }) => {
  await page.goto('/');
  const presets = page.locator('.presets button');
  await expect(presets).toHaveText(['grand', 'upright']);
  await startAudio(page);
  await presets.filter({ hasText: 'upright' }).click();
  await page.waitForFunction(() => (window as any).__piano.piano?.preset === 'upright', null, { timeout: 10_000 });
  await expect(presets.filter({ hasText: 'upright' })).toHaveAttribute('aria-pressed', 'true');
  await presets.filter({ hasText: 'grand' }).click();
  await page.waitForFunction(() => (window as any).__piano.piano?.preset === 'grand', null, { timeout: 10_000 });
});

test('piano stage: several held notes all vibrate at once (one shape per sounding string)', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  const n = await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.sustain(1);
    for (const m of [48, 55, 60, 64, 67]) a.noteOn(m, 96, 'keys');
    let best = 0;
    const off = a.piano.onVisual((v: any) => {
      const ps = v.pianoShapes;
      if (!ps) return;
      const seen = new Set<number>();
      for (let j = 0; j < ps.midi.length; j++) {
        if (ps.light[j]) continue;
        let mx = 0;
        for (let i = 0; i < ps.points; i++) mx = Math.max(mx, Math.abs(ps.shapes[j * ps.points + i]));
        if (mx > 0) seen.add(ps.midi[j]);
      }
      best = Math.max(best, [48, 55, 60, 64, 67].filter((m) => seen.has(m)).length);
    });
    await new Promise((r) => setTimeout(r, 600));
    off();
    return best;
  });
  expect(n).toBe(5);
});

test('room and lid are dragged on the stage (and work from the keyboard)', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'dragging is checked on desktop');
  await page.goto('/');
  await startAudio(page);
  await page.waitForTimeout(300);
  const p = (k: string) => page.evaluate((key) => (window as any).__piano.piano.params[key], k);
  const room0 = await p('room');
  const grip = page.locator('.grip-room');
  const b = (await grip.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(await p('room')).toBeGreaterThan(room0 + 0.05);
  // the lid: dragging its free edge towards the curved side closes it
  const lid = page.locator('.grip-lid');
  const lb = (await lid.boundingBox())!;
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + 500, lb.y + lb.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await p('lid')).toBeLessThan(0.8);
  await lid.focus();
  const before = await p('lid');
  await page.keyboard.press('ArrowUp');
  expect(await p('lid')).toBeGreaterThan(before);
});

test('keys light only the notes the engine really sounds: flute, trumpet, violin, from every input', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'computer keys and MIDI are desktop inputs');
  await page.addInitScript(() => {
    const inputs = new Map<string, any>();
    const access: any = { inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false };
    (navigator as any).requestMIDIAccess = async () => access;
    (window as any).__midi = {
      plug() {
        const input = { id: 'fake', name: 'Test Keys', state: 'connected', onmidimessage: null as any };
        inputs.set('fake', input);
        access.onstatechange?.({ port: input });
      },
      send(bytes: number[]) {
        inputs.get('fake').onmidimessage?.({ data: new Uint8Array(bytes) });
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => (window as any).__midi.plug());
  await startAudio(page);
  const key = (m: number) => page.locator(`.key[data-midi="${m}"]`);
  const lit = async (on: number[], ghost: number[]) => {
    for (const m of on) await expect(key(m), `m${m} sounding`).toHaveClass(/sounding/);
    for (const m of ghost) {
      await expect(key(m), `m${m} held`).toHaveClass(/down/);
      await expect(key(m), `m${m} not sounding`).not.toHaveClass(/sounding/);
    }
  };
  // flute, computer keys (A = C5, D = E5): the last held key sounds; releasing it returns
  await page.evaluate(() => (window as any).__piano.setInstrument('flute'));
  await page.keyboard.down('KeyA');
  await lit([72], []);
  await page.keyboard.down('KeyD');
  await lit([76], [72]);
  await page.keyboard.up('KeyD');
  await lit([72], []);
  await page.keyboard.up('KeyA');
  await expect(key(72)).not.toHaveClass(/sounding/);
  // trumpet, MIDI
  await page.evaluate(() => (window as any).__piano.setInstrument('trumpet'));
  await page.evaluate(() => (window as any).__midi.send([0x90, 60, 90]));
  await page.evaluate(() => (window as any).__midi.send([0x90, 64, 90]));
  await lit([64], [60]);
  await page.evaluate(() => (window as any).__midi.send([0x80, 64, 0]));
  await lit([60], []);
  await page.evaluate(() => (window as any).__midi.send([0x80, 60, 0]));
  await expect(key(60)).not.toHaveClass(/sounding/);
  // violin: G3 and A3 can only be played on the G string. G3 held on screen (mouse), A3 from
  // MIDI takes the string; releasing A3 gives it back
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  const g3 = key(55);
  await g3.scrollIntoViewIfNeeded();
  const b = (await g3.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.9);
  await page.mouse.down();
  await lit([55], []);
  await page.evaluate(() => (window as any).__midi.send([0x90, 57, 90]));
  await lit([57], [55]);
  await page.evaluate(() => (window as any).__midi.send([0x80, 57, 0]));
  await lit([55], []);
  await page.mouse.up();
  await expect(key(55)).not.toHaveClass(/sounding/);
  // five notes on four strings: the fifth (G5, playable on all four) takes the string that has
  // been playing longest (G3's); releasing it gives that string back
  await page.evaluate(async () => {
    for (const m of [55, 62, 69, 76, 79]) {
      (window as any).__piano.noteOn(m, 90, 'keys');
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await lit([62, 69, 76, 79], [55]);
  await expect(page.locator('.key.sounding')).toHaveCount(4);
  await page.evaluate(() => (window as any).__piano.noteOff(79, 'keys'));
  await lit([55, 62, 69, 76], []);
});

test('icon-only stage controls say what they are: a short tooltip and an accessible name', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  await page.waitForTimeout(300);
  const tip = page.locator('.tip');
  // no tooltip and no new words until asked
  await expect(tip).toBeHidden();
  const room = page.locator('.grip-room');
  const lid = page.locator('.grip-lid');
  await expect(room).toHaveAttribute('aria-label', /Reverb/);
  await expect(lid).toHaveAttribute('aria-label', /lid/i);
  await expect(room).toHaveAttribute('aria-valuetext', /^reverb · \d\.\d s$/);
  await expect(lid).toHaveAttribute('aria-valuetext', /^lid · (closed|\d+ % open)$/);
  if (info.project.name === 'phone') {
    // touch has no hover: the tooltip shows while a grip is held
    const b = (await room.boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect(tip).toHaveText(/^reverb · \d\.\d s$/);
    return;
  }
  await lid.hover();
  await expect(tip).toHaveText(/^lid · (closed|\d+ % open)$/);
  // keyboard focus shows it at once and it follows the value
  await room.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(tip).toHaveText(/^reverb · \d\.\d s$/);
  const t0 = await tip.textContent();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(tip).not.toHaveText(t0!);
  // the other icon-only controls
  for (const [sel, text] of [['.oct-btn >> nth=0', 'octave down · Z'], ['.oct-btn >> nth=1', 'octave up · X'], ['.knob-toggle', 'knobs'], ['.ens-toggle', 'ensemble · tap instruments to add them'], ['.score-btn', 'pieces'], ['.vec-toggle', 'vector lines'], ['.pl-route', 'routing'], ['.pl-open', 'open a MIDI file'], ['.pl-play', 'play · Chopin, Prelude in C minor, Op. 28 No. 20']] as const) {
    const el = page.locator(sel);
    if (!(await el.isVisible())) continue;
    await el.hover();
    await expect(tip, sel).toHaveText(text);
  }
});

test('click a note’s strings: that key’s action opens, plays from its own telemetry, and closes', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  await page.waitForTimeout(400);
  const openAt = async (midi: number, frac: number) => {
    const k = page.locator(`.key[data-midi="${midi}"]`);
    await k.scrollIntoViewIfNeeded();
    const kb = (await k.boundingBox())!;
    const cv = (await page.locator('.stage-cv').boundingBox())!;
    if (info.project.name === 'phone') await page.touchscreen.tap(kb.x + kb.width / 2, cv.y + cv.height * frac);
    else await page.mouse.click(kb.x + kb.width / 2, cv.y + cv.height * frac);
  };
  await openAt(48, 0.8);
  const panel = page.locator('.av-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-label', /^C3: the grand action$/);
  // the engine streams this key's action: its damper, strike record and string
  const watch = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const p = (window as any).__piano.piano;
        const off = p.onVisual((v: any) => {
          if (v.watch?.strike) {
            off();
            resolve({ midi: v.watch.midi, damper: v.watch.damper, vH: v.watch.strike.vHammer, n: v.watch.strike.force.length, shape: v.watch.shape.length });
          }
        });
        (window as any).__piano.noteOn(48, 96, 'keys');
        setTimeout(() => (window as any).__piano.noteOff(48, 'keys'), 400);
      }),
  );
  expect(watch.midi).toBe(48);
  expect(watch.vH).toBeGreaterThan(0.5);
  expect(watch.n).toBeGreaterThan(10);
  expect(watch.shape).toBe(64);
  // the strike is replayed in slow motion
  await expect(page.locator('.av-speed')).toHaveText(/^×1\/\d+$/);
  // pressing the drawn key plays the note
  const cvb = (await page.locator('.av-cv').boundingBox())!;
  if (info.project.name !== 'phone') {
    await page.mouse.move(cvb.x + cvb.width * 0.2, cvb.y + cvb.height * 0.8);
    await page.mouse.down();
    await expect(page.locator('.key[data-midi="48"]')).toHaveClass(/down/);
    await page.mouse.up();
    await page.keyboard.press('Escape');
  } else {
    await page.locator('.av-close').tap();
  }
  await expect(panel).toHaveCount(0);
  // the upright has its own action
  await page.evaluate(() => (window as any).__piano.setPreset('upright'));
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await page.waitForTimeout(300);
  await openAt(48, 0.55);
  await expect(panel).toHaveAttribute('aria-label', /upright action/);
  await page.locator('.av-close').click();
  await expect(panel).toHaveCount(0);
});

test('the action close-up follows the playing: whole on its panel, no old strike on opening, the damper with the key, held and tapped, another key and the other piano', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.waitForTimeout(400);
  const phone = info.project.name === 'phone';
  const act = <T,>(f: string) => page.evaluate((src) => new Function('a', `return ${src}`)((window as any).__action), f) as Promise<T>;
  const note = (on: boolean, midi: number) => page.evaluate(([o, m]) => (o ? (window as any).__piano.noteOn(m, 96, 'keys') : (window as any).__piano.noteOff(m, 'keys')), [on, midi] as const);
  /** every frame's state until `until` holds (or `ms` pass) */
  const record = (until: string, ms: number) =>
    page.evaluate(
      ([src, lim]) =>
        new Promise<any[]>((resolve) => {
          const done = new Function('s', `return ${src}`);
          const out: any[] = [];
          const t0 = performance.now();
          const tick = () => {
            const s = { ...(window as any).__action.state };
            out.push(s);
            if (done(s) || performance.now() - t0 > (lim as number)) resolve(out);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      [until, ms] as const,
    );
  const whole = async (what: string) => {
    await page.waitForFunction(() => (window as any).__action?.box);
    const [b, cv] = await Promise.all([act<{ x0: number; y0: number; x1: number; y1: number }>('a.box'), page.locator('.av-cv').boundingBox()]);
    // the section from the key's front to its far end, keybed to top, inside the panel (it used to
    // start behind the key's front on a phone)
    expect(b.x0, `${what}: left`).toBeGreaterThanOrEqual(0);
    expect(b.x1, `${what}: right`).toBeLessThanOrEqual(cv!.width + 0.5);
    expect(b.y0, `${what}: top`).toBeGreaterThanOrEqual(0);
    expect(b.y1, `${what}: bottom`).toBeLessThanOrEqual(cv!.height + 0.5);
    const vp = page.viewportSize()!;
    expect(cv!.x, `${what}: panel`).toBeGreaterThanOrEqual(0);
    expect(cv!.x + cv!.width, `${what}: panel`).toBeLessThanOrEqual(vp.width + 0.5);
    // drawn: the key's ivory at its front, the far end's wood
    const lit = await page.locator('.av-cv').evaluate((c) => {
      const cv = c as HTMLCanvasElement;
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n / (cv.width * cv.height);
    });
    expect(lit, `${what}: drawn`).toBeGreaterThan(0.03);
  };
  // the key is played and let go before its close-up is opened
  await note(true, 48);
  await page.waitForTimeout(200);
  await note(false, 48);
  await page.waitForTimeout(500);
  const k = page.locator('.key[data-midi="48"]');
  await k.scrollIntoViewIfNeeded();
  const kb = (await k.boundingBox())!;
  const cv = (await page.locator('.stage-cv').boundingBox())!;
  if (phone) await page.touchscreen.tap(kb.x + kb.width / 2, cv.y + cv.height * 0.8);
  else await page.mouse.click(kb.x + kb.width / 2, cv.y + cv.height * 0.8);
  const panel = page.locator('.av-panel');
  await expect(panel).toHaveAttribute('aria-label', 'C3: the grand action');
  await whole('grand');
  // that old strike is not replayed: the action is at rest (it used to fly at once, nothing played)
  const idle = await record('false', 700);
  expect(idle.length).toBeGreaterThan(10);
  expect(idle.filter((s) => !(s.slow === 0 && s.phase === 'rest' && s.y === 0 && s.keyPos === 0 && s.damperOn > 0.99)).slice(0, 3)).toEqual([]);
  await expect(page.locator('.av-speed')).toHaveText('');
  // the upright, held: its damper stays on the strings until the drawn key lifts it (it used to jump
  // off as the replay began), is off at the strike, and the hammer is caught in check
  await page.evaluate(() => (window as any).__piano.setPreset('upright'));
  await expect(panel).toHaveAttribute('aria-label', 'C3: the upright action');
  expect(await act<string>('a.kind')).toBe('upright');
  await whole('upright');
  await page.waitForTimeout(300);
  await note(true, 48);
  const held = await record("s.phase === 'checked' && s.slow === 0", 8000);
  const drive = held.filter((s) => s.phase === 'drive');
  expect(drive.length).toBeGreaterThan(5);
  expect(drive[0].damperOn, 'the damper as the key starts down').toBeGreaterThan(0.99);
  expect(drive.every((s) => !s.escaped)).toBe(true);
  expect(held.every((s) => s.phase !== 'rest' || s.damperOn > 0.99), 'the damper waits for the key').toBe(true);
  const order = ['drive', 'free', 'contact', 'fall', 'checked'];
  const seq = held.filter((s) => s.slow > 0).map((s) => order.indexOf(s.phase));
  expect(seq.every((v, i) => i === 0 || v >= seq[i - 1]), 'drive, let-off, strike, fall, check: in that order').toBe(true);
  expect(held.filter((s) => s.phase === 'free' || s.phase === 'contact').every((s) => s.damperOn < 0.01 && s.keyPos === 1 && s.escaped)).toBe(true);
  const last = held[held.length - 1];
  expect([last.phase, last.keyPos > 0.99, last.damperOn < 0.01, last.y > 20]).toEqual(['checked', true, true, true]);
  await expect(page.locator('.av-speed')).toHaveText('');
  // let go: everything returns
  await note(false, 48);
  await expect.poll(() => act<boolean>('a.state.phase === "rest" && a.state.y < 0.2 && a.state.keyPos < 0.02 && a.state.damperOn > 0.99 && !a.state.escaped')).toBe(true);
  // another key played by hand: the close-up goes to it and replays its strike; a tap falls back to
  // rest, never caught in check, the damper off through the strike though the key is long up
  await note(true, 55);
  await page.waitForTimeout(80);
  await note(false, 55);
  await expect(panel).toHaveAttribute('aria-label', 'G3: the upright action');
  await expect(page.locator('.av-name')).toHaveText('G3');
  expect(await act<number>('a.midi')).toBe(55);
  const tap = await record("s.phase === 'fall' && s.keyPos < 0.8", 8000);
  const flown = tap.filter((s) => s.phase === 'free' || s.phase === 'contact');
  expect(flown.length).toBeGreaterThan(0);
  expect(flown.every((s) => s.damperOn < 0.01 && s.keyPos === 1)).toBe(true);
  // (falling back, the key and the damper with it: the whole return is in apps/web/test/action-motion.test.ts)
  expect(tap.some((s) => s.phase === 'checked')).toBe(false);
  const end = tap[tap.length - 1];
  expect([end.phase, end.keyPos < 0.8, end.damperOn > 0]).toEqual(['fall', true, true]);
  // closed: nothing left behind
  await page.locator('.av-close').click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__action)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('a key’s close-up in 3D on a narrow stage: the action whole, key front to damper, under the file player; it outlives a change of piano', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a wide stage keeps the close-up’s own framing');
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
  const seen = () =>
    page.evaluate(() => {
      const s = (window as any).__stage3d;
      const cv = s.el.getBoundingClientRect();
      return { zoomed: s.zoomed as number | null, box: s.zoomBox() as { x0: number; y0: number; x1: number; y1: number } | null, w: cv.width, h: cv.height, over: document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom - cv.top };
    });
  const whole = async (name: string, key: number) => {
    await expect.poll(async () => (await seen()).zoomed, { timeout: 15_000 }).toBe(key);
    // (landed: the box holds still)
    let was = -1e9;
    await expect
      .poll(
        async () => {
          const b = (await seen()).box;
          const still = !!b && Math.abs(b.x0 - was) < 0.05;
          was = b ? b.x0 : -1e9;
          return still;
        },
        { timeout: 15_000, intervals: [300] },
      )
      .toBe(true);
    const v = await seen();
    const b = v.box!;
    // (it used to run out of both sides: the key's front off the one, the damper off the other)
    expect(b.x0, `${name} ${key}: left`).toBeGreaterThanOrEqual(-0.5);
    expect(b.x1, `${name} ${key}: right`).toBeLessThanOrEqual(v.w + 0.5);
    expect(b.y1, `${name} ${key}: bottom`).toBeLessThanOrEqual(v.h + 0.5);
    expect(b.y0, `${name} ${key}: top`).toBeGreaterThanOrEqual(v.over - 0.5);
    // and as large as that allows: it binds on one axis
    expect(Math.max((b.x1 - b.x0) / v.w, (b.y1 - b.y0) / (v.h - v.over)), `${name} ${key}: fills`).toBeGreaterThan(0.85);
  };
  await page.locator('.presets button', { hasText: 'grand' }).click();
  await page.waitForTimeout(600);
  for (const key of [60, 30]) {
    await page.evaluate((k) => (window as any).__stage3d.zoomTo(k), key);
    await whole('grand', key);
  }
  // the other piano under the close-up: the same key, that piano's action, framed again
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await whole('upright', 30);
  await page.evaluate(() => (window as any).__stage3d.zoomOut());
  await expect.poll(async () => (await seen()).zoomed).toBeNull();
});

test('3D stage: every instrument draws in WebGL2 from live frames; orbit and zoom; 2D without WebGL2', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  const btn = page.locator('.dim-toggle');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  const cv = page.locator('.stage-3d');
  await expect(cv).toBeVisible();
  await page.evaluate(() => ((window as any).__stage3d.probe = true));
  const stats = () => page.evaluate(() => ({ ...(window as any).__stage3d.stats }));
  for (const [inst, note] of [['piano', 60], ['violin', 72], ['viola', 60], ['cello', 50], ['flute', 74], ['trumpet', 67]] as const) {
    await page.evaluate(async ([i, m]) => {
      await (window as any).__piano.setInstrument(i);
      (window as any).__piano.noteOn(m, 96, 'keys');
    }, [inst, note] as const);
    await page.waitForTimeout(500);
    const s = await stats();
    expect(s.vertices, inst).toBeGreaterThan(200);
    // pixels actually drawn (not a blank canvas)
    const lit = (await stats()).lit;
    expect(lit, inst).toBeGreaterThan(0); // (a flute is a thin line on a 40×24 sample grid)
    await page.evaluate((m) => (window as any).__piano.noteOff(m, 'keys'), note);
  }
  // the upright too
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('piano');
    (window as any).__stage3d.probe = true;
    await (window as any).__piano.setPreset('upright');
  });
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await page.waitForTimeout(300);
  expect((await stats()).vertices).toBeGreaterThan(200);
  // budget: a frame's scene + draw stays small
  expect((await stats()).ms).toBeLessThan(info.project.name === 'phone' ? 16 : 12);
  // orbit: dragging changes the picture
  const b = (await cv.boundingBox())!;
  // a checksum of the drawn pixels, with the sound stopped so only the camera changes it
  await page.evaluate(() => (window as any).__piano.allNotesOff?.());
  await page.waitForTimeout(300);
  const snap = async () => (await stats()).sum;
  if (info.project.name !== 'phone') {
    const before = await snap();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 160, b.y + b.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
    expect(await snap()).not.toBe(before);
  }
  // a click (not a drag) on a note's strings in 3D flies to that key's action (no 2D panel); back out
  await page.evaluate(() => (window as any).__stage3d.resetView());
  await page.waitForTimeout(150);
  const at = await page.evaluate(() => (window as any).__stage3d.screenOf(60));
  expect(at, 'C4 strings on screen').not.toBeNull();
  const b3 = (await cv.boundingBox())!;
  if (info.project.name === 'phone') await page.touchscreen.tap(b3.x + at[0], b3.y + at[1]);
  else await page.mouse.click(b3.x + at[0], b3.y + at[1]);
  await expect.poll(() => page.evaluate(() => (window as any).__stage3d.zoomed)).toBe(60);
  await expect(page.locator('.av-panel')).toHaveCount(0);
  await page.locator('.zoom-back').click();
  await expect.poll(() => page.evaluate(() => (window as any).__stage3d.zoomed)).toBeNull();
  // back to 2D
  await btn.click();
  await expect(cv).toBeHidden();
});

test('the action close-up is the pianos’ alone: no string zoom on the bowed strings or the winds, in 2D or 3D', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  const panel = page.locator('.av-panel');
  const press = (x: number, y: number) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const choose = async (label: string, id: string) => {
    await page.locator('.instruments').getByRole('button', { name: label }).click();
    await page.waitForFunction((x) => (window as any).__piano.piano?.instrument === x, id, { timeout: 15_000 });
  };
  // the piano offers it; switching instrument closes it and leaves no zoom cursor behind
  await page.waitForTimeout(400);
  await page.locator('.key[data-midi="48"]').scrollIntoViewIfNeeded();
  const kb = (await page.locator('.key[data-midi="48"]').boundingBox())!;
  const cvb = (await page.locator('.stage-cv').boundingBox())!;
  if (!phone) {
    await page.mouse.move(kb.x + kb.width / 2, cvb.y + cvb.height * 0.8);
    await expect.poll(() => page.locator('.stage-cv').evaluate((e) => (e as HTMLElement).style.cursor)).toBe('zoom-in');
  }
  await press(kb.x + kb.width / 2, cvb.y + cvb.height * 0.8);
  await expect(panel).toBeVisible();
  // (the panel is modal: a switch while it is open comes from elsewhere, e.g. the API or a file)
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  await expect(panel).toHaveCount(0);
  expect(await page.locator('.stage-cv').evaluate((e) => (e as HTMLElement).style.cursor)).toBe('');
  // elsewhere: hover and click a grid over the whole stage (below its top band); nothing opens
  const sweep = async (sel: string) => {
    const cv = page.locator(sel);
    const b = (await cv.boundingBox())!;
    const top = (await page.locator('.stage-top').boundingBox())!;
    const y0 = Math.max(b.y, top.y + top.height) + 8;
    const y1 = b.y + b.height - 8;
    for (let i = 1; i <= 5; i++)
      for (let j = 0; j < 3; j++) {
        const x = b.x + (b.width * i) / 6;
        const y = y0 + ((y1 - y0) * (j + 0.5)) / 3;
        if (!phone) {
          await page.mouse.move(x, y);
          expect(await cv.evaluate((e) => (e as HTMLElement).style.cursor), `${sel} cursor`).not.toBe('zoom-in');
        }
        await press(x, y);
      }
    await expect(panel).toHaveCount(0);
  };
  const others = [['Violin', 'violin'], ['Viola', 'viola'], ['Cello', 'cello'], ['Flute', 'flute'], ['Trumpet', 'trumpet']] as const;
  for (const [label, id] of others) {
    await choose(label, id);
    await sweep('.stage-cv');
  }
  const btn = page.locator('.dim-toggle');
  await btn.click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  for (const [label, id] of others) {
    await choose(label, id);
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    await sweep('.stage-3d');
  }
  await btn.click();
});

test('pianos in 3D: the case hides (button or I), the inside keeps drawing, and it is remembered for the session', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  const caseBtn = page.locator('.case-toggle');
  await expect(caseBtn).toBeHidden(); // 2D: no case toggle
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await expect(caseBtn).toBeVisible();
  await expect(caseBtn).toHaveAttribute('aria-label', 'Hide the case');
  // the grand's open lid mirrors the plate and strings (not in the phones' light scene, not when shut)
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  const mirror = () => page.evaluate(() => (window as any).__stage3d.stats.mirror as boolean);
  if (info.project.name === 'phone') expect(await mirror()).toBe(false);
  else {
    await expect.poll(mirror).toBe(true);
    await page.evaluate(() => (window as any).__piano.setParams({ lid: 0 }));
    await expect.poll(mirror).toBe(false);
    await page.evaluate(() => (window as any).__piano.setParams({ lid: 1 }));
    await expect.poll(mirror).toBe(true);
  }
  await page.evaluate(() => (window as any).__piano.setPreset('upright'));
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  await page.waitForTimeout(300);
  const verts = () => page.evaluate(() => (window as any).__stage3d.stats.vertices as number);
  const shown = await verts();
  expect(await mirror()).toBe(false);
  if (info.project.name === 'phone') await caseBtn.tap();
  else await page.keyboard.press('KeyI');
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'true');
  // after the dissolve the cabinet is no longer drawn; the keys, action and strings still are
  await expect.poll(verts, { timeout: 3000 }).toBeLessThan(shown);
  expect(await verts()).toBeGreaterThan(shown * 0.5);
  // a key still moves its action with the case hidden
  await page.evaluate(() => (window as any).__piano.noteOn(60, 100, 'keys'));
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as any).__piano.noteOff(60, 'keys'));
  // remembered for the session (a reload keeps it), and only offered for the pianos
  await page.reload();
  await startAudio(page);
  await expect(page.locator('.stage-3d')).toBeVisible();
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as any).__piano.setInstrument('cello'));
  await expect(caseBtn).toBeHidden();
  await page.keyboard.press('KeyI');
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'true');
  await caseBtn.click();
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'false');
});

test('pianos in 3D: a key flies the camera to its own action; Esc, the × or a click off the keys fly back; never on other instruments', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  const cv = page.locator('.stage-3d');
  await expect(cv).toBeVisible();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  const zoomed = () => page.evaluate(() => (window as any).__stage3d.zoomed);
  const press = (x: number, y: number) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const b = (await cv.boundingBox())!;
  const clickKey = async (m: number) => {
    const at = await page.evaluate((k) => (window as any).__stage3d.screenOf(k), m);
    await press(b.x + at[0], b.y + at[1]);
  };
  const back = page.locator('.zoom-back');
  await expect(back).toBeHidden();
  await clickKey(60);
  await expect.poll(zoomed).toBe(60);
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('aria-label', 'Back to the whole piano');
  // the key's action plays live while zoomed, and the frame stays cheap
  await page.evaluate(() => (window as any).__piano.noteOn(60, 100, 'keys'));
  await page.waitForTimeout(950);
  await page.evaluate(() => (window as any).__piano.noteOff(60, 'keys'));
  expect(await page.evaluate(() => (window as any).__stage3d.stats.ms)).toBeLessThan(phone ? 16 : 12);
  if (!phone) {
    await page.keyboard.press('Escape');
    await expect.poll(zoomed).toBeNull();
    await expect(back).toBeHidden();
    await page.waitForTimeout(900);
    await clickKey(72);
    await expect.poll(zoomed).toBe(72);
  }
  // a click off the keys (the empty corner of the stage) flies back out
  await press(b.x + 12, b.y + b.height - 12);
  await expect.poll(zoomed).toBeNull();
  await page.waitForTimeout(900);
  // a change of instrument leaves no zoom behind, and the other instruments never zoom
  await page.evaluate(() => (window as any).__stage3d.zoomTo(48));
  await expect.poll(zoomed).toBe(48);
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'violin');
  await expect.poll(zoomed).toBeNull();
  await page.evaluate(() => (window as any).__stage3d.zoomTo(60));
  await page.waitForTimeout(200);
  expect(await zoomed()).toBeNull();
  await expect(back).toBeHidden();
});

test('3D draws without one WebGL warning: the grand (its lid a mirror), the upright, a key’s close-up on each, and every other instrument', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  const ready = () => page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  const zoomed = () => page.evaluate(() => (window as any).__stage3d.zoomed);
  for (const preset of ['grand', 'upright']) {
    await page.evaluate((p) => (window as any).__piano.setPreset(p), preset);
    await page.locator('.presets button', { hasText: preset }).click();
    await ready();
    // the whole piano, strings sounding (their glow is drawn too; on a desktop the grand's open lid
    // mirrors them: a second pass, with its own depth)
    if (preset === 'grand' && !phone) await expect.poll(() => page.evaluate(() => (window as any).__stage3d.stats.mirror)).toBe(true);
    await page.evaluate(() => [48, 60, 67].forEach((m) => (window as any).__piano.noteOn(m, 100, 'keys')));
    expect(await glErrors(page), `${preset}, whole`).toBe(0);
    // a key's action close up: the flight in, there (a key struck), and the flight back
    await page.evaluate(() => (window as any).__stage3d.zoomTo(60));
    expect(await glErrors(page, 45), `${preset}, flying in`).toBe(0);
    await expect.poll(zoomed).toBe(60);
    await page.waitForTimeout(300);
    await page.evaluate(() => (window as any).__piano.noteOn(62, 100, 'keys'));
    expect(await glErrors(page), `${preset}, close up`).toBe(0);
    await page.evaluate(() => {
      for (const m of [48, 60, 62, 67]) (window as any).__piano.noteOff(m, 'keys');
      (window as any).__stage3d.zoomOut();
    });
    expect(await glErrors(page, 45), `${preset}, flying back`).toBe(0);
    await expect.poll(zoomed).toBeNull();
    await page.waitForTimeout(350);
  }
  for (const [inst, note] of [['violin', 72], ['viola', 60], ['cello', 50], ['flute', 74], ['trumpet', 67]] as const) {
    await page.evaluate(async ([i, m]) => {
      await (window as any).__piano.setInstrument(i);
      (window as any).__piano.noteOn(m, 96, 'keys');
    }, [inst, note] as const);
    await ready();
    expect(await glErrors(page, 12), inst).toBe(0);
    await page.evaluate((m) => (window as any).__piano.noteOff(m, 'keys'), note);
  }
  expect(gl, 'WebGL messages on the console').toEqual([]);
  expect(errors).toEqual([]);
});

// Stephen's cello: blotchy orange speckle on the upper bout. The worn places on a painted plate were
// strewn with small pale polygons ("islands" of bare ground), and the rosin was 2200 dots. A worn place
// is now one soft, streaked thinning of the varnish: in the thumb's place on the treble upper bout, no
// pixel of the top's painted map stands far from its neighbours along the grain. (On main the mean was
// 1.5 and 1.2 levels, cello and violin, and one pixel in a hundred stood 10 and 8.5 off.)
test('3D varnish: a bowed top’s worn places are soft, with no speckle (cello and violin)', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'a phone draws the same map at half the size');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  for (const inst of ['cello', 'violin']) {
    await page.evaluate((i) => (window as any).__piano.setInstrument(i), inst);
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    const top = () =>
      page.evaluate(() => {
        // the top's painted map: the one drawn now that has its f-holes cut out
        let cv: HTMLCanvasElement | null = null;
        (window as any).__stage3d.r3.scene.traverse((o: any) => {
          if (!o.visible) return;
          for (const m of [].concat(o.material ?? []) as any[]) if (m.alphaTest && m.map?.image?.getContext) cv = m.map.image;
        });
        if (!cv) return null;
        const c = cv as HTMLCanvasElement;
        const w = c.width;
        const h = c.height;
        const d = c.getContext('2d')!.getImageData(0, 0, w, h).data;
        const lum = (x: number, y: number) => (d[(y * w + x) * 4] + d[(y * w + x) * 4 + 1] + d[(y * w + x) * 4 + 2]) / 3;
        const v: number[] = [];
        for (let y = Math.round(0.186 * h); y < Math.round(0.346 * h); y++)
          for (let x = Math.round(0.182 * w); x < Math.round(0.272 * w); x++) v.push(Math.abs(lum(x, y) - (lum(x - 6, y) + lum(x + 6, y)) / 2));
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        v.sort((a, b) => a - b);
        return { w, mean, p99: v[Math.floor(v.length * 0.99)] };
      });
    await expect.poll(async () => (await top())?.w ?? 0).toBe(2048);
    const m = (await top())!;
    test.info().annotations.push({ type: `speckle ${inst}`, description: JSON.stringify(m) });
    expect(m.mean, inst).toBeLessThan(0.8);
    expect(m.p99, inst).toBeLessThan(5);
  }
  expect(errors).toEqual([]);
});

test('a key’s close-up in 3D: its own light, the near plane in, zoom about its framing, and the orbit kept on the open side of the section', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  const cv = page.locator('.stage-3d');
  await expect(cv).toBeVisible();
  const s3 = <T,>(f: string) => page.evaluate((src) => new Function('s', `return ${src}`)((window as any).__stage3d), f) as Promise<T>;
  // (a key towards each end: the section is cut from that end)
  for (const [preset, key] of [['grand', 40], ['upright', 84]] as const) {
    await page.evaluate((p) => (window as any).__piano.setPreset(p), preset);
    await page.locator('.presets button', { hasText: preset }).click();
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    // the whole piano: the instrument's own exposure, a near plane sized to it
    expect(await s3<number>('s.r3.exposure'), preset).toBe(1);
    const nearOut = await s3<number>('s.r3.cam.near');
    expect(nearOut, preset).toBeGreaterThanOrEqual(0.01);
    {
      await page.evaluate((k) => (window as any).__stage3d.zoomTo(k), key);
      await expect.poll(() => s3<number | null>('s.zoomed')).toBe(key);
      await page.waitForTimeout(1100);
      const where = `${preset} key ${key}`;
      // exposure capped (pale felt and bare wood fill the frame), the near plane within millimetres
      // (nothing before the lens is cut), the key light's shadows on
      expect(await s3<number>('s.r3.exposure'), where).toBeLessThan(0.85);
      expect(await s3<number>('s.r3.cam.near'), where).toBeLessThanOrEqual(0.005);
      expect(await s3<boolean>('s.stats.shadows'), where).toBe(true);
      const open = async () => {
        const [eye, sec] = await Promise.all([s3<number[]>('s.eye'), s3<{ at: number; side: number; zoom: number }>('s.section')]);
        return { d: sec.side * (eye[0] - sec.at), side: sec.side, zoom: sec.zoom };
      };
      const o0 = await open();
      expect(o0.side, where).toBe(key < 60 ? -1 : 1);
      expect(o0.d, `${where}: the camera on the open side`).toBeGreaterThan(0.05);
      expect(o0.zoom, where).toBeCloseTo(1, 1);
      if (!phone) {
        const b = (await cv.boundingBox())!;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        // zoom in: nearer than the framing (one part fills the stage), but not without end
        await page.mouse.move(cx, cy);
        for (let k = 0; k < 8; k++) await page.mouse.wheel(0, -700);
        await page.waitForTimeout(400);
        const zin = (await open()).zoom;
        expect(zin, `${where}: zoomed in`).toBeLessThan(0.5);
        expect(zin, `${where}: zoom stops`).toBeGreaterThan(0.3);
        // turn it as far as it goes, both ways: the camera never crosses the cut's plane into the
        // keys left standing
        for (const dir of [1, -1]) {
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          for (let k = 1; k <= 6; k++) await page.mouse.move(cx + dir * k * 110, cy, { steps: 2 });
          await page.mouse.up();
          await page.waitForTimeout(300);
          expect((await open()).d, `${where}: turned ${dir > 0 ? 'right' : 'left'}`).toBeGreaterThan(0.05);
        }
        expect(await s3<number | null>('s.zoomed'), `${where}: a drag is not a click off the keys`).toBe(key);
      }
      await page.evaluate(() => (window as any).__stage3d.zoomOut());
      await expect.poll(() => s3<number | null>('s.zoomed')).toBeNull();
      await page.waitForTimeout(900);
      expect(await s3<number>('s.r3.exposure'), `${where}: back out`).toBe(1);
      expect(await s3<number>('s.r3.cam.near'), `${where}: back out`).toBe(nearOut);
    }
  }
});

test('pianos in 3D: sustain leaves the camera alone, and zooming in stops outside the case (grand and upright)', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  const cv = page.locator('.stage-3d');
  await expect(cv).toBeVisible();
  const eye = () => page.evaluate(() => (window as any).__stage3d.eye as number[]);
  // well inside each case (the plate, strings, action and keybed): the camera must never get here
  const inner: Record<string, [number[], number[]]> = { grand: [[-0.68, 0.12, 0.12], [0.68, 0.92, 1.95]], upright: [[-0.7, 0.1, 0.06], [0.7, 1.16, 0.55]] };
  for (const preset of ['grand', 'upright']) {
    await page.evaluate((p) => (window as any).__piano.setPreset(p), preset);
    await page.locator('.presets button', { hasText: preset }).click();
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    await page.evaluate(() => (window as any).__stage3d.resetView());
    await page.waitForTimeout(300);
    const before = await eye();
    // A5, then the sustain pedal (Space on a keyboard; the API on a phone)
    await page.evaluate(() => (window as any).__piano.noteOn(81, 100, 'keys'));
    if (phone) await page.evaluate(() => (window as any).__piano.sustain(1));
    else await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    const after = await eye();
    expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]), `${preset}: camera moved on sustain`).toBeLessThan(0.002);
    if (phone) await page.evaluate(() => (window as any).__piano.sustain(0));
    else await page.keyboard.up('Space');
    await page.evaluate(() => (window as any).__piano.noteOff(81, 'keys'));
    // zoom all the way in (wheel / pinch clamp): the camera stays outside the case
    if (!phone) {
      const b = (await cv.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      for (let k = 0; k < 12; k++) await page.mouse.wheel(0, -400);
    } else {
      await page.evaluate(() => (window as any).__stage3d.setView({ dist: 0.05 }));
    }
    await page.waitForTimeout(600);
    const e = await eye();
    const [lo, hi] = inner[preset];
    const isIn = e.every((v, k) => v > lo[k] && v < hi[k]);
    expect(isIn, `${preset}: camera inside the case at ${e.map((v) => v.toFixed(2))}`).toBe(false);
  }
});

test('the full pedal set: sustain, soft and the middle pedal (a grand’s sostenuto, an upright’s muffler), on screen, keys and engine', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  const pedals = page.locator('.pedals .pedal');
  const middle = page.locator('.pedals .pedal').nth(2);
  await expect(pedals).toHaveCount(3);
  const stats = () => page.evaluate(() => (window as any).__piano.lastStats);
  // the grand: the middle pedal is the sostenuto
  await expect(middle.locator('.p-name')).toHaveText('sost.');
  await expect(middle).toHaveAttribute('aria-label', /^Sostenuto/);
  if (!phone) {
    await page.keyboard.down('KeyB');
    await expect.poll(async () => (await stats()).middle).toBeGreaterThan(0.9);
    await expect(middle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.up('KeyB');
    await expect.poll(async () => (await stats()).middle).toBeLessThan(0.1);
  }
  // pressed on screen (a held pointer)
  const mb = (await middle.boundingBox())!;
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await stats()).middle).toBeGreaterThan(0.9);
  await page.mouse.up();
  await expect.poll(async () => (await stats()).middle).toBeLessThan(0.1);
  // the upright: the soft pedal is the half-blow rail, the middle pedal its practice muffler
  await page.evaluate(() => (window as any).__piano.setPreset('upright'));
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await expect(middle.locator('.p-name')).toHaveText('muffler');
  await expect(middle).toHaveAttribute('aria-label', /^Practice muffler/);
  await expect(pedals.nth(1)).toHaveAttribute('aria-label', /hammers rest nearer/);
  // the other instruments show only the sustain pedal
  await page.evaluate(() => (window as any).__piano.setInstrument('cello'));
  await expect(middle).toBeHidden();
  await expect(pedals.nth(1)).toBeHidden();
});

test('without WebGL2 there is no 3D toggle and the 2D stage works', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function (type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return orig.call(this, type as never, ...(rest as []));
    };
    localStorage.setItem('piano-model.3d', '1');
  });
  await page.goto('/');
  await startAudio(page);
  await expect(page.locator('.dim-toggle')).toBeHidden();
  await expect(page.locator('.stage-3d')).toHaveCount(0);
  await expect(page.locator('.stage-cv')).toBeVisible();
});

test('the bow in the hand: a drag on the bow sounds the string and moves the bow, by touch and by mouse, in 2D and 3D', async ({ page, context }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  const cdp = phone ? await context.newCDPSession(page) : null;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const line = () =>
    page.evaluate(() => {
      const w = window as any;
      if (!w.__stage3d) return w.__bow2d();
      const l = w.__stage3d.bowLine();
      if (!l) return null;
      const r = w.__stage3d.el.getBoundingClientRect();
      return { fx: l.fx + r.left, fy: l.fy + r.top, tx: l.tx + r.left, ty: l.ty + r.top, pos: l.pos };
    }) as Promise<{ fx: number; fy: number; tx: number; ty: number; pos: number } | null>;
  const rms = () =>
    page.evaluate(() => {
      const a = (window as any).__piano.analyser as AnalyserNode;
      const b = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(b);
      let s = 0;
      for (const v of b) s += v * v;
      return Math.sqrt(s / b.length);
    });
  const vw = page.viewportSize()!;
  for (const d3 of [false, true]) {
    if (d3) {
      await page.locator('.dim-toggle').click();
      await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    }
    for (const inst of ['violin', 'viola', 'cello']) {
      await page.evaluate((i) => (window as any).__piano.setInstrument(i), inst);
      await expect.poll(async () => (await line())?.pos ?? -1).toBeGreaterThanOrEqual(0);
      await page.waitForTimeout(d3 ? 250 : 80);
      // a touch on the stage is the bow's, never a pan the browser takes away
      expect(await page.evaluate((s) => getComputedStyle(document.querySelector(s)!).touchAction, d3 ? '.stage-3d' : '.stage-cv')).toBe('none');
      const l = (await line())!;
      const len = Math.hypot(l.tx - l.fx, l.ty - l.fy);
      const ux = (l.tx - l.fx) / len;
      const uy = (l.ty - l.fy) / len;
      // down on the hair (at the string, kept on screen), then towards the frog: the contact point travels to the tip
      let x = Math.min(vw.width - 70, Math.max(70, l.fx + (l.tx - l.fx) * l.pos));
      let y = l.fy + (l.ty - l.fy) * l.pos + (l.tx - l.fx ? ((x - (l.fx + (l.tx - l.fx) * l.pos)) / (l.tx - l.fx)) * (l.ty - l.fy) : 0);
      if (phone) await touch('touchStart', x, y);
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      // the bow is in the hand and still: nothing sounds yet
      expect(await page.evaluate(() => (window as any).__piano.sounding.size)).toBe(0);
      let loud = 0;
      for (let i = 0; i < 14; i++) {
        x -= ux * 6;
        y -= uy * 6;
        if (phone) await touch('touchMove', x, y);
        else await page.mouse.move(x, y);
        await page.waitForTimeout(16);
        if (i > 6) loud = Math.max(loud, await rms());
      }
      const where = `${inst} ${d3 ? '3D' : '2D'}`;
      expect(loud, `${where}: it sounds`).toBeGreaterThan(0.002);
      expect(await page.evaluate(() => (window as any).__piano.sounding.size), `${where}: a string is bowed`).toBe(1);
      await expect.poll(async () => (await line())!.pos, { message: `${where}: the bow has moved` }).toBeGreaterThan(l.pos + 0.04);
      if (phone) await touch('touchEnd');
      else await page.mouse.up();
      // let go: the bow leaves the string
      await expect.poll(() => page.evaluate(() => (window as any).__piano.sounding.size)).toBe(0);
    }
  }
  // the 3D stage still turns when the pointer lands off the bow
  const eye0 = await page.evaluate(() => [...(window as any).__stage3d.eye]);
  const r = (await page.locator('.stage-3d').boundingBox())!;
  const [ox, oy] = [r.x + r.width * 0.12, r.y + r.height * 0.1];
  if (phone) {
    await touch('touchStart', ox, oy);
    for (let i = 1; i <= 6; i++) await touch('touchMove', ox + 12 * i, oy);
    await touch('touchEnd');
  } else {
    await page.mouse.move(ox, oy);
    await page.mouse.down();
    await page.mouse.move(ox + 72, oy, { steps: 6 });
    await page.mouse.up();
  }
  await expect.poll(async () => Math.hypot(...(await page.evaluate(() => [...(window as any).__stage3d.eye])).map((v: number, i: number) => v - eye0[i]))).toBeGreaterThan(0.01);
  expect(await page.evaluate(() => (window as any).__piano.sounding.size)).toBe(0);
  await page.locator('.dim-toggle').click();
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
  expect(errors).toEqual([]);
});

// ================================================================ a file's dynamics
/** a file at ♩ = 60, 4/4: per part (its channel = its index), notes of `beats` each, at velocity
 *  `vel(i)`, and controllers [tick, cc, value] */
const dynFile = (parts: { name: string; pitches: number[]; beats: number; vel: (i: number) => number; cc?: [number, number, number][] }[]) => {
  const label = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40], [0, 0xff, 0x58, 4, 4, 2, 24, 8]]];
  parts.forEach((p, ch) => {
    const abs: [number, number[]][] = [[0, label(p.name)]];
    p.pitches.forEach((m, i) => abs.push([i * p.beats * 480, [0x90 | ch, m, p.vel(i)]], [(i + 1) * p.beats * 480 - 10, [0x80 | ch, m, 0]]));
    for (const [t, c, v] of p.cc ?? []) abs.push([t, [0xb0 | ch, c, v]]);
    abs.sort((a, b) => a[0] - b[0]);
    // (as deltas)
    let prev = 0;
    tracks.push(
      abs.map(([t, b]) => {
        const d = t - prev;
        prev = t;
        return [d, ...b] as [number, ...number[]];
      }),
    );
  });
  return Array.from(smf(480, tracks));
};
const scheduled = (page: Page) =>
  page.evaluate(() => {
    const ev = (window as any).__player.scheduled as { kind: string; vel?: number }[];
    return { vels: ev.filter((e) => e.kind === 'on').map((e) => e.vel!), dyn: ev.filter((e) => e.kind === 'dyn').length };
  });

test('automatic expression: a hairpin by the hairline, on by default; a flat file phrased, as written when off, remembered; a file’s own dynamics left alone', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('piano-model.expression'));
  const btn = page.locator('.player .pl-expr');
  // at rest there is no hairpin (play, the pieces, open)
  await expect(btn).toBeHidden();
  // a flat file: one velocity, no controllers, the cello's notes long
  const flat = dynFile([
    { name: 'Violin', pitches: Array.from({ length: 24 }, (_, i) => 67 + ((i * 5) % 12)), beats: 1, vel: () => 80 },
    { name: 'Cello', pitches: [48, 43, 45, 41, 48, 43], beats: 4, vel: () => 80 },
  ]);
  await page.evaluate((b) => (window as any).__player.load(new Uint8Array(b).buffer), flat);
  await expect.poll(() => page.evaluate(() => (window as any).__player.playing), { timeout: 15_000 }).toBe(true);
  await expect(btn).toBeVisible();
  // icon only: named for a screen reader, its state pressed, its tip on hover
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toHaveAttribute('aria-label', 'Automatic expression');
  await expect(btn).toHaveAttribute('data-tip', 'expression · on');
  expect((await btn.innerText()).trim()).toBe('');
  let s = await scheduled(page);
  // phrased: velocities spread about the file's 80; the cello's long notes swell
  expect(new Set(s.vels).size).toBeGreaterThan(5);
  expect(s.dyn).toBeGreaterThan(10);
  // off: as written, and it plays on
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(btn).toHaveAttribute('data-tip', 'expression · off');
  s = await scheduled(page);
  expect([...new Set(s.vels)]).toEqual([80]);
  expect(s.dyn).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).__player.playing)).toBe(true);
  // remembered on this device
  await page.reload();
  await page.evaluate((b) => (window as any).__player.load(new Uint8Array(b).buffer), flat);
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  expect([...new Set((await scheduled(page)).vels)]).toEqual([80]);
  // and on again, by the keyboard
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('piano-model.expression'))).toBe('on');
  expect(new Set((await scheduled(page)).vels).size).toBeGreaterThan(5);
  // a file with dynamics of its own (expression hairpins throughout): played as written either way
  const own = dynFile([{ name: 'Violin', pitches: Array.from({ length: 16 }, (_, i) => 67 + (i % 5)), beats: 1, vel: () => 80, cc: Array.from({ length: 64 }, (_, k) => [k * 120, 11, Math.round(70 + 50 * Math.sin((Math.PI * k) / 16) ** 2)] as [number, number, number]) }]);
  await page.evaluate((b) => (window as any).__player.load(new Uint8Array(b).buffer), own);
  await expect(btn).toHaveClass(/\bown\b/);
  await expect(btn).toHaveAttribute('data-tip', 'expression · the file’s own');
  s = await scheduled(page);
  expect([...new Set(s.vels)]).toEqual([80]);
  expect(s.dyn).toBe(0);
  // the player's row still fits the screen
  const row = await page.locator('.player .pl-row').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(row!.x).toBeGreaterThanOrEqual(0);
  expect(row!.x + row!.width).toBeLessThanOrEqual(vw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => (window as any).__player.unload());
  await expect(btn).toBeHidden();
  expect(errors).toEqual([]);
});

test('a file’s volume and expression reach the instrument that plays the line, alone or in an ensemble, and let go when it stops', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const gainOf = () => page.evaluate(() => (window as any).__piano.piano?.output.gain.value as number);
  // one line, on the instrument shown: volume 60 (of the default 100), expression full: (60/100)² = 0.36
  const solo = dynFile([{ name: 'Piano', pitches: [60, 64, 67, 72, 67, 64, 60, 64], beats: 1, vel: () => 80, cc: [[0, 7, 60], [0, 11, 127]] }]);
  await page.evaluate((b) => (window as any).__player.load(new Uint8Array(b).buffer), solo);
  await expect.poll(gainOf, { timeout: 15_000 }).toBeCloseTo(0.36, 2);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  await expect.poll(gainOf).toBeCloseTo(1, 3);
  // two lines, an ensemble: the violin's expression at 64 ((64/127)² ≈ 0.254), the cello's at full
  const duo = dynFile([
    { name: 'Violin', pitches: Array.from({ length: 12 }, (_, i) => 67 + (i % 5)), beats: 1, vel: () => 80, cc: [[0, 11, 64]] },
    { name: 'Cello', pitches: [48, 43, 45], beats: 4, vel: () => 80, cc: [[0, 11, 127]] },
  ]);
  await page.evaluate((b) => (window as any).__player.load(new Uint8Array(b).buffer), duo);
  const partGains = () => page.evaluate(() => (window as any).__orchestra.ensemble.parts.map((p: any) => [p.voice, +(p.engine?.output.gain.value ?? NaN).toFixed(3)]));
  await expect.poll(partGains, { timeout: 15_000 }).toEqual([['violin', +((64 / 127) ** 2).toFixed(3)], ['cello', 1]]);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  await expect.poll(partGains).toEqual([['violin', 1], ['cello', 1]]);
  await page.locator('.ens-toggle').click();
  expect(errors).toEqual([]);
});

// ================================================================ orchestra mode
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { active: e.active as boolean, lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, frames: e.parts.filter((p: any) => p.frame).length as number, held: e.parts.map((p: any) => p.down.size) as number[], kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });

test('orchestra: a piece from the menu puts its ensemble on the stage, in 2D and 3D, and the ensemble steps back', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.score-btn').click();
  const menu = page.locator('.score-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.sm-item')).toHaveCount(3);
  // (a credit, minimal, to the notes)
  await expect(menu.locator('.sm-credit')).toHaveText(/public domain · Mutopia/);
  await menu.locator('.sm-item').first().click();
  await expect(menu).toBeHidden();
  // the quartet: four engines on the one context, each drawing from its own frames
  await expect.poll(async () => (await ens(page)).frames, { timeout: 8000 }).toBe(4);
  const s = await ens(page);
  expect(s.lineup).toEqual(['violin', 'violin', 'viola', 'cello']);
  expect(s.kinds).toEqual(['violin', 'violin', 'viola', 'cello']);
  expect(await page.evaluate(() => (window as any).__piano.ctx.state)).toBe('running');
  // the picker counts the lineup; the file's four lines show their instruments
  await expect(page.locator('.ens-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pick[aria-label="Violin"] .pick-n')).toHaveText('×2');
  for (const [name, on] of [['Violin', 'true'], ['Viola', 'true'], ['Cello', 'true'], ['Flute', 'false'], ['Piano', 'false']]) await expect(page.locator(`.pick[aria-label="${name}"]`)).toHaveAttribute('aria-pressed', on);
  await expect(page.locator('.pl-line')).toHaveCount(4);
  expect(await page.locator('.pl-line').evaluateAll((b) => b.map((x) => x.getAttribute('data-voice')))).toEqual(['violin', 'violin', 'viola', 'cello']);
  // it sounds: the tune is played, and the mix reaches the analyser
  await expect.poll(async () => (await ens(page)).held.reduce((a, b) => a + b, 0), { timeout: 4000 }).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const a = (window as any).__piano.analyser as AnalyserNode;
          const b = new Float32Array(2048);
          a.getFloatTimeDomainData(b);
          return Math.sqrt(b.reduce((s, x) => s + x * x, 0) / b.length);
        }),
      { timeout: 4000 },
    )
    .toBeGreaterThan(1e-4);
  // the single instrument's own controls step aside; nothing scrolls sideways
  await expect(page.locator('.knob-toggle')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // the player and its lines cover none of the top band
  const p = (await page.locator('.player').boundingBox())!;
  for (const sel of ['.picker', '.readout']) {
    const r = (await page.locator(sel).boundingBox())!;
    expect(p.x < r.x + r.width && r.x < p.x + p.width && p.y < r.y + r.height && r.y < p.y + p.height, sel).toBe(false);
  }
  // 3D: the four instruments drawn from their frames
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(() => ((window as any).__stage3d.probe = true));
  await expect.poll(() => page.evaluate(() => (window as any).__stage3d.stats.lit), { timeout: 8000 }).toBeGreaterThan(20);
  const v3 = await page.evaluate(() => (window as any).__stage3d.stats.vertices);
  expect(v3).toBeGreaterThan(50_000);
  await page.locator('.dim-toggle').click();
  // the ensemble off: the single instrument back, playing and in the graph
  await page.locator('.ens-toggle').click();
  await expect(page.locator('.ens-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect((await ens(page)).active).toBe(false);
  await expect(page.locator('.pl-lines')).toBeHidden();
  await expect(page.locator('.pick[aria-pressed="true"]')).toHaveCount(1);
  await page.evaluate(() => (window as any).__piano.noteOn(67, 90, 'keys'));
  await expect.poll(() => page.evaluate(() => (window as any).__piano.sounding.size), { timeout: 2000 }).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__piano.noteOff(67, 'keys'));
  expect(errors).toEqual([]);
});

test('the pieces are in the player’s overlay, with play and open: one icon, the same for one instrument and for an ensemble; its menu opens under it, on the screen', async ({ page }, info) => {
  const errors = collectErrors(page);
  // (the phone: 390×844, where the menu has the least room)
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const player = page.locator('.player');
  const btn = page.locator('.score-btn');
  const menu = page.locator('.score-menu');
  const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
  const view = page.viewportSize()!;
  /** the button sits in the player's row, and its menu, open, hangs under it, whole and uncovered */
  const check = async (mode: string, row: string[]) => {
    await expect(btn, mode).toHaveCount(1);
    await expect(player.locator('.pl-row > .score-btn.pl-btn'), mode).toBeVisible();
    await expect(page.locator('.picker .score-btn'), mode).toHaveCount(0);
    // one row of icons, in this order, the pieces next to the file they are the alternative to
    const shown = await player.locator('.pl-row button:visible').evaluateAll((bs) => bs.map((b) => [...b.classList].find((c) => /^pl-(play|stop|expr|route|pieces|open)$/.test(c))));
    expect(shown, mode).toEqual(row);
    const [b, o] = [await box(btn), await box(page.locator('.pl-open'))];
    expect(Math.abs(b.y - o.y), mode).toBeLessThan(1);
    expect(o.x - (b.x + b.width), mode).toBeLessThanOrEqual(8);
    expect([b.width, b.height], mode).toEqual([o.width, o.height]);
    await btn.click();
    await expect(menu, mode).toBeVisible();
    await expect(player.locator('.score-menu'), mode).toHaveCount(1);
    await expect(btn, mode).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.locator('.sm-item'), mode).toHaveCount(3);
    const m = await box(menu);
    expect(m.y, mode).toBeGreaterThanOrEqual(b.y + b.height);
    expect(m.y, mode).toBeLessThan(b.y + b.height + 10);
    expect(b.x + b.width / 2, mode).toBeGreaterThan(m.x);
    expect(b.x + b.width / 2, mode).toBeLessThan(m.x + m.width);
    expect(m.x, mode).toBeGreaterThanOrEqual(4);
    expect(m.x + m.width, mode).toBeLessThanOrEqual(view.width - 4);
    expect(m.y + m.height, mode).toBeLessThanOrEqual(view.height);
    for (const it of await menu.locator('.sm-item, .sm-credit').all()) {
      const r = await box(it);
      expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.score-menu'), [r.x + r.width / 2, r.y + r.height / 2]), `${mode}: nothing over the menu`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), mode).toBe(true);
  };
  // icon only, named for a screen reader and by its tip
  await expect(btn).toHaveAttribute('aria-label', 'Pieces for the ensemble');
  await expect(btn).toHaveAttribute('data-tip', 'pieces');
  expect((await btn.innerText()).trim()).toBe('');
  // one instrument, nothing loaded: play, the pieces, open
  await check('one instrument, at rest', ['pl-play', 'pl-pieces', 'pl-open']);
  // Escape closes the menu and the button has the focus again; so does a tap anywhere else
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(btn).toBeFocused();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await btn.click();
  await expect(menu).toBeVisible();
  await page.locator('.spec-wrap').click();
  await expect(menu).toBeHidden();
  // a piece from it puts its ensemble on the stage; the button keeps its place in the row, by the routing
  await btn.click();
  await menu.locator('.sm-item').first().click();
  await expect(menu).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.piece?.id ?? null), { timeout: 10_000 }).toBe('haydn');
  await expect(page.locator('.pl-line')).toHaveCount(4);
  await check('an ensemble, its piece loaded', ['pl-play', 'pl-stop', 'pl-expr', 'pl-route', 'pl-pieces', 'pl-open']);
  // the routing grid and the pieces menu are not open together
  await page.locator('.pl-route').click();
  await expect(page.locator('.pl-grid')).toBeVisible();
  await expect(menu).toBeHidden();
  await btn.click();
  await expect(menu).toBeVisible();
  await expect(page.locator('.pl-grid')).toBeHidden();
  await page.keyboard.press('Escape');
  await player.getByRole('button', { name: 'Stop' }).click();
  // the ensemble with nothing loaded (the file let go): the same three icons as for one instrument
  await page.evaluate(() => (window as any).__player.unload());
  await expect(player).toHaveClass(/idle/);
  expect((await ens(page)).active).toBe(true);
  await check('an ensemble, at rest', ['pl-play', 'pl-pieces', 'pl-open']);
  await page.keyboard.press('Escape');
  await page.locator('.ens-toggle').click();
  expect((await ens(page)).active).toBe(false);
  expect(errors).toEqual([]);
});

test('orchestra: with nothing loaded, the overlay’s play icon plays the built-in piece nearest the lineup; an instrument’s own piece makes way for the ensemble', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  // the violin's own piece playing, then the ensemble: the overlay back to rest, its play icon the quartet's
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  await page.locator('.pl-play').click();
  await expect.poll(() => page.evaluate(() => (window as any).__player.demo?.instrument ?? null), { timeout: 10_000 }).toBe('violin');
  await page.locator('.ens-toggle').click();
  await expect(page.locator('.player')).toHaveClass(/idle/);
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Haydn/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.pl-line')).toHaveCount(4, { timeout: 10_000 });
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.piece?.id)).toBe('haydn');
  await expect.poll(async () => (await ens(page)).held.reduce((a, b) => a + b, 0), { timeout: 8000 }).toBeGreaterThan(0);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
  expect(errors).toEqual([]);
});

test('orchestra: a dropped file with several parts is shared out by name, program and range; a line moves to another instrument', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const tune: [number, ...number[]][] = [];
  for (let i = 0; i < 8; i++) tune.push([0, 0x90, [72, 76, 79, 84][i % 4], 90], [480, 0x80, [72, 76, 79, 84][i % 4], 0]);
  const bass: [number, ...number[]][] = [];
  for (let i = 0; i < 4; i++) bass.push([0, 0x91, [36, 43, 41, 43][i], 90], [960, 0x81, [36, 43, 41, 43][i], 0]);
  // an unnamed line of chords (no program): the piano's
  const chords: [number, ...number[]][] = [];
  for (let i = 0; i < 4; i++) chords.push([0, 0x92, 60, 70], [0, 0x92, 64, 70], [0, 0x92, 67, 70], [0, 0x92, 71, 70], [960, 0x82, 60, 0], [0, 0x82, 64, 0], [0, 0x82, 67, 0], [0, 0x82, 71, 0]);
  const file = smf(480, [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]], [[0, ...name('Flauto')], [0, 0xc0, 73], ...tune], [[0, ...name('Violoncello')], ...bass], chords]);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'trio.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(file));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(3);
  expect((await ens(page)).lineup).toEqual(['flute', 'cello', 'grand']);
  // the cello's line to the viola: its own instrument changes (a new engine), the others play on
  await page.locator('.pl-line').nth(1).click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-pick[aria-checked="true"]')).toHaveAttribute('aria-label', 'cello');
  await menu.locator('.pl-pick[aria-label="viola"]').click();
  await expect(menu).toBeHidden();
  await expect.poll(async () => (await ens(page)).kinds, { timeout: 5000 }).toEqual(['flute', 'viola', 'piano']);
  await expect(page.locator('.pl-line').nth(1)).toHaveAttribute('data-voice', 'viola');
  // a line can be left silent; Escape closes the menu without a change
  await page.locator('.pl-line').nth(0).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.locator('.pl-line').nth(0).click();
  await menu.locator('.pl-pick[aria-label="silent"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['viola', 'grand']);
  await expect(page.locator('.pl-line').nth(0)).toHaveAttribute('data-voice', 'none');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

/** what the keys play (orchestra/keys.ts): each part, chosen or not, and what it holds by hand */
const keysState = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { parts: e.keyParts as number[], split: e.keys.split as boolean, chips: [...document.querySelectorAll('.kf-part')].map((b) => b.getAttribute('aria-pressed') === 'true') };
  });
/** a plug-in MIDI keyboard, plugged in (the page's own Web MIDI path, as in the Web MIDI test) */
const plugMidi = (page: Page) =>
  page.addInitScript(() => {
    const inputs = new Map<string, any>();
    const access: any = { inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false };
    (navigator as any).requestMIDIAccess = async () => access;
    (window as any).__midi = {
      plug() {
        const input = { id: 'fake', name: 'Test Keys', state: 'connected', onmidimessage: null as any };
        inputs.set('fake', input);
        access.onstatechange?.({ port: input });
      },
      send(bytes: number[]) {
        inputs.get('fake').onmidimessage?.({ data: new Uint8Array(bytes) });
      },
    };
  });
/** a control of the keys' row: on a phone it waits behind the fallboard's button */
const kfChip = async (page: Page, sel: string) => {
  const t = page.locator('.kf-toggle');
  if ((await t.isVisible()) && (await t.getAttribute('aria-expanded')) !== 'true') await t.click();
  await page.locator(`.kf ${sel}`).click();
};

test('orchestra by hand: the ensemble toggle, instruments counted in; the keys play the instruments chosen on the fallboard, several at once, or split by register', async ({ page }, info) => {
  const errors = collectErrors(page);
  await plugMidi(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__midi.plug());
  await expect(page.locator('.status')).toHaveAttribute('data-midi', 'MIDI: Test Keys');
  await startAudio(page);
  // one instrument: no keys picker (the knobs are in its place)
  await expect(page.locator('.kf')).toBeHidden();
  await expect(page.locator('.kf-toggle')).toBeHidden();
  await page.locator('.ens-toggle').click();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  expect((await ens(page)).lineup).toEqual(['violin', 'violin', 'viola', 'cello']);
  // a tap adds one; past the most an instrument may have, it has none
  await page.locator('.pick[aria-label="Flute"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['flute', 'violin', 'violin', 'viola', 'cello']);
  await page.locator('.pick[aria-label="Viola"]').click();
  await page.locator('.pick[aria-label="Viola"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['flute', 'violin', 'violin', 'cello']);
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  // the fallboard says what the keys play: no piano, so the highest melodic instrument, the flute
  const phone = info.project.name === 'phone';
  await expect(page.locator(phone ? '.kf-toggle' : '.kf')).toBeVisible();
  if (phone) await expect(page.locator('.kf-toggle')).toHaveAttribute('aria-label', 'The keys play: flute');
  expect(await keysState(page)).toEqual({ parts: [0], split: false, chips: [true, false, false, false] });
  await expect(page.locator('.kf-part[data-part="1"]')).toHaveAttribute('aria-label', 'violin 1');
  await expect(page.locator('.kf-part[data-part="2"]')).toHaveAttribute('aria-label', 'violin 2');
  // the keys span the flute's range, C4 to C7
  await expect(page.locator('.key[data-midi="60"]')).not.toHaveClass(/out/);
  await expect(page.locator('.key[data-midi="59"]')).toHaveClass(/out/);
  // the engines' own word on what sounds
  await page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    (window as any).__heard = e.parts.map(() => new Set<number>());
    e.parts.forEach((p: any, k: number) => p.engine.onSounding((ns: number[]) => ns.forEach((n) => (window as any).__heard[k].add(n))));
  });
  const heard = () => page.evaluate(() => (window as any).__heard.map((s: Set<number>) => [...s].sort((a, b) => a - b)));
  const held = () => page.evaluate(() => (window as any).__orchestra.ensemble.parts.map((p: any) => [...p.down].sort((a: number, b: number) => a - b)));
  // a key: on the flute alone (G2 moved into its range)
  await page.evaluate(() => (window as any).__piano.noteOn(43, 90, 'keys'));
  expect(await held()).toEqual([[67], [], [], []]);
  await expect.poll(heard, { timeout: 3000 }).toEqual([[67], [], [], []]);
  await page.evaluate(() => (window as any).__piano.noteOff(43, 'keys'));
  // the cello chosen too: one key, both instruments (the plug-in keyboard's keys the same)
  await kfChip(page, '.kf-part[data-part="3"]');
  expect(await keysState(page)).toEqual({ parts: [0, 3], split: false, chips: [true, false, false, true] });
  if (phone) await expect(page.locator('.kf-toggle')).toHaveAttribute('aria-label', 'The keys play: flute, cello');
  await expect(page.locator('.key[data-midi="36"]')).not.toHaveClass(/out/);
  await expect(page.locator('.key[data-midi="35"]')).toHaveClass(/out/);
  await page.evaluate(() => (window as any).__midi.send([0x90, 72, 90]));
  expect(await held()).toEqual([[72], [], [], [72]]);
  await expect.poll(async () => (await heard()).map((s: number[]) => s.includes(72)), { timeout: 3000 }).toEqual([true, false, false, true]);
  // the pedal (CC64) goes where the keys go, and leaves an instrument with them
  await page.evaluate(() => (window as any).__midi.send([0xb0, 64, 127]));
  const sus = () => page.evaluate(() => (window as any).__orchestra.ensemble.parts.map((p: any) => p.sustain));
  expect(await sus()).toEqual([1, 0, 0, 1]);
  await kfChip(page, '.kf-part[data-part="0"]');
  expect(await sus()).toEqual([0, 0, 0, 1]);
  // (a change of choice lets go of the keys held)
  expect(await held()).toEqual([[], [], [], []]);
  await page.evaluate(() => (window as any).__midi.send([0xb0, 64, 0]));
  expect(await sus()).toEqual([0, 0, 0, 0]);
  await page.evaluate(() => (window as any).__midi.send([0x80, 72, 0]));
  // the last instrument stays chosen
  await kfChip(page, '.kf-part[data-part="3"]');
  expect((await keysState(page)).parts).toEqual([3]);
  // split: a chord dealt out by register, the lowest note to the cello, the highest to the flute
  await kfChip(page, '.kf-split');
  await expect(page.locator('.kf-split')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    for (const m of [43, 67, 74, 84]) (window as any).__piano.noteOn(m, 90, 'keys');
  });
  expect(await held()).toEqual([[84], [67], [74], [43]]);
  await page.evaluate(() => {
    for (const m of [43, 67, 74, 84]) (window as any).__piano.noteOff(m, 'keys');
  });
  expect((await ens(page)).held).toEqual([0, 0, 0, 0]);
  if (phone) {
    // the row opens over the fallboard, on the screen; a tap elsewhere closes it
    const row = (await page.locator('.kf').boundingBox())!;
    expect(row.x).toBeGreaterThanOrEqual(0);
    expect(row.x + row.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const st = (await page.locator('.stage').boundingBox())!;
    await page.touchscreen.tap(st.x + 12, st.y + st.height * 0.55);
    await expect(page.locator('.kf')).toBeHidden();
    await expect(page.locator('.kf-toggle')).toHaveAttribute('aria-expanded', 'false');
  } else {
    await page.locator('.kf-split').hover();
    await expect(page.locator('.tip')).toHaveText('split · one note each, by register');
  }
  await page.locator('.ens-toggle').click();
  expect((await ens(page)).active).toBe(false);
  await expect(page.locator('.kf')).toBeHidden();
  expect(errors).toEqual([]);
});

test('orchestra keys: a piano on the stage takes the keys, and keeps them through its preset; a piece starts from its default', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.ens-toggle').click();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  expect((await keysState(page)).parts).toEqual([0]);
  // a piano joins the quartet: nothing chosen by hand, so the keys are the piano's, its pedals with them
  await page.locator('.pick[aria-label="Piano"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['violin', 'violin', 'viola', 'cello', 'grand']);
  expect(await keysState(page)).toEqual({ parts: [4], split: false, chips: [false, false, false, false, true] });
  await expect(page.locator('.pedal').nth(1)).toBeVisible();
  // the second violin chosen as well; the piano becomes an upright in its seat and stays chosen
  await kfChip(page, '.kf-part[data-part="1"]');
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await expect.poll(async () => (await ens(page)).lineup[4]).toBe('upright');
  expect((await keysState(page)).parts).toEqual([1, 4]);
  await expect(page.locator('.kf-part[data-part="4"]')).toHaveAttribute('data-voice', 'upright');
  // without the piano the keys have no soft pedal
  await kfChip(page, '.kf-part[data-part="4"]');
  await expect(page.locator('.pedal').nth(1)).toBeHidden();
  // a piece brings its own lineup and the keys their default: Haydn's quartet, its first violin
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).__orchestra.loadPiece(0));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  expect((await keysState(page)).parts).toEqual([0]);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

/**
 * The bows of an ensemble on the 2D stage, measured on the canvas. The stage says where each bow's hair
 * lies (`__ens2d`: its frog end and its tip end, client px); 48 stations along that line are then read
 * from the canvas's own pixels, each a small patch across the hair, for the colours of a bow being
 * played. On the stage's own style: light and warm, the hair's ivory and the lit side of the stick
 * (the ground is near black, the varnish dark, strings and a flute's silver cool). On the vector
 * lines: the red of the hair's two edges, or white where the stick's blue lies over it (an outline's
 * blue has little red). `drawn` is the share of the stations that have it, `first` and `last` the
 * outermost ones that do (0 the frog, 1 the tip).
 */
const bowsDrawn = (page: Page, vector: boolean) =>
  page.evaluate((vector) => {
    const cv = document.querySelector('.stage-cv') as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const copy = document.createElement('canvas');
    copy.width = cv.width;
    copy.height = cv.height;
    const c2 = copy.getContext('2d', { willReadFrequently: true })!;
    c2.drawImage(cv, 0, 0);
    const px = c2.getImageData(0, 0, cv.width, cv.height).data;
    const ink = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return false;
      const i = 4 * (y * cv.width + x);
      const [R, G, B] = [px[i], px[i + 1], px[i + 2]];
      return vector ? R >= 110 && R + 20 >= G : Math.min(R, G, B) >= 100 && R >= B + 8;
    };
    type Part = { voice: string; cell: { x: number; y: number; w: number; h: number }; bow: { fx: number; fy: number; tx: number; ty: number; pos: number } | null } | null;
    return ((window as any).__ens2d() as Part[])
      .filter((p) => p?.bow)
      .map((p) => {
        const { fx, fy, tx, ty, pos } = p!.bow!;
        const len = Math.hypot(tx - fx, ty - fy);
        const [ux, uy] = [(tx - fx) / len, (ty - fy) / len];
        const N = 48;
        let hit = 0;
        let first = 2;
        let last = -1;
        for (let s = 0; s < N; s++) {
          const t = 0.02 + (0.96 * s) / (N - 1);
          let on = false;
          // 9 px either way along the hair (the glow where it meets the string, a neighbour's frog lying
          // over it, hide no station), 7 px either side of it (the hair gives under the bow's force)
          for (let a = -9; a <= 9 && !on; a++)
            for (let b = -7; b <= 7 && !on; b += 0.5) on = ink(Math.round((fx + ux * (t * len + a) - uy * b - r.left) * k), Math.round((fy + uy * (t * len + a) + ux * b - r.top) * k));
          if (!on) continue;
          hit++;
          first = Math.min(first, t);
          last = Math.max(last, t);
        }
        return { voice: p!.voice, pos, len, drawn: hit / N, first, last, cell: p!.cell, line: { fx, fy, tx, ty } };
      });
  }, vector);

test('orchestra in 2D: every bow is drawn whole, frog to tip, at either end of its travel and in the middle: over its neighbours, on the stage, in both styles', async ({ page }, info) => {
  const errors = collectErrors(page);
  // (the phone: 390×844, the narrowest the layout is kept for)
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await startAudio(page);
  // the lineup the bows were first seen cut in: a flute and the quartet
  await page.locator('.ens-toggle').click();
  await page.locator('.pick[aria-label="Flute"]').click();
  await expect.poll(async () => (await ens(page)).frames, { timeout: 8000 }).toBe(5);
  expect((await ens(page)).lineup).toEqual(['flute', 'violin', 'violin', 'viola', 'cello']);
  const stage = (await page.locator('.stage-cv').boundingBox())!;
  const under = (await page.locator('.player').boundingBox())!;
  for (const vector of [false, true]) {
    if (vector) {
      await page.locator('.vec-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-style', 'vector');
    }
    for (const pos of [0, 1, 0.5]) {
      // the bow in the hand on every bowed string (controllers 128 and 129: its speed, m/s, and the
      // string's place along the hair), so each is played at the frog, at the tip and in the middle
      await page.evaluate((pos) => {
        for (const p of (window as any).__orchestra.ensemble.parts) {
          if (!['violin', 'viola', 'cello'].includes(p.voice)) continue;
          p.engine.control(128, 0.25);
          p.engine.control(129, pos);
        }
      }, pos);
      const where = `${vector ? 'vector lines' : 'the stage’s own style'}, the string ${pos * 100} % of the hair from the frog`;
      await expect.poll(async () => (await bowsDrawn(page, vector)).map((b) => Math.round(b.pos * 100)), { message: `${where}: the bows are there`, timeout: 5000 }).toEqual([pos * 100, pos * 100, pos * 100, pos * 100]);
      // (a bow set down on its string comes up to full strength in a few frames. At the ensemble's one
      // scale a violin's bow is a third of the length it was in a cell of its own, its hair 2–3 px wide:
      // where it crosses its own instrument's varnish a few stations blend into the plate; a bow cut at
      // its cell's edge loses an end, which `first` and `last` below catch)
      await expect.poll(async () => Math.min(...(await bowsDrawn(page, vector)).map((b) => b.drawn)), { message: `${where}: the least share of a bow’s length that is drawn`, timeout: 5000 }).toBeGreaterThan(0.85);
      const bows = await bowsDrawn(page, vector);
      expect(bows.map((b) => b.voice)).toEqual(['violin', 'violin', 'viola', 'cello']);
      for (const b of bows) {
        const who = `${where}: ${b.voice} in the cell at ${Math.round(b.cell.x)}, ${Math.round(b.cell.y)}`;
        // drawn out to both its ends
        expect(b.first, `${who}: drawn from the frog`).toBeLessThan(0.07);
        expect(b.last, `${who}: drawn to the tip`).toBeGreaterThan(0.93);
        // and all of it on the stage, clear of the file player above
        for (const [x, y] of [[b.line.fx, b.line.fy], [b.line.tx, b.line.ty]]) {
          expect(x, `${who}: on the stage`).toBeGreaterThan(stage.x + 2);
          expect(x, `${who}: on the stage`).toBeLessThan(stage.x + stage.width - 2);
          expect(y, `${who}: under the player`).toBeGreaterThan(under.y + under.height);
          expect(y, `${who}: on the stage`).toBeLessThan(stage.y + stage.height - 2);
        }
      }
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // the hands let go
  await page.evaluate(() => (window as any).__orchestra.ensemble.parts.forEach((p: any) => p.engine.control(130, 0)));
  await page.locator('.ens-toggle').click();
  expect(errors).toEqual([]);
});

test('orchestra in 2D, the Daylight quintet (two violins, viola, two cellos): every bow its own length at the one scale, clear of the others, the group in the middle of the stage', async ({ page }, info) => {
  const errors = collectErrors(page);
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await startAudio(page);
  await page.locator('.ens-toggle').click();
  await page.locator('.pick[aria-label="Cello"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['violin', 'violin', 'viola', 'cello', 'cello']);
  await expect.poll(async () => (await ens(page)).frames, { timeout: 8000 }).toBe(5);
  await page.locator('.vec-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'vector');
  const stage = (await page.locator('.stage-cv').boundingBox())!;
  const under = (await page.locator('.player').boundingBox())!;
  type Part = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null }; bow: { fx: number; fy: number; tx: number; ty: number; pos: number; hair: number } };
  const ends: Part[][] = [];
  for (const pos of [0, 1]) {
    await page.evaluate((pos) => {
      for (const p of (window as any).__orchestra.ensemble.parts) {
        p.engine.control(128, 0.25);
        p.engine.control(129, pos);
      }
    }, pos);
    await expect.poll(() => page.evaluate(() => ((window as any).__ens2d() as Part[]).map((p) => p.bow?.pos)), { timeout: 5000 }).toEqual([pos, pos, pos, pos, pos]);
    ends.push(await page.evaluate(() => (window as any).__ens2d()));
  }
  for (const parts of ends) {
    // the hair as drawn over its real length: one px/m for all five (a viola's bow as long as a
    // violin's, a cello's 0.6/0.64 of it; in Stephen's shot the viola's was twice a cello's scale)
    const pxm = parts.map((p) => Math.hypot(p.bow.tx - p.bow.fx, p.bow.ty - p.bow.fy) / p.bow.hair);
    for (const [i, p] of parts.entries()) {
      const who = `${p.voice} ${i}, the string ${p.bow.pos * 100} % from the frog`;
      expect(pxm[i] / pxm[3], `${who}: its bow at ${(pxm[i] / pxm[3]).toFixed(2)} × the cello's scale`).toBeGreaterThan(0.95);
      expect(pxm[i] / pxm[3], `${who}: its bow at ${(pxm[i] / pxm[3]).toFixed(2)} × the cello's scale`).toBeLessThan(1.05);
      expect(p.cell.sc).toBe(parts[0].cell.sc);
      // on the stage, under the player, and through no other instrument
      for (const [x, y] of [[p.bow.fx, p.bow.fy], [p.bow.tx, p.bow.ty]]) {
        expect(x, who).toBeGreaterThan(stage.x + 2);
        expect(x, who).toBeLessThan(stage.x + stage.width - 2);
        expect(y, who).toBeGreaterThan(under.y + under.height);
        for (const [j, o] of parts.entries())
          if (j !== i) {
            // the hair's line against the other's box (its line sampled every 2 px)
            const n = Math.ceil(Math.hypot(p.bow.tx - p.bow.fx, p.bow.ty - p.bow.fy) / 2);
            for (let k = 0; k <= n; k++) {
              const [qx, qy] = [p.bow.fx + ((p.bow.tx - p.bow.fx) * k) / n, p.bow.fy + ((p.bow.ty - p.bow.fy) * k) / n];
              expect(qx > o.cell.x && qx < o.cell.x + o.cell.w && qy > o.cell.y && qy < o.cell.y + o.cell.h, `${who}: its bow through ${o.voice} ${j}`).toBe(false);
            }
          }
      }
    }
    // the cellos the larger: their length 2.3 × a violin's
    const len = (c: Part['cell']) => Math.max(c.w, c.h);
    expect(len(parts[3].cell) / len(parts[0].cell)).toBeGreaterThan(2.1);
  }
  // the group (the instruments and their hair at both ends of the bows' travel) in the middle of the
  // stage under the player: either side alike, within the frog's length (its far end is left out here)
  const xs = ends.flat().flatMap((p) => [p.cell.x, p.cell.x + p.cell.w, p.bow.fx, p.bow.tx]);
  const ys = ends.flat().flatMap((p) => [p.cell.y, p.cell.y + p.cell.h, p.bow.fy, p.bow.ty]);
  const [L, R] = [Math.min(...xs) - stage.x, stage.x + stage.width - Math.max(...xs)];
  const [T, B] = [Math.min(...ys) - (under.y + under.height), stage.y + stage.height - Math.max(...ys)];
  expect(Math.abs(L - R), `left ${L.toFixed(0)} px, right ${R.toFixed(0)} px`).toBeLessThan(0.04 * stage.width);
  expect(Math.abs(T - B), `top ${T.toFixed(0)} px, bottom ${B.toFixed(0)} px`).toBeLessThan(0.04 * stage.height);
  await page.evaluate(() => (window as any).__orchestra.ensemble.parts.forEach((p: any) => p.engine.control(130, 0)));
  expect(errors).toEqual([]);
});

test('orchestra seats: each instrument is heard from its seat, the first violin on the left and the cello on the right', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.ens-toggle').click();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  // the seats: the 3D stage's, a computer's wide stage whatever the view
  const seats = await page.evaluate(() => (window as any).__orchestra.ensemble.parts.map((p: any) => p.seat));
  expect(seats[0][0]).toBeLessThan(-0.9);
  expect(seats[3][0]).toBeGreaterThan(0.9);
  // what each engine itself sends: its two channels' levels while it holds a note (the worklet's own
  // output, before the bus)
  const ild = (k: number, midi: number) =>
    page.evaluate(
      async ([k, midi]) => {
        const ctx = (window as any).__piano.ctx as AudioContext;
        const eng = (window as any).__orchestra.ensemble.parts[k].engine;
        const split = ctx.createChannelSplitter(2);
        const an = [ctx.createAnalyser(), ctx.createAnalyser()];
        const sink = ctx.createGain();
        sink.gain.value = 0;
        eng.output.connect(split);
        an.forEach((a, c) => {
          a.fftSize = 2048;
          split.connect(a, c);
          a.connect(sink);
        });
        sink.connect(ctx.destination);
        eng.noteOn(midi, 90);
        const e = [0, 0];
        const b = new Float32Array(2048);
        await new Promise((r) => setTimeout(r, 250));
        for (let i = 0; i < 16; i++) {
          an.forEach((a, c) => {
            a.getFloatTimeDomainData(b);
            e[c] += b.reduce((s, x) => s + x * x, 0);
          });
          await new Promise((r) => setTimeout(r, 40));
        }
        eng.noteOff(midi);
        eng.output.disconnect(split);
        sink.disconnect();
        return 10 * Math.log10((e[0] + 1e-20) / (e[1] + 1e-20));
      },
      [k, midi],
    );
  const first = await ild(0, 67);
  const cello = await ild(3, 48);
  // (each bowed body has its own lean between the microphones: from the middle of the stage these two
  // notes come to −3.75 dB, from their seats +3.89 dB, offline; the worklet's is the seated one)
  expect(first - cello).toBeGreaterThan(2);
  await page.locator('.ens-toggle').click();
  expect(errors).toEqual([]);
});

// ================================================================ orchestra routing, many to many
const routing = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return {
      lineup: e.lineup as string[],
      players: e.parts.map((p: any) => p.player) as number[],
      routes: e.plan.lines.map((rs: any[]) => rs.map((r) => r.part)) as number[][],
      engines: new Set(e.parts.map((p: any) => p.engine).filter(Boolean)).size as number,
    };
  });

test('orchestra routing, many to many: a tune on two instruments, the whole file on a second cello, two grands of their own', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.evaluate(() => (window as any).__orchestra.loadPiece(0));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  // the routing grid: a row per instrument, a column per line (and one for every line)
  if (info.project.name !== 'phone') {
    await page.locator('.pl-route').hover();
    await expect(page.locator('.tip')).toHaveText('routing');
  }
  await page.locator('.pl-route').click();
  const grid = page.locator('.pl-grid');
  await expect(grid).toBeVisible();
  await expect(page.locator('.pl-route')).toHaveAttribute('aria-expanded', 'true');
  await expect(grid.locator('.pg-row:not(.pg-add)')).toHaveCount(4);
  await expect(grid.locator('.pg-cell:not(.pg-all)')).toHaveCount(16);
  await expect(grid.locator('.pg-cell[aria-pressed="true"]:not(.pg-all)')).toHaveCount(4);
  // nothing scrolls sideways, the grid on the screen
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const gb = (await grid.boundingBox())!;
  expect(gb.x).toBeGreaterThanOrEqual(0);
  expect(gb.x + gb.width).toBeLessThanOrEqual(info.project.name === 'phone' ? 412 : 1440);
  // one line on several instruments: a flute (it sits before the strings), the first violin's tune on it too
  await grid.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="flute"]').click();
  await expect.poll(async () => (await routing(page)).lineup).toEqual(['flute', 'violin', 'violin', 'viola', 'cello']);
  await grid.locator('.pg-cell[data-part="0"][data-line="0"]').click();
  await expect(grid.locator('.pg-cell[data-part="0"][data-line="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pl-line').nth(0)).toHaveAttribute('data-voices', 'flute violin');
  await expect(page.locator('.pl-line').nth(0).locator('.pl-more')).toHaveText('+1');
  // both play it: the flute and the first violin hold notes together
  await expect.poll(async () => (await ens(page)).held.slice(0, 2).every((n) => n > 0), { timeout: 8000 }).toBe(true);
  // the same instrument twice: a second cello, its own engine and player, playing the whole file
  await grid.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="cello"]').click();
  await grid.locator('.pg-all[data-part="5"]').click();
  await expect.poll(async () => (await routing(page)).engines, { timeout: 8000 }).toBe(6);
  const r = await routing(page);
  expect(r.lineup).toEqual(['flute', 'violin', 'violin', 'viola', 'cello', 'cello']);
  expect(r.routes).toEqual([[0, 1, 5], [2, 5], [3, 5], [4, 5]]);
  expect(r.players).toEqual([0, 0, 0, 0, 0, 1]);
  await expect(grid.locator('.pg-row[data-part="4"]')).toHaveAttribute('aria-label', /^cello 1/);
  await expect(grid.locator('.pg-row[data-part="5"]')).toHaveAttribute('aria-label', /^cello 2/);
  await expect(page.locator('.pick[aria-label="Cello"] .pick-n')).toHaveText('×2');
  await expect.poll(async () => (await ens(page)).held[5], { timeout: 6000 }).toBeGreaterThan(0);
  if (info.project.name === 'phone') {
    // a phone's stage holds six: the grid offers no seventh
    await expect(grid.locator('.pg-add')).toBeDisabled();
  } else {
    // two grands, each its own engine and seat; eight is the most
    for (let k = 0; k < 2; k++) {
      await grid.locator('.pg-add').click();
      await page.locator('.pl-menu .pl-pick[data-voice="grand"]').click();
    }
    await expect(grid.locator('.pg-add')).toBeDisabled();
    await grid.locator('.pg-all[data-part="6"]').click();
    await grid.locator('.pg-all[data-part="7"]').click();
    await expect.poll(async () => (await ens(page)).frames, { timeout: 10000 }).toBe(8);
    const g = await routing(page);
    expect(g.engines).toBe(8);
    expect(g.lineup.slice(6)).toEqual(['grand', 'grand']);
    expect(g.players.slice(6)).toEqual([0, 1]);
    expect((await ens(page)).kinds.slice(6)).toEqual(['piano', 'piano']);
    // the bus at 1/√n of the instruments that play
    await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.bus.gain.value), { timeout: 2000 }).toBeCloseTo(1 / Math.sqrt(8), 2);
    // in 3D: every seat drawn, both grands' open lids mirror the strings
    await page.keyboard.press('Escape');
    await page.locator('.dim-toggle').click();
    await expect(page.locator('.stage-3d')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__stage3d.stats.mirrors), { timeout: 8000 }).toBe(2);
    // (each mirror is a pass of its own, strings and all: neither draws into a texture it samples)
    expect(await glErrors(page, 10), 'two grands: WebGL errors').toBe(0);
    await page.locator('.dim-toggle').click();
    await page.locator('.pl-route').click();
    // a grand taken off from its row
    await grid.locator('.pg-row[data-part="7"]').click();
    await page.locator('.pl-menu .pl-off').click();
    await expect.poll(async () => (await routing(page)).engines, { timeout: 5000 }).toBe(7);
  }
  // an instrument changed in its seat: the flute becomes a trumpet, the tune with it
  await grid.locator('.pg-row[data-part="0"]').click();
  await page.locator('.pl-menu .pl-pick[data-voice="trumpet"]').click();
  await expect.poll(async () => (await routing(page)).lineup[0]).toBe('trumpet');
  // (the second cello and, on a desktop, the grand play every line)
  const desk = info.project.name !== 'phone';
  await expect(page.locator('.pl-line').nth(0)).toHaveAttribute('data-voices', desk ? 'trumpet violin cello grand' : 'trumpet violin cello');
  // off the stage: the tune stays on its violin (and the second cello, and the grand)
  await grid.locator('.pg-row[data-part="0"]').click();
  await page.locator('.pl-menu .pl-off').click();
  await expect.poll(async () => (await routing(page)).routes[0]).toEqual(desk ? [0, 4, 5] : [0, 4]);
  // Escape closes the grid; the line chip still moves a line, and only that line
  await page.keyboard.press('Escape');
  await expect(grid).toBeHidden();
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra routing: a file on the one instrument shown goes onto several from the routing button', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  // a two-hand piano piece: it plays on the instrument shown, no ensemble
  const rh: [number, ...number[]][] = [];
  for (let i = 0; i < 8; i++) rh.push([0, 0x90, [72, 74, 76, 77][i % 4], 80], [240, 0x80, [72, 74, 76, 77][i % 4], 0]);
  const lh: [number, ...number[]][] = [];
  for (let i = 0; i < 4; i++) lh.push([0, 0x91, 48, 80], [0, 0x91, 52, 80], [0, 0x91, 55, 80], [0, 0x91, 60, 80], [480, 0x81, 48, 0], [0, 0x81, 52, 0], [0, 0x81, 55, 0], [0, 0x81, 60, 0]);
  const file = smf(480, [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]], rh, lh]);
  await page.evaluate((b) => (window as any).__player.load(new Uint8Array(b).buffer), Array.from(file));
  expect((await ens(page)).active).toBe(false);
  await expect(page.locator('.pl-route')).toBeVisible();
  // routing: the ensemble comes on, the instrument shown playing every line
  await page.locator('.pl-route').click();
  await expect(page.locator('.pl-grid')).toBeVisible();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(1);
  const r = await routing(page);
  expect(r.lineup).toEqual(['grand']);
  expect(r.routes).toEqual([[0], [0]]);
  // the whole file on a violin as well
  await page.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="violin"]').click();
  await page.locator('.pg-all[data-part="0"]').click();
  await expect.poll(async () => (await routing(page)).routes, { timeout: 4000 }).toEqual([[0, 1], [0, 1]]);
  expect((await routing(page)).lineup).toEqual(['violin', 'grand']);
  await expect.poll(async () => (await ens(page)).held[0], { timeout: 6000 }).toBeGreaterThan(0);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});


test('the vector display: off by default; the toggle redraws every family in blue and amber with the chrome, is remembered, fits the page, and steps aside in 3D', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const root = page.locator('html');
  const toggle = page.getByRole('button', { name: 'Vector lines' });
  // the stage as it was is the default
  await expect(root).not.toHaveAttribute('data-style', /.+/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  // it closes the picker's row: nothing that was there has moved
  expect(await page.evaluate(() => document.querySelector('.picker-row')!.lastElementChild!.className)).toBe('vec-toggle');
  const ground = () => page.evaluate(() => getComputedStyle(document.querySelector('.stage')!).backgroundColor + ' / ' + getComputedStyle(document.querySelector('.pick-name')!).fontFamily);
  const classic = await ground();
  await toggle.click();
  await expect(root).toHaveAttribute('data-style', 'vector');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await ground()).not.toBe(classic);
  expect(await ground()).toMatch(/^rgb\(0, 0, 0\) \/ "?Hershey/);
  expect(await page.evaluate(() => document.fonts.load('500 12px Hershey').then((f) => f.length))).toBeGreaterThan(0);
  // one instrument of each family, sounding: the instrument's lines are blue, the sound amber, and
  // nothing is filled (most of the stage stays black)
  for (const [id, midi] of [['piano', 60], ['violin', 67], ['flute', 74], ['trumpet', 67]] as const) {
    await page.evaluate(async ([i, m]) => {
      const a = (window as any).__piano;
      await a.setInstrument(i);
      a.noteOn(m, 100, 'keys');
    }, [id, midi] as const);
    await page.waitForTimeout(700);
    const px = await page.evaluate(() => {
      const cv = document.querySelector('.stage-cv') as HTMLCanvasElement;
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      let blue = 0, amber = 0, lit = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
        if (r + g + b > 150) lit++;
        if (b > 150 && b > r + 60) blue++;
        if (r > 180 && g > 90 && r > b + 90) amber++;
      }
      return { blue, amber, lit: lit / (d.length / 4) };
    });
    expect(px.blue, `${id}: blue lines`).toBeGreaterThan(1500);
    expect(px.amber, `${id}: amber sound`).toBeGreaterThan(300);
    expect(px.lit, `${id}: lines, not fills`).toBeLessThan(0.25);
    await page.evaluate((m) => (window as any).__piano.noteOff(m, 'keys'), midi);
  }
  // each knob wears its slot colour
  const slots = await page.evaluate(() => Array.from(document.querySelectorAll('.knob')).map((k) => (k as HTMLElement).style.getPropertyValue('--slot')));
  expect(slots).toEqual(['#5be381', '#ff5d40', '#ff73cf']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'no horizontal scroll').toBeLessThanOrEqual(1);
  // the other pages keep their own look; back on the stage the choice is remembered (and across a reload)
  await page.goto('/#/notes');
  await expect(root).not.toHaveAttribute('data-style', /.+/);
  await page.goto('/#/');
  await expect(root).toHaveAttribute('data-style', 'vector');
  await page.reload();
  await expect(root).toHaveAttribute('data-style', 'vector');
  // 3D is the stage as it was; asking for the vector display from there comes back to 2D
  const dim = page.getByRole('button', { name: '3D view' });
  if (await dim.isVisible()) {
    await dim.click();
    await expect(root).not.toHaveAttribute('data-style', /.+/);
    await expect(page.getByRole('button', { name: 'Vector lines' })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Vector lines' }).click();
    await expect(dim).toHaveAttribute('aria-pressed', 'false');
    await expect(root).toHaveAttribute('data-style', 'vector');
  }
  // the pianos' action close-up follows: a black panel, the section in blue lines, nothing filled
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
  await page.waitForTimeout(400);
  {
    const k = page.locator('.key[data-midi="48"]');
    await k.scrollIntoViewIfNeeded();
    const kb = (await k.boundingBox())!;
    const cv = (await page.locator('.stage-cv').boundingBox())!;
    if (info.project.name === 'phone') await page.touchscreen.tap(kb.x + kb.width / 2, cv.y + cv.height * 0.8);
    else await page.mouse.click(kb.x + kb.width / 2, cv.y + cv.height * 0.8);
    const panel = page.locator('.av-panel');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(300);
    expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 0, 0)');
    const av = await page.evaluate(() => {
      const c = document.querySelector('.av-cv') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let blue = 0, lit = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        if (d[i] + d[i + 1] + d[i + 2] > 150) lit++;
        if (d[i + 2] > 150 && d[i + 2] > d[i] + 60) blue++;
      }
      return { blue, lit: lit / (d.length / 4) };
    });
    expect(av.blue, 'close-up: blue lines').toBeGreaterThan(1500);
    expect(av.lit, 'close-up: lines, not fills').toBeLessThan(0.2);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Vector lines' }).click();
  await expect(root).not.toHaveAttribute('data-style', /.+/);
  expect(await ground()).toBe(classic);
  expect(await page.evaluate(() => localStorage.getItem('piano-model.style'))).toBe('classic');
  expect(errors).toEqual([]);
});
