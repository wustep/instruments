// screenshots of the MIDI-file player: an original eight-chord chorale dropped on the page
const vlq = (n) => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
function chorale() {
  const chords = [[36, 48, 55, 63, 67], [41, 53, 56, 65, 68], [43, 50, 55, 62, 71], [36, 48, 55, 63, 72], [44, 51, 56, 63, 72], [41, 53, 57, 63, 69], [43, 50, 55, 62, 67], [36, 48, 55, 60, 63]];
  const ev = [];
  chords.forEach((c, i) => {
    ev.push([i ? 0 : 0, 0xb0, 64, 0], [40, 0xb0, 64, 127]);
    c.forEach((m, j) => ev.push([j ? 6 : 0, 0x90, m, 64 + (j === c.length - 1 ? 18 : 6)]));
    c.forEach((m, j) => ev.push([j ? 0 : 860, 0x80, m, 0]));
  });
  const data = ev.flatMap(([d, ...b]) => [...vlq(d), ...b]).concat([0, 0xff, 0x2f, 0]);
  const hdr = [77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224];
  const len = data.length;
  return [...hdr, 77, 84, 114, 107, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...data];
}
const drop = (wait) => async (page) => {
  await page.evaluate(async (b) => {
    await window.__piano.start();
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'chorale.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, chorale());
  await page.waitForTimeout(wait);
};
export default [
  ['desktop-piano', { route: '', action: drop(2600), wait: 200 }],
  ['desktop-cello', { route: '', instrument: 'cello', action: drop(2600), wait: 200 }],
  ['phone-piano', { route: '', device: 'phone', action: drop(2600), wait: 200 }],
];
