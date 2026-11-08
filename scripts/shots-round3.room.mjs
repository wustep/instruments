// room wavefronts and the lid: a chord in a hall with the lid open, half open, and a cello
const play = (inst, params, notes) => async (page) => {
  await page.evaluate(async ([i, p, ns]) => {
    await window.__piano.start();
    if (i !== 'piano') await window.__piano.setInstrument(i);
    window.__piano.setParams(p);
    window.__piano.sustain(1);
    for (const [m, v] of ns) {
      window.__piano.noteOn(m, v, 'keys');
      await new Promise((r) => setTimeout(r, 160));
    }
  }, [inst, params, notes]);
};
const chord = [[36, 100], [48, 90], [55, 90], [64, 96], [72, 100]];
export default [
  ['desktop-hall-lid-open', { route: '', action: play('piano', { room: 0.85, lid: 1 }, chord), wait: 500 }],
  ['desktop-small-room-lid-closed', { route: '', action: play('piano', { room: 0.1, lid: 0 }, chord), wait: 500 }],
  ['desktop-cello-hall', { route: '', action: play('cello', { room: 0.8 }, [[43, 110]]), wait: 1200 }],
  ['phone-hall', { route: '', device: 'phone', action: play('piano', { room: 0.8, lid: 0.7 }, chord), wait: 500 }],
];
