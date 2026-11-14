// A Standard MIDI File read and written track by track, every event kept as its own bytes (the status
// written out: no running status), so a file can be given dynamics and nothing else of it moves: each
// track's notes, their ticks, the tempo map, the names and the programs are the file's, in its order.

export interface SmfEvent {
  tick: number;
  /** the event whole: status and data; a meta event FF type length data; a sysex F0/F7 length data */
  bytes: number[];
}

export interface Smf {
  format: number;
  ppq: number;
  tracks: SmfEvent[][];
}

const vlq = (n: number): number[] => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};

export function readSmf(buf: Uint8Array): Smf {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const str = (p: number) => String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
  if (str(0) !== 'MThd') throw new Error('not a MIDI file');
  const format = d.getUint16(8);
  const n = d.getUint16(10);
  const ppq = d.getUint16(12);
  if (ppq & 0x8000) throw new Error('SMPTE time is not read');
  let p = 8 + d.getUint32(4);
  const tracks: SmfEvent[][] = [];
  for (let tr = 0; tr < n; tr++) {
    if (str(p) !== 'MTrk') throw new Error(`track ${tr}: no MTrk`);
    const end = p + 8 + d.getUint32(p + 4);
    p += 8;
    const events: SmfEvent[] = [];
    let tick = 0;
    let status = 0;
    const readVlq = (): number[] => {
      const b: number[] = [];
      do b.push(buf[p++]);
      while (b[b.length - 1] & 0x80);
      return b;
    };
    const value = (b: number[]) => b.reduce((v, x) => (v << 7) | (x & 0x7f), 0);
    while (p < end) {
      tick += value(readVlq());
      if (buf[p] & 0x80) status = buf[p++];
      if (status === 0xff) {
        const type = buf[p++];
        const len = readVlq();
        const l = value(len);
        events.push({ tick, bytes: [0xff, type, ...len, ...buf.subarray(p, p + l)] });
        p += l;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVlq();
        const l = value(len);
        events.push({ tick, bytes: [status, ...len, ...buf.subarray(p, p + l)] });
        p += l;
      } else {
        const two = (status & 0xf0) !== 0xc0 && (status & 0xf0) !== 0xd0;
        events.push({ tick, bytes: two ? [status, buf[p], buf[p + 1]] : [status, buf[p]] });
        p += two ? 2 : 1;
      }
    }
    p = end;
    tracks.push(events);
  }
  return { format, ppq, tracks };
}

export function writeSmf(s: Smf): Uint8Array {
  const out: number[] = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, s.format >> 8, s.format & 255, s.tracks.length >> 8, s.tracks.length & 255, s.ppq >> 8, s.ppq & 255];
  for (const t of s.tracks) {
    const data: number[] = [];
    let last = 0;
    for (const e of t) {
      data.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    const n = data.length;
    out.push(0x4d, 0x54, 0x72, 0x6b, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    for (const b of data) out.push(b);
  }
  return Uint8Array.from(out);
}

export const isOn = (e: SmfEvent) => (e.bytes[0] & 0xf0) === 0x90 && e.bytes[2] > 0;
export const isOff = (e: SmfEvent) => (e.bytes[0] & 0xf0) === 0x80 || ((e.bytes[0] & 0xf0) === 0x90 && e.bytes[2] === 0);
export const isCC = (e: SmfEvent, cc: number) => (e.bytes[0] & 0xf0) === 0xb0 && e.bytes[1] === cc;
export const isEnd = (e: SmfEvent) => e.bytes[0] === 0xff && e.bytes[1] === 0x2f;

/** The file's lines as the page counts them (midi-file.ts): a track's notes on one channel, in the order
 *  of their tracks and channels, the drum channel left out. */
export function linesOf(s: Smf): { track: number; channel: number }[] {
  const keys = new Set<number>();
  s.tracks.forEach((t, tr) => {
    for (const e of t) if (isOn(e) && (e.bytes[0] & 15) !== 9) keys.add(tr * 16 + (e.bytes[0] & 15));
  });
  return [...keys].sort((a, b) => a - b).map((k) => ({ track: k >> 4, channel: k & 15 }));
}

/** the bar's length in ticks (the file's first time signature; 4/4 with none), and whether it ever changes */
export function barOf(s: Smf): { ticks: number; changes: boolean } {
  const lens: number[] = [];
  for (const t of s.tracks) for (const e of t) if (e.bytes[0] === 0xff && e.bytes[1] === 0x58) lens.push((e.bytes[3] * 4 * s.ppq) / 2 ** e.bytes[4]);
  return { ticks: lens[0] ?? 4 * s.ppq, changes: lens.some((l) => l !== lens[0]) };
}

/** ticks → seconds by the file's tempo map */
export function secondsOf(s: Smf): (tick: number) => number {
  const tempi: [number, number][] = [];
  for (const t of s.tracks) for (const e of t) if (e.bytes[0] === 0xff && e.bytes[1] === 0x51) tempi.push([e.tick, (e.bytes[3] << 16) | (e.bytes[4] << 8) | e.bytes[5]]);
  tempi.sort((a, b) => a[0] - b[0]);
  // each tempo's start in seconds
  const at: { tick: number; sec: number; us: number }[] = [{ tick: 0, sec: 0, us: 500000 }];
  for (const [tick, us] of tempi) {
    const l = at[at.length - 1];
    const sec = l.sec + ((tick - l.tick) * l.us) / 1e6 / s.ppq;
    if (tick === l.tick) l.us = us;
    else at.push({ tick, sec, us });
  }
  return (tick: number) => {
    let i = at.length - 1;
    while (i > 0 && at[i].tick > tick) i--;
    return at[i].sec + ((tick - at[i].tick) * at[i].us) / 1e6 / s.ppq;
  };
}
