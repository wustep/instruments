// Does the capture work here? Films a few seconds of a page with the time code on all the way through
// and says what came out: the size, the frame rate, frames lost or repeated, the timeline's fit.
//   node artifacts/launch-videos/tools/probe.mjs [headless] [url]
import { open, start, stop, readCode, timeline, sleep, join, VIEW, probe } from './rec.mjs';

const headless = !process.argv.includes('headed');
const url = process.argv.slice(2).find((a) => a.startsWith('/')) ?? '/piano?view=3d';
const OUT = join(process.env.OUT ?? '/tmp/instruments-videos', `probe-${headless ? 'headless' : 'headed'}`);
const SECS = Number(process.env.SECS ?? 8);

const t = await open({ url, headless });
try {
  const { page } = t;
  await sleep(1500);
  const env = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const e = c?.getExtension('WEBGL_debug_renderer_info');
    return { dpr: devicePixelRatio, inner: [innerWidth, innerHeight], outer: [outerWidth, outerHeight], screen: [screen.width, screen.height], gl: e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'none', vis: document.visibilityState, focus: document.hasFocus() };
  });
  console.log('env', JSON.stringify(env));
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  await sleep(1500);
  console.log('audio', JSON.stringify(await page.evaluate(() => ({ state: window.__tapCtx?.state, sr: window.__tapCtx?.sampleRate, base: window.__tapCtx?.baseLatency, out: window.__tapCtx?.outputLatency, s3: window.__stage3d ? { ...window.__stage3d.stats } : null }))));
  const st = await start(t, { fps: 60, bitrate: Number(process.env.BITRATE ?? 60e6) });
  console.log('capture', JSON.stringify(st));
  await page.evaluate(() => window.__rec.code(true));
  // something to hear and see: a few notes by hand
  for (let k = 0; k < SECS; k++) {
    await page.evaluate((m) => {
      window.__rec.mark('on', { midi: m });
      window.__piano.noteOn(m, 100);
      setTimeout(() => window.__piano.noteOff(m), 400);
    }, 60 + (k % 5) * 2);
    await sleep(1000);
  }
  const rec = await stop(t, OUT);
  const raf = rec.frames;
  const d = raf.slice(1).map((x, i) => x - raf[i]);
  d.sort((a, b) => a - b);
  console.log(`page: ${raf.length} frames in ${((raf[raf.length - 1] - raf[0]) / 1000).toFixed(2)} s; frame time median ${d[d.length >> 1].toFixed(2)} ms, p99 ${d[Math.floor(d.length * 0.99)].toFixed(2)} ms, max ${d[d.length - 1].toFixed(1)} ms`);
  console.log('s3', JSON.stringify(await page.evaluate(() => (window.__stage3d ? { ...window.__stage3d.stats } : null))));
  const info = probe(join(OUT, rec.video));
  const v = info.streams.find((s) => s.codec_type === 'video');
  console.log(`file: ${rec.mime} ${v.codec_name} ${v.width}×${v.height} ${v.pix_fmt} ${v.color_range ?? ''} ${v.color_space ?? ''} r=${v.r_frame_rate} avg=${v.avg_frame_rate} nb=${v.nb_frames ?? '?'} dur=${info.format.duration} size=${(rec.bytes / 1e6).toFixed(1)} MB`);
  const code = readCode(OUT, rec);
  const fr = code.frames;
  const read = fr.filter((f) => f.perf !== null);
  console.log(`recorded frames: ${fr.length}, code read in ${read.length}`);
  // every page frame drawn while filming: was it filmed, once?
  const vals = read.map((f) => f.perf);
  let rep = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] === vals[i - 1]) rep++;
  const uniq = new Set(vals);
  const drawn = raf.map((x) => Math.round(x)).filter((x) => x >= vals[0] && x <= vals[vals.length - 1]);
  const missed = drawn.filter((x) => !uniq.has(x)).length;
  console.log(`page frames in that span: ${drawn.length}; filmed: ${uniq.size}; repeated in the recording: ${rep}; never filmed: ${missed}`);
  const dp = fr.slice(1).map((f, i) => (f.pts - fr[i].pts) * 1000).sort((a, b) => a - b);
  console.log(`recording frame spacing: median ${dp[dp.length >> 1].toFixed(2)} ms, p1 ${dp[Math.floor(dp.length * 0.01)].toFixed(2)}, p99 ${dp[Math.floor(dp.length * 0.99)].toFixed(2)}, max ${dp[dp.length - 1].toFixed(1)} ms`);
  const gaps = fr.slice(1).map((f, i) => [(f.pts - fr[i].pts) * 1000, f.pts]).filter((g) => g[0] > 25);
  console.log(`gaps over 25 ms: ${gaps.length}: ${gaps.slice(0, 12).map((g) => `${g[0].toFixed(0)}@${g[1].toFixed(2)}`).join(' ')}`);
  const tl = timeline(fr);
  console.log(`timeline: ${tl.pairs.length} pairs over ${(tl.span / 1000).toFixed(1)} s; slope ${tl.fit.slope.toFixed(6)}; residual rms ${tl.fit.rms.toFixed(2)} ms, max ${tl.fit.max.toFixed(1)} ms; recording starts ${(rec.recAt + tl.med).toFixed(0)} ms before its start event`);
  const of = (await import('./rec.mjs')).line(rec.outs.map(([c, p]) => [c * 1000, p]));
  console.log(`clocks: ${rec.outs.length} pairs; slope ${of.slope.toFixed(6)}; residual rms ${of.rms.toFixed(2)} ms, max ${of.max.toFixed(1)} ms; rendered ahead of heard by ${(rec.outs.reduce((s, o) => s + (o[2] - (o[0] + (o[3] - o[1]) / 1000)), 0) / rec.outs.length * 1000).toFixed(1)} ms`);
  console.log(`sound: ${(rec.audio.frames / rec.audio.sr).toFixed(2)} s at ${rec.audio.sr} Hz; base ${(rec.audio.baseLatency * 1000).toFixed(1)} ms, output ${(rec.audio.outputLatency * 1000).toFixed(1)} ms`);
  console.log('marks', JSON.stringify(rec.marks.slice(0, 3)));
  (await import('./rec.mjs')).ff('-ss', '3', '-i', join(OUT, rec.video), '-frames:v', '1', join(OUT, 'frame.png'));
  console.log('out', OUT, VIEW);
} finally {
  await t.browser.close();
}
