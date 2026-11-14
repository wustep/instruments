// A take: the page set up, filmed with its time code before and after, and cut to a clip.
//   take({ name, url, prepare, perform })   → raw picture + raw sound + rec.json in RAW/<name>/
//   encode(name, out, { from, to, ... })    → the clip (1920×1080, 60 fps, H.264 + AAC, faststart)
// Untracked helper (artifacts/launch-videos/tools).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { renameSync } from 'node:fs';
import { open, start, stop, code, readCode, timeline, line, sleep, join, mkdirSync, readFileSync, writeFileSync, wavHeader, ffinfo, VIEW, probe } from './rec.mjs';

/** where the raw recordings go (large: about half a gigabyte a take) */
export const RAW = process.env.RAW ?? '/tmp/instruments-videos/raw';
export const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
export { sleep, join };

/** In the page: window.__lv, the take's conductor. Song positions are the file player's (seconds);
 *  `heard`: the position being heard now; `sched`: the position the context has rendered to (the
 *  player schedules 0.2 s past it). Cues fire inside the frame loop, so what one changes is in the
 *  very next picture. The camera, if set, is placed as each 3D frame is drawn. */
export async function conductor(page) {
  await page.evaluate(() => {
    if (window.__lv) return;
    const P = () => window.__player;
    const A = () => window.__piano;
    const lv = (window.__lv = {
      log: [],
      cues: [],
      cam: null,
      heard: () => (P().playing ? P().pos0 + (A().audibleTime() - P().t0) : P().pos),
      sched: () => (P().playing ? P().pos0 + (A().ctx.currentTime - P().t0) : P().pos),
      /** the performance time (ms) at which a song position is heard, as the clocks stand now */
      heardAt(pos) {
        const o = A().ctx.getOutputTimestamp();
        return o.performanceTime + (P().t0 + (pos - P().pos0) - o.contextTime) * 1000;
      },
      note(name, extra) {
        const o = A().ctx?.getOutputTimestamp();
        lv.log.push({ name, perf: performance.now(), heard: lv.heard(), sched: lv.sched(), t0: P().t0, pos0: P().pos0, ctx: A().ctx?.currentTime ?? null, out: o ? [o.contextTime, o.performanceTime] : null, ...extra });
      },
      /** cues: { at, clock: 'heard' | 'sched' | 'perf', name, run } (run: a function's source) */
      set(cues) {
        lv.cues = cues.map((c) => ({ ...c, fn: new Function('lv', c.run), done: false }));
      },
      pending: () => lv.cues.filter((c) => !c.done).length,
      /** the readout and the parts' strip as a page that has not played yet has them (after a warm-up) */
      blank() {
        for (const q of ['.r-note', '.r-hz']) for (const e of document.querySelectorAll(q)) e.textContent = '';
        for (const e of document.querySelectorAll('.part-notes')) e.textContent = '';
      },
      frames: (n = 2) => new Promise((r) => {
        const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
      /**
       * A view of the 3D stage from a bearing (yaw, pitch) that holds everything drawn: the box of
       * every vertex, as wide as `fillW` of the stage or as high as `fillH` of what is free under the
       * file player (whichever comes first), in the middle of that. Found on the stage itself (its
       * `box()`), a few steps of Newton. Distances in metres (setView takes them over the lens's scale F).
       */
      async fit(yaw, pitch, { fillW = 0.9, fillH = 0.9, F, shiftX = 0, shiftY = 0 } = {}) {
        const s3 = window.__stage3d;
        const cam = lv.cam;
        lv.cam = null;
        const cv = s3.el;
        const W = cv.clientWidth;
        const H = cv.clientHeight;
        const pl = document.querySelector('.player');
        const top = pl && !pl.hidden ? Math.max(0, pl.getBoundingClientRect().bottom - cv.getBoundingClientRect().top) + 6 : 0;
        const free = H - top - 6;
        const home = s3.home;
        let target = [...home.target];
        let dist = home.dist;
        const r = [-Math.cos(yaw), 0, -Math.sin(yaw)];
        const see = async (t, d) => {
          s3.setView({ target: t, yaw, pitch, dist: d / F });
          await lv.frames(3);
          const b = s3.box();
          return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0, b };
        };
        const wantX = W / 2 + shiftX * W;
        const wantY = top + free / 2 + shiftY * free;
        let m = await see(target, dist);
        for (let k = 0; k < 7; k++) {
          dist *= Math.max(m.w / (fillW * W), m.h / (fillH * free));
          m = await see(target, dist);
          const e = 0.25;
          const mx = await see([target[0] + r[0] * e, target[1], target[2] + r[2] * e], dist);
          const my = await see([target[0], target[1] + e, target[2]], dist);
          const gx = (mx.cx - m.cx) / e;
          const gy = (my.cy - m.cy) / e;
          const sx = Math.abs(gx) > 1 ? (wantX - m.cx) / gx : 0;
          const sy = Math.abs(gy) > 1 ? (wantY - m.cy) / gy : 0;
          target = [target[0] + r[0] * sx, target[1] + sy, target[2] + r[2] * sx];
          m = await see(target, dist);
        }
        lv.cam = cam;
        return { target, yaw, pitch, dist, box: m.b, stage: [W, H, top] };
      },
      /** a path through camera keys ({ target, yaw, pitch, dist }, metres): e 0 … 1 along them, each
       *  quantity on a monotone cubic (no overshoot between keys); the view setView takes */
      path(keys, F) {
        const n = keys.length;
        const ts = keys.map((_, i) => i / (n - 1));
        const ch = (ys) => {
          const d = ys.slice(1).map((y, i) => (ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i]));
          const mm = ys.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
          return (t) => {
            if (t <= 0) return ys[0];
            if (t >= 1) return ys[n - 1];
            let i = 0;
            while (t > ts[i + 1]) i++;
            const h = ts[i + 1] - ts[i];
            const q = (t - ts[i]) / h;
            return (2 * q ** 3 - 3 * q ** 2 + 1) * ys[i] + (q ** 3 - 2 * q ** 2 + q) * h * mm[i] + (-2 * q ** 3 + 3 * q ** 2) * ys[i + 1] + (q ** 3 - q ** 2) * h * mm[i + 1];
          };
        };
        const f = { x: ch(keys.map((k) => k.target[0])), y: ch(keys.map((k) => k.target[1])), z: ch(keys.map((k) => k.target[2])), yaw: ch(keys.map((k) => k.yaw)), pitch: ch(keys.map((k) => k.pitch)), ld: ch(keys.map((k) => Math.log(k.dist))) };
        return (e) => ({ target: [f.x(e), f.y(e), f.z(e)], yaw: f.yaw(e), pitch: f.pitch(e), dist: Math.exp(f.ld(e)) / F });
      },
    });
    const tick = () => {
      if (lv.cues.length) {
        const h = lv.heard();
        const s = lv.sched();
        const now = performance.now();
        for (const c of lv.cues) {
          if (c.done) continue;
          const t = c.clock === 'sched' ? s : c.clock === 'perf' ? now : h;
          if (t < c.at) continue;
          c.done = true;
          try {
            c.fn(lv);
          } catch (e) {
            console.error(`cue ${c.name}: ${e.message}`);
          }
          lv.note(`cue:${c.name}`, { at: c.at, clock: c.clock ?? 'heard' });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // the camera: set inside the 3D stage's own frame (whichever stage is showing)
    let wrapped = null;
    const wrap = () => {
      const s3 = window.__stage3d;
      if (s3 && s3 !== wrapped && !s3.__lvWrapped) {
        const draw = s3.frame;
        s3.frame = function (...a) {
          if (lv.cam) {
            try {
              const v = lv.cam(lv.heard(), performance.now(), s3);
              if (v) s3.setView(v);
            } catch (e) {
              console.error(`camera: ${e.message}`);
              lv.cam = null;
            }
          }
          return draw.apply(this, a);
        };
        s3.__lvWrapped = true;
        wrapped = s3;
      }
    };
    setInterval(wrap, 50);
    wrap();
  });
}

/** film a take */
export async function take({ name, url, storage, prepare, perform, tail = 400, half = false }) {
  const dir = join(RAW, name);
  mkdirSync(dir, { recursive: true });
  const t = await open({ url, storage, half });
  try {
    await sleep(1500);
    await conductor(t.page);
    await prepare(t);
    const st = await start(t, { fps: 60, bitrate: Number(process.env.BITRATE ?? 80e6) });
    console.log(`[${name}] filming ${st.settings.width}×${st.settings.height} ${st.mime}`);
    await code(t, 900);
    await sleep(500);
    const info = (await perform(t)) ?? {};
    await sleep(tail);
    await code(t, 900);
    await sleep(150);
    const log = await t.page.evaluate(() => window.__lv.log);
    const stats = await t.page.evaluate(() => (window.__stage3d ? { ...window.__stage3d.stats } : null));
    const rec = await stop(t, dir);
    writeFileSync(join(dir, 'take.json'), JSON.stringify({ name, url, info, log, stats, half, view: t.view }, null, 1));
    const raf = rec.frames;
    const d = raf.slice(1).map((x, i) => x - raf[i]).sort((a, b) => a - b);
    console.log(`[${name}] page: ${raf.length} frames in ${((raf[raf.length - 1] - raf[0]) / 1000).toFixed(1)} s, frame time median ${d[d.length >> 1].toFixed(1)} ms, p99 ${d[Math.floor(d.length * 0.99)].toFixed(1)} ms, max ${d[d.length - 1].toFixed(0)} ms; over 25 ms: ${d.filter((x) => x > 25).length}; 3D ${stats ? `${stats.ms.toFixed(1)} ms ao=${stats.ao} lite=${stats.lite} shadows=${stats.shadows}` : 'off'}`);
    return { dir, rec, info, log };
  } finally {
    await t.browser.close();
  }
}

/** what a take's recording says about itself: the timeline, the clocks, frames lost */
export function measure(name) {
  const dir = join(RAW, name);
  const rec = JSON.parse(readFileSync(join(dir, 'rec.json'), 'utf8'));
  const tk = JSON.parse(readFileSync(join(dir, 'take.json'), 'utf8'));
  const cr = readCode(dir, rec);
  const tl = timeline(cr.frames);
  const clocks = line(rec.outs.map(([c, p]) => [c * 1000, p]));
  /** performance time (ms) at which context time c (s) is heard, and back */
  const heardPerf = (c) => clocks.at(c * 1000);
  const ctxHeardAt = (perf) => clocks.inv(perf) / 1000;
  return { dir, rec, tk, frames: cr.frames, width: cr.width, height: cr.height, tl, clocks, heardPerf, ctxHeardAt };
}

/**
 * Cut a clip from a take. `from`, `to`: performance times (ms) on the page's clock. The picture is the
 * frames filmed between them, each put in the 60 fps slot nearest its own time (a frame is repeated or
 * left out only where the page itself ran more than three quarters of a frame off the grid); the
 * sound is the samples heard between them, one gain for the whole clip (its peak brought to `peak`
 * dBFS), faded in over `fadeIn` s and out over `fadeOut` s.
 */
export async function encode(name, out, { from, to, fadeIn = 0.01, fadeOut = 0.8, peak = -1.5, fps = 60, crf = 16, w = 1920, h = 1080, audioDelay = 0 }) {
  const m = measure(name);
  const { dir, rec, frames, tl, clocks } = m;
  console.log(`[${name}] timeline: ${tl.pairs.length} code frames over ${(tl.span / 1000).toFixed(1)} s, slope ${tl.fit.slope.toFixed(6)}, residual rms ${tl.fit.rms.toFixed(2)} ms max ${tl.fit.max.toFixed(1)} ms; clocks: ${rec.outs.length} pairs, slope ${clocks.slope.toFixed(6)}, residual rms ${clocks.rms.toFixed(2)} ms max ${clocks.max.toFixed(2)} ms`);
  if (tl.span < 5000) throw new Error('the time code was read at one end only');
  if (tl.fit.max > 25 || clocks.max > 8) throw new Error('the clocks do not hold: retake');
  const v0 = tl.vOf(from);
  const v1 = tl.vOf(to);
  const dur = v1 - v0;
  const n = Math.round(dur * fps);
  // ---- the picture: which filmed frame goes in each slot
  const pts = frames.map((f) => f.pts);
  let cur = pts.findIndex((p) => p >= v0 - 0.5 / fps);
  if (cur < 0) throw new Error('the clip starts after the recording');
  const pick = [cur];
  let dup = 0;
  let skip = 0;
  for (let k = 1; k < n; k++) {
    const T = v0 + k / fps;
    let next = cur + 1;
    if (next >= pts.length) next = cur;
    else if (pts[next] - T > 0.75 / fps) {
      next = cur;
      dup++;
    } else {
      while (next + 1 < pts.length && T - pts[next] > 0.75 / fps) {
        next++;
        skip++;
      }
    }
    pick.push((cur = next));
  }
  const codeIn = pick.filter((i) => frames[i].perf !== null).length;
  if (codeIn) throw new Error(`${codeIn} frames of the clip show the time code`);
  console.log(`[${name}] clip: ${dur.toFixed(3)} s, ${n} frames from the recording's ${v0.toFixed(3)} s; repeated ${dup}, left out ${skip}`);
  // ---- the sound: the samples heard from `from` to `to`
  const sr = rec.audio.sr;
  const wav = readFileSync(join(dir, 'raw.wav'));
  const pcm = new Float32Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) / 4);
  // (`audioDelay` ms: the sound that much later against the picture than the clocks put it. A page drawn
  // 30 times a second shows a note a frame or two after it is heard; measured on the clips, sync.py)
  const s0 = Math.round((m.ctxHeardAt(from) - audioDelay / 1000) * sr) - rec.audio.first;
  const ns = Math.round((n / fps) * sr);
  if (s0 < 0 || s0 + ns > pcm.length / 2) throw new Error('the clip runs outside the sound recorded');
  const cut = new Float32Array(ns * 2);
  cut.set(pcm.subarray(s0 * 2, (s0 + ns) * 2));
  let pk = 0;
  let sq = 0;
  for (let i = 0; i < cut.length; i++) {
    pk = Math.max(pk, Math.abs(cut[i]));
    sq += cut[i] * cut[i];
  }
  const rawPeak = 20 * Math.log10(pk);
  const rawRms = 10 * Math.log10(sq / cut.length);
  const gain = 10 ** ((peak - rawPeak) / 20);
  const fi = Math.round(fadeIn * sr);
  const fo = Math.round(fadeOut * sr);
  for (let i = 0; i < ns; i++) {
    let g = gain;
    if (i < fi) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
    if (i >= ns - fo) g *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (ns - fo))) / fo);
    cut[2 * i] *= g;
    cut[2 * i + 1] *= g;
  }
  const cutWav = join(dir, 'cut.wav');
  writeFileSync(cutWav, Buffer.concat([wavHeader(cut.byteLength, sr), Buffer.from(cut.buffer)]));
  console.log(`[${name}] sound: from sample ${s0}; as recorded peak ${rawPeak.toFixed(1)} dBFS, rms ${rawRms.toFixed(1)} dBFS; gain ${(peak - rawPeak).toFixed(1)} dB`);
  // ---- decode → the slots → encode
  const size = w * h * 1.5;
  // (written beside its name as .part, probed, and only then given the name: a clip is whole or not there)
  const part = `${out}.part`;
  const dec = spawn('ffmpeg', ['-v', 'error', '-i', join(dir, rec.video), '-vf', `scale=${w}:${h}:flags=lanczos:in_range=tv:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const enc = spawn(
    'ffmpeg',
    ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${w}x${h}`, '-r', String(fps), '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-i', '-', '-i', cutWav,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-maxrate', '24M', '-bufsize', '48M', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-g', String(fps * 2), '-bf', '2',
      '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', '-f', 'mp4', part],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const last = pick[pick.length - 1];
  let idx = 0; // the decoder's frame now arriving
  let k = 0; // the next slot to fill
  let buf = [];
  let have = 0;
  const write = async (b) => {
    if (!enc.stdin.write(b)) await once(enc.stdin, 'drain');
  };
  for await (const chunk of dec.stdout) {
    buf.push(chunk);
    have += chunk.length;
    while (have >= size) {
      const all = buf.length === 1 ? buf[0] : Buffer.concat(buf);
      const frame = all.subarray(0, size);
      const rest = all.subarray(size);
      buf = rest.length ? [rest] : [];
      have = rest.length;
      while (k < n && pick[k] === idx) {
        await write(frame);
        k++;
      }
      idx++;
      if (idx > last) break;
    }
    if (idx > last) break;
  }
  dec.kill('SIGKILL');
  enc.stdin.end();
  await once(enc, 'close');
  if (k < n) throw new Error(`only ${k} of ${n} frames written`);
  {
    const pr = probe(part);
    const v = pr.streams.find((x) => x.codec_type === 'video');
    const au = pr.streams.find((x) => x.codec_type === 'audio');
    const d = Number(pr.format.duration);
    if (!v || !au || v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p' || v.width !== w || v.height !== h || au.codec_name !== 'aac' || Math.abs(d - n / fps) > 0.1) throw new Error(`the clip written is not as asked: ${JSON.stringify({ v: v && [v.codec_name, v.pix_fmt, v.width, v.height], a: au && au.codec_name, d, want: n / fps })}`);
    renameSync(part, out);
  }
  const meta = { name, out, from, to, dur: n / fps, fps, frames: n, dup, skip, audioDelay, rawPeak, rawRms, gainDb: peak - rawPeak, captured: `${m.width}x${m.height}`, timeline: { slope: tl.fit.slope, rms: tl.fit.rms, max: tl.fit.max }, clocks: { slope: clocks.slope, rms: clocks.rms, max: clocks.max } };
  writeFileSync(join(dir, 'clip.json'), JSON.stringify(meta, null, 1));
  return meta;
}

/** ffprobe + levels of a finished clip, in one line each */
export function report(file) {
  const p = probe(file);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const vol = ffinfo('-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-');
  const eb = ffinfo('-i', file, '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-');
  const g = (re, s) => (re.exec(s) ?? [])[1];
  const sum = eb.slice(eb.lastIndexOf('Summary:'));
  const r = { file, duration: Number(p.format.duration), size: Number(p.format.size), video: `${v.codec_name} ${v.profile} ${v.width}×${v.height} ${v.pix_fmt} ${v.r_frame_rate} fps (avg ${v.avg_frame_rate})`, vbitrate: Number(v.bit_rate), audio: `${a.codec_name} ${a.profile} ${a.sample_rate} Hz ${a.channels} ch ${Math.round(Number(a.bit_rate) / 1000)} kb/s`, mean: Number(g(/mean_volume: (-?[\d.]+) dB/, vol)), peak: Number(g(/max_volume: (-?[\d.]+) dB/, vol)), lufs: Number(g(/I:\s+(-?[\d.]+) LUFS/, sum)), truePeak: Number(g(/Peak:\s+(-?[\d.]+) dBFS/, sum)), lra: Number(g(/LRA:\s+(-?[\d.]+) LU/, sum)) };
  return r;
}
