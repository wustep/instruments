// Notes: how each instrument is modelled, how it was calibrated and where it falls short.
// The one page allowed to be long; the stage itself stays nearly wordless.

import { h, type View } from '../ui/dom.ts';
import { INSTRUMENT_IDS, INSTRUMENT_INFO } from '@piano-model/engine';
import { DEMOS, PIECES } from '../orchestra/pieces.ts';

type Kid = string | Node;
const p = (...c: Kid[]) => h('p', {}, ...c);
const eq = (...lines: string[]) => h('div', { class: 'eq', role: 'math' }, lines.map((l) => h('div', {}, l)));
const ul = (...items: (Kid | Kid[])[]) => h('ul', {}, items.map((i) => h('li', {}, ...(Array.isArray(i) ? i : [i]))));
const em = (s: string) => h('em', {}, s);
const code = (s: string) => h('code', {}, s);
const h3 = (s: string) => h('h3', {}, s);
const table = (head: string[], rows: (string | number)[][], note?: string) =>
  h(
    'div',
    { class: 'tbl' },
    h('table', {}, h('thead', {}, h('tr', {}, head.map((c) => h('th', {}, c)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, String(c))))))),
    note ? h('div', { class: 'hint' }, note) : '',
  );

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
const T = (x: number, y: number, s: string) => `<text x="${x}" y="${y}">${s}</text>`;

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
    <g fill="currentColor" class="lbl">
      ${T(200, 34, '→ wave towards the bridge')}${T(200, 132, '← reflected wave')}
      ${T(6, 80, 'agraffe')}${T(436, 148, 'bridge')}
      ${T(500, 56, 'soundboard')}${T(500, 72, '~150 modes')}${T(500, 88, '(all strings')}${T(500, 104, 'share them)')}
      ${T(95, 158, 'hammer at β·L')}
      ${T(150, 82, 'dispersion all-passes · loss filter · fractional delay')}
    </g>
    <path d="M110 150 V118" class="hot" stroke-width="2"/>`,
  );

const friction = () => {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const dv = -1.2 + (2.4 * i) / 120;
    if (Math.abs(dv) < 0.01) continue;
    const mu = Math.sign(dv) * (0.3 + 0.5 * (0.2 / (0.2 + Math.abs(dv))));
    pts.push(`${(40 + (i / 120) * 520).toFixed(1)},${(85 - mu * 90).toFixed(1)}`);
  }
  return svg(
    '0 0 600 170',
    'The bow’s friction: while the string sticks, the force can be anything up to μs·F (the vertical line); once it slips, friction falls towards μd as the slip speed grows.',
    `<g stroke="currentColor" fill="none" stroke-width="1" opacity=".35"><path d="M30 85 H570 M300 10 V160"/></g>
     <polyline points="${pts.slice(0, 60).join(' ')}" fill="none" class="warm" stroke-width="2"/>
     <polyline points="${pts.slice(60).join(' ')}" fill="none" class="warm" stroke-width="2"/>
     <path d="M300 13 V157" class="hot" stroke-width="3"/>
     <g fill="currentColor" class="lbl">${T(306, 22, 'stick: |f| ≤ μs·F')}${T(430, 70, 'slip → μd')}${T(470, 100, 'slip speed Δv')}${T(40, 22, 'friction f / F')}</g>`,
  );
};

const brass = () =>
  svg(
    '0 0 640 150',
    'The trumpet: the lips as a valve driven by the mouth and mouthpiece pressures, the bore as a loop whose round trip sets the harmonic series, and the bell radiating the highs (∝ f² below its cutoff) while reflecting the lows.',
    `<g fill="none" stroke="currentColor" stroke-width="1.3">
      <ellipse cx="60" cy="58" rx="16" ry="9"/><ellipse cx="60" cy="92" rx="16" ry="9"/>
      <path d="M86 66 H440 M86 84 H440"/>
      <path d="M440 66 C500 66 540 40 590 20 M440 84 C500 84 540 110 590 130"/>
      <ellipse cx="592" cy="75" rx="8" ry="56"/>
      <path d="M150 104 C250 130 360 130 430 104" stroke-dasharray="3 4"/>
    </g>
    <path d="M100 75 C140 60 180 90 220 75 S300 60 340 75 S400 90 430 75" fill="none" class="hot" stroke-width="1.6"/>
    <g fill="currentColor" class="lbl">
      ${T(20, 30, 'lips (mass–spring valve)')}${T(150, 50, 'bore: its round trip sets the harmonics')}
      ${T(468, 146, 'bell: ∝ f² below 1.4 kHz')}${T(240, 124, 'reflected lows')}
      ${T(20, 146, 'flow ∝ opening² · breath + turbulence')}
    </g>`,
  );

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
        p('Seven acoustic instruments — piano (grand and upright), violin, viola, cello, double bass, flute and trumpet — computed as physics, sample by sample, in your browser. No recorded sound is ever played as the instrument. Each is a small set of coupled physical parts: something that carries waves (a string, an air column), something that drives it (a felt hammer, a bow, a jet of breath, buzzing lips) and something that radiates (a soundboard, a wooden body, an open end, a bell), heard in a modelled room.'),
        p('Everything runs in an AudioWorklet written in TypeScript. The same DSP core runs in Node for the tests, calibration and offline renders, so every number on this page comes from the code you are hearing. What moves on the stage — strings, hammers, bows, holes, valves, wavefronts — is drawn from the same simulation, live.'),
      ],
    },
    {
      id: 'piano',
      title: 'Piano',
      body: [
        h3('Strings: travelling waves'),
        p('Each string is a digital waveguide: the wave equation’s solution as two waves travelling in opposite directions, held in a delay loop whose length is the round trip from the agraffe to the bridge (Smith 1992). Losses, stiffness and exact tuning are lumped into small filters in that loop.'),
        waveguide(),
        p('Piano wire is stiff, so its partials are not harmonic. Partial ', em('k'), ' of a string with inharmonicity ', em('B'), ' sits at'),
        eq('f_k = k · f₀ · √(1 + B·k²)'),
        p('— the upper partials progressively sharp, the slightly metallic, bell-like quality of a piano. A cascade of second-order all-pass filters designed per string (after Abel, Välimäki & Smith 2010) gives the loop exactly this frequency-dependent delay: the first 120 partials land within about 0.3 ¢ of the formula. A fractional (Thiran) delay sets partial 1 to the stretched tuning measured on the reference piano. Losses grow with frequency; each loop has a one-pole filter fitted to target decay rates:'),
        eq('σ(f) = σ₁ + c · (f² − f₁²),   T₆₀(f) = ln 1000 / σ(f)', 'σ₁ from T₆₀ at partial 1, c from T₆₀ at 3 kHz (both per register, calibrated)'),
        h3('Two or three strings per note'),
        p('Most notes have two or three strings, tuned a fraction of a cent apart. Struck together they push the bridge in phase and give energy away quickly; as they drift apart, part of the motion no longer reaches the bridge and rings on — the piano’s two-stage decay (Weinreich 1977). Each string also has a horizontal polarisation, weakly coupled to the bridge. Each string of a unison has its own stiffness (±2 %), as real wires and tensions differ: identical copies beat in a perfectly regular comb through the upper partials, a flanger that read as “robotic”.'),
        h3('Hammer'),
        p('The hammer is a mass on a felt spring that stiffens as it is squashed and pushes back harder while compressing than while releasing (Hunt & Crossley; Stulov):'),
        eq('F = K · xᵖ · (1 + λ·ẋ)', 'x: felt compression, p ≈ 2.8–4 (fitted per register), λ: hysteresis'),
        p('It is solved implicitly every sample with the strings it touches. A soft blow is a long, gentle contact (round, dark tone); a hard one is short and excites the upper partials — loud notes are brighter by physics, not by a filter. Key velocity maps to hammer speeds of about 0.5–5.7 m/s.'),
        h3('Bridge, soundboard and sympathetic strings'),
        p('All strings end on bridges over about 150 soundboard modes, each a damped resonator with its own frequency and mode shape at three bridge zones, solved jointly with every string touching it, so the board pushes back: with the pedal down, striking C2 makes C3, G3 and C1 ring on their own. On the stage they glow amber exactly as much as they really move — their displacement against the loudest struck string’s, a few percent at most. The undamped treble (F6 up on the grand, G6 on the upright) stays dark under a bass note, where it moves at about −70 dB.'),
        p('Above ~700 Hz, where a real board is too dense to model mode by mode, the radiated sound is the bridge force times a mobility, given the board’s high-frequency response: a direct part plus a short, smooth, noise-like decay (exponentially decaying velvet noise, T₆₀ 30 ms; Järveläinen & Karjalainen; Alary et al.). Until this round that response was a chain of short all-pass filters, and every key-down — the most impulsive moment of a note — rang through them as a 40 ms metallic flutter at fixed periods. That was the “robotic” sound at the start of each note. The Steinway has no such ringing, and now neither does the model: its high-frequency tail after the attack matches the recording within 2 dB, held-out notes included.'),
        h3('Dampers, pedals and the action'),
        ul(
          'Dampers press on gradually when a key is released; the sustain pedal lifts them continuously, so half-pedalling works. On the grand, una corda shifts the hammer off one string of three (and onto softer felt), and the sostenuto (the middle pedal; B on a keyboard, CC66) holds the dampers that are up when it goes down. On the upright the soft pedal is the half-blow rail (the hammers start nearer the strings: every string struck, about 3 dB softer) and the middle pedal lowers a practice muffler, a felt strip between hammers and strings, as on a Yamaha U1 (about 10 dB softer, and darker). Those two are estimates: no recordings of them here.',
          'The key and action knock is a short force on the frame and board: a 1.6 ms thud and a 4 ms tick of contact noise, different on every strike, fitted to the attack’s 6–12 kHz burst on 24 Steinway notes (half held out).',
          'When the felt lands on a vibrating string it adds a little noise. This round it was found far too loud (0.8× the string’s own level): the string’s loop turned it into a 200 ms pitched buzz at every key release, louder than the note above 1 kHz. It is now 40 dB quieter and 8 ms long, and the dampers close at their real rate — they had been stepping three times too fast because the control update counted samples that were never rendered.',
          'In the bass, the strings’ longitudinal motion adds “phantom” partials through two longitudinal resonances.',
        ),
        h3('One key, close up'),
        p('Click a note’s strings on the stage to see its action: the key on its balance rail, capstan, wippen, jack and let-off button (escapement), the hammer’s flight and check, the damper, and the string vibrating with its real shape, struck at β. The grand has double escapement — a repetition lever holds the hammer up so the note repeats before the key is fully up. The upright has a single escapement, a hammer that swings back into a vertical string, catcher, backcheck and bridle tape. Each strike replays in slow motion from that key’s own record: the hammer’s speed, the felt’s contact force and compression over time, and the rebound that follows from them (m·Δv = ∫F dt). The engine launches the hammer at its strike speed, so the travel before the strike is reconstructed from that speed, not simulated.'),
      ],
    },
    {
      id: 'strings',
      title: 'Violin, viola, cello, double bass',
      body: [
        p('The same strings-and-bridge machinery, bowed instead of struck. The bow grips the string by friction until the string’s pull exceeds it, slips back, and is caught again, once per period; the Helmholtz motion — a corner circulating along the string — emerges from the friction law (McIntyre, Schumacher & Woodhouse 1983).'),
        friction(),
        eq('μ(Δv) = μd + (μs − μd) · v₀ / (v₀ + |Δv|),   μs = 0.8, μd = 0.3, v₀ = 0.2 m/s', 'stick while |2Z·(v_bow − v_string)| ≤ μs·F, otherwise solve the slip on the curve'),
        p('Whether the bow holds Helmholtz motion depends on the force, the bow speed and the distance β from the bridge. Schelleng’s maximum is'),
        eq('F_max = 2Z · v_bow / (β · (μs − μd))'),
        p('Players get louder mostly by moving the bow towards the bridge rather than pressing harder; the model does the same, so louder notes are brighter and stay in Helmholtz motion. There is one bow with a length and a contact point along the hair: détaché notes alternate down-bow and up-bow, slurs continue the stroke, and when the hair runs out the bow changes on its own (a ~70 ms reversal through zero speed).'),
        p('A stopped note shortens the string’s loop; vibrato rocks that length and the loop is read at a fractional position (the bow’s taps follow the nominal loop, so vibrato makes no clicks). All four strings stand on one bridge over a modal body — the air resonance A0, the wood modes B1− and B1+, statistically spaced modes above. Open strings ring sympathetically.'),
        p('Each bowed string plays one note. Hold more notes than the strings can play (two on the G string, five on four strings) and the newest takes the string that has been playing longest; release it and the string returns to a key still held. The keyboard lights only the notes the engine is really sounding — a held key that has lost its string stays pressed but dark.'),
        p('The double bass is the same physics on its own strings and body: a 3/4 orchestral bass, 1.05 m from nut to bridge, four steel strings tuned in fourths (E1 A1 D2 G2, 285–330 N each), a 1.11 m body with sloped shoulders and a flat back, and a heavier French bow with 0.58 m of hair. Its body’s air mode sits near 60 Hz, among its own fundamentals (Askenfelt 1982), so it radiates in phase at both microphones (the other three take every third mode inverted on one side, for width; on the bass that cancelled its lowest notes in mono by up to 23 dB). Its modes are damped 2.5 times the cello’s, which keeps neighbouring notes as even in level as the recording’s, and its radiation is fitted to the Iowa double bass (below). It reaches E1–G4; a file’s notes outside that move by octaves.'),
        p('The bow can be taken in the hand: drag it along its own line, with a finger or the mouse (in 3D, start on the bow; anywhere else turns the instrument). The string sounds while the bow moves — faster is louder, back and forth changes the bow, and it stops when the hair runs out. A key held meanwhile only stops the string; with none held, the bow plays the string last played, open.'),
      ],
    },
    {
      id: 'flute',
      title: 'Flute',
      body: [
        p('A thin jet of breath crosses the embouchure hole and hits the far edge. Sound in the tube deflects the jet at the lip; the deflection rides the jet to the edge and sends air into or out of the tube. The ride time decides which resonance is fed:'),
        eq('U_j = √(2p / ρ),   τ_j = l_j / (0.45 · U_j)', 'blow harder: faster jet, shorter delay, brighter, slightly sharper — and eventually the next mode (overblowing)'),
        p('The jet is aimed slightly off the edge, so it splits unevenly and makes even harmonics; vortices shed at the edge limit the amplitude; both openings radiate as small pulsating spheres. Fingering shortens the tube (there are no individual tone holes in the model). The tongue’s release sweeps the jet across the edge once — a coherent push that seeds the tube — so notes speak as fast as a real flute’s (attack ×1.14 of the recordings; it was ×1.67). The flute is monophonic: the last key held sounds, and releasing it returns to the previous one.'),
      ],
    },
    {
      id: 'trumpet',
      title: 'Trumpet',
      body: [
        p('The lips are a valve: a small mass on a spring, tuned just below the note, pushed open by the mouth pressure and pulled shut by the pressure in the mouthpiece. Air through the opening drives the bore; the bore’s round trip sets its harmonic series, and the lips lock to the bore mode just above their own resonance (Cook 1991). Real B♭ fingerings choose the tube length: the three valves add 2, 1 and 3 semitones of tubing, and the lip tension picks the partial (2, 3, 4, 5, 6, 8 of the lengthened tube).'),
        brass(),
        eq('ÿ + (ω_lip/Q)·ẏ + ω_lip²·y ∝ p_mouth − p_bore', 'opening h = h₀(p_mouth) + y,   flow ∝ h² · (breath + turbulence)'),
        p('This round the trumpet was measured against the Iowa trumpet for the first time — 105 notes, pp to ff, E3 to E♭6 — and found to sound like a different instrument. Its fundamental was the strongest harmonic (in the recording the third is, with the first 5–11 dB below), it was half as bright, 8 dB short of even harmonics (clarinet-like), 17 dB too pure, and too narrow in dynamics. Three changes, each judged against held-out notes, fixed most of it:'),
        ul(
          ['The ', em('bell'), ' radiates ∝ f² below its cutoff (a two-pole high-pass at 1.4 kHz on the radiated pressure): a small opening radiates the lows poorly and reflects them back into the bore; above the cutoff the highs leave. The judge’s score went from 12.9 to 7.2 (spectrum error 14.9 → 3.2 dB, brightness 0.54 → 0.93 of the recording’s, even/odd −8 → −1.4 dB, dynamics 6 → 9 dB).'],
          'Turbulence where the air squeezes through the lips: noise in the flow, proportional to it, resonated by the bore (score 7.2 → 4.1; noise now within 1 dB of the recording’s).',
          'Its level, matched to the recordings as the other instruments are (4.1 → 3.3).',
        ),
        p('Eleven other attempts — a tongue release, lower pianissimo pressure, a dynamic brightness tilt, a harmonic cut-off tied to the pitch — were measured too and rejected: none beat the judge. The trumpet plays within ±6 ¢ at pp and ±2 ¢ at ff (2.7 ¢ RMS against the recordings). On the stage its standing wave glows inside the tube along the real wrap, the lips buzz with the engine’s own opening, and the valve slides light up when the air goes through them.'),
      ],
    },
    {
      id: 'room',
      title: 'The room',
      body: [
        p('Everything is heard a few metres away in a modelled hall. Early reflections come from an image-source model of a shoebox room (Allen & Berkley 1979): the first- and second-order mirror images of the source, each with its own delay to each of two cardioid microphones 0.6 m apart, 1/r spreading, wall loss and more high-frequency absorption per bounce. The late reverberation is a 16-line feedback delay network (Jot & Chaigne 1991) with Hadamard mixing, slow delay modulation, and per-line filters that give the bass a longer and the treble a shorter decay:'),
        eq('T₆₀(mid) = 0.7 + 1.7·room  s,   T₆₀(low) ≈ 1.2×,   T₆₀(8 kHz) ≈ 0.5×'),
        p('Dragging the room’s edge on the stage changes the room continuously, and its delays now glide (~80 ms, read at fractional positions) instead of jumping: every jump was a click, up to 18 dB above the sound on a drag. The grand’s lid is dragged the same way; closing it removes up to 11 dB above 1.8 kHz from the direct sound and dims the wavefronts it throws.'),
      ],
    },
    {
      id: 'stage',
      title: 'The stage',
      body: [
        p('The stage draws the engine’s own state, about 30 times a second: every sounding string’s shape (each voice’s, not just the last note’s), the hammers and dampers, the soundboard’s or body’s modes as a Chladni-like field, the bow and its contact point, each string’s stopping point rocking with the vibrato, the flute’s covered and open holes pulsing with the breath vibrato, the trumpet’s pistons, lips and the standing wave in its bore, and wavefronts leaving the instrument and returning from the walls, fading with the room’s T₆₀. Keys light only for notes the engine is really sounding.'),
        p('The same frames drive a 3D view (the 3d button; drag to turn, pinch or scroll to zoom): the instruments built to their real measures in three.js, physically based materials under a studio light, the strings drawn as wires of their real gauges, moving and glowing as they sound. The waves and mode fields are the 2D view’s; the 3D view keeps to what an eye could see. It costs under a millisecond of CPU per frame; phones draw at reduced resolution and a lighter scene, and one held upright frames the instrument to its stage: whole, as large as fits, clear of the file player; without WebGL2 the button never appears.'),
        p('Where the keys do not all fit (a phone, a narrow window) a thin strip over them shows all 88 with a window on the ones in view. Dragging on the strip slides the keys; a drag on the keys themselves stays a glissando. A touch screen’s keys carry no computer-key letters.'),
        p('On the pianos, a click on a key or its strings opens that key’s action close up: in 2D a section drawn to scale, replayed slowly from the engine’s own record of the strike; in 3D the camera flies to the key and a section cuts away the keys in front of it (Esc, or a click off the keys, flies back). The I key, or the icon beside 3d, lifts the case away and leaves the plate, strings, soundboard and action playing.'),
      ],
    },
    {
      id: 'ensemble',
      title: 'Ensemble',
      body: [
        p('The ensemble button puts several instruments on the stage at once; tap an instrument to add one (up to three violins, two of most others, two pianos, six in all). Each is its own engine — its own AudioWorklet node on the page’s one audio context — so a quartet is four violins’ worth of physics, a few per cent of a core each; they share one bus and a limiter. Played by hand — the keys on the screen, the computer’s keys or a MIDI keyboard, its pedals, bend and wheel with them — the notes go to the instruments lit on the fallboard, where a single instrument has its knobs: the piano if one is on the stage, else the highest melodic instrument (a quartet’s first violin, a flute over strings), until others are chosen. A tap adds an instrument or takes one away, so one key can sound on several, each moving the note by octaves into its own range; the keys’ span follows. Split, the fork after them, is the other way: a chord is dealt out by register, one note to each melodic instrument (the lowest to the cello or double bass, the highest to the violin or flute), and a piano takes what is left.'),
        p('Drop a MIDI file with several parts and each part (a track, or a channel in a single-track file) gets an instrument of its own: by its name (“Violin I”, “Violoncello”, “Contrabass”, “Flauto”), else its General MIDI program, else its range and whether it plays chords; a name counts only if that instrument can play the part as written. A bass line goes to the double bass: “contrabass”, “double bass”, “Kontrabass”, “contrabbasso”, “basse”, “Cb.”, “violone”, General MIDI’s contrabass (43) and basses (32–39), or an unnamed part that goes below the cello’s C; a string quintet such as Max Richter’s On the Nature of Daylight (Violin I, II, Viola, Violoncello, Contrabass) plays on two violins, a viola, a cello and a bass. A part outside its instrument’s range moves by octaves into it. Piano parts share one piano; with more parts than the stage holds, string parts become sections (double stops) and a piano takes the rest. With a lineup picked first, the parts are matched to it by register. The row of instruments under the player shows each part’s; tap one to move it, or to silence it.'),
        p('Routing is many to many. The grid button by the player sets out the instruments (rows) against the file’s parts (columns): a dot puts a part on an instrument as well, so a tune can play on a violin and a flute at once, or the whole file on two pianos (the last column takes every part). The row below adds an instrument, and another of a kind already there — a second cello, a second grand — is its own engine and seat, up to eight on a computer and six on a phone; a row’s glyph changes its instrument or takes it off. The bus stays at 1/√n of the instruments that play. Two of a kind on one part would be one instrument twice as loud, so the second is a second player: its own vibrato, bow, breath or hammer noise (another random stream) and its own intonation, a few cents off the first (players of one section in unison are 5–15 cents apart: Ternström 2003); a second grand is another piano of the same make, its unisons and tuning its own. Their sum then grows as power, not amplitude: La Réjouissance on two trumpets and two grands is as loud as on one of each (0.4 dB apart), where one player twice would be 3 dB louder.'),
        h3('The pieces'),
        ul(...PIECES.map((pc) => [h('a', { href: pc.source, target: '_blank', rel: 'noopener' }, `${pc.composer}, ${pc.title}`), '. ', pc.credit] as Kid[])),
        h3('Each instrument’s own piece'),
        p('With nothing loaded, the play icon at the top of the stage plays a short piece on the instrument shown, and the next instrument’s when you change it while it plays (in an ensemble, the built-in piece nearest its lineup). Beside it, the list holds the ensemble’s pieces above, and the folder opens a MIDI file from the device, for phones, where nothing can be dropped.'),
        ul(...INSTRUMENT_IDS.map((id) => DEMOS[id]).map((d) => [h('a', { href: d.source, target: '_blank', rel: 'noopener' }, `${INSTRUMENT_INFO[d.instrument].label}: ${d.composer}, ${d.title}`), '. ', d.credit] as Kid[])),
        p('The MIDI files are the Mutopia Project’s own (mutopiaproject.org), unchanged; each typesetting is placed in the public domain by its typesetter. What a player would change (a line left out, a transposition, a tempo where the file has none, where it stops) is set beside the file, not in it.'),
        h3('A file’s dynamics'),
        p('A file’s own dynamics are played as written: its velocities; its volume (CC7) and expression (CC11) as General MIDI has them, a gain on the instrument that plays each part (each 40·log₁₀(value/127) dB, the volume measured against the loudest the file sets, at least the default 100); and its mod wheel (CC1), where it moves, on a bowed or wind instrument as a plug-in keyboard’s wheel is (bow pressure, breath), kept in the upper half of its travel so a wheel at rest never takes the breath away. Pedals are as before.'),
        p('Many files have none: every note at one velocity, nothing that moves. Those parts are phrased, as players would (the KTH performance rules: Friberg, Bresin & Sundberg 2006; the phrase arch after Todd 1992): a crescendo and diminuendo over each phrase of two to eight bars, over each pair of phrases and over the piece, the phrases grouped where the parts breathe (a long note let go, a rest); higher notes a little louder, long notes a little louder and short ones softer, the downbeat leaned on, the top of a chord brought out, each part its own small unevenness. On the strings and winds a held note swells and fades (messa di voce): the bow goes faster and presses harder, the vibrato widens a little (MacLeod 2008), or the breath grows, exactly as a note begun that much harder would. All of it in velocity steps, about the file’s own level, so its terraces stay. A part that moves its own dynamics near a quarter of its notes or more is left as written, and where an otherwise flat part moves them (a fade at the end) the phrasing makes way. The hairpin by the progress line turns it off (it stays off on this device); a file with dynamics of its own plays the same either way.'),
      ],
    },
    {
      id: 'calibration',
      title: 'Calibration: measured against real instruments',
      body: [
        p('The models are tuned against recordings from the University of Iowa Musical Instrument Samples — a Steinway model B, and violin, viola, cello, double bass, flute and trumpet — used for analysis only. The same analysis runs on the recording and on a dry render of the model at the same notes and dynamics, and parameters move only to reduce the measured difference.'),
        h3('Like with like, and a judge'),
        ul(
          'Each model note is rendered exactly as long as the part of the recording that is analysed, with vibrato only where the player used it; a note’s pitch with vibrato is the centre of its fine pitch track.',
          ['Since this round a change is kept only with a verdict from a judge. Each per-note error is measured in units of the recording’s own note-to-note variation; notes alternate between a fit half and a ', em('held-out'), ' half; and the verdict — BETTER, WORSE or NO CLEAR CHANGE — comes from the held-out half, with guards so that one measure cannot be traded for another.'],
        ),
        h3('Where it stands'),
        table(
          ['piano (Steinway B)', 'now', 'round 2*'],
          [
            ['stretch tuning, ¢ RMS', '3.86', '4.10'],
            ['inharmonicity B, log₁₀ RMS', '0.064', '0.068'],
            ['prompt T60 model/recording: A0–B1 / C2–B3 / C4–B5 / C6–C8', '1.00 / 1.04 / 0.97 / 0.76', '1.01 / 1.15 / 0.93 / 0.90'],
            ['late T60 model/recording', '0.79 / 1.27 / 1.03 / 1.12', '0.79 / 1.28 / 1.11 / 1.03'],
            ['⅓-octave spectrum at mf, dB', '4.63', '4.64'],
            ['loudness per note, dB (pp / mf / ff)', '8.4 / 4.7 / 5.5', '8.3 / 4.7 / 5.4'],
          ],
          '* round 2 re-measured with this round’s method.',
        ),
        table(
          ['Iowa, anechoic', 'harmonic error dB', 'spectrum dB', 'brightness ×', 'noise vs recording dB', 'attack ×', 'pitch ¢'],
          [
            ['violin', '11.7', '14.6', '0.70', '+0.3', '0.26', '2.2'],
            ['viola', '11.2', '11.0', '0.84', '−1.0', '0.45', '1.6'],
            ['cello', '11.2', '15.5', '0.60', '−0.2', '1.18', '3.1'],
            ['double bass', '6.9', '4.9', '0.95', '+1.7', '1.37', '2.1'],
            ['flute', '7.1', '4.7', '0.97', '+5.4', '1.14', '1.0'],
            ['trumpet', '4.2', '3.3', '0.93', '+0.8', '1.43', '2.7'],
          ],
        ),
        p('Full histories are in the repository (', code('docs/calibration-rounds.json'), ', ', code('docs/ensemble-rounds.json'), ', ', code('artifacts/round3/'), '), and the Measurements page charts the details.'),
      ],
    },
    {
      id: 'engineering',
      title: 'Engineering',
      body: [
        ul(
          ['Start-up. The piano’s filter designs (one per string) are computed when the site is built and shipped as data, so building the instrument costs the audio thread about 10 ms instead of ~0.4 s. The worklet is loaded from a Blob URL where possible. The engine counts as started when the audio context runs and the audio thread reports — not on a round-trip message that some WebKit builds hold back. One AudioContext serves the page, and a failed start is retried only from your next tap or key. Open the page with ', code('?debug'), ' to see every step.'],
          'The host’s block size never changes the sound: each instrument renders its own blocks (cut only at events) and hands samples out as the browser asks, so the output is identical sample for sample at 128, 37 or 500 frames per call.',
          'The audio thread never fails silently: an error while building or playing posts one message and goes quiet, and the page says why. The worklet bundle is checked at build time to parse in Safari 14.1, the first WebKit with AudioWorklet.',
          'Golden snapshots (each instrument’s loudness envelope and spectrum) catch any change to the sound a refactor did not intend; the processor itself is tested in Node inside a fake AudioWorkletGlobalScope.',
          'A MIDI file’s keys and progress line follow what you hear, not what has been computed: they use the output timestamp, which matters over Bluetooth (150–250 ms).',
        ),
      ],
    },
    {
      id: 'limits',
      title: 'Known limitations',
      body: [
        ul(
          ['Piano: the lowest octave’s aftersound is ', em('×0.8'), ' of the recording’s (a one-pole loss filter cannot hold the low partials’ long decay); the top octave’s prompt decay is ×0.76; the middle register’s 3–6 kHz content falls away faster after the attack than the Steinway’s. The soundboard modes are plausible, not measured. A key’s travel before the hammer leaves is not simulated.'],
          'Strings: the violin’s and viola’s bodies are fitted note by note to the recordings (long-term spectra within 4 dB RMS; brightness grows with the bow’s force), but single notes still miss the recording’s harmonic profile by 9–10 dB, the violin’s fortissimo is still a little dark above 2 kHz and the viola’s dynamic range is wider than the recording’s. The cello’s body is unchanged and its loud notes are dark. Torsional waves and a finite bow width are the cello’s and the double bass’s only. The double bass’s pianissimo is 5–10 dB short between 600 Hz and 4 kHz (its fortissimo is within 2 dB), its notes’ levels still differ from the recording’s by 5–6 dB (SD) note to note, a few starts take up to a second to settle (the open E, at 48 kHz, can start on a higher partial), and an E3 on the G string can lock about 19 ¢ flat in a multiple-slip regime (two of 280 notes, dynamics and rates surveyed were still off after 0.85 s; the cello’s five). The bowed string is a chaotic self-oscillator, so its exact waveform depends on the smallest timing detail (its spectrum does not).',
          'Flute: the low register’s second harmonic at mf/ff is several dB short; about 5 dB less breath noise than the recording; no individual tone holes.',
          'Trumpet: at pianissimo its upper harmonics are 7–20 dB too strong in the middle and high registers (a real pp is nearly sinusoidal: the lips never close); the high register is a little short of second harmonic; attacks are 1.4× slow on the median; the bore is an ideal loop with no mouthpiece or bell impedance curve; no mutes.',
          'The room is a plausible hall, not a measured one. The 3D and 2D instruments are built from measured drawings and photographs, not scanned; close up they do not pass for photographs. The action close-ups follow the 3D models’ parts and ratios; the hammer’s flight after let-off follows the engine’s strike, not a simulation of the levers.',
        ),
      ],
    },
    {
      id: 'design',
      title: 'Design decisions',
      body: [
        ul(
          'Waveguides and modal bodies rather than finite-difference grids: exact tuning and dispersion at a cost that allows all 88 keys and their sympathetic strings in real time in JavaScript.',
          'TypeScript, not WebAssembly: fast enough (a struck note costs about a quarter of a percent of one core), and the same code runs in Node for tests and calibration.',
          'Measured, not tuned by ear: every change is judged against recordings with held-out notes, regressions are reported, and audible changes ship with before/after audio.',
          'The stage is nearly wordless; the reading is here. Everything moving on it is the simulation’s own state.',
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
    h('h3', { class: 'refs-title' }, 'Sources'),
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
        'H. Järveläinen & M. Karjalainen, “Reverberation modeling using velvet noise,” AES 30th Conf., 2007; J. Alary, A. Politis & V. Välimäki, “Velvet-noise decorrelator,” DAFx 2017',
        'M. E. McIntyre, R. T. Schumacher & J. Woodhouse, “On the oscillations of musical instruments,” JASA 74(5), 1983; J. Woodhouse, Acta Acustica 89, 2003',
        'J. C. Schelleng, “The bowed string and the player,” JASA 53(1), 1973',
        'N. H. Fletcher & T. D. Rossing, The Physics of Musical Instruments, 2nd ed., Springer 1998',
        'B. Fabre, A. Hirschberg & A. P. J. Wijnands, Acta Acustica 82, 1996; R. Auvray, B. Fabre & P.-Y. Lagrée, JASA 131(4), 2012',
        'P. R. Cook, “TBone: an interactive waveguide brass instrument synthesis workbench,” ICMC 1991; the Synthesis ToolKit (STK), Brass',
        'A. H. Benade, Fundamentals of Musical Acoustics, Oxford 1976 (the bell’s cutoff, spectral enrichment)',
        'J. B. Allen & D. A. Berkley, “Image method for efficiently simulating small-room acoustics,” JASA 65(4), 1979',
        'J.-M. Jot & A. Chaigne, “Digital delay networks for designing artificial reverberators,” AES 90th Convention, 1991',
        'University of Iowa Musical Instrument Samples (analysis only; never played as the instrument)',
        'The stage’s vector lines follow the screens of J. Hodge’s Chimera vocal synth (github.com/jamesondh/chimera-vocal-synth); their type is AVHershey Simplex by S. C. Russell (CC0), from A. V. Hershey’s vector fonts, US Naval Weapons Laboratory, 1967',
      ].map((r) => h('li', {}, r)),
    ),
  );
  return { el, dock: false };
}
