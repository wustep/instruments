// Minimal WAV encode/decode (PCM16 / float32), environment-agnostic.

export interface Audio {
  sampleRate: number;
  channels: Float32Array[];
}

export function encodeWav(a: Audio, bits: 16 | 32 = 16): Uint8Array {
  const nch = a.channels.length;
  const n = a.channels[0].length;
  const bps = bits / 8;
  const dataLen = n * nch * bps;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, bits === 32 ? 3 : 1, true);
  dv.setUint16(22, nch, true);
  dv.setUint32(24, a.sampleRate, true);
  dv.setUint32(28, a.sampleRate * nch * bps, true);
  dv.setUint16(32, nch * bps, true);
  dv.setUint16(34, bits, true);
  w(36, 'data');
  dv.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const s = a.channels[c][i];
      if (bits === 32) {
        dv.setFloat32(o, s, true);
      } else {
        const v = Math.max(-1, Math.min(1, s));
        dv.setInt16(o, Math.round(v < 0 ? v * 32768 : v * 32767), true);
      }
      o += bps;
    }
  }
  return new Uint8Array(buf);
}

export function decodeWav(bytes: Uint8Array): Audio {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let o = 12;
  let fmt = 1;
  let nch = 1;
  let sr = 44100;
  let bits = 16;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const len = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      fmt = dv.getUint16(body, true);
      nch = dv.getUint16(body + 2, true);
      sr = dv.getUint32(body + 4, true);
      bits = dv.getUint16(body + 14, true);
      if (fmt === 0xfffe) fmt = dv.getUint16(body + 24, true);
    } else if (id === 'data') {
      const bps = bits / 8;
      const n = Math.floor(Math.min(len, bytes.length - body) / (bps * nch));
      const ch = Array.from({ length: nch }, () => new Float32Array(n));
      let p = body;
      for (let i = 0; i < n; i++)
        for (let c = 0; c < nch; c++) {
          let v: number;
          if (fmt === 3 && bits === 32) v = dv.getFloat32(p, true);
          else if (bits === 16) v = dv.getInt16(p, true) / 32768;
          else if (bits === 24) {
            const b = dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getInt8(p + 2) << 16);
            v = b / 8388608;
          } else if (bits === 32) v = dv.getInt32(p, true) / 2147483648;
          else throw new Error(`unsupported bits ${bits}`);
          ch[c][i] = v;
          p += bps;
        }
      return { sampleRate: sr, channels: ch };
    }
    o = body + len + (len & 1);
  }
  throw new Error('no data chunk');
}
