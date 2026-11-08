// screenshots of the MIDI indicator: a fake device plugged in, a chord played from it
const fakeMidi = () => {
  const inputs = new Map();
  const access = { inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false };
  navigator.requestMIDIAccess = async () => access;
  window.__midi = {
    plug() {
      const input = { id: 'k', name: 'Keystation 49', state: 'connected', onmidimessage: null };
      inputs.set('k', input);
      access.onstatechange?.({ port: input });
    },
    send(b) {
      inputs.get('k').onmidimessage?.({ data: new Uint8Array(b) });
    },
  };
};
const play = (inst) => async (page) => {
  await page.evaluate(async (i) => {
    window.__midi.plug();
    await window.__piano.start();
    if (i !== 'piano') await window.__piano.setInstrument(i);
    for (const m of i === 'piano' ? [48, 55, 64, 67] : [69]) window.__midi.send([0x90, m, 96]);
    if (i !== 'piano') {
      window.__midi.send([0xb0, 1, 110]);
      window.__midi.send([0xe0, 0x00, 0x48]);
    }
  }, inst);
};
export default [
  ['desktop-piano', { route: '', init: fakeMidi, action: play('piano'), wait: 900 }],
  ['desktop-violin', { route: '', init: fakeMidi, action: play('violin'), wait: 1500 }],
  ['phone-piano', { route: '', device: 'phone', init: fakeMidi, action: play('piano'), wait: 900 }],
];
