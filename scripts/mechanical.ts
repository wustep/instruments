// How mechanical each part of a score sounds, measured. It reads the stems scripts/render-orchestra.ts
// writes (`--stems --wav`: each part alone as seated, and the notes it was sent) and says, per part:
//   how exposed it is (its level under the mix, the share of the time it is the loudest part);
//   how its held notes move (level, pitch and brightness about a straight line: dB, cents, cents; the
//     vibrato's rate and depth, how far the rate differs from note to note, and how much of the pitch's
//     movement is one sine: 1 is a generator);
//   how alike its repeated notes are (the same pitch struck again at about the same dynamic: the two
//     beginnings' waveforms correlated, and their spectra's difference in third octaves: 1 and 0 dB are a
//     sample played twice);
//   how wide its dynamics are (its notes' levels, the 90th percentile over the 10th);
//   for the timpani, its rolls: how far the strokes stand out, and how much of the level moves at one rate.
// With --refs, the recordings read the same way (University of Iowa MIS held notes; the VSCO 2 CE timpani's
// two takes of each stroke, and its rolls), analysis only.
//   npx tsx scripts/mechanical.ts --stems artifacts/symphony-robot/before [--from 206 --to 262] [--refs] [--only timpani] [--json out.json]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, identifyNote, segmentNotes, spectrum, THIRD_OCT } from '../packages/engine/src/analysis/index.ts';
import { ENS_CACHE, REF_FILES } from './ensemble-refs.ts';
import { TIMP_CACHE, loadMono, refFiles } from './timpani-refs.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const STEMS = opt('--stems', '');
const FROM = Number(opt('--from', '0'));
const TO = Number(opt('--to', '1e9'));
const REFS = args.includes('--refs');
const ONLY = opt('--only', '');
const JSON_OUT = opt('--json', '');

const q = (xs: number[], p: number) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 0.5))] : NaN;
};
const med = (xs: number[]) => q(xs, 0.5);
const sd = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
/** the standard deviation about the straight line through the points */
const sdLine = (xs: number[]) => {
  const n = xs.length;
  if (n < 4) return NaN;
  const tm = (n - 1) / 2;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((v, i) => {
    sxy += (i - tm) * (v - mean);
    sxx += (i - tm) ** 2;
  });
  const k = sxy / sxx;
  return sd(xs.map((v, i) => v - mean - k * (i - tm)));
};
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');

interface Note { t: number; midi: number; vel: number; len: number }
interface Held { level: number; pitch: number; bright: number; rate: number; depth: number; sine: number }

/** a note's harmonic to follow: the strongest of the first eight under 4 kHz, at the middle of [a, b) */
function harmonicOf(x: ArrayLike<number>, fs: number, a: number, b: number, f0: number): number {
  const win = Math.min(b - a, Math.round(0.3 * fs));
  const sp = spectrum(x, fs, Math.round((a + b - win) / 2), win, 32768, 'hann');
  let best = 1;
  let bm = 0;
  for (let h = 1; h <= 8 && h * f0 < 4000; h++) {
    let m = 0;
    for (let k = Math.floor((h * f0 * 0.97) / sp.binHz); k <= Math.ceil((h * f0 * 1.03) / sp.binHz); k++) m = Math.max(m, sp.mag[k]);
    if (m > bm) {
      bm = m;
      best = h;
    }
  }
  return best;
}
/** the pitch (cents from f0) of x at s, from harmonic h over `win` samples */
function pitchAt(x: ArrayLike<number>, fs: number, s: number, win: number, f0: number, h: number, nfft: number): number {
  const sp = spectrum(x, fs, s, win, nfft, 'hann');
  const lo = Math.max(2, Math.floor((h * f0 * 0.96) / sp.binHz));
  const hi = Math.min(sp.mag.length - 2, Math.ceil((h * f0 * 1.04) / sp.binHz));
  let top = lo;
  for (let k = lo; k <= hi; k++) if (sp.mag[k] > sp.mag[top]) top = k;
  const l = Math.log(sp.mag[top - 1] + 1e-30);
  const c = Math.log(sp.mag[top] + 1e-30);
  const r = Math.log(sp.mag[top + 1] + 1e-30);
  const den = l - 2 * c + r;
  return 1200 * Math.log2(((top + (den ? (0.5 * (l - r)) / den : 0)) * sp.binHz) / (h * f0));
}

