// Launch-video recorder: the production app in Chrome, its viewport filmed by the browser's own tab
// capture (getDisplayMedia, this tab) and its sound taken inside the audio graph (an AudioWorklet on
// everything the page connects to its AudioContext's destination: every sample, in order). Picture and
// sound are lined up on the page's clock: a time code drawn in the page before and after the take
// places the recording's timeline against performance.now(), and the context's output timestamps
// (which context time is heard at which performance time: what the app itself draws by) place the
// sound on it. Nothing is added to the picture: the time code is shown only outside the part kept.
//
// Untracked helper (artifacts/launch-videos/tools). Needs Google Chrome and ffmpeg.
import { chromium } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = process.env.BASE ?? 'https://instruments-wustep.vercel.app';
/** the app's viewport (CSS px) and the pixels per CSS px it is drawn and filmed at */
export const VIEW = { w: Number(process.env.VW ?? 1440), h: Number(process.env.VH ?? 810), dsf: Number(process.env.DSF ?? 2) };
/** the time code: CELLS squares of CELL CSS px across the top left (two reference squares, white and
 *  black, then BITS bits of performance.now() in ms, lowest first) */
export const CODE = { bits: 24, cell: 12 };

export const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 30 });
export const ffinfo = (...a) => spawnSync('ffmpeg', ['-hide_banner', ...a], { encoding: 'utf8', maxBuffer: 1 << 30 }).stderr;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** a WAV header: 32-bit float, stereo */
export function wavHeader(bytes, sr) {
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
/** least squares y = a + b x; `rms`, `max`: the residuals */
export function line(pts) {
  const n = pts.length;
  const mx = pts.reduce((s, [x]) => s + x, 0) / n;
  const my = pts.reduce((s, [, y]) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of pts) (sxx += (x - mx) ** 2), (sxy += (x - mx) * (y - my));
  const slope = sxx > 0 ? sxy / sxx : 1;
  const at = (x) => my + slope * (x - mx);
  const res = pts.map(([x, y]) => y - at(x));
  return { slope, at, inv: (y) => mx + (y - my) / slope, rms: Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n), max: Math.max(...res.map(Math.abs)) };
}

/** Chrome with the app's page. Headless by default: this machine's screen (1280×720, 603 of it free)
 *  cannot hold the window, and a tab is filmed at no more than the window's own size; headless, with
 *  the device scale factor forced to the one the page is drawn at, the whole viewport is filmed at
 *  view.dsf pixels per CSS px (the GPU is the real one: ANGLE on Metal). */
export async function open({ url, headless = process.env.HEADED !== '1', mute = true, storage = {}, view = VIEW, kiosk = false, half = process.env.HALF === '1' } = {}) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    // (no "controlled by automated test software" bar: it would take its height off the picture)
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--auto-accept-this-tab-capture',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--hide-scrollbars',
      '--window-position=0,0',
      ...(kiosk && !headless ? ['--kiosk'] : []),
      ...(headless ? ['--use-angle=metal', '--enable-gpu', `--force-device-scale-factor=${view.dsf}`, `--window-size=${view.w},${view.h}`] : []),
      ...(process.env.XARGS ? process.env.XARGS.split(' ') : []),
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: view.w, height: view.h }, deviceScaleFactor: view.dsf, acceptDownloads: true, reducedMotion: 'no-preference', colorScheme: 'dark' });
  await ctx.addInitScript(
    ([mute, storage, half]) => {
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      // `half`: the page draws on every other tick of the compositor (30 pictures a second, evenly
      // spaced): a scene that cannot be sure of 60 here is filmed at a rate it always holds
      if (half) {
        const nraf = window.requestAnimationFrame.bind(window);
        const q = new Map();
        let id = 0;
        let n = 0;
        window.requestAnimationFrame = (cb) => {
          q.set(++id, cb);
          return id;
        };
        window.cancelAnimationFrame = (i) => void q.delete(i);
        const pump = (t) => {
          nraf(pump);
          if (++n % 2) return;
          const run = [...q.values()];
          q.clear();
          for (const cb of run) {
            try {
              cb(t);
            } catch (e) {
              console.error(e);
            }
          }
        };
        nraf(pump);
      }
      // whatever the page connects to its AudioContext's destination goes to one node, the tap: the
      // recorder listens there; from it to the destination itself (`mute`: through a gain of 0, so the
      // room the machine is in hears nothing while the context runs on the device's clock as ever)
      const con = AudioNode.prototype.connect;
      const dis = AudioNode.prototype.disconnect;
      window.__recConnect = con;
      const tapOf = (c) => {
        if (!c.__tap) {
          c.__tap = c.createGain();
          c.__out = c.createGain();
          c.__out.gain.value = mute ? 0 : 1;
          con.call(c.__tap, c.__out);
          con.call(c.__out, c.destination);
          (window.__tapCtxs ??= []).push(c);
          window.__tapCtx = c;
        }
        return c.__tap;
      };
      AudioNode.prototype.connect = function (dest, out, inp) {
        if (dest instanceof AudioDestinationNode && typeof OfflineAudioContext !== 'undefined' && !(dest.context instanceof OfflineAudioContext)) {
          con.call(this, tapOf(dest.context), out ?? 0);
          return dest;
        }
        return con.apply(this, arguments);
      };
      AudioNode.prototype.disconnect = function (...a) {
        if (a[0] instanceof AudioDestinationNode && a[0].context.__tap) {
          try {
            return dis.call(this, a[0].context.__tap, ...a.slice(1));
          } catch {
            return undefined;
          }
        }
        return dis.apply(this, a);
      };
    },
    [mute, storage, half],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`console.${m.type()}:`, m.text().slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  if (url) await page.goto(url.startsWith('http') ? url : `${BASE}${url}`, { waitUntil: 'load' });
  // no pointer in the picture, no text caret, no selection
  await page.addStyleTag({ content: '*, *::before, *::after { cursor: none !important; caret-color: transparent !important; } ::selection { background: transparent; }' });
  return { browser, ctx, page, cdp, view };
}

