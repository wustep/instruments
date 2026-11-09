// Cello before/after: the same passages through an older engine (--before) and this checkout,
// as MP3s (with the site's room), stacked spectrograms (before on top) and dry-render metrics.
// Original material, plus the opening of Bach's Suite No. 1 (BWV 1007, public domain).
//   npx tsx scripts/render-cello.ts --before <old>/packages/engine/src/core/index.ts --out artifacts/realistic-3d/cello-audio
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav, spectrum } from '../packages/engine/src/analysis/index.ts';
import { biquadHighpass } from '../packages/engine/src/core/filters.ts';
import { BiquadChain } from '../packages/engine/src/core/post.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'cello-audio'))!);
const BEFORE = opt('--before');
const AFTER = resolve(opt('--after', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
type Bowed = Record<string, { seed: number }>;
const engines: [string, Render, Bowed][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', AFTER]]) {
  const e = await import(pathToFileURL(path).href);
  engines.push([tag, e.renderInstrument, e.BOWED]);
}
// --seeds N: the click and grain measures averaged over N renders that differ only in the cello's
// random seed (rosin noise, vibrato and bow wander, and the statistical body modes above 240 Hz,
// a statistically equivalent body): the bow is chaotic, and one render's count of
// rare events says little
const SEEDS = +(opt('--seeds', '1')!);
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
/** [midi, start s, duration s, velocity] */
type Note = [number, number, number, number];
const notes = (ns: Note[]): Ev[] => ns.flatMap(([m, t, d, v]) => [{ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + d, event: { type: 'noteOff', midi: m } }]);

// ---------------------------------------------------------------- the passages
const PIECES: { name: string; what: string; ns: Note[]; dur: number; params?: Record<string, unknown> }[] = [];
// 1. the round-3 audit phrase (matched: same notes, same vibrato), for continuity
PIECES.push({ name: 'phrase', what: 'the round-3 audit phrase: C3 E3 G3 C4 B3 A3 G3, vibrato 17 ¢', ns: [[48, 0.1, 1.2, 80], [52, 1.35, 0.6, 82], [55, 2.0, 0.6, 84], [60, 2.65, 1.6, 90], [59, 4.3, 0.6, 84], [57, 4.95, 0.6, 80], [55, 5.6, 2.2, 82]], dur: 8.6, params: { vibrato: 17 } });
// 2. Bach, Suite No. 1, Prelude, bars 1–4: string crossings over G–D–A, slurred in pairs of
//    beats (notes overlap by 15 ms within a slur, so the bow keeps going), ♩ = 66
{
  const bars = [
    [43, 50, 59, 57, 59, 50, 59, 50],
    [43, 50, 59, 57, 59, 50, 59, 50],
    [43, 52, 60, 59, 60, 52, 60, 52],
    [43, 52, 60, 59, 60, 52, 60, 52],
  ];
  const s16 = 60 / 66 / 4;
  const ns: Note[] = [];
  let t = 0.15;
  bars.forEach((bar) =>
    bar.forEach((m, i) => {
      const lastOfSlur = i % 4 === 3;
      ns.push([m, t, s16 + (lastOfSlur ? -0.03 : 0.015), i % 4 === 0 ? 92 : 80]);
      t += s16;
    }),
  );
  PIECES.push({ name: 'bach-prelude', what: 'Bach, Suite No. 1, Prelude, bars 1–4 (string crossings, slurs of four)', ns, dur: t + 1.4, params: { vibrato: 12 } });
}
// 3. sustained tones across the range and the dynamics, with vibrato
PIECES.push({
  name: 'sustained',
  what: 'long tones with vibrato: C2 pp, G2 mf, D3 ff, A3 mf, E4 ff, A4 pp (2.2 s each)',
  ns: [[36, 0.1, 2.2, 30], [43, 2.6, 2.2, 70], [50, 5.1, 2.2, 112], [57, 7.6, 2.2, 70], [64, 10.1, 2.2, 112], [69, 12.6, 2.2, 30]],
  dur: 15.6,
  params: { vibrato: 17 },
});
// 4. the same long tones without vibrato (pitch stability, the bare tone)
PIECES.push({ name: 'sustained-novib', what: 'G2 mf, D3 ff, A3 mf, D4 mf without vibrato (pitch stability)', ns: [[43, 0.1, 2.4, 70], [50, 2.8, 2.4, 112], [57, 5.5, 2.4, 70], [62, 8.2, 2.4, 70]], dur: 11.4, params: { vibrato: 0 } });
// 5. transitions: a legato scale on the D string, a slurred string crossing, détaché bow
//    changes, and a long ff note that runs out of bow (automatic bow changes)
PIECES.push({
  name: 'transitions',
  what: 'legato D3–A3 on one string; slurred crossings G2↔D3; détaché repeated notes; one long ff note with bow changes',
  ns: [
    ...([50, 52, 53, 55, 57] as number[]).map((m, i): Note => [m, 0.1 + i * 0.4, 0.42, 76]),
    ...([43, 50, 43, 50, 43, 50] as number[]).map((m, i): Note => [m, 2.4 + i * 0.3, 0.32, 80]),
    ...([55, 55, 55, 55] as number[]).map((_, i): Note => [55, 4.5 + i * 0.35, 0.3, 84]),
    [50, 6.2, 4.4, 116],
  ],
  dur: 11.6,
  params: { vibrato: 14 },
});

// ---------------------------------------------------------------- metrics (dry renders)
function mono(r: { left: Float32Array | Float64Array; right: Float32Array | Float64Array }): Float32Array {
  const x = new Float32Array(r.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (r.left[i] + r.right[i]);
  return x;
}
/** fine f0 track (cents re the note) by a parabolic DFT peak near f0, 20 ms hop */
function centsTrack(x: Float32Array, fs: number, f0: number, a: number, b: number): number[] {
  const N = 4096;
  const out: number[] = [];
  for (let p = Math.round(a * fs); p + N < Math.round(b * fs); p += Math.round(0.02 * fs)) {
    let best = -1;
    let bc = 0;
    const pw = (c: number) => {
      const f = f0 * 2 ** (c / 1200);
      let re = 0;
      let im = 0;
      for (let i = 0; i < N; i += 2) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
        const ph = (2 * Math.PI * f * i) / fs;
        re += x[p + i] * w * Math.cos(ph);
        im += x[p + i] * w * Math.sin(ph);
      }
      return re * re + im * im;
    };
    for (let c = -60; c <= 60; c += 4) {
      const v = pw(c);
      if (v > best) {
        best = v;
        bc = c;
      }
    }
    for (let c = bc - 4; c <= bc + 4; c += 0.5) {
      const v = pw(c);
      if (v > best) {
        best = v;
        bc = c;
      }
    }
    out.push(bc);
  }
  return out;
}
/** clicks: 2 ms frames of a crude 4–12 kHz band (first difference); a click is a frame that
 *  stands out by > 10 dB above BOTH the median of the 20 ms before and the 20 ms after it (an
 *  onset rises and stays up, a click comes back down). Returns the count and the worst one. */
function clicks(x: Float32Array, fs: number): { clicks: number; worstDb: number } {
  const w = Math.round(0.002 * fs);
  const e: number[] = [];
  for (let p = 1; p + w < x.length; p += w) {
    let s = 0;
    for (let i = p; i < p + w; i++) {
      const d = x[i] - x[i - 1];
      s += d * d;
    }
    e.push(10 * Math.log10(s / w + 1e-14));
  }
  const medOf = (a: number, b: number) => e.slice(Math.max(0, a), Math.max(0, b)).sort((p, q) => p - q)[Math.floor((b - a) / 2)] ?? -140;
  let n = 0;
  let worst = 0;
  for (let i = 11; i + 11 < e.length; i++) {
    if (e[i] < -100) continue;
    const r = e[i] - Math.max(medOf(i - 11, i - 1), medOf(i + 2, i + 12));
    if (r > worst) worst = r;
    if (r > 10) n++;
  }
  return { clicks: n, worstDb: +worst.toFixed(1) };
}
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
/** Vibrato grain, pitch-synchronously: the > 6 kHz band (4th-order Butterworth high-pass, mono
 *  sum as the recordings are) in the steady part of each long note (0.6 s after the onset, once
 *  the vibrato is in, to 0.15 s before the release), cut into frames one period of the note
 *  long. A sharp Helmholtz corner puts one high-frequency pulse in every period, which is not
 *  grain; grain is that pulse changing from one period to the next. `roughnessDb` is the SD of
 *  each period's band energy around the running median of the 10 periods either side (dB);
 *  a spike is a period > 6 dB above it. */
function hfGrain(x: Float32Array, fs: number, ns: Note[]): { spikesPerSecond: number; roughnessDb: number; seconds: number; interHarmonicDb: number } {
  const y = new Float64Array(x);
  const z = new Float64Array(y.length);
  const hp = new BiquadChain();
  hp.set([biquadHighpass(6000, 0.5412, fs), biquadHighpass(6000, 1.3066, fs)]);
  hp.process(y, z, y.length);
  let spikes = 0;
  let secs = 0;
  const dev: number[] = [];
  for (const [m, t, d] of ns) {
    const a = Math.round((t + 0.6) * fs);
    const b = Math.min(y.length, Math.round((t + d - 0.15) * fs));
    if (b - a < 0.2 * fs) continue;
    const w = Math.round(fs / (440 * 2 ** ((m - 69) / 12)));
    const e: number[] = [];
    for (let p = a; p + w <= b; p += w) {
      let s = 0;
      for (let i = p; i < p + w; i++) s += y[i] * y[i];
      e.push(10 * Math.log10(s / w + 1e-20));
    }
    for (let i = 10; i + 10 < e.length; i++) {
      const r = e[i] - med([...e.slice(i - 10, i - 1), ...e.slice(i + 2, i + 11)]);
      dev.push(r);
      if (r > 6) spikes++;
    }
    secs += (b - a) / fs;
  }
  const rms = Math.sqrt(dev.reduce((s, v) => s + v * v, 0) / Math.max(1, dev.length));
  return { spikesPerSecond: +(spikes / Math.max(1e-9, secs)).toFixed(2), roughnessDb: +rms.toFixed(2), seconds: +secs.toFixed(1), interHarmonicDb: interHarmonic(x, fs, ns) };
}
/** Energy between the harmonics against the energy on them, 3–8 kHz, dB (median over Hann frames
 *  of 8 periods, hop 4, in the same steady parts): partials that do not follow the note's own
 *  harmonics, such as a bow–bridge ripple whose period swings with the vibrato. The frame's f0 is
 *  the parabolic peak near the second harmonic. */
function interHarmonic(x: Float32Array, fs: number, ns: Note[]): number {
  const rs: number[] = [];
  for (const [m, t, d] of ns) {
    const a = Math.round((t + 0.6) * fs);
    const b = Math.min(x.length, Math.round((t + d - 0.15) * fs));
    const f0g = 440 * 2 ** ((m - 69) / 12);
    const N = 2 ** Math.ceil(Math.log2((8 * fs) / f0g));
    for (let p = a; p + N <= b; p += N >> 1) {
      const sp = spectrum(x, fs, p, N, 4 * N, 'hann');
      const pw = (f: number) => sp.mag[Math.round(f / sp.binHz)] ** 2;
      // f0 from the second harmonic's peak (± 3 %)
      let kb = Math.round((2 * f0g * 0.97) / sp.binHz);
      for (let k = kb; k <= Math.round((2 * f0g * 1.03) / sp.binHz); k++) if (sp.mag[k] > sp.mag[kb]) kb = k;
      const [y0, y1, y2] = [sp.mag[kb - 1], sp.mag[kb], sp.mag[kb + 1]];
      // (the parabola's vertex, within half a bin of the peak; a flat or silent frame is skipped)
      const den = y0 - 2 * y1 + y2;
      const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
      const f0 = ((kb + off) * sp.binHz) / 2;
      if (!(y1 > 0) || !(f0 > 0.9 * f0g && f0 < 1.1 * f0g)) continue;
      let eh = 0;
      let ei = 0;
      for (let k = Math.ceil(3000 / f0); k * f0 < 8000; k++) {
        for (let f = (k - 0.2) * f0; f <= (k + 0.2) * f0; f += sp.binHz) eh += pw(f);
        for (let f = (k + 0.35) * f0; f <= (k + 0.65) * f0; f += sp.binHz) ei += pw(f);
      }
      // equal bandwidths: 0.4 f0 on, 0.3 f0 between
      rs.push(10 * Math.log10((ei / 0.3 + 1e-30) / (eh / 0.4 + 1e-30)));
    }
  }
  return rs.length ? +med(rs).toFixed(1) : NaN;
}

const metrics: Record<string, Record<string, unknown>> = {};
for (const [tag, render, bowed] of engines) {
  const m: Record<string, unknown> = {};
  const seed0 = bowed.cello.seed;
  // pitch: the no-vibrato long tones, steady part (0.5 s in … 0.2 s before the end)
  const nv = PIECES.find((p) => p.name === 'sustained-novib')!;
  const x = mono(render({ sampleRate: FS, instrument: 'cello', dry: true, params: nv.params as never, events: notes(nv.ns) as never, duration: nv.dur }));
  m.pitch = nv.ns.map(([midi, t, d]) => {
    const tr = centsTrack(x, FS, 440 * 2 ** ((midi - 69) / 12), t + 0.5, t + d - 0.2);
    // jitter: median absolute deviation (robust to a bow change inside a long ff note) and the full range
    const mdn = med(tr);
    return { midi, offsetCents: +mdn.toFixed(1), jitterMadCents: +med(tr.map((c) => Math.abs(c - mdn))).toFixed(2), rangeCents: +(Math.max(...tr) - Math.min(...tr)).toFixed(1), sdCents: +sd(tr).toFixed(2) };
  });
  for (const p of PIECES) {
    const cs: { clicks: number; worstDb: number }[] = [];
    const gs: ReturnType<typeof hfGrain>[] = [];
    for (let k = 0; k < SEEDS; k++) {
      bowed.cello.seed = seed0 + 1000 * k;
      // on the left channel: the round-2/3 chain sends an inverted copy of its high-frequency
      // radiation to the right, so a mono sum would hide its clicks; per second of audio
      const r = render({ sampleRate: FS, instrument: 'cello', dry: true, params: p.params as never, events: notes(p.ns) as never, duration: p.dur });
      cs.push(clicks(Float32Array.from(r.left), FS));
      // (pieces with long notes: the Bach's sixteenths never reach the vibrato)
      if (p.ns.some(([, , d]) => d > 1)) gs.push(hfGrain(mono(r), FS, p.ns));
    }
    bowed.cello.seed = seed0;
    const avg = (xs: number[]) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
    const n = avg(cs.map((c) => c.clicks));
    m[`clicks:${p.name}`] = { clicks: n, worstDb: Math.max(...cs.map((c) => c.worstDb)), perSecond: +(n / p.dur).toFixed(2), ...(SEEDS > 1 ? { seeds: SEEDS } : {}) };
    if (gs.length) m[`grain:${p.name}`] = { spikesPerSecond: avg(gs.map((g) => g.spikesPerSecond)), roughnessDb: avg(gs.map((g) => g.roughnessDb)), seconds: gs[0].seconds, interHarmonicDb: avg(gs.map((g) => g.interHarmonicDb)) };
  }
  metrics[tag] = m;
}
if (args.includes('--metrics-only')) {
  console.log(JSON.stringify(metrics, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- audio + spectrograms
for (const p of PIECES) {
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    const r = render({ sampleRate: FS, instrument: 'cello', params: p.params as never, events: notes(p.ns) as never, duration: p.dur });
    let pk = 0;
    for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
    // each file peak-normalised to −1 dBFS (loudness differences are in the metrics, not the files)
    const g = pk > 0 ? Math.pow(10, -1 / 20) / pk : 1;
    const L = Float32Array.from(r.left, (v) => v * g);
    const R = Float32Array.from(r.right, (v) => v * g);
    const wav = join(OUT, `${p.name}-${tag}.wav`);
    writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${p.name}-${tag}.mp3`)]);
    rmSync(wav);
    monos.push({ data: Float32Array.from(L, (v, i) => 0.5 * (v + R[i])), fs: FS });
    console.log(`${p.name}-${tag}.mp3`);
  }
  spectrogramPng(join(OUT, `${p.name}.png`), monos, { start: 0, dur: p.dur, fmax: 8000, win: 2048, hop: Math.max(64, Math.round((p.dur * FS) / 960)), range: 80, height: 220 });
  console.log(`${p.name}.png (${engines.map(([t]) => t).join(' over ')})`);
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ pieces: PIECES.map((p) => ({ name: p.name, what: p.what })), metrics }, null, 1) + '\n');
console.log(JSON.stringify(metrics, null, 1));