/** one held note, x[a, b) its held part (after the attack, before the release): how it moves */
function held(x: ArrayLike<number>, fs: number, a: number, b: number, f0: number): Held | null {
  if (b - a < 0.6 * fs) return null;
  const h = harmonicOf(x, fs, a, b, f0);
  // slowly: 200 ms windows a tenth of a second apart (a vibrato's cycle is about one window: averaged)
  const win = Math.round(0.2 * fs);
  const hop = Math.round(0.1 * fs);
  const lv: number[] = [];
  const cs: number[] = [];
  const ps: number[] = [];
  for (let s = a; s + win <= b; s += hop) {
    let sq = 0;
    for (let i = 0; i < win; i++) sq += x[s + i] * x[s + i];
    lv.push(10 * Math.log10(sq / win + 1e-20));
    const sp = spectrum(x, fs, s, win, 16384, 'hann');
    let num = 0;
    let den = 0;
    for (let k = 2; k < sp.mag.length && k * sp.binHz < 6000; k++) {
      num += k * sp.binHz * sp.mag[k] ** 2;
      den += sp.mag[k] ** 2;
    }
    cs.push(1200 * Math.log2(num / Math.max(den, 1e-30)));
    ps.push(pitchAt(x, fs, s, win, f0, h, 16384));
  }
  if (lv.length < 5) return null;
  // the vibrato: the pitch every 10 ms over 60 ms (never under eight periods of the harmonic followed)
  const vw = Math.max(Math.round(0.06 * fs), Math.round((8 * fs) / (h * f0)));
  const vh = Math.round(0.01 * fs);
  const c: number[] = [];
  for (let s = a; s + vw <= b; s += vh) c.push(pitchAt(x, fs, s, vw, f0, h, 8192));
  // (less its own slow part: a 300 ms running mean)
  const M = 15;
  const d = c.map((v, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - M); j <= Math.min(c.length - 1, i + M); j++) {
      sum += c[j];
      n++;
    }
    return v - sum / n;
  }).slice(M, -M);
  let rate = NaN;
  let depth = NaN;
  let sine = NaN;
  if (d.length >= 40) {
    let bestP = 0;
    for (let r = 3.5; r <= 9; r += 0.05) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < d.length; i++) {
        const ph = 2 * Math.PI * r * i * 0.01;
        re += d[i] * Math.cos(ph);
        im += d[i] * Math.sin(ph);
      }
      const A = (2 * Math.hypot(re, im)) / d.length;
      if (A > bestP) {
        bestP = A;
        rate = r;
      }
    }
    depth = bestP;
    const v = d.reduce((p, y) => p + y * y, 0) / d.length;
    sine = v > 0 ? Math.min(1, (bestP * bestP) / 2 / v) : NaN;
  }
  return { level: sdLine(lv), pitch: sdLine(ps), bright: sdLine(cs), rate, depth, sine };
}
const heldLine = (hs: Held[]) => {
  const vib = hs.filter((r) => r.depth >= 4);
  return `held ${String(hs.length).padStart(3)}: level ±${f(med(hs.map((r) => r.level)), 2)} dB  pitch ±${f(med(hs.map((r) => r.pitch)))} ¢  brightness ±${f(med(hs.map((r) => r.bright)), 0)} ¢` +
    (vib.length >= 3 ? `  vibrato ${f(med(vib.map((r) => r.depth)))} ¢ at ${f(med(vib.map((r) => r.rate)), 2)} Hz (rate ±${f(sd(vib.map((r) => r.rate)), 2)} Hz, depth ±${f((100 * sd(vib.map((r) => r.depth))) / med(vib.map((r) => r.depth)), 0)} % from note to note; ${f(100 * med(vib.map((r) => r.sine)), 0)} % one sine)` : '  no vibrato');
};
const heldRow = (hs: Held[]) => {
  const vib = hs.filter((r) => r.depth >= 4);
  return { n: hs.length, levelDb: med(hs.map((r) => r.level)), pitchCents: med(hs.map((r) => r.pitch)), brightCents: med(hs.map((r) => r.bright)), vibrato: vib.length >= 3 ? { depth: med(vib.map((r) => r.depth)), rate: med(vib.map((r) => r.rate)), rateSd: sd(vib.map((r) => r.rate)), depthSdPct: (100 * sd(vib.map((r) => r.depth))) / med(vib.map((r) => r.depth)), sine: med(vib.map((r) => r.sine)) } : null };
};

