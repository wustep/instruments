// Notes: how each instrument is modelled, how it was calibrated and where it falls short.
// The one page allowed to be long; the stage itself stays nearly wordless.

import { h, type View } from '../ui/dom.ts';

type Kid = string | Node;
const p = (...c: Kid[]) => h('p', {}, ...c);
const eq = (...lines: string[]) => h('div', { class: 'eq', role: 'math' }, lines.map((l) => h('div', {}, l)));
const ul = (...items: (Kid | Kid[])[]) => h('ul', {}, items.map((i) => h('li', {}, ...(Array.isArray(i) ? i : [i]))));
const em = (s: string) => h('em', {}, s);
const code = (s: string) => h('code', {}, s);
const table = (head: string[], rows: (string | number)[][]) =>
  h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, head.map((c) => h('th', {}, c)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, String(c))))))));

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(viewBox: string, label: string, inner: string): HTMLElement {
  const fig = h('figure', { class: 'diagram' });
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', label);
  s.innerHTML = inner;
  fig.appendChild(s);
  fig.appendChild(h('figcaption', {}, label));
  return fig;
}

const waveguide = () =>
  svg(
    '0 0 640 170',
    'A piano string as a digital waveguide: two travelling waves in a delay loop, the hammer acting at β ≈ 1/8, the bridge coupling every string to the soundboard modes.',
    `<g fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="60" y="40" width="380" height="22" rx="4"/><rect x="60" y="92" width="380" height="22" rx="4"/>
      <path d="M440 51 H470 V103 H440" /><path d="M60 103 H30 V51 H60"/>
      <path d="M100 51 l10 -4 v8 z M420 103 l-10 -4 v8 z" fill="currentColor"/>
      <rect x="490" y="30" width="120" height="96" rx="6" stroke-dasharray="3 3"/>
      <path d="M470 77 H490"/>
    </g>
    <g fill="currentColor" font-family="IBM Plex Mono, monospace" font-size="11">
      <text x="200" y="34">→ wave towards the bridge</text><text x="200" y="132">← reflected wave</text>
      <text x="6" y="80">agraffe</text><text x="436" y="148">bridge</text>
      <text x="500" y="56">soundboard</text><text x="500" y="72">~150 modes</text><text x="500" y="88">(all strings</text><text x="500" y="104">share them)</text>
      <text x="95" y="158">hammer at β·L</text>
    </g>
    <path d="M110 150 V118" stroke="#ff5e38" stroke-width="2"/>
    <text x="252" y="82" font-family="IBM Plex Mono, monospace" font-size="10" fill="currentColor">dispersion all-passes · loss filter · fractional delay</text>`,
  );

const friction = () => {
  // μ(Δv) = μd + (μs − μd)·v0/(v0 + |Δv|), μs 0.8, μd 0.3, v0 0.2 m/s
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const dv = -1.2 + (2.4 * i) / 120;
    if (Math.abs(dv) < 0.01) continue;
    const mu = Math.sign(dv) * (0.3 + 0.5 * (0.2 / (0.2 + Math.abs(dv))));
    pts.push(`${(40 + (i / 120) * 520).toFixed(1)},${(85 - mu * 90).toFixed(1)}`);
  }
  const left = pts.filter((_, i) => i < 60).join(' ');
  const right = pts.filter((_, i) => i >= 60).join(' ');
  return svg(
    '0 0 600 170',
    'The bow’s friction: while the string sticks the force can be anything up to μs·F (vertical line); once it slips, friction falls towards μd as the slip speed grows.',
    `<g stroke="currentColor" fill="none" stroke-width="1"><path d="M30 85 H570 M300 10 V160" opacity=".35"/></g>
     <polyline points="${left}" fill="none" stroke="#f2a646" stroke-width="2"/>
     <polyline points="${right}" fill="none" stroke="#f2a646" stroke-width="2"/>
     <path d="M300 13 V157" stroke="#ff5e38" stroke-width="3"/>
     <g fill="currentColor" font-family="IBM Plex Mono, monospace" font-size="11">
       <text x="306" y="22">stick: |f| ≤ μs·F</text><text x="430" y="70">slip → μd</text><text x="470" y="100">slip speed Δv</text><text x="40" y="22">friction f / F</text>
     </g>`,
  );
};

