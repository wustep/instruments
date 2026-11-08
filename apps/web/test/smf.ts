// A tiny Standard MIDI File writer for tests.
const vlq = (n: number) => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
export function smf(ppq: number, tracks: [delta: number, ...bytes: number[]][][]): Uint8Array {
  const body: number[] = [...'MThd'].map((c) => c.charCodeAt(0));
  body.push(...u32(6), ...u16(tracks.length > 1 ? 1 : 0), ...u16(tracks.length), ...u16(ppq));
  for (const t of tracks) {
    const data: number[] = [];
    for (const [delta, ...bytes] of t) data.push(...vlq(delta), ...bytes);
    data.push(0, 0xff, 0x2f, 0);
    body.push(...[...'MTrk'].map((c) => c.charCodeAt(0)), ...u32(data.length), ...data);
  }
  return Uint8Array.from(body);
}