/** the recorder in the page: window.__rec (code/flash, start, stop) */
export async function install(page, view = VIEW) {
  await page.evaluate(
    async ([CODE, view, VEIL]) => {
      if (window.__rec) return;
      // ---- the time code (shown only while asked for)
      const n = CODE.bits + 2;
      const cv = document.createElement('canvas');
      cv.width = n * CODE.cell;
      cv.height = CODE.cell;
      cv.style.cssText = `position:fixed;left:0;top:0;width:${n * CODE.cell}px;height:${CODE.cell}px;z-index:2147483647;pointer-events:none;display:none;image-rendering:pixelated`;
      document.documentElement.append(cv);
      const g = cv.getContext('2d');
      // The tab's capturer follows the part of the page that changes: when another part changes too (a
      // key pressed, the readout's text), it stops for a tenth of a second while it looks again. A
      // veil over the whole viewport that changes every frame, by an amount no pixel shows (an alpha of
      // one or two thousandths of black), keeps the whole viewport the part that changes.
      const veil = document.createElement('div');
      veil.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;will-change:background-color;background:rgba(0,0,0,0.001)';
      if (VEIL) document.documentElement.append(veil);
      let flip = false;
      let codeOn = false;
      const frames = [];
      const outs = [];
      let running = false;
      const tickCode = () => {
        const now = performance.now();
        flip = !flip;
        if (VEIL) veil.style.background = flip ? 'rgba(0,0,0,0.001)' : 'rgba(0,0,0,0.002)';
        if (running) {
          frames.push(now);
          if (frames.length % 6 === 0 && window.__tapCtx) {
            const o = window.__tapCtx.getOutputTimestamp();
            if (o.performanceTime > 0) outs.push([o.contextTime, o.performanceTime, window.__tapCtx.currentTime, now]);
          }
        }
        if (codeOn) {
          const v = Math.round(now) % 2 ** CODE.bits;
          g.fillStyle = '#000';
          g.fillRect(0, 0, cv.width, cv.height);
          g.fillStyle = '#fff';
          g.fillRect(0, 0, CODE.cell, CODE.cell);
          for (let i = 0; i < CODE.bits; i++) if ((v >> i) & 1) g.fillRect((i + 2) * CODE.cell, 0, CODE.cell, CODE.cell);
        }
        requestAnimationFrame(tickCode);
      };
      requestAnimationFrame(tickCode);

      const rec = (window.__rec = {
        frames,
        outs,
        marks: [],
        code(on) {
          codeOn = on;
          cv.style.display = on ? 'block' : 'none';
        },
        mark(name, extra) {
          const c = window.__tapCtx;
          const o = c?.getOutputTimestamp();
          rec.marks.push({ name, perf: performance.now(), ctx: c?.currentTime ?? null, out: o ? [o.contextTime, o.performanceTime] : null, ...extra });
        },
        async start({ fps = 60, bitrate = 60e6, audio = true } = {}) {
          // the picture: this tab, as the browser composites it
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: fps, max: fps }, cursor: 'never', displaySurface: 'browser' },
            audio: false,
            preferCurrentTab: true,
            selfBrowserSurface: 'include',
            surfaceSwitching: 'exclude',
            monitorTypeSurfaces: 'exclude',
          });
          const track = stream.getVideoTracks()[0];
          try {
            track.contentHint = 'detail';
          } catch {}
          rec.track = track;
          // (the capture settles on its size in its first frames: a change of size inside an mp4 breaks it)
          for (let k = 0; k < 40; k++) {
            await new Promise((r) => setTimeout(r, 100));
            const q = track.getSettings();
            if (k >= 12 && q.width === Math.round(view.w * view.dsf) && q.height === Math.round(view.h * view.dsf)) break;
          }
          rec.settings = track.getSettings();
          const mime = ['video/mp4;codecs=avc1.640034', 'video/x-matroska;codecs=avc1.640034', 'video/webm;codecs=h264', 'video/webm;codecs=vp9'].find((m) => MediaRecorder.isTypeSupported(m));
          rec.mime = mime;
          const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
          rec.mr = mr;
          rec.chunks = [];
          mr.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
          mr.onerror = (e) => console.error('MediaRecorder error', e.error?.message ?? e);
          const begun = new Promise((r) => (mr.onstart = () => r(performance.now())));
          // the sound: every sample the context renders into the tap
          if (audio) {
            const c = window.__tapCtx;
            if (!c) throw new Error('no AudioContext has been connected to its destination yet');
            if (!rec.node) {
              const code = `class TapRec extends AudioWorkletProcessor {
                constructor() { super(); this.on = false; this.n = 0; this.L = new Float32Array(48000); this.R = new Float32Array(48000); this.first = -1;
                  this.port.onmessage = (e) => { if (e.data === 'start') { this.on = true; this.first = -1; } else if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage('stopped'); } }; }
                flush() { if (this.n) { this.port.postMessage({ first: this.first, L: this.L.slice(0, this.n), R: this.R.slice(0, this.n) }); this.first += this.n; this.n = 0; } }
                process(inputs) {
                  if (!this.on) return true;
                  if (this.first < 0) this.first = currentFrame;
                  const ch = inputs[0], a = ch[0], b = ch[1] || ch[0], m = a ? a.length : 128;
                  for (let k = 0; k < m; k++) { this.L[this.n] = a ? a[k] : 0; this.R[this.n] = b ? b[k] : 0; this.n++; }
                  if (this.n + 128 > this.L.length) this.flush();
                  return true;
                } }
              registerProcessor('tap-rec', TapRec);`;
              await c.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
              const node = new AudioWorkletNode(c, 'tap-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
              window.__recConnect.call(c.__tap, node);
              // (pulled by the destination; its own output is silence)
              window.__recConnect.call(node, c.destination);
              rec.node = node;
            }
            rec.parts = [];
            rec.stopped = new Promise((r) => {
              rec.node.port.onmessage = (e) => (e.data === 'stopped' ? r() : rec.parts.push(e.data));
            });
            rec.node.port.postMessage('start');
          }
          frames.length = 0;
          outs.length = 0;
          rec.marks.length = 0;
          running = true;
          mr.start(1000);
          rec.recAt = await begun;
          return { mime, settings: rec.settings, recAt: rec.recAt };
        },
        async stop() {
          const mr = rec.mr;
          const done = new Promise((r) => (mr.onstop = r));
          const stopAt = performance.now();
          mr.stop();
          if (rec.node) rec.node.port.postMessage('stop');
          await Promise.all([done, rec.node ? rec.stopped : null]);
          running = false;
          rec.track.stop();
          const save = (blob, name) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
          };
          const video = new Blob(rec.chunks, { type: rec.mime });
          let audio = null;
          if (rec.node) {
            const parts = rec.parts;
            const total = parts.reduce((s, p) => s + p.L.length, 0);
            for (let i = 1; i < parts.length; i++) if (parts[i].first !== parts[i - 1].first + parts[i - 1].L.length) throw new Error('the sound recording skipped');
            const pcm = new Float32Array(2 * total);
            let k = 0;
            for (const p of parts) for (let i = 0; i < p.L.length; i++) (pcm[k++] = p.L[i]), (pcm[k++] = p.R[i]);
            audio = { first: parts[0]?.first ?? 0, frames: total, sr: window.__tapCtx.sampleRate, baseLatency: window.__tapCtx.baseLatency, outputLatency: window.__tapCtx.outputLatency };
            save(new Blob([pcm.buffer], { type: 'application/octet-stream' }), 'raw.f32');
            await new Promise((r) => setTimeout(r, 300));
          }
          save(video, 'raw.video');
          return { mime: rec.mime, settings: rec.settings, recAt: rec.recAt, stopAt, bytes: video.size, audio, frames: [...frames], outs: outs.map((o) => [...o]), marks: rec.marks.map((m) => ({ ...m })), dpr: devicePixelRatio, inner: [innerWidth, innerHeight] };
        },
      });
    },
    [CODE, view, process.env.VEIL !== '0'],
  );
}

