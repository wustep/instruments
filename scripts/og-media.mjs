// The link preview, filmed from the app itself: the og:image (the 3D orchestra under the title) and the
// og:video (the 3D orchestra playing the opening of Beethoven's Fifth, the camera moving through it,
// with the sound the app made while it was filmed). Nothing is drawn but the title: the picture is the
// 3D canvas as the app renders it, the sound every sample the page's AudioContext rendered (tapped
// where the page connects to its destination, recorded in the audio graph by an AudioWorklet).
//   pnpm build && pnpm preview --port 5417 --strictPort &
//   BASE=http://localhost:5417 node scripts/og-media.mjs [image] [video] [encode]
// (`encode`: the clip again from the last recording, without filming)
// Writes apps/web/public/og/instruments.jpg (1200×630) and apps/web/public/og/instruments.mp4
// (1280×720, H.264 + AAC, yuv420p, faststart); the raw recording and stills in .cache/og-media/. Needs
// Chrome and ffmpeg. The camera is set as each frame is drawn, for the song time heard at that moment;
// picture and sound are lined up on the page's clock (see video()), to within a frame.
import { chromium } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE ?? 'http://localhost:5417';
const RAW = join(ROOT, '.cache/og-media');
const OUT = join(ROOT, 'apps/web/public/og');
const what = process.argv.slice(2);
const want = (k) => !what.length || what.includes(k);
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const PIECE = 4; // Beethoven, Symphony No. 5, I (orchestra/pieces.ts)
const TITLE = 'Instruments';
const TAGLINE = 'computed from physics, not samples';
/** the lens's distances are scaled like the stage's own views (stage3d.ts FRAME) */
const FRAME = Math.tan(0.3) / Math.tan((12 * Math.PI) / 180);
/** the still and the video's last shot: the whole orchestra, the title over it */
const WIDE = { target: [-0.35, 1.64, 1.4], yaw: 0, pitch: 0.26, dist: 9.9 };

/** a WAV header: 32-bit float, stereo */
function wavHeader(bytes, sr) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 8, 28);
  h.writeUInt16LE(8, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}
/** least squares y = a + b x through the points; `rms`: the residual */
function line(pts) {
  const n = pts.length;
  const mx = pts.reduce((s, [x]) => s + x, 0) / n;
  const my = pts.reduce((s, [, y]) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of pts) (sxx += (x - mx) ** 2), (sxy += (x - mx) * (y - my));
  const slope = sxy / sxx;
  const at = (x) => my + slope * (x - mx);
  const rms = Math.sqrt(pts.reduce((s, [x, y]) => s + (y - at(x)) ** 2, 0) / n);
  return { slope, at, rms };
}
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 30 });
const font = (p) => `data:font/woff2;base64,${readFileSync(join(ROOT, 'apps/web/node_modules', p)).toString('base64')}`;

/** The title as the site sets its display type: Newsreader italic over IBM Plex Mono (styles.css);
 *  over `bg` (a still), or alone on a transparent page (the video's overlay) */
