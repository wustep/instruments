import { h, type View } from '../ui/dom.ts';

const p = (...c: (string | Node)[]) => h('p', {}, ...c);

export function notesView(): View {
  const el = h(
    'div',
    { class: 'view notes' },
    h('h2', {}, 'How it works'),
    h(
      'div',
      { class: 'prose', style: 'margin-top:14px' },
      p('A piano note is a short collision followed by a long conversation. A felt hammer is thrown at two or three steel strings, squashes against them for a couple of milliseconds, and bounces away. The strings then vibrate for tens of seconds, pushing on a wooden bridge that is glued to the soundboard — a large, thin spruce panel that actually moves the air. This model computes each of those parts as physics, every sample, in your browser.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Strings'),
      p('Each string is a pair of travelling waves running back and forth between the agraffe and the bridge, stored in a delay line (a digital waveguide). Real piano wire is stiff, so high partials travel faster and land sharp of a pure harmonic series — the slightly metallic, bell-like quality of a piano. A chain of all-pass filters reproduces that stretch for every key to within a fraction of a cent. Another small filter removes energy faster at high frequencies, as air and the wire itself do.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Hammer'),
      p('The hammer is a small mass with a felt spring that gets much stiffer the more it is squashed, and pushes back harder while compressing than while releasing. Play softly and the contact is long and gentle, giving a round, dark tone; play hard and it is short and sharp, adding upper partials. Nothing is filtered to fake this — it falls out of the felt law.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Two or three strings per note'),
      p('Most notes have two or three strings, tuned a hair apart. Struck together they push the bridge in step and lose energy quickly; as they drift out of step, part of the motion stops reaching the bridge and rings on for much longer. That is the piano’s characteristic two-stage decay and its gentle beating, and here it comes from the coupling itself.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Bridge and soundboard'),
      p('All strings end on one bridge that drives about 150 vibration modes of the soundboard. The soundboard pushes back on every string that is free to move, so with the pedal down, a struck C3 makes the strings of C4, G4 and C5 ring quietly on their own — sympathetic resonance, computed rather than added. Two virtual microphones over the bass and treble strings pick up the board, like the reference recording.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Dampers and pedals'),
      p('Releasing a key lowers a felt damper onto its strings, adding loss and a faint felt noise. The sustain pedal lifts all dampers gradually, so half-pedalling on a continuous pedal works. The soft pedal shifts the hammers so they miss one string of each trichord and meet softer felt. The top keys, as on a real grand, have no dampers at all.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Violin, viola, cello'),
      p('The same strings-and-bridge machinery, bowed instead of struck. The bow grips the string by friction until the string’s pull exceeds static friction, slips back, and is caught again — once per period. Nobody tells the string to do this; it falls out of the friction law, and you can watch it under “Look inside”. All four strings stand on one bridge over a wooden body with its own air and wood resonances, so open strings ring along with the notes you play.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Flute'),
      p('A thin jet of air flaps across the edge of the embouchure hole, steered by the sound already in the tube; the time it takes a ripple to ride the jet to the edge decides which resonance of the tube it feeds. Blow harder and the jet is faster, the tone brightens, and eventually the tube leaps up an octave — exactly how flutists reach the upper registers.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'What is approximate'),
      p('Each string vibrates in one plane only; the soundboard is plausible rather than measured; the hum of the longitudinal string waves in the bass is a simplified add-on; the room and the lid are ordinary audio effects; and the action noises are brief synthetic knocks. The Measurements page shows where these choices leave the model compared with a recorded Steinway.'),
      h('h3', { style: 'margin:30px 0 8px' }, 'Running it'),
      p('The synthesizer is an AudioWorklet written in TypeScript: on a Mac mini (M5 Pro) a struck note costs about a quarter of a percent of one CPU core, and all 88 keys at once about a fifth. The engine is a separate package with a small API — ', h('code', {}, 'createPiano(ctx)'), ', ', h('code', {}, 'noteOn'), ', ', h('code', {}, 'sustain'), ', and an offline renderer — so it can be dropped into another app.'),
    ),
    h('h2', {}, 'Sources'),
    h(
      'ol',
      { class: 'refs' },
      [
        'J. O. Smith, “Physical modeling using digital waveguides,” Computer Music Journal 16(4), 1992.',
        'B. Bank, Physics-based sound synthesis of the piano, M.Sc. thesis, BUTE / HUT, 2000; Bank, Zambon & Fontana, IEEE TASLP 18(4), 2010.',
        'J. Chabassier, A. Chaigne & P. Joly, “Modeling and simulation of a grand piano,” JASA 134(1), 2013.',
        'A. Chaigne & A. Askenfelt, “Numerical simulations of piano strings I,” JASA 95(2), 1994.',
        'G. Weinreich, “Coupled piano strings,” JASA 62(6), 1977.',
        'H. Fletcher, “Normal vibration frequencies of a stiff piano string,” JASA 36(1), 1964.',
        'J. S. Abel, V. Välimäki & J. O. Smith, “Robust, efficient design of allpass filters for dispersive string sound synthesis,” IEEE SPL 17(4), 2010.',
        'A. Stulov, “Hysteretic model of the grand piano hammer felt,” JASA 97(4), 1995; Hunt & Crossley, J. Appl. Mech. 42(2), 1975.',
        'K. Ege, X. Boutillon & M. Rébillat, “Vibroacoustics of the piano soundboard,” J. Sound Vib. 332(5), 2013.',
        'A. Askenfelt & E. V. Jansson, “From touch to string vibrations,” JASA 88(1) 1990 and 90(5) 1991.',
        'B. Bank & L. Sujbert, “Generation of longitudinal vibrations in piano strings,” JASA 117(4), 2005.',
        'Reference recordings: University of Iowa Musical Instrument Samples, Steinway model B (2001).',
      ].map((r) => h('li', {}, r)),
    ),
  );
  return { el, dock: false };
}