/** two beginnings (x from a, y from b, `len` samples): their waveforms' correlation at the best lag within
 *  ±lag, and their third-octave spectra's difference (dB rms, 100 Hz–8 kHz, the mean difference taken out) */
function alike(x: ArrayLike<number>, a: number, y: ArrayLike<number>, b: number, len: number, lag: number, fs: number): { corr: number; spec: number; level: number } {
  let best = -1;
  let xx = 0;
  for (let i = 0; i < len; i++) xx += x[a + i] * x[a + i];
  for (let k = -lag; k <= lag; k++) {
    let xy = 0;
    let yy = 0;
    for (let i = 0; i < len; i++) {
      const v = y[b + k + i] ?? 0;
      xy += x[a + i] * v;
      yy += v * v;
    }
    best = Math.max(best, xy / Math.sqrt(xx * yy + 1e-30));
  }
  const bands = (z: ArrayLike<number>, s: number) => {
    const sp = spectrum(z, fs, s, len, 16384, 'hann');
    return THIRD_OCT.filter((c) => c >= 100 && c <= 8000).map((c) => {
      let e = 0;
      for (let k = Math.ceil((c / 2 ** (1 / 6)) / sp.binHz); k <= Math.floor((c * 2 ** (1 / 6)) / sp.binHz); k++) e += sp.mag[k] ** 2;
      return 10 * Math.log10(e + 1e-20);
    });
  };
  const A = bands(x, a);
  const B = bands(y, b);
  // (bands within 40 dB of the loudest: the rest is the floor)
  const top = Math.max(...A, ...B);
  const dif = A.map((v, i) => (Math.max(v, B[i]) > top - 40 ? v - B[i] : NaN)).filter(Number.isFinite);
  const m = dif.reduce((p, v) => p + v, 0) / dif.length;
  return { corr: best, spec: Math.sqrt(dif.reduce((p, v) => p + (v - m) ** 2, 0) / dif.length), level: m };
}

/** a roll over x[a, b): how far its strokes stand out of it (the level every 5 ms: its 90th percentile over
 *  its 10th, dB), how many a second (the envelope's strongest line between 8 and 20 Hz) and how much of the
 *  envelope moves at that one rate (the line's amplitude over the mean level: a machine's strokes, all alike and
 *  evenly spaced, put it all there) */
function rollOf(x: ArrayLike<number>, fs: number, a: number, b: number): { depthDb: number; perSec: number; line: number } | null {
  const hop = Math.round(0.005 * fs);
  const env: number[] = [];
  for (let s = a; s + hop <= b; s += hop) {
    let e = 0;
    for (let i = 0; i < hop; i++) e += x[s + i] * x[s + i];
    env.push(Math.sqrt(e / hop));
  }
  if (env.length < 100) return null;
  const sm = env.map((v, i) => (v + (env[i - 1] ?? v)) / 2);
  const dbs = sm.map((v) => 20 * Math.log10(v + 1e-10));
  const mean = sm.reduce((p, v) => p + v, 0) / sm.length;
  let best = 0;
  let rate = 0;
  let wsum = 0;
  const w = sm.map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (sm.length - 1)));
  for (const v of w) wsum += v;
  for (let r = 8; r <= 20; r += 0.1) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < sm.length; i++) {
      const ph = 2 * Math.PI * r * i * 0.005;
      re += (sm[i] - mean) * w[i] * Math.cos(ph);
      im += (sm[i] - mean) * w[i] * Math.sin(ph);
    }
    const A = (2 * Math.hypot(re, im)) / wsum;
    if (A > best) {
      best = A;
      rate = r;
    }
  }
  return { depthDb: q(dbs, 0.9) - q(dbs, 0.1), perSec: rate, line: best / mean };
}