/** start filming (a user gesture is what getDisplayMedia asks for: the evaluation is made as one) */
export async function start(t, opts = {}) {
  await install(t.page, t.view);
  const r = await t.cdp.send('Runtime.evaluate', { expression: `window.__rec.start(${JSON.stringify(opts)})`, userGesture: true, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`capture did not start: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

/** the time code shown for `ms` (the recording's timeline is placed by it) */
export async function code(t, ms = 700) {
  await t.page.evaluate(() => window.__rec.code(true));
  await sleep(ms);
  await t.page.evaluate(() => window.__rec.code(false));
}

/** stop filming; the raw picture, the raw sound and what was measured, into `dir` */
export async function stop(t, dir) {
  mkdirSync(dir, { recursive: true });
  const got = [];
  const onDl = (d) => got.push(d);
  t.page.on('download', onDl);
  const rec = await t.page.evaluate(() => window.__rec.stop());
  const want = rec.audio ? 2 : 1;
  for (let k = 0; k < 600 && got.length < want; k++) await sleep(100);
  t.page.off('download', onDl);
  if (got.length < want) throw new Error(`downloads: ${got.length} of ${want}`);
  const ext = rec.mime.includes('mp4') ? 'mp4' : rec.mime.includes('matroska') ? 'mkv' : 'webm';
  for (const d of got) {
    const name = d.suggestedFilename();
    if (name.endsWith('.f32')) {
      const tmp = join(dir, 'raw.f32');
      await d.saveAs(tmp);
      const pcm = readFileSync(tmp);
      writeFileSync(join(dir, 'raw.wav'), Buffer.concat([wavHeader(pcm.length, rec.audio.sr), pcm]));
    } else await d.saveAs(join(dir, `raw.${ext}`));
  }
  rec.video = `raw.${ext}`;
  writeFileSync(join(dir, 'rec.json'), JSON.stringify(rec));
  return rec;
}

/** Read the time code off the recording: for each frame its pts (s) and, where the code shows, the
 *  performance.now() (ms) drawn in it. */
export function readCode(dir, rec, view = VIEW) {
  const raw = join(dir, rec.video);
  const [vw, vh] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', raw], { encoding: 'utf8' }).trim().split(',').map(Number);
  const s = vw / view.w;
  const n = CODE.bits + 2;
  const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', raw], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split(/\s+/)
    .map((t) => parseFloat(t))
    .filter((t) => Number.isFinite(t));
  // each square's middle, one grey value per square
  const cw = Math.round(CODE.cell * s);
  const gray = ff('-i', raw, '-vf', `crop=${n * cw}:${cw}:0:0,crop=iw:${Math.max(2, Math.round(cw / 2))}:0:${Math.round(cw / 4)},scale=${n * 4}:1:flags=area,format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-');
  const nf = Math.min(pts.length, Math.floor(gray.length / (n * 4)));
  const out = [];
  for (let i = 0; i < nf; i++) {
    const px = (k) => (gray[i * n * 4 + k * 4 + 1] + gray[i * n * 4 + k * 4 + 2]) / 2;
    const hi = px(0);
    const lo = px(1);
    let v = null;
    if (hi > 180 && lo < 60) {
      v = 0;
      const th = (hi + lo) / 2;
      for (let b = 0; b < CODE.bits; b++) if (px(b + 2) > th) v += 2 ** b;
    }
    out.push({ pts: pts[i], perf: v });
  }
  return { frames: out, width: vw, height: vh, scale: s };
}

/** the recording's timeline against the page's clock, from the frames whose code was read:
 *  `vOf(perfMs)` → seconds of the recording */
export function timeline(codeFrames) {
  // the first frame showing each drawn value: when that drawing reached the picture
  const seen = new Map();
  for (const f of codeFrames) if (f.perf !== null && !seen.has(f.perf)) seen.set(f.perf, f.pts);
  const pairs = [...seen.entries()].map(([p, v]) => [p, v * 1000]);
  if (pairs.length < 4) throw new Error(`time code read in ${pairs.length} frames only`);
  // (slope fixed at 1 where the code spans too little to measure it)
  const span = Math.max(...pairs.map((p) => p[0])) - Math.min(...pairs.map((p) => p[0]));
  const fit = line(pairs);
  const off = pairs.map(([p, v]) => v - p).sort((a, b) => a - b);
  const med = off[off.length >> 1];
  return { pairs, span, fit, med, vOf: (perf) => (span > 5000 ? fit.at(perf) : perf + med) / 1000 };
}

export function probe(file) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
}
export { join, mkdirSync, readFileSync, writeFileSync, statSync, execFileSync, spawnSync };