function titleHtml({ w, h, bg, size, tsize, top }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Newsreader Variable'; font-style: italic; font-weight: 200 800; src: url(${font('@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2')}) format('woff2-variations'); }
@font-face { font-family: 'IBM Plex Mono'; font-weight: 400; src: url(${font('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2')}) format('woff2'); }
html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: ${bg ? '#0e0d0b' : 'transparent'}; }
.bg { position: absolute; inset: 0; width: ${w}px; height: ${h}px; object-fit: cover; filter: brightness(1.12) contrast(1.06) saturate(1.06); }
.shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14,13,11,0.78) 0%, rgba(14,13,11,0.35) 30%, rgba(14,13,11,0) 48%)${bg ? ', radial-gradient(ellipse 90% 85% at 55% 60%, rgba(14,13,11,0) 55%, rgba(14,13,11,0.55) 100%)' : ''}; }
.t { position: absolute; left: 0; right: 0; top: ${top}px; text-align: center; }
h1 { margin: 0; font: italic 400 ${size}px/1 'Newsreader Variable', serif; font-variation-settings: 'opsz' 72; letter-spacing: -0.012em; color: #ece2ce; text-shadow: 0 2px 24px rgba(14,13,11,0.6); }
p { margin: ${Math.round(size * 0.13)}px 0 0; font: 400 ${tsize}px/1.3 'IBM Plex Mono', monospace; color: #c9bfab; letter-spacing: 0.01em; text-shadow: 0 1px 12px rgba(14,13,11,0.8); }
</style></head><body>${bg ? `<img class="bg" src="data:image/png;base64,${readFileSync(bg).toString('base64')}">` : ''}<div class="shade"></div><div class="t"><h1>${TITLE}</h1><p>${TAGLINE}</p></div></body></html>`;
}

async function renderHtml(browser, html, w, h, path, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family));
  if (bad.length) throw new Error(`fonts not loaded: ${bad}`);
  await page.screenshot({ path, omitBackground: transparent });
  await page.close();
}

/** the app with the 3D stage exactly w×h CSS px (the page grown round it), the orchestra loaded and
 *  playing; `tap`: the page's sound also summed into one node (the recording's) */
async function openStage(browser, w, h, tap) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.addInitScript((tap) => {
    localStorage.setItem('piano-model.instrument', 'violin');
    localStorage.setItem('piano-model.3d', '1');
    if (!tap) return;
    // whatever the page connects to its AudioContext's destination is connected to the tap as well
    const con = AudioNode.prototype.connect;
    const dis = AudioNode.prototype.disconnect;
    window.__ogConnect = con;
    AudioNode.prototype.connect = function (dest, out = 0, inp = 0) {
      const r = con.call(this, dest, out, inp);
      if (dest instanceof AudioDestinationNode) {
        const c = dest.context;
        if (!c.__tap) {
          c.__tap = c.createGain();
          window.__tapCtx = c;
        }
        con.call(this, c.__tap, out);
      }
      return r;
    };
    AudioNode.prototype.disconnect = function (...a) {
      const r = dis.apply(this, a);
      if (a[0] instanceof AudioDestinationNode && a[0].context.__tap) {
        try {
          dis.call(this, a[0].context.__tap);
        } catch {
          /* (not connected) */
        }
      }
      return r;
    };
  }, tap);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  await page.waitForFunction(() => document.querySelector('.stage-3d'));
  for (let k = 0; k < 4; k++) {
    const [ch, ih] = await page.evaluate(() => [document.querySelector('.stage-3d').getBoundingClientRect().height, innerHeight]);
    if (Math.abs(ch - h) < 0.5) break;
    await page.setViewportSize({ width: w, height: Math.round(ih + (h - ch)) });
    await page.waitForTimeout(300);
  }
  const box = await page.evaluate(() => {
    const r = document.querySelector('.stage-3d').getBoundingClientRect();
    return [r.width, r.height];
  });
  if (Math.abs(box[0] - w) > 0.5 || Math.abs(box[1] - h) > 0.5) throw new Error(`stage is ${box}, not ${w}×${h}`);
  // (the file player and the knobs lie over the canvas: not in the picture)
  await page.addStyleTag({ content: '.player, .stage-knob { visibility: hidden !important; }' });
  await page.evaluate(async (i) => {
    await window.__orchestra.loadPiece(i);
  }, PIECE);
  await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 5);
  return { ctx, page };
}

const setView = (page, v) =>
  page.evaluate(([v, F]) => window.__stage3d.setView({ target: v.target, yaw: v.yaw, pitch: v.pitch, dist: v.dist / F }), [v, FRAME]);

// ---------------------------------------------------------------- the image
async function image(browser) {
  const W = 1200;
  const H = 630;
  const { ctx, page } = await openStage(browser, W, H, false);
  // (into the first tutti: every section has played, the bows are on the string)
  await page.waitForTimeout(10500);
  await setView(page, WIDE);
  await page.waitForTimeout(250);
  const still = join(RAW, 'still.png');
  await page.locator('.stage-3d').screenshot({ path: still });
  await ctx.close();
  const card = join(RAW, 'card@2x.png');
  await renderHtml(browser, titleHtml({ w: W, h: H, bg: still, size: 112, tsize: 27, top: 30 }), W, H, card);
  const jpg = join(OUT, 'instruments.jpg');
  ff('-i', card, '-vf', `scale=${W}:${H}:flags=lanczos,format=yuvj444p`, '-q:v', '2', jpg);
  console.log(`image: ${jpg} (${(statSync(jpg).size / 1024).toFixed(0)} KB)`);
}

// ---------------------------------------------------------------- the video
/** the camera, keyed to the song's time (s): close on the first violins for the motto, along the
 *  strings (violas, cellos, basses) through the quiet theme, then back and up to the whole orchestra
 *  for the tutti, where it rests under the title */
const KEYS = [
  { t: -0.05, target: [-0.95, 0.95, -0.22], yaw: -0.38, pitch: 0.12, dist: 2.15 },
  { t: 3.0, target: [-0.5, 0.95, -0.1], yaw: -0.1, pitch: 0.12, dist: 2.6 },
  { t: 6.5, target: [0.5, 0.92, 0.0], yaw: 0.1, pitch: 0.14, dist: 3.0 },
  { t: 9.6, target: [1.3, 1.0, 0.2], yaw: 0.06, pitch: 0.13, dist: 3.9 },
  { t: 12.6, ...WIDE, dist: 10.8 },
  { t: 15.5, ...WIDE, yaw: 0.015, dist: 10.2 },
];
/** the clip: from PRE s before the first note to END s of the song; the title from TITLE_AT */
const PRE = 0.1;
const END = 13.7;
const TITLE_AT = 11.9;

async function video(browser) {
  const W = 1280;
  const H = 720;
  const { ctx, page } = await openStage(browser, W, H, true);
  // every engine and mesh built, then the piece stopped and its sound let die away
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__player.stop());
  await page.waitForTimeout(3500);
  const first = await page.evaluate(() => window.__player.events.find((e) => e.kind === 'on').t);
  // The sound is recorded inside the audio graph, every sample the context renders, in order (an
  // AudioWorklet on the tap): a MediaStreamAudioDestinationNode's track, recorded by MediaRecorder in
  // headless Chrome, came out about a tenth short — samples dropped while the context itself kept
  // exact time. The picture is the canvas's own stream, recorded by MediaRecorder. The two are put
  // together by the page's clock: a cut in the picture at a known performance.now() places the video's
  // timeline, and the context's output timestamps (getOutputTimestamp(): which context time is heard at
  // which performance time) place the sound on it. (Checked on the grand's keys, staccato: a key is
  // seen 5–15 ms after it is played and heard 18–23 ms after, as in the page itself.)
  await page.evaluate(async () => {
    const c = window.__tapCtx;
    const code = `class OgRec extends AudioWorkletProcessor {
      constructor() { super(); this.on = false; this.n = 0; this.L = new Float32Array(16384); this.R = new Float32Array(16384); this.first = -1;
        this.port.onmessage = (e) => { if (e.data === 'start') this.on = true; else if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage('stopped'); } }; }
      flush() { if (this.n) { this.port.postMessage({ first: this.first, L: this.L.slice(0, this.n), R: this.R.slice(0, this.n) }); this.first += this.n; this.n = 0; } }
      process(inputs) {
        if (!this.on) return true;
        if (this.first < 0) this.first = currentFrame;
        const ch = inputs[0], a = ch[0], b = ch[1] || ch[0], m = a ? a.length : 128;
        for (let k = 0; k < m; k++) { this.L[this.n] = a ? a[k] : 0; this.R[this.n] = b ? b[k] : 0; this.n++; }
        if (this.n + 128 > this.L.length) this.flush();
        return true;
      } }
    registerProcessor('og-rec', OgRec);`;
    await c.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    const node = new AudioWorkletNode(c, 'og-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    window.__ogConnect.call(c.__tap, node);
    // (pulled by the destination; its output is silence)
    window.__ogConnect.call(node, c.destination);
    window.__ogRec = node;
  });
  const download = page.waitForEvent('download', { timeout: 120000 });
  const rec = await page.evaluate(
    async ([KEYS, F, until]) => {
      // monotone cubic (Fritsch–Carlson) through each quantity: no overshoot between keys; at rest at
      // the first and the last
      const ch = (ys, ts) => {
        const n = ys.length;
        const d = ys.slice(1).map((y, i) => (ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i]));
        const m = ys.map((_, i) => (i === 0 || i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
        return (t) => {
          if (t <= ts[0]) return ys[0];
          if (t >= ts[n - 1]) return ys[n - 1];
          let i = 0;
          while (t > ts[i + 1]) i++;
          const h = ts[i + 1] - ts[i];
          const s = (t - ts[i]) / h;
          return (2 * s ** 3 - 3 * s ** 2 + 1) * ys[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * ys[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
        };
      };
      const ts = KEYS.map((k) => k.t);
      const f = {
        x: ch(KEYS.map((k) => k.target[0]), ts),
        y: ch(KEYS.map((k) => k.target[1]), ts),
        z: ch(KEYS.map((k) => k.target[2]), ts),
        yaw: ch(KEYS.map((k) => k.yaw), ts),
        pitch: ch(KEYS.map((k) => k.pitch), ts),
        ld: ch(KEYS.map((k) => Math.log(k.dist)), ts),
      };
      const s3 = window.__stage3d;
      const pl = window.__player;
      const ac = window.__tapCtx;
      const node = window.__ogRec;
      const at = (t) => s3.setView({ target: [f.x(t), f.y(t), f.z(t)], yaw: f.yaw(t), pitch: f.pitch(t), dist: Math.exp(f.ld(t)) / F });
      at(KEYS[0].t);
      await new Promise((r) => setTimeout(r, 400));
      // the sound
      const parts = [];
      const stopped = new Promise((r) => {
        node.port.onmessage = (e) => (e.data === 'stopped' ? r() : parts.push(e.data));
      });
      node.port.postMessage('start');
      // the picture
      const cv = document.querySelector('.stage-3d');
      const mime = ['video/webm;codecs=h264', 'video/webm;codecs=vp9'].find((m) => MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(new MediaStream(cv.captureStream(60).getVideoTracks()), { mimeType: mime, videoBitsPerSecond: 40e6 });
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      let recAt = 0;
      const begun = new Promise((r) => (mr.onstart = () => r((recAt = performance.now()))));
      mr.start(1000);
      await begun;
      // the clocks side by side (context time heard at performance time), all through
      const outs = [];
      let frames = 0;
      // the camera is set as each frame is drawn (inside the stage's own frame()), for the song time
      // heard at that moment: a frame's picture and its time agree, whatever the frame rate does.
      // Before the song is under way it waits at the first key. First, a mark on the recording's
      // timeline: the camera turned away, then cut back at a known moment (MediaRecorder's timeline
      // begins some tens of ms before its start event; the cut, found in the picture, fixes it)
      let heard0 = null;
      let cutAt = 0;
      const cutWhen = performance.now() + 450;
      const draw = s3.frame;
      s3.frame = function (...a) {
        frames++;
        const now = performance.now();
        const o = ac.getOutputTimestamp();
        if (o.performanceTime > 0) outs.push([o.contextTime, o.performanceTime]);
        if (!cutAt && now >= cutWhen) cutAt = now;
        if (!cutAt) s3.setView({ target: KEYS[0].target, yaw: KEYS[0].yaw + 1.2, pitch: KEYS[0].pitch, dist: KEYS[0].dist / F });
        else at(heard0 === null ? KEYS[0].t : Math.max(KEYS[0].t, (now - heard0) / 1000));
        return draw.apply(this, a);
      };
      await new Promise((r) => setTimeout(r, 1000));
      await pl.play();
      // (when the song's time 0 will be heard: from the latest output timestamp)
      const o = ac.getOutputTimestamp();
      heard0 = o.performanceTime + (pl.t0 - pl.pos0 - o.contextTime) * 1000;
      while (ac.currentTime - pl.t0 < until) await new Promise((r) => setTimeout(r, 50));
      const secs = (performance.now() - recAt) / 1000;
      const done = new Promise((r) => (mr.onstop = r));
      mr.stop();
      node.port.postMessage('stop');
      await Promise.all([done, stopped]);
      s3.frame = draw;
      const blob = new Blob(chunks, { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'raw.webm';
      a.click();
      // the sound, contiguous: first frame, then interleaved stereo as base64 float32
      const n = parts.reduce((s, p) => s + p.L.length, 0);
      for (let i = 1; i < parts.length; i++) if (parts[i].first !== parts[i - 1].first + parts[i - 1].L.length) throw new Error('the recording skipped');
      const pcm = new Float32Array(2 * n);
      let k = 0;
      for (const p of parts) for (let i = 0; i < p.L.length; i++) (pcm[k++] = p.L[i]), (pcm[k++] = p.R[i]);
      const bytes = new Uint8Array(pcm.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { mime, frames, secs, bytes: blob.size, w: cv.width, h: cv.height, sr: ac.sampleRate, first: parts[0].first, pcm: btoa(bin), outs, recAt, cutAt, t0: pl.t0 - pl.pos0 };
    },
    [KEYS, FRAME, END + 1.2],
  );
  const raw = join(RAW, 'raw.webm');
  await (await download).saveAs(raw);
  await ctx.close();
  console.log(`recorded ${rec.mime} ${rec.w}×${rec.h}, ${rec.frames} frames in ${rec.secs.toFixed(1)} s (${(rec.frames / rec.secs).toFixed(1)} fps), ${(rec.bytes / 1e6).toFixed(1)} MB`);
  const pcm = Buffer.from(rec.pcm, 'base64');
  const SR = rec.sr;
  const wav = join(RAW, 'raw.wav');
  writeFileSync(wav, Buffer.concat([wavHeader(pcm.length, SR), pcm]));
  console.log(`sound: ${(pcm.length / 8 / SR).toFixed(2)} s at ${SR} Hz from context frame ${rec.first}, contiguous`);
  writeFileSync(join(RAW, 'rec.json'), JSON.stringify({ ...rec, pcm: undefined, firstNote: first }));
}

/** the clip, cut from the recording (raw.webm, raw.wav, rec.json) and encoded */
async function encode(browser) {
  const W = 1280;
  const H = 720;
  const rec = JSON.parse(readFileSync(join(RAW, 'rec.json'), 'utf8'));
  const first = rec.firstNote;
  const raw = join(RAW, 'raw.webm');
  const wav = join(RAW, 'raw.wav');
  const SR = rec.sr;
  // performance time at which a context time is heard (a line through the output timestamps: the
  // clocks run together, so its slope is 1 to within a few parts in ten thousand)
  const fit = line(rec.outs.map(([c, p]) => [c, p]));
  console.log(`clocks: ${rec.outs.length} pairs, ${(fit.slope / 1000).toFixed(5)} s/s, residual ${fit.rms.toFixed(2)} ms`);
  const heard = (c) => fit.at(c);
  // the clip, in context time: from PRE s before the first note to END s of the song
  const c0 = rec.t0 + first - PRE;
  const dur = PRE + END - first;
  // the sound from c0 (its first sample is context frame rec.first)
  const a0 = c0 - rec.first / SR;
  // the picture from the moment c0 was heard: the recording's timeline placed by the cut (the
  // biggest change between frames within 0.25 s of where its start event puts it)
  const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', raw], { encoding: 'utf8' })
    .split(/\s+/)
    .map((t) => parseFloat(t))
    .filter((t) => Number.isFinite(t));
  const gray = ff('-i', raw, '-t', '2', '-vf', 'scale=160:90,format=gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-');
  const nf = Math.min(pts.length, Math.floor(gray.length / (160 * 90)));
  const guess = (rec.cutAt - rec.recAt) / 1000;
  let mark = -1;
  let big = 0;
  for (let i = 1; i < nf; i++) {
    if (Math.abs(pts[i] - guess) > 0.25) continue;
    let s = 0;
    for (let k = 0; k < 160 * 90; k++) s += Math.abs(gray[i * 14400 + k] - gray[(i - 1) * 14400 + k]);
    if (s / 14400 > big) (big = s / 14400), (mark = i);
  }
  if (mark < 0 || big < 8) throw new Error(`the cut was not found (${big.toFixed(1)})`);
  const vAt = (p) => pts[mark] + (p - rec.cutAt) / 1000;
  console.log(`cut: drawn ${(guess * 1000).toFixed(0)} ms after the recorder's start event, seen at ${pts[mark].toFixed(3)} s (its timeline begins ${((pts[mark] - guess) * 1000).toFixed(0)} ms earlier; change ${big.toFixed(1)})`);
  const v0 = vAt(heard(c0));
  console.log(`clip: ${dur.toFixed(2)} s; sound from ${a0.toFixed(3)} s, picture from ${v0.toFixed(3)} s of their recordings`);
  if (a0 < 0 || v0 < 0) throw new Error('the clip starts before the recording');
  const start = v0;

  // the title, over the last shot
  const overlay = join(RAW, 'title@2x.png');
  await renderHtml(browser, titleHtml({ w: W, h: H, bg: null, size: 104, tsize: 26, top: 40 }), W, H, overlay, true);

  // the sound as recorded, its peak brought to −1.5 dBFS (under −1 dBTP once in AAC; one gain for the
  // whole clip: the music's own dynamics kept), a short fade in and a fade out over the last 0.7 s
  const cut = join(RAW, 'cut.wav');
  ff('-i', wav, '-af', `atrim=start=${a0.toFixed(5)}:duration=${dur.toFixed(5)},asetpts=PTS-STARTPTS`, '-c:a', 'pcm_f32le', cut);
  const vol = spawnSync('ffmpeg', ['-v', 'info', '-i', cut, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m = /max_volume: (-?[\d.]+) dB/.exec(vol);
  if (!m) throw new Error('no peak measured');
  const peak = Number(m[1]);
  const gain = -1.5 - peak;
  console.log(`audio peak ${peak} dBFS: gain ${gain.toFixed(1)} dB`);
  const mp4 = join(OUT, 'instruments.mp4');
  const vf = [
    `[0:v]trim=start=${start.toFixed(3)}:duration=${dur.toFixed(3)},setpts=PTS-STARTPTS,framerate=fps=30:interp_start=0:interp_end=255:scene=100,scale=${W}:${H}:flags=lanczos:in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709[v]`,
    `[1:v]scale=${W}:${H}:flags=lanczos,format=rgba,fade=in:st=${(TITLE_AT - first + PRE).toFixed(2)}:d=0.9:alpha=1[t]`,
    `[v][t]overlay=0:0:shortest=1,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709[out]`,
  ].join(';');
  const af = `volume=${gain.toFixed(2)}dB,afade=in:st=0:d=0.03,afade=out:st=${(dur - 0.7).toFixed(2)}:d=0.7`;
  const x264 = ['-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'film', '-profile:v', 'high', '-level', '4.0', '-b:v', '2300k', '-maxrate', '3500k', '-bufsize', '5000k', '-g', '60', '-r', '30', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-passlogfile', join(RAW, 'x264')];
  const enc = (pass) =>
    pass === 1
      ? ['-i', raw, '-loop', '1', '-t', dur.toFixed(3), '-i', overlay, '-filter_complex', vf, '-map', '[out]', ...x264, '-pass', '1', '-an', '-f', 'null', '/dev/null']
      : ['-i', raw, '-loop', '1', '-t', dur.toFixed(3), '-i', overlay, '-i', cut, '-filter_complex', vf, '-map', '[out]', '-map', '2:a', '-af', af, ...x264, '-pass', '2', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', '-t', dur.toFixed(3), mp4];
  ff(...enc(1));
  ff(...enc(2));
  console.log(`video: ${mp4} (${(statSync(mp4).size / 1e6).toFixed(2)} MB)`);
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
try {
  if (want('image')) await image(browser);
  if (want('video')) await video(browser);
  if (want('video') || want('encode')) await encode(browser);
} finally {
  await browser.close();
}
writeFileSync(join(RAW, 'done'), new Date().toISOString());
