// A short musical sample of one instrument from a live build: the page's own engine (window.__engine
// renderOffline: the deployed bundle's DSP, through its room and limiter) renders a phrase, which is written
// as WAV and encoded to MP3 (ffmpeg), then measured (peak, RMS, silence).
//   BASE=https://instruments-wustep.vercel.app OUT=artifacts/new3 ID=tuba node scripts/sample-live.mjs
// The phrases: the tuba's a bass line with tongued repeated notes and a legato phrase; the harp's arpeggios
// and a glissando on a pedal setting; the glockenspiel's a bright melody left to ring.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4331';
const OUT = process.env.OUT ?? 'test-results/samples';
const ID = process.env.ID ?? 'tuba';
const FS = 48000;
mkdirSync(OUT, { recursive: true });

/** notes as [start s, MIDI, length s, velocity]; `over`: notes that overlap the next are slurred by a wind */
const on = (t, m, v) => ({ time: t, event: { type: 'noteOn', midi: m, velocity: v } });
const off = (t, m) => ({ time: t, event: { type: 'noteOff', midi: m } });
const see = (t, m, v, dur) => ({ time: t, event: { type: 'foresee', midi: m, velocity: v, dur } });
function phrase(id) {
  const ev = [];
  let dur = 12;
  const note = (t, m, len, v = 84, told = true) => {
    if (told) ev.push(see(t, m, v, len));
    ev.push(on(t, m, v), off(t + len, m));
  };
  if (id === 'tuba') {
    // a march's bass: tonic and dominant, tongued, with repeated eighths (F major, ♩ = 96)
    const q = 60 / 96;
    let t = 0.2;
    for (const [m, n] of [[29, 1], [36, 1], [29, 0.5], [29, 0.5], [36, 1], [31, 1], [38, 1], [31, 0.5], [31, 0.5], [36, 0.5], [36, 0.5], [34, 0.5], [34, 0.5], [33, 0.5], [31, 0.5], [29, 1.5]]) {
      note(t, m, n * q * (n < 1 ? 0.62 : 0.8), 96);
      t += n * q;
    }
    // then a legato phrase, each note held into the next (slurred), up to C4 and down again
    t += 0.5 * q;
    const line = [41, 43, 45, 46, 48, 53, 52, 50, 48, 46, 45, 43, 41];
    line.forEach((m, i) => {
      const len = i === line.length - 1 ? 3 * q : i === 5 ? 1.5 * q : q * 0.75;
      ev.push(on(t, m, 78), off(t + len + (i === line.length - 1 ? 0 : 0.06), m));
      t += len;
    });
    dur = t + 1.6;
  } else if (id === 'harp') {
    // arpeggios in E♭ major up the compass (the pedals move themselves for the flats), let ring …
    let t = 0.2;
    const up = (ns, step, v) => ns.forEach((m) => { note(t, m, 0.4, v, true); t += step; });
    up([39, 46, 51, 55, 58, 63, 67, 70, 75, 79, 82, 87], 0.16, 82);
    t += 0.5;
    up([44, 51, 56, 60, 63, 68, 72, 75, 80, 84], 0.16, 78);
    t += 0.5;
    up([46, 53, 58, 62, 65, 70, 74, 77, 82, 86], 0.16, 80);
    t += 0.9;
    // … then glissandi on the pedals as they stand (E♭, A♭ and B♭ flat): every white key its string
    const white = [];
    for (let m = 36; m <= 96; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) white.push(m);
    for (const m of white) { ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: 70 + Math.round(18 * (m - 36) / 60), gliss: true } }, off(t + 0.2, m)); t += 0.034; }
    t += 0.25;
    for (const m of white.slice().reverse()) { ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: 66, gliss: true } }, off(t + 0.2, m)); t += 0.03; }
    t += 0.3;
    for (const m of white) { ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: 72 + Math.round(22 * (m - 36) / 60), gliss: true } }, off(t + 0.2, m)); t += 0.03; }
    t += 0.2;
    for (const m of [39, 51, 58, 63, 67, 75]) ev.push(on(t, m, 96), off(t + 0.5, m));
    dur = t + 4.5;
  } else {
    // glockenspiel: a bright tune in G major high in its compass, a broken chord, a last note left to ring
    let t = 0.2;
    const q = 60 / 132;
    for (const [m, n] of [[91, 1], [95, 0.5], [98, 0.5], [103, 1], [98, 1], [96, 0.5], [95, 0.5], [93, 0.5], [91, 0.5], [86, 1], [91, 1], [93, 0.5], [95, 0.5], [96, 0.5], [98, 0.5], [100, 1], [103, 2]]) {
      note(t, m, 0.2, 92, false);
      t += n * q;
    }
    for (const m of [79, 83, 86, 91, 95, 98, 103]) { note(t, m, 0.2, 80, false); t += 0.11; }
    t += 0.5;
    for (const m of [91, 98, 103]) note(t, m, 0.2, 100, false);
    dur = t + 4.5;
  }
  return { events: ev.sort((a, b) => a.time - b.time), duration: Math.min(20, Math.max(8, dur)) };
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
await page.goto(`${BASE}/${ID}`);
await page.waitForFunction(() => !!window.__engine?.renderOffline, null, { timeout: 30_000 });
const { events, duration } = phrase(ID);
const data = await page.evaluate(
  async ([id, ev, dur, fs]) => {
    const buf = await window.__engine.renderOffline({ instrument: id, sampleRate: fs, duration: dur, events: ev });
    return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))];
  },
  [ID, events, duration, FS],
);
await browser.close();
const [L, R] = data;
const n = L.length;
let peak = 0;
let sq = 0;
let quiet = 0;
for (let i = 0; i < n; i++) {
  const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
  peak = Math.max(peak, a);
  sq += 0.5 * (L[i] * L[i] + R[i] * R[i]);
  if (a < 1e-4) quiet++;
}
// (16-bit stereo WAV, as rendered: no gain)
const wav = Buffer.alloc(44 + n * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + n * 4, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(FS, 24);
wav.writeUInt32LE(FS * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
}
const wavPath = `${OUT}/${ID}-sample.wav`;
writeFileSync(wavPath, wav);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '192k', `${OUT}/${ID}-sample.mp3`]);
execFileSync('rm', ['-f', wavPath]);
console.log(JSON.stringify({ id: ID, base: BASE, seconds: +(n / FS).toFixed(2), notes: events.filter((e) => e.event.type === 'noteOn').length, peakDb: +(20 * Math.log10(peak + 1e-12)).toFixed(1), rmsDb: +(10 * Math.log10(sq / n + 1e-20)).toFixed(1), silentShare: +(quiet / n).toFixed(3), clipped: peak >= 0.999 }));
