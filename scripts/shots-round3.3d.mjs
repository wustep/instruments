// the 3D stage, each instrument, playing (live telemetry), desktop and phone
const play = (inst, preset, notes, opts = {}) => async (page) => {
  await page.evaluate(async ([i, pr, ns, o]) => {
    try { localStorage.setItem('piano-model.3d', '1'); } catch {}
    await window.__piano.start();
    await window.__piano.setInstrument(i);
    if (pr) {
      await window.__piano.setPreset(pr);
      document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
    }
    await new Promise((r) => setTimeout(r, 400)); // after the preset (it resets the lid)
    if (o.room !== undefined) window.__piano.setParams({ room: o.room });
    if (o.lid !== undefined) window.__piano.setParams({ lid: o.lid });
    if (o.pedal) window.__piano.sustain(1);
    for (const m of ns) {
      window.__piano.noteOn(m, 96, 'keys');
      await new Promise((r) => setTimeout(r, 90));
    }
  }, [inst, preset, notes, opts]);
  const btn = page.locator('.dim-toggle');
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
};
export default [
  ['desktop-grand', { route: '', action: play('piano', 'grand', [36, 48, 55, 64, 67, 72], { pedal: true }), wait: 900 }],
  ['desktop-grand-lid-closed', { route: '', action: play('piano', 'grand', [48, 60, 64, 67], { lid: 0 }), wait: 900 }],
  ['desktop-upright', { route: '', action: play('piano', 'upright', [36, 48, 55, 64, 67], { pedal: true }), wait: 900 }],
  ['desktop-violin', { route: '', instrument: 'violin', action: play('violin', null, [72]), wait: 1400 }],
  ['desktop-viola', { route: '', instrument: 'viola', action: play('viola', null, [60]), wait: 1400 }],
  ['desktop-cello', { route: '', instrument: 'cello', action: play('cello', null, [50]), wait: 1400 }],
  ['desktop-flute', { route: '', instrument: 'flute', action: play('flute', null, [74]), wait: 1400 }],
  ['desktop-trumpet', { route: '', instrument: 'trumpet', action: play('trumpet', null, [67]), wait: 1200 }],
  ['phone-grand', { route: '', device: 'phone', action: play('piano', 'grand', [48, 60, 64, 67], { pedal: true }), wait: 900 }],
  ['phone-cello', { route: '', device: 'phone', instrument: 'cello', action: play('cello', null, [50]), wait: 1400 }],
];