const out: Record<string, unknown> = {};
if (STEMS) {
  const meta = JSON.parse(readFileSync(join(STEMS, readdirSync(STEMS).find((n) => n.endsWith('-stems.json'))!), 'utf8')) as { piece: string; parts: { file: string; voice: string; notes: Note[] }[] };
  const parts = meta.parts.map((p) => {
    const a = decodeWav(new Uint8Array(readFileSync(join(STEMS, `${p.file}.wav`))));
    const L = a.channels[0];
    const R = a.channels[1] ?? L;
    const x = new Float32Array(L.length);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * (L[i] + R[i]);
    return { ...p, x, fs: a.sampleRate };
  });
  const fs = parts[0].fs;
  const n = parts[0].x.length;
  const a0 = Math.round(Math.max(0, FROM) * fs);
  const a1 = Math.min(n, Math.round(TO * fs));
  const mix = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < n; i++) mix[i] += p.x[i];
  const rms = (x: ArrayLike<number>, a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    return 10 * Math.log10(s / Math.max(1, b - a) + 1e-20);
  };
  // the loudest part of each 50 ms
  const fr = Math.round(0.05 * fs);
  const lead = parts.map(() => 0);
  let frames = 0;
  for (let s = a0; s + fr <= a1; s += fr) {
    let best = -1;
    let bv = -200;
    parts.forEach((p, k) => {
      const v = rms(p.x, s, s + fr);
      if (v > bv) {
        bv = v;
        best = k;
      }
    });
    if (bv > -70) {
      lead[best]++;
      frames++;
    }
  }
  console.log(`${meta.piece} (${STEMS}), ${f(a0 / fs, 0)}–${f(a1 / fs, 0)} s; the mix ${f(rms(mix, a0, a1))} dBFS`);
  const rows: Record<string, unknown>[] = [];
  parts.forEach((p, k) => {
    if (ONLY && p.voice !== ONLY) return;
    const notes = p.notes.filter((v) => v.t >= a0 / fs && v.t < a1 / fs);
    const struck = p.voice === 'timpani';
    // held notes: at least 1.3 s, nothing else of the part sounding over their held part
    const hs: Held[] = [];
    if (!struck) {
      const cand = notes.filter((v) => v.len >= 1.1 && !p.notes.some((o) => o !== v && o.t < v.t + v.len - 0.15 && o.t + o.len > v.t + 0.4));
      const step = Math.max(1, Math.ceil(cand.length / 40));
      for (let i = 0; i < cand.length; i += step) {
        const v = cand[i];
        const r = held(p.x, fs, Math.round((v.t + 0.4) * fs), Math.round((v.t + v.len - 0.1) * fs), hz(v.midi));
        if (r && Math.abs(r.pitch) < 60) hs.push(r);
      }
    }
    // repeats: the same pitch again within 3 s, the dynamics within 8 of each other, nothing between
    const cs: number[] = [];
    const ss: number[] = [];
    for (let i = 1; i < notes.length; i++) {
      const u = notes[i - 1];
      const v = notes[i];
      if (u.midi !== v.midi || Math.abs(u.vel - v.vel) > 8 || v.t - u.t > 3 || v.t - u.t < 0.09) continue;
      const len = Math.round(Math.min(0.08, v.t - u.t - 0.005) * fs);
      // (the sound reaches the listener a seat's delay after the note: both alike; a stroke's felt 5 ms in)
      const r = alike(p.x, Math.round(u.t * fs), p.x, Math.round(v.t * fs), len, Math.round(Math.min(0.012, 1 / hz(v.midi)) * fs), fs);
      cs.push(r.corr);
      ss.push(r.spec);
    }
    // each note's level (its loudest 100 ms), and how far apart the part's notes are
    const lvs = notes.filter((v) => v.len >= 0.15 || struck).map((v) => {
      let best = -200;
      const w = Math.round(0.1 * fs);
      for (let s0 = Math.round(v.t * fs); s0 + w <= Math.min(n, Math.round((v.t + Math.max(0.1, Math.min(v.len, 1.5))) * fs) + w); s0 += w >> 1) best = Math.max(best, rms(p.x, s0, s0 + w));
      return best;
    });
    const row: Record<string, unknown> = { voice: p.voice, dynamicsDb: q(lvs, 0.9) - q(lvs, 0.1), velocities: [Math.min(...notes.map((v) => v.vel)), Math.max(...notes.map((v) => v.vel))], file: p.file, notes: notes.length, underMixDb: rms(p.x, a0, a1) - rms(mix, a0, a1), loudestPct: (100 * lead[k]) / Math.max(1, frames), held: heldRow(hs), repeats: { n: cs.length, corr: med(cs), corrHigh: q(cs, 0.9), specDb: med(ss) } };
    console.log(`\n${String(k + 1).padStart(2)} ${p.voice.padEnd(9)} ${String(notes.length).padStart(4)} notes  ${f(row.underMixDb as number)} dB under the mix  loudest ${f(row.loudestPct as number, 0)} % of the time  dynamics ${f(row.dynamicsDb as number)} dB (velocities ${(row.velocities as number[]).join('–')})`);
    if (!struck) console.log(`   ${heldLine(hs)}`);
    console.log(`   repeats ${String(cs.length).padStart(3)}: the beginnings correlate ${f(med(cs), 3)} (a tenth of them over ${f(q(cs, 0.9), 3)}), spectra ${f(med(ss))} dB apart`);
    if (struck) {
      // rolls: runs of twelve or more notes under 0.12 s apart
      const rolls: NonNullable<ReturnType<typeof rollOf>>[] = [];
      let run: Note[] = [];
      const close = () => {
        if (run.length >= 12) {
          const r = rollOf(p.x, fs, Math.round(run[0].t * fs), Math.round((run[run.length - 1].t + 0.06) * fs));
          if (r) rolls.push(r);
        }
        run = [];
      };
      for (const v of notes) {
        if (run.length && v.t - run[run.length - 1].t > 0.12) close();
        run.push(v);
      }
      close();
      row.rolls = { n: rolls.length, depthDb: med(rolls.map((r) => r.depthDb)), perSec: med(rolls.map((r) => r.perSec)), line: med(rolls.map((r) => r.line)) };
      console.log(`   rolls ${rolls.length}: ${f(med(rolls.map((r) => r.perSec)))} strokes a second, standing ${f(med(rolls.map((r) => r.depthDb)))} dB out of the roll, ${f(100 * med(rolls.map((r) => r.line)), 0)} % of the level moving at that one rate`);
    }
    rows.push(row);
  });
  out.parts = rows;
}