interface Sec {
  id: string;
  title: string;
  body: Kid[];
}

export function notesView(): View {
  const secs: Sec[] = [
    {
      id: 'overview',
      title: 'What this is',
      body: [
        p('Six acoustic instruments — piano, violin, viola, cello, flute and trumpet — computed as physics, sample by sample, in your browser. No recorded sound is ever played as the instrument. Each is a small set of coupled physical parts: a string or an air column that carries waves, something that drives it (a felt hammer, a bow, a jet of breath, buzzing lips), and something that radiates (a soundboard, a wooden body, an open end, a bell), heard in a modelled room.'),
        p('Everything runs in an AudioWorklet written in TypeScript. The same DSP core runs in Node for tests, calibration and offline rendering, so every number on these pages comes from the code you are hearing.'),
      ],
    },
    {
      id: 'piano',
      title: 'Piano',
      body: [
        h('h3', {}, 'Strings: travelling waves'),
        p('Each string is a digital waveguide: the solution of the wave equation is two waves travelling in opposite directions, stored in a delay loop whose length is the round trip from the agraffe to the bridge (Smith 1992). Losses, stiffness and the exact tuning are lumped into small filters in that loop.'),
        waveguide(),
        p('Piano wire is stiff, so its partials are not harmonic. Partial ', em('k'), ' of a string with inharmonicity ', em('B'), ' sits at'),
        eq('f_k = k · f₀ · √(1 + B·k²)'),
        p('which makes the upper partials progressively sharp — the slightly metallic, bell-like quality of a piano. A cascade of second-order all-pass filters, designed per key (after Abel, Välimäki & Smith 2010), gives the loop exactly this frequency-dependent delay: the first 120 partials land within about 0.3 ¢ of the formula. A fractional (Thiran) delay sets partial 1 to the stretched tuning measured on the reference piano.'),
        p('Losses grow with frequency. Each string’s loop has a one-pole filter fitted to target decay rates:'),
        eq('σ(f) = σ₁ + c · (f² − f₁²),   T₆₀(f) = ln 1000 / σ(f)', 'σ₁ from T₆₀ at partial 1, c from T₆₀ at 3 kHz (both per register, calibrated)'),
        h('h3', {}, 'Two or three strings per note'),
        p('Most notes have two or three strings, tuned a fraction of a cent apart (tuners hear this as a slow beat, so above the middle the spread is held as a beat rate rather than a fixed number of cents). Struck together they push the bridge in phase and give energy away quickly; as they drift apart, part of the motion stops reaching the bridge and rings on — the piano’s two-stage decay (Weinreich 1977). Each string also has a second, horizontal polarisation, weakly coupled to the bridge.'),
        p('Since round 3 each string of a unison has its own stiffness, ±2 % around the key’s: real wires and tensions differ. Without it the strings were exact copies, and their beating swept a perfectly regular comb through the upper partials — a flanger that read as “robotic”. With it, the high partials detune by different amounts (∝ k²·ΔB) and the beating becomes irregular, as on a real piano.'),
        h('h3', {}, 'Hammer'),
        p('The hammer is a mass on a felt spring that stiffens as it is squashed and pushes back harder while compressing than while releasing (Hunt & Crossley; Stulov):'),
        eq('F = K · xᵖ · (1 + λ·ẋ)', 'x: felt compression, p ≈ 2.8–4 (fitted per register), λ: hysteresis'),
        p('It is solved implicitly every sample together with the strings it touches. A soft blow is a long, gentle contact (round, dark tone); a hard one is short and sharp and excites the upper partials — loud notes are brighter by physics, not by a filter. Key velocity maps to hammer speeds of about 0.5–5.7 m/s.'),
        h('h3', {}, 'Bridge, soundboard and sympathetic strings'),
        p('All strings end on bridges over about 150 soundboard modes, each a damped resonator with its own frequency and mode shape at three bridge zones. The board’s motion is solved jointly with every string touching it, so the board pushes back: with the pedal down, striking C3 makes C4, G4 and C5 ring quietly on their own (on the stage, those strings move in amber). Above ~700 Hz, where real boards are too dense to model mode by mode, the radiated sound is the bridge force times a mobility, diffused.'),
        h('h3', {}, 'Dampers, pedals and the action'),
        ul(
          'Dampers press on gradually when a key is released, with their own decay targets; the sustain pedal lifts them continuously, so half-pedalling works. The top keys, as on a grand, have no dampers.',
          'Una corda shifts the hammer off one string of three (and onto softer felt); sostenuto holds the dampers that are up.',
          'The key and action knock is a short force on the frame and board: a 1.6 ms thud plus, since round 3, a 4 ms tick of contact noise, different on every strike, that also reaches the high-frequency path (the attack used to be far too clean above 6 kHz).',
          'In the bass, the strings’ longitudinal motion adds “phantom” partials through two longitudinal resonances.',
        ),
      ],
    },
    {
      id: 'strings',
      title: 'Violin, viola, cello',
      body: [
        p('The same strings-and-bridge machinery, bowed instead of struck. The bow grips the string by friction until the string’s pull exceeds it, slips back, and is caught again — once per period. Nobody tells the string to do this; the Helmholtz motion (a corner circulating along the string) emerges from the friction law (McIntyre, Schumacher & Woodhouse 1983).'),
        friction(),
        eq('μ(Δv) = μd + (μs − μd) · v₀ / (v₀ + |Δv|),   μs = 0.8, μd = 0.3, v₀ = 0.2 m/s', 'stick while |2Z·(v_bow − v_string)| ≤ μs·F, otherwise solve the slip on the curve'),
        p('Whether the bow can hold Helmholtz motion depends on the force, the bow speed and the distance β from the bridge. Schelleng’s maximum is'),
        eq('F_max = 2Z · v_bow / (β · (μs − μd))'),
        p('Players get louder mostly by moving the bow towards the bridge rather than by pressing harder; the model does the same, so louder notes are both brighter and stay in Helmholtz motion. The bow speed is capped at realistic values (0.33–0.4 m/s).'),
        h('h3', {}, 'One bow, with a length'),
        p('There is one bow, with a length and a contact point along the hair. Each détaché note takes the other direction (down-bow, up-bow); slurs and chords continue the stroke; when the hair runs out the bow changes on its own: a ~70 ms cosine reversal through zero speed with a slight weight dip, after which the stick–slip re-forms the other way round.'),
        h('h3', {}, 'Fingers, vibrato and the body'),
        p('A stopped note shortens the string’s loop. Vibrato rocks that length (the recorded cellist: about 17 ¢ at 5.4 Hz); the loop is read at a fractional position at the bridge. Since round 3 the bow’s taps sit on the note’s nominal loop rather than the gliding one: following the glide made them jump by a whole sample a dozen times per vibrato cycle, each a click between the harmonics (the cello was 3.9 dB noisier than its recording; now 0.2 dB).'),
        p('All four strings stand on one bridge over a modal body: the air resonance A0 and the wood modes B1− and B1+ low down, statistically spaced modes above, and a high-frequency path for what radiates above the modal range. Open strings are driven back by the body and ring sympathetically.'),
      ],
    },
    {
      id: 'flute',
      title: 'Flute',
      body: [
        p('A thin jet of breath crosses the embouchure hole and hits the far edge. Sound in the tube deflects the jet at the lip; the deflection rides the jet to the edge, where it sends air into or out of the tube. The time the ride takes decides which resonance of the tube is fed:'),
        eq('U_j = √(2p / ρ),   τ_j = l_j / (0.45 · U_j)', 'blow harder: faster jet, shorter delay, brighter tone, slightly sharper — and eventually the tube leaps to its next mode (overblowing)'),
        p('The jet is aimed slightly off the edge, so it splits unevenly and makes even harmonics; vortices shed at the edge limit the amplitude before the jet saturates; and both openings radiate as small pulsating spheres, so the sound is the rate of change of the air flowing in and out of them (monopole radiation). Fingering shortens the tube (there are no individual tone holes in the model); the upper registers are overblown modes of the same fingering.'),
        p('Round 3 added the tongue: when it releases the breath, the jet’s front sweeps across the edge once — a coherent push that seeds the tube — and the jet is briefly sharper. Before, the oscillation grew from turbulence alone and notes took ~4× too long to speak in the middle and upper registers.'),
      ],
    },
    {
      id: 'trumpet',
      title: 'Trumpet',
      body: [
        p('The player’s lips are a valve: a small mass on a spring, tuned near the note, pushed open by the mouth pressure and closed again by the pressure in the mouthpiece. Air through the opening drives a bore; the bore’s round trip sets its harmonic series; and the lips lock to the bore mode just above their own resonance (Cook 1991; STK’s Brass, with real valve fingerings):'),
        eq('ÿ + (ω_lip/Q)·ẏ + ω_lip²·y ∝ p_mouth − p_bore', 'opening h = h₀(p_mouth) + y,   flow ∝ h²   (louder ⇒ more of the cycle saturates ⇒ brighter)'),
        p('The B♭ trumpet’s open tube plays partials 2, 3, 4, 5, 6, 8 … of B♭2. The three valves add tubing — 2 semitones (1st), 1 (2nd), 3 (3rd) — and the lip tension picks which partial of the lengthened tube sounds. Each note uses the standard fingering (fewest valves, then lowest partial):'),
        table(
          ['concert note', 'valves', 'partial'],
          [
            ['E3', '1+2+3', 2],
            ['G3', '1+2', 2],
            ['A3', '2', 2],
            ['B♭3', 'open', 2],
            ['D4', '1+2', 3],
            ['F4', 'open', 3],
            ['B♭4', 'open', 4],
            ['D5', 'open', 5],
            ['F5', 'open', 6],
            ['B♭5', 'open', 8],
          ],
        ),
        p('The lips pull the playing frequency above the bore’s mode — by up to a semitone in the low register — so a measured table lengthens the bore and lowers the lips per note: the model now plays within ±6 ¢ at pp and ±2 ¢ at ff, its pitch rising slightly with dynamics as on real brass. The trumpet is new this round and has not yet been compared with recordings.'),
      ],
    },
    {
      id: 'room',
      title: 'The room',
      body: [
        p('Everything is heard a few metres away in a modelled hall. Early reflections come from an image-source model of a shoebox room (Allen & Berkley 1979): the six first-order and eighteen second-order mirror images of the source, each with its own delay to each of two cardioid microphones 0.6 m apart, 1/r spreading, wall loss and more high-frequency absorption per bounce. The late reverberation is a 16-line feedback delay network (Jot & Chaigne 1991) with Hadamard mixing, input diffusion, slow delay modulation against metallic ringing, and per-line filters that give the bass a longer decay and the treble a shorter one, as in a real hall:'),
        eq('T₆₀(mid) = 0.7 + 1.7·room  s,   T₆₀(low) ≈ 1.2×,   T₆₀(8 kHz) ≈ 0.5×'),
        p('Measured from its impulse response, the tail is now diffuse (fine-structure roughness 6.5–6.7 dB, against 5.6 dB for ideal noise and 8.9 dB for the round-2 room), echo density builds within 62–90 ms (was 130–216 ms), and its loudness relative to the dry sound is unchanged. On the stage the wavefronts and their reflections follow these numbers; drag the room’s edge to change it, and the grand’s lid to throw more or less of the sound towards the room.'),
      ],
    },
    {
      id: 'calibration',
      title: 'Calibration: measured against real instruments',
      body: [
        p('The models are tuned against recordings from the University of Iowa Musical Instrument Samples — a Steinway model B (2001), and anechoic violin, viola, cello and flute — used for analysis only. The same analysis runs on the recording and on a dry render of the model at the same notes and dynamics, and parameters move only to reduce the measured difference.'),
        h('h3', {}, 'Like with like'),
        p('Three corrections this round made the comparisons fairer:'),
        ul(
          'Each model note is rendered exactly as long as the part of the recording that is analysed. The decay fit takes its noise floor from the last stretch of what it is given; on a short dry render that “floor” was the still-decaying note, which made long decays look short (the piano’s bass aftersound read ×0.67 at 22 s, ×0.79 at the recording’s 30 s).',
          'Model vibrato matches the recording: none where the player used none.',
          'With vibrato, a note’s pitch is the centre of its fine pitch track. The median of long-frame spectral peaks was pulled towards the louder side of the swing (the cello read 4.25 ¢ scatter; 2.47 ¢ measured fairly).',
        ),
        h('h3', {}, 'Where it stands'),
        table(
          ['piano (Steinway B)', 'now', 'round 2'],
          [
            ['stretch tuning, ¢ RMS', '3.86', '4.10'],
            ['inharmonicity B, log₁₀ RMS', '0.064', '0.068'],
            ['prompt T60 model/recording: A0–B1 / C2–B3 / C4–B5 / C6–C8', '1.00 / 1.04 / 0.97 / 0.76', '1.01 / 1.15 / 0.93 / 0.90 *'],
            ['late T60 model/recording', '0.79 / 1.27 / 1.03 / 1.12', '0.79 / 1.28 / 1.11 / 1.03 *'],
            ['⅓-octave spectrum at mf, dB', '4.63', '4.64'],
            ['loudness per note, dB (pp / mf / ff)', '8.4 / 4.7 / 5.5', '8.3 / 4.7 / 5.4'],
          ],
        ),
        p(h('span', { class: 'hint' }, '* round 2 re-measured with this round’s method.')),
        table(
          ['strings & flute (Iowa, anechoic)', 'harmonic error dB', 'spectrum dB', 'noise vs recording dB', 'attack ×', 'pitch ¢'],
          [
            ['violin', '11.7', '14.6', '+0.3', '0.26', '2.2'],
            ['viola', '11.2', '11.0', '−1.0', '0.45', '1.6'],
            ['cello', '11.2', '15.5', '−0.2', '1.18', '3.1'],
            ['flute', '7.1', '4.7', '+5.4', '1.14', '1.0'],
          ],
        ),
        p('Full histories are in the repository: ', code('docs/calibration-rounds.json'), ', ', code('docs/ensemble-rounds.json'), ', and the Measurements page charts the details.'),
      ],
    },
    {
      id: 'limits',
      title: 'Known limitations',
      body: [
        ul(
          ['Piano: the lowest octave’s aftersound is about ', em('×0.8'), ' of the recording’s; its string-loss breakpoints are at their limits and a one-pole loss filter cannot hold the low partials’ long decay. The top octave’s prompt decay is ×0.76 since the unisons got individual stiffness. The treble knock (0.3–1 kHz) is about 10 dB weaker than the Steinway’s. The soundboard modes are plausible, not measured.'],
          'Strings: the spectra are 11–15 dB RMS from the recordings, and loud notes are too dark (ff centroid well below the recording’s); the bodies are modal sketches whose radiation is fitted, not measured. No torsional waves, no finite bow width.',
          'Flute: the low register’s second harmonic at mf/ff is still several dB short of the real H2 ≈ H1; the model is about 5 dB cleaner (less breath noise) than the recording. No individual tone holes.',
          'Trumpet: not yet compared with recordings; the bore is an ideal harmonic loop (no mouthpiece or bell impedance curve), no mutes.',
          'The room is a plausible hall, not a measured one, and costs about 0.8 % of one CPU core (the round-2 room cost 0.2 %).',
        ),
      ],
    },
    {
      id: 'design',
      title: 'Design decisions',
      body: [
        ul(
          'Waveguides and modal bodies rather than finite-difference grids: they give exact tuning and dispersion at a cost that allows all 88 keys and their sympathetic strings in real time in JavaScript.',
          'TypeScript, not WebAssembly: measured fast enough (a struck note costs about a quarter of a percent of one core on an Apple M5 Pro), and the same code runs in Node for tests and calibration.',
          'The piano’s filter designs (one per string) are computed when the site is built and shipped as data, so starting the instrument costs the audio thread about 10 ms instead of ~0.4 s (several seconds on a slow machine).',
          'Measured, not tuned by ear: every calibration change is kept only if the numbers against the recordings improve, and regressions are reported.',
          'The stage draws the engine’s own state — string shapes, levels, the bow, the bore’s pressure, the board’s modes — so what you see is what is being computed.',
        ),
      ],
    },
  ];

  const toc = h(
    'nav',
    { class: 'toc', 'aria-label': 'Sections' },
    secs.map((s) => h('button', { type: 'button', onclick: () => document.getElementById(`n-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, s.title)),
  );
  const el = h(
    'div',
    { class: 'view notes' },
    h('h2', {}, 'How it works'),
    toc,
    h('div', { class: 'prose note-body' }, secs.map((s) => h('section', { id: `n-${s.id}` }, h('h2', { class: 'sec' }, s.title), ...s.body))),
    h('h3', { style: 'margin-top:40px' }, 'Sources'),
    h(
      'ol',
      { class: 'refs' },
      [
        'J. O. Smith, “Physical modeling using digital waveguides,” Computer Music Journal 16(4), 1992',
        'B. Bank, Physics-based sound synthesis of the piano, 2000; Bank, Zambon & Fontana, IEEE TASLP 18(4), 2010',
        'J. Chabassier, A. Chaigne & P. Joly, “Modeling and simulation of a grand piano,” JASA 134(1), 2013',
        'A. Chaigne & A. Askenfelt, “Numerical simulations of piano strings,” JASA 95(2), 1994',
        'G. Weinreich, “Coupled piano strings,” JASA 62(6), 1977',
        'H. Fletcher, “Normal vibration frequencies of a stiff piano string,” JASA 36(1), 1964',
        'J. S. Abel, V. Välimäki & J. O. Smith, “Robust, efficient design of allpass filters for dispersive string sound synthesis,” IEEE SPL 17(4), 2010',
        'A. Stulov, “Hysteretic model of the grand piano hammer felt,” JASA 97(4), 1995; K. H. Hunt & F. R. E. Crossley, J. Appl. Mech. 42(2), 1975',
        'K. Ege, X. Boutillon & M. Rébillat, “Vibroacoustics of the piano soundboard,” JSV 332(5), 2013',
        'A. Askenfelt & E. V. Jansson, “From touch to string vibrations,” JASA 88(1), 1990',
        'B. Bank & L. Sujbert, “Generation of longitudinal vibrations in piano strings,” JASA 117(4), 2005',
        'M. E. McIntyre, R. T. Schumacher & J. Woodhouse, “On the oscillations of musical instruments,” JASA 74(5), 1983; J. Woodhouse, Acta Acustica 89, 2003',
        'J. C. Schelleng, “The bowed string and the player,” JASA 53(1), 1973',
        'N. H. Fletcher & T. D. Rossing, The Physics of Musical Instruments, 2nd ed., Springer 1998',
        'B. Fabre, A. Hirschberg & A. P. J. Wijnands, Acta Acustica 82, 1996; R. Auvray, B. Fabre & P.-Y. Lagrée, JASA 131(4), 2012',
        'P. R. Cook, “TBone: an interactive waveguide brass instrument synthesis workbench,” ICMC 1991; the Synthesis ToolKit (STK), Brass',
        'J. B. Allen & D. A. Berkley, “Image method for efficiently simulating small-room acoustics,” JASA 65(4), 1979',
        'J.-M. Jot & A. Chaigne, “Digital delay networks for designing artificial reverberators,” AES 90th Convention, 1991',
        'University of Iowa Musical Instrument Samples (analysis only; never played as the instrument)',
      ].map((r) => h('li', {}, r)),
    ),
  );
  return { el, dock: false };
}
