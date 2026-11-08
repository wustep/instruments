// Standard MIDI File reader (format 0 and 1): every track merged, the tempo map
// applied, timing in seconds. Notes, sustain/sostenuto/soft pedals; the drum channel
// (10) is skipped, since it would play pitches on a pitched instrument.

export type FileEvent =
  | { t: number; kind: 'on'; midi: number; vel: number }
  | { t: number; kind: 'off'; midi: number }
  | { t: number; kind: 'pedal'; cc: 64 | 66 | 67; value: number };

export interface MidiSong {
  events: FileEvent[];
  duration: number;
}

export function parseMidi(buf: ArrayBuffer): MidiSong {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i));
    return s;
  };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hlen = d.getUint32(4);
  const ntracks = d.getUint16(10);
  const division = d.getUint16(12);
  p = 8 + hlen;
  // ticks → seconds: PPQ with a tempo map, or SMPTE (fixed ticks per second)
  const smpte = (division & 0x8000) !== 0;
  const ppq = division & 0x7fff;
  const smpteTps = smpte ? -((division >> 8) - 256 || -25) * (division & 0xff) : 0;

  type Raw = { tick: number; order: number; ev: { kind: 'on' | 'off' | 'pedal' | 'tempo'; a: number; b: number } };
  const raw: Raw[] = [];
  let order = 0;
  for (let tr = 0; tr < ntracks && p + 8 <= d.byteLength; tr++) {
    const id = str(4);
    const len = d.getUint32(p + 4);
    p += 8;
    const end = Math.min(d.byteLength, p + len);
    if (id !== 'MTrk') {
      p = end;
      continue;
    }
    let tick = 0;
    let status = 0;
    const vlq = () => {
      let v = 0;
      for (let i = 0; i < 4 && p < end; i++) {
        const b = d.getUint8(p++);
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return v;
    };
    while (p < end) {
      tick += vlq();
      let b = d.getUint8(p);
      if (b & 0x80) {
        status = b;
        p++;
      } else if (!status) break; // corrupt: data without status
      b = status;
      if (b === 0xff) {
        const type = d.getUint8(p++);
        const l = vlq();
        if (type === 0x51 && l === 3) raw.push({ tick, order: order++, ev: { kind: 'tempo', a: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2), b: 0 } });
        p += l;
        if (type === 0x2f) break;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        p += vlq();
        continue;
      }
      const type = b & 0xf0;
      const ch = b & 0x0f;
      const d1 = d.getUint8(p++);
      const d2 = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
      if (ch === 9) continue;
      if (type === 0x90 && d2 > 0) raw.push({ tick, order: order++, ev: { kind: 'on', a: d1, b: d2 } });
      else if (type === 0x80 || (type === 0x90 && d2 === 0)) raw.push({ tick, order: order++, ev: { kind: 'off', a: d1, b: 0 } });
      else if (type === 0xb0 && (d1 === 64 || d1 === 66 || d1 === 67)) raw.push({ tick, order: order++, ev: { kind: 'pedal', a: d1, b: d2 } });
    }
    p = end;
  }
  // same tick: tempo first, then note-offs (a repeated note re-strikes), then the rest
  const rank = { tempo: 0, off: 1, pedal: 2, on: 3 } as const;
  raw.sort((x, y) => x.tick - y.tick || rank[x.ev.kind] - rank[y.ev.kind] || x.order - y.order);
  const events: FileEvent[] = [];
  let usPerQ = 500000;
  let lastTick = 0;
  let sec = 0;
  for (const r of raw) {
    sec += smpte ? (r.tick - lastTick) / smpteTps : ((r.tick - lastTick) * usPerQ) / 1e6 / (ppq || 480);
    lastTick = r.tick;
    const e = r.ev;
    if (e.kind === 'tempo') usPerQ = e.a || 500000;
    else if (e.kind === 'on') events.push({ t: sec, kind: 'on', midi: e.a, vel: e.b });
    else if (e.kind === 'off') events.push({ t: sec, kind: 'off', midi: e.a });
    else events.push({ t: sec, kind: 'pedal', cc: e.a as 64 | 66 | 67, value: e.b / 127 });
  }
  return { events, duration: events.length ? events[events.length - 1].t : 0 };
}