if (REFS) {
  console.log('\nThe recordings, read the same way');
  const refs: Record<string, unknown> = {};
  const ens = [...new Set(REF_FILES.map((r) => r.instrument))].filter((i) => !ONLY || i === ONLY);
  for (const ins of ens) {
    const hs: Held[] = [];
    let skipped = 0;
    for (const rf of REF_FILES.filter((r) => r.instrument === ins && r.dyn !== 'pp')) {
      const path = join(ENS_CACHE, 'wav', rf.file.replace(/\.aiff$/, '.wav'));
      if (!existsSync(path)) continue;
      const a = decodeWav(new Uint8Array(readFileSync(path)));
      const x = a.channels[0];
      const fs = a.sampleRate;
      for (const seg of segmentNotes(x, fs, rf.merge ? { merge: rf.merge } : {})) {
        if ((seg.end - seg.start) / fs < 1.4) continue;
        const id = identifyNote(x, fs, seg, Math.max(rf.range[0] - 1, 24), rf.range[1] + 1);
        // (its own pitch, not the tempered note's: a player a few cents off still follows his own line)
        // (its held part: from 0.4 s in to where the level last stands within 4 dB of its middle's, less 0.15 s:
        // a bowed or blown note left to die away is not being held any more)
        const fr = Math.round(0.05 * fs);
        const lvl = (s0: number) => {
          let e = 0;
          for (let i = 0; i < fr; i++) e += x[s0 + i] * x[s0 + i];
          return 10 * Math.log10(e / fr + 1e-20);
        };
        const mid = lvl(Math.round((seg.start + seg.end) / 2));
        let end = seg.end - fr;
        while (end > seg.start && lvl(end) < mid - 4) end -= fr;
        const r = held(x, fs, seg.start + Math.round(0.4 * fs), end - Math.round(0.15 * fs), hz(id.midi));
        // (a segment that is not one held note, two notes run together or a note and its silence, moves
        // by decibels: left out, and counted)
        if (r && r.level < 3 && r.pitch < 40) hs.push(r);
        else if (r) skipped++;
      }
    }
    if (hs.length < 4 || skipped > hs.length) {
      console.log(`${ins.padEnd(9)} not read: its runs do not come apart into held notes here (${hs.length} read, ${skipped} not)`);
      continue;
    }
    refs[ins] = heldRow(hs);
    console.log(`${ins.padEnd(9)} ${heldLine(hs)}`);
  }
  if ((!ONLY || ONLY === 'timpani') && existsSync(TIMP_CACHE)) {
    // one drum at one dynamic, struck twice (the library's two takes)
    const cs: number[] = [];
    const ss: number[] = [];
    const files = refFiles();
    for (const u of files.filter((r) => r.rr === 1)) {
      const v = files.find((r) => r.drum === u.drum && r.dyn === u.dyn && r.rr === 2);
      if (!v || !existsSync(join(TIMP_CACHE, u.file)) || !existsSync(join(TIMP_CACHE, v.file))) continue;
      const A = loadMono(join(TIMP_CACHE, u.file));
      const B = loadMono(join(TIMP_CACHE, v.file));
      const on = (x: Float32Array) => {
        let pk = 0;
        for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
        let i = 0;
        while (i < x.length && Math.abs(x[i]) < 0.05 * pk) i++;
        return Math.max(0, i - Math.round(0.002 * A.fs));
      };
      const r = alike(A.x, on(A.x), B.x, on(B.x), Math.round(0.08 * A.fs), Math.round(0.012 * A.fs), A.fs);
      cs.push(r.corr);
      ss.push(r.spec);
    }
    console.log(`timpani   two takes of one stroke (${cs.length} pairs): the beginnings correlate ${f(med(cs), 3)} (a tenth over ${f(q(cs, 0.9), 3)}), spectra ${f(med(ss))} dB apart`);
    const rolls: NonNullable<ReturnType<typeof rollOf>>[] = [];
    const dir = join(TIMP_CACHE, 'rolls');
    if (existsSync(dir))
      for (const name of readdirSync(dir).filter((s) => s.endsWith('.wav'))) {
        const A = loadMono(join(dir, name));
        // (three seconds of the steady part: the player has started, and has not begun to stop)
        const r = rollOf(A.x, A.fs, Math.round(1 * A.fs), Math.min(A.x.length - Math.round(1.5 * A.fs), Math.round(4 * A.fs)));
        if (r) rolls.push(r);
      }
    console.log(`timpani   recorded rolls (${rolls.length}): ${f(med(rolls.map((r) => r.perSec)))} strokes a second, standing ${f(med(rolls.map((r) => r.depthDb)))} dB out of the roll, ${f(100 * med(rolls.map((r) => r.line)), 0)} % of the level moving at that one rate`);
    refs.timpani = { takes: { n: cs.length, corr: med(cs), specDb: med(ss) }, rolls: { n: rolls.length, perSec: med(rolls.map((r) => r.perSec)), depthDb: med(rolls.map((r) => r.depthDb)), line: med(rolls.map((r) => r.line)) } };
  }
  out.refs = refs;
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
