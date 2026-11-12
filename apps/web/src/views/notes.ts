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


function creditIcon(href: string, label: string, inner: string): HTMLAnchorElement {
  const a = h('a', {
    class: 'credit-icon',
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    'aria-label': label,
    title: label,
  });
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = inner;
  a.appendChild(s);
  return a;
}

export function notesView(): View {
  const secs: Sec[] = [
    {
      id: 'overview',
      title: 'What this is',
      body: [
        p('Fourteen acoustic instruments — piano (grand and upright), violin, viola, cello, double bass, flute, oboe, clarinet, bassoon, horn, trumpet, trombone, tuba and timpani — computed as physics, sample by sample, in your browser. No recorded sound is ever played as the instrument. Each is a small set of coupled physical parts: something that carries waves (a string, an air column, a stretched membrane), something that drives it (a felt hammer, a bow, a jet of breath, a double or a single reed, buzzing lips, a felt mallet) and something that radiates (a soundboard, a wooden body, an open end, a bell, the head itself), heard in a modelled room.'),
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
        p('Players get louder mostly by moving the bow towards the bridge rather than pressing harder; the model does the same, so louder notes are brighter and stay in Helmholtz motion. There is one bow with a length and a contact point along the hair: détaché notes alternate down-bow and up-bow, slurs continue the stroke, and when the hair runs out the bow changes on its own (a ~70 ms reversal through zero speed). When a file or a piece plays, the notes to come are known, and the bow is planned as by a player who reads the part: a long note is drawn slower and nearer the bridge so that one bow carries it, a short note beside a long one faster, a stroke begins where it has the hair it needs, and in a rest the lifted bow goes to where the next stroke begins; a slur too long for the hair changes bow where one of its notes begins. Played from the keys, each note is met as it comes.'),
        p('A stopped note shortens the string’s loop; vibrato rocks that length and the loop is read at a fractional position (the bow’s taps follow the nominal loop, so vibrato makes no clicks). All four strings stand on one bridge over a modal body — the air resonance A0, the wood modes B1− and B1+, statistically spaced modes above. Open strings ring sympathetically.'),
        p('Each bowed string plays one note. Hold more notes than the strings can play (two on the G string, five on four strings) and the newest takes the string that has been playing longest; release it and the string returns to a key still held. The keyboard lights only the notes the engine is really sounding — a held key that has lost its string stays pressed but dark.'),
        p('The double bass is the same physics on its own strings and body: a 3/4 orchestral bass, 1.05 m from nut to bridge, four steel strings tuned in fourths (E1 A1 D2 G2, 285–330 N each), a 1.11 m body with sloped shoulders and a flat back, and a heavier French bow with 0.58 m of hair. Its body’s air mode sits near 60 Hz, among its own fundamentals (Askenfelt 1982), so it radiates in phase at both microphones (the other three take every third mode inverted on one side, for width; on the bass that cancelled its lowest notes in mono by up to 23 dB). Its modes are damped 2.5 times the cello’s, which keeps neighbouring notes as even in level as the recording’s, and its radiation is fitted to the Iowa double bass (below). It reaches E1–G4; a file’s notes outside that move by octaves.'),
        p('The bow can be taken in the hand: drag it along its own line, with a finger or the mouse (in 3D, start on the bow; anywhere else turns the instrument). The string sounds while the bow moves — faster is louder, back and forth changes the bow, and it stops when the hair runs out. A key held meanwhile only stops the string; with none held, the bow plays the string last played, open.'),
      ],
    },
    {
      id: 'harp',
      title: 'Harp',
      body: [
        p('A harp is strings and almost nothing else: forty-seven of them, C1 to G7, wire in the bass, gut through the middle, nylon at the top, each fastened at one end to a soundboard it pulls on directly. Nothing strikes them and nothing damps them. A finger draws a string aside near its middle and lets it go; it rings until it has given its energy away or a hand stops it, and while it rings the other forty-six answer it. So each string here is its own partials, up to sixty-four exact resonators each, set going by the pluck and left alone.'),
        eq('aₙ ∝ sin(nπβ) / n^s · 1/√(1 + (fₙ/f_c)^2p),   fₙ = n·f₀·√(1 + B·n²)', 'a string plucked at the fraction β of its length (β near ½: the even partials nearly vanish), through the finger’s release (a low-pass at f_c); stiff, so the upper partials are sharp'),
        p('Plucked at its very middle a string would have no even partials at all. The recordings’ second partial is there, 16–20 dB under the first, while the fourth and sixth are 30–45 dB under: it is the string’s own tension, which swings twice a cycle whatever the pluck’s place and pulls the board along the string at twice the fundamental (Legge & Fletcher 1984). The model adds that octave, growing with the pluck.'),
        p('A string swings in two planes. Across the soundboard it moves the board, is heard at once and is soon spent; along the board it hardly moves it and rings on; and the two are never quite at one pitch. So a harp note falls fast, then slowly, and wavers a little as it goes (Weinreich 1977 found it on the piano; Woodhouse 2004 on plucked strings). Each of a string’s first eight partials is two resonators here, one for each plane. The strings that answer a pluck (those with a partial within a few cents of one of the plucked string’s: its octaves, twelfths and double octaves most, Le Carrou et al. 2009) ring in the slow plane, and are the halo a harp has and a piano with its dampers down has not.'),
        p('The seven pedals are the harp’s whole chromatic machinery: one for every letter (D, C, B at the left foot; E, F, G, A at the right), each with three notches. Up, every string of that letter is open and flat; in the middle a disc turns against it and shortens it a semitone, natural; down, a second disc, sharp. A harp is tuned in C♭ major and played in whatever key its pedals set, which is why its glissando is a chord or a scale and never chromatic: a finger drawn across the strings sounds whatever the pedals have made of them. Here a finger drawn across the keys does the same (each white key is its string), and a note the strings do not have moves the pedal that reaches it: the one that retunes no string still ringing, keeps the notes a file says are coming, and travels least; of two spellings, the one that comes first among the key signatures (B♭ before A♯).'),
        p('The soundboard and the box behind it are a few filters fitted to recordings, not a model of the board: a low cut (a harp’s board radiates little under 100 Hz, so the bass strings are heard by their upper partials), two resonances, a shelf, and four of the board’s own modes knocked by each pluck. The voicing was fitted to twenty-three recorded strings of one concert harp (VSCO 2 CE; every second string held out): brightness and the time a string takes to fall 20 dB match the recordings in the median, the partials’ levels within 9 dB. One pluck a string could not tell that fit from the voicing first set by hand, and with the same harp’s second dynamic (VCSL: every string at mf and at f) the judge still cannot: a string differs from its neighbour by as much as the model differs from it (the table under Calibration).'),
        p('What the second dynamic did show is what a harder pluck does. On one string the recorded forte is a sixth of an octave brighter than the softer pluck on average (most of an octave on some strings), its attack 3 dB stronger, and it falls its first 20 dB sooner; the model’s only got louder. Now the finger lets go of a string it has drawn further more abruptly (the upper partials stronger), and the knock on the board and the noise of skin leaving the string (on the wound wire strings, the scrape across the winding) grow faster than the note: 0.13 of an octave brighter and 0.8 dB more attack on the strings held out. A wire string swung wider than the recorded forte rattles a little against its disc, a rasp at its own pitch that dies as the string does; the recordings have none, and neither has the model up to there.'),
        p('And a player plucks it. No two plucks are alike: the finger takes the string a little nearer the board or further from it, with more or less of its pad (four fingers in turn as the line moves, the thumb the roundest and strongest), a little harder or softer, a moment late; the notes of a chord are never plucked on one instant, but from the bottom string up, some milliseconds apart; and a string that still rings is touched before it is plucked again: told the notes a file is about to play, the finger is on it a twentieth of a second early and stops it.'),
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
      id: 'oboe',
      title: 'Oboe',
      body: [
        p('Two blades of cane, bound to a metal staple, are the oboe’s valve: the mouth’s pressure pushes them shut and the pressure in the staple pushes them apart, so the air let through rises and falls with the sound (a reed “blown closed”, as a clarinet’s is). The bore is a cone, about 0.6 m long, and a cone plays every harmonic and overblows at the octave, where a clarinet’s cylinder plays odd ones and overblows at the twelfth. A cone is the same, to the waves in it, as a cylinder open at both ends driven where the missing tip of the cone would end (the “cylindrical saxophone”, Ollivier, Dalmont & Kergomard 2004): two delay lines meet at the reed, one down the bore to its first open hole, one the few centimetres up to the cone’s apex.'),
        eq('x = 1 − Δ,   u = ζ · x · √|Δ| · sgn Δ,   p = a₁ + a₂ + u/2', 'Δ: mouth − staple pressure in units of the closing pressure; shut at Δ ≥ 1. Solved exactly each sample.'),
        p('The dynamic is mostly in the lips. Oboists blow at nearly the same pressure soft or loud (it rises with pitch: Fuks & Sundberg 1999); a soft note is played with the lips pressing the blades closer. The closing pressure falls with the opening, so the sound the reed drives does too: in the model the lips set the reed’s rest opening, from about a third of a loud note’s at pianissimo. The tongue holds the blades shut for 30 ms while the breath builds and lets them go over part of a period of the note, which is what keeps a low note on its own register rather than its octave. A soft note swells in, as the recorded oboist’s do; a short tap on a soft note still sounds, its breath kept on until it has spoken. Each note is played on the tube whose fundamental it is (the octave keys’ vents are not modelled), and the radiation’s colour — the oboe’s formant near 1 kHz, whatever the note — is fitted to the recordings. It is monophonic, B♭3 to A6 at concert pitch (the oboe is in C: written as it sounds).'),
      ],
    },
    {
      id: 'clarinet',
      title: 'Clarinet',
      body: [
        p('The clarinet’s valve is a single cane reed, held by a ligature against the mouthpiece’s lay: the mouth’s pressure pushes it shut against the lay and the pressure in the mouthpiece pushes it open, the same characteristic as the oboe’s double reed (Wilson & Beavers 1974; Dalmont, Gilbert & Ollivier 2003). The bore is a cylinder, closed at the reed and open at the first open tone hole: a quarter-wave pipe, whose resonances are the odd harmonics of its lowest note. So the low register (the chalumeau) has strong odd harmonics and weak even ones, and the clarinet overblows not at the octave but at the twelfth — the register key turns the chalumeau’s E3 into the clarion’s B4.'),
        eq('x = 1 − Δ,   u = ζ · x · √|Δ| · sgn Δ,   p = 2a + u', 'one delay line: a, the wave back from the open end (inverted, through the lattice’s low-pass); solved exactly each sample'),
        p('The open-hole lattice reflects the wave only below its cutoff, about 1.5 kHz on a clarinet (Benade 1960): above it the bore barely resonates and the reed’s flow passes every harmonic, odd and even, so the odd-harmonic sound belongs to the low notes, and the high ones are fuller. In the model the open end reflects through a low-pass at that cutoff, and the sound is what the end lets through. As on the oboe, the lips set the dynamic (the reed’s rest opening) and the tongue holds the reed against the lay while the breath builds; each note is played on the tube whose fundamental it is (the register key and the altissimo’s vents are not modelled). It is monophonic, D3 to B♭6 at concert pitch: the B♭ clarinet, written a tone higher (E3–C7).'),
      ],
    },
    {
      id: 'bassoon',
      title: 'Bassoon',
      body: [
        p('The bassoon is the oboe’s bass: the same double reed, larger (its blades about 56 mm long), on a cone two and a half metres long, folded in two so a player can reach its holes. The reed sits on a curved metal crook, the bocal; the bore runs down the wing joint, round a U-bend at the foot of the boot, up the long joint and out of the bell, 1.34 m above the floor. As on the oboe, a cone is a cylinder open at both ends driven where its missing tip would end: two delay lines meet at the reed. A bassoon’s cone is so narrow that its tip is far behind the reed, so the short line is long, and its comb thins the bore’s harmonics where it falls.'),
        eq('x = 1 − Δ,   u = ζ · x · √|Δ| · sgn Δ,   p = a₁ + a₂ + u/2', 'the oboe’s reed and two-tube bore; Δ: mouth − bocal pressure in units of the closing pressure'),
        p('Its open holes let everything above about 400–500 Hz out of the bore (the lattice’s cutoff, Benade 1976), which is where the bassoon’s fixed formant sits: its low notes have a weak fundamental under a cluster of strong harmonics near 500 Hz, the reedy sound that does not move with the note. In the model the bore loses its high resonances a few harmonics above the note (the walls and the open holes), so a low note settles in a few tens of milliseconds as the recorded one does; the radiation carries the formants. The lips set the dynamic, the tongue holds the blades while the breath builds; each note is played on the tube whose fundamental it is (the half-hole, the flick keys and the whisper key are drawn, not modelled). It is monophonic, B♭1 to E5, in C: written as it sounds, in bass and tenor clef.'),
      ],
    },
    {
      id: 'horn',
      title: 'Horn',
      body: [
        p('The horn is the trumpet’s family played the other way round: buzzing lips on a tube two and a half times as long (3.7 m for the F horn, 2.8 m for the B♭ horn; the double horn has both, and the thumb chooses), narrow and mostly widening, wound in a circle and opening into a bell 30 cm across with the player’s right hand in it. Its lowest resonances are far apart, its highest a tone or less: the horn plays from the second partial of its tube to the twelfth or sixteenth, and the lips alone choose among neighbours that close, which is why a horn note can crack. Players take the F side up to about written G4 (sounding C4) and the B♭ side above, where the partials are wider apart.'),
        eq('m(ÿ + ω/Q · ẏ + ω² y) = S · Δp,   h = h₀ + y,   u = ζ · h · √|Δp| · sgn Δp,   p = a₁ + a₂ + u/2', 'the lips: a mass on a spring pushed open by Δp = mouth − mouthpiece pressure, their resonance just under the note; Bernoulli’s flow through the slit, solved with the mouthpiece pressure each sample'),
        p('A tube closed at the lips and open at its bell plays only the odd multiples of its quarter wave (a clarinet). A horn plays every partial because its bore widens like a cone, so the model’s bore is the oboe’s and bassoon’s: two delay lines meeting at the lips, the tube and its missing tip, the bell reflecting the low frequencies and letting the high ones out. The hand in the bell and the bell turned away from the listener make the horn dark: the recordings gather its harmonics near 450–600 Hz whatever the note, the low notes’ fundamental far under them, the top notes almost pure; a loud note’s lips close sharply each cycle and the tone turns brassy. The model has no hand of its own (no stopping, no hand position): the hand’s darkening is in the colour fitted to the recordings, so none is drawn in the bell. It is monophonic, B♭1 to F5 as it sounds: the horn in F, written a fifth higher (F2–C6). A part written for horn in F, E♭ or D and typed into a file at its written pitch is heard at its sounding pitch in the Orchestra.'),
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
        p('Eleven other attempts — a tongue release, lower pianissimo pressure, a dynamic brightness tilt, a harmonic cut-off tied to the pitch — were measured too and rejected: none beat the judge. The trumpet plays within ±6 ¢ at pp and ±2 ¢ at ff (2.7 ¢ RMS against the recordings). On the stage its standing wave glows inside the tube along the real wrap, the breath goes into the mouthpiece as it does on every wind, pulsing with the engine’s own lip opening, and the valve slides light up when the air goes through them.'),
      ],
    },
    {
      id: 'trombone',
      title: 'Trombone',
      body: [
        p('The trombone is the brass instrument with no valves to choose its tube: a slide does. Two thirds of a tenor trombone’s 2.74 m are a cylinder 13.9 mm across — the leadpipe, the inner and outer slide tubes, the crook, the tuning slide — and the last metre widens into a bell 216 mm across. Each of the slide’s seven positions lowers the tube a semitone (the seventh is 57 cm out); the lips choose which resonance of the tube sounds. Players reach the low register’s long positions with a valve in the bell section instead, the F attachment, which adds a loop lowering the whole tube a fourth.'),
        eq('m(ÿ + ω/Q · ẏ + ω² y) = S · (p_mouth − p_cup),   u = w · h · √(2|Δp|/ρ),   C · dp_cup/dt = u − u_throat,   M · du_throat/dt = p_cup − p_bore', 'the lips blown open into the mouthpiece’s cup (a volume: compliance C), joined to the bore by its throat (an inertance M): a Helmholtz resonator, everything in pascals and cubic metres per second'),
        p('A cylinder closed at one end plays only odd harmonics. The trombone plays nearly every one because of its two ends: the bell turns low frequencies back early in its flare (a shorter tube for them) and the mouthpiece’s cup pulls the high resonances down, until the series is almost 2, 3, 4, 5 … times a pedal note that is not itself a resonance (the first resonance lies far below it, at about 0.7). The model builds exactly that — the cylinder as one delay line with its wall’s loss, the bell as a Bessel horn of scattering sections, the cup and throat as a resonator — and the series comes out of it: 0.70, 1.97, 2.97, 4.02, 5.06, 6.06, 7.09, 8.06 × the pedal for B♭3 in first position. The slide is set as a player sets it, by ear: so that the chosen resonance of the whole bore falls on the note.'),
        p('Loud, a trombone turns brassy because its long cylinder steepens the wave: a crest travels faster than a trough, and at fortissimo a shock forms before the bell (Hirschberg et al. 1996). The model computes it from the air’s own constants over the slide’s length, in pascals, and lets the harmonics it makes out through the bell. A slur that moves the slide is masked by a soft legato tongue, as players do; asked to glide, it is a glissando, and the pitch wheel moves the slide. One model plays three trombones at their own measures: the alto in E♭ (a fourth shorter, 7-inch bell, A2–G5), the tenor in B♭ with its F valve (E1–F5, pedals included) and the bass in B♭ with F and G♭ valves (9½-inch bell, C1–C5); the stage’s trombone is the tenor, its size a knob, and in the Orchestra each trombone takes the size its part needs.'),
      ],
    },
    {
      id: 'tuba',
      title: 'Tuba',
      body: [
        p('The tuba is the bass of the brass, and the most conical of them: nearly all of a contrabass tuba in C’s 4.88 m widens, from a deep funnel mouthpiece to a bell 48 cm across. So it is the horn’s model, and here the horn’s own engine: the same lips blown open against the mouthpiece’s pressure, the same cone as two waveguides meeting at the lips, the same tongue and the same player’s handling of a file’s notes; only the compass, the valves and the fitted voicing are the tuba’s. Its first resonance is a note (the pedal C1), which a trumpet’s is not.'),
        p('Four valves lengthen the tube: a semitone, a tone, a tone and a half, and a fourth valve that lowers it a fourth, used in place of the first and third together. One search gives the trumpet, the horn and the tuba their fingerings: the least lowering on the lowest partial that reaches the note. A real tuba’s valves together stand sharp, each loop being cut for the open tube: the first and second by 10 ¢, the second and fourth by 24, the first and fourth by 48, all four by 175 (the Iowa player’s E♭1 at fortissimo, unpulled, is 76 ¢ off); and the tube’s fifth partial is 14 ¢ flat of equal temperament. Players pull most of it out with a slide and the lips. The model’s tube is the right length for every note, and its player leaves a little of both: a few cents on two valves, up to 12 on the low four-valve notes, 7 flat on the fifth partial. On the stage the loops are drawn at their real lengths, so with all four valves down the drawn air path is a tenth short of the note’s, as the instrument’s is.'),
        p('That player is in the engine. A held note’s breath comes up over its first quarter second and sags as the air is spent, the pitch wanders a cent or two (the Iowa tubist’s does; he uses no vibrato, and the model none unless asked), and from one tongued note to the next the tongue, the lips’ kick and first setting and the breath are each a little different, with a puff of air at the tongue’s release. A soft note is airier than a loud one. The pictures show a front-action tuba from its valve side, as it is held: the bell at the player’s left over the mouthpiece’s side, the valves before his right hand.'),
        p('Its wide bell lets go of the highs early, and what it radiates of its lowest notes is mostly their upper harmonics: in the Iowa recordings a C1’s fundamental lies 30–40 dB under its sixth to ninth harmonics, near 250–450 Hz, and the model’s the same. The voicing was fitted to those recordings on half their notes and judged on the other half: better than the horn’s voicing set to a tuba’s bell by hand (held-out score 10.8 → 5.9), every note of the compass on its own partial at four sample rates. Its breath noise, held under a bound in that fit, was fitted again and judged better once more (5.89 → 5.81; the harmonics over the noise 4.4 → 3.9 dB out, a soft note airier than a loud one). The pianissimo recordings stay brighter than the model’s (their brightness is above their own mezzo-forte’s: the room’s hiss more than the tone), and that is left alone. Its level is set beside the horn’s: the tuba session was recorded 19 dB under the horn’s.'),
      ],
    },
    {
      id: 'timpani',
      title: 'Timpani',
      body: [
        p('A kettledrum is a membrane: a Mylar head 0.19 mm thick stretched over a copper kettle and struck with a felt mallet. An ideal circular membrane’s modes are Bessel functions, J_m(j_mn r/a)·cos mθ, with m lines across the head and n circles, and their frequencies are the zeros j_mn: 1 : 1.59 : 2.14 : 2.30 … — no pitch at all. The timpani sound a clear note because the air on both sides of the head moves with it, and loads its slow, broad modes most: the modes with nodal diameters only, (1,1) (2,1) (3,1) (4,1) (5,1), fall near 1 : 1.5 : 2 : 2.5 : 3, a harmonic series whose principal tone, the (1,1), is the note (Rossing 1982; Fletcher & Rossing 1998 §18).'),
        eq('ω_mn² = (T/σ · k_mn² + κ_mn) / (1 + μ_mn),   k_mn = j_mn / a,   μ_mn ∝ ρa / (σ j_mn),   κ₀ₙ = 4πρc²a² / (Vσ j₀ₙ²)', 'the head’s modes: tension, the air’s added mass (μ), and the kettle’s air as a spring on the modes that pump it (κ, only m = 0)'),
        p('Each of the four drums (32″, 29″, 26″, 23″: C2–A3 together, the low drum on the player’s left) is 96 of these modes, each an exact resonator, with the losses physics gives them: each mode radiates as its own multipole (the far field of a Bessel mode is closed form), so the (0,1), which pumps the kettle, thumps and dies in a fraction of a second while the (1,1) rings for seconds; only the m = 1 and m = 0 modes push on the rim, rocking or lifting the kettle on its stand, and lose to it; the many modes above the 96 are a band of noise the mallet’s sharpest force excites. A loud stroke stretches the head and every mode starts a little sharp. The mallet is a mass on a felt spring that stiffens as it squeezes and, struck hard, bottoms out on the mallet’s core: a soft stroke is a long gentle push that sounds the (1,1) and little else, a loud one is short and hard and brings out the (2,1), the (3,1) and the clatter above. A note goes to a drum already tuned to it, else to the drum whose pedal has least to move; held keys roll; the pitch wheel is the last drum’s pedal.'),
      ],
    },
    {
      id: 'glockenspiel',
      title: 'Glockenspiel',
      body: [
        p('Thirty steel bars, each cut to its pitch (a quarter of a metre at G5, eleven centimetres at C8), lying on felt over their nodes and struck in the middle with a hard mallet. It sounds two octaves above where its part is written: here a note is its sounding pitch, G5–C8, and a note typed lower is read as written and brought up by octaves, so a part plays either way.'),
        eq('f₁ = 1.028 · h · √(E/ρ) / L²,   thin free bar: 1 : 2.76 : 5.40 : 8.93 : 13.34', 'the pitch of a bar of thickness h and length L, free at both ends; and the overtones a thin bar’s theory gives it'),
        p('Those overtones are not what a glockenspiel’s bar does. The mallet lands on the bar’s middle, where the second and fourth flatwise modes have a node; and the bar is a third as thick as it is wide, so it also bends edgewise, as a thick beam whose overtones crowd together, and twists. The recordings show five families of partials above the pitch, each a smooth function of the bar: about 3.1, 6.3 and 14 times the pitch at C6, falling slowly as the bars shorten (read here as the edgewise bending: the bar is 3.3 times as wide as thick), and about 3.8 and 8 times it, falling as 1/√f (twisting: its pitch goes as 1/L where the bending’s goes as 1/L²). Each family’s ratio, level and decay over the compass and the dynamics is measured on the recordings and regressed; the model is those partials as exact resonators, and the mallet’s knock.'),
        p('The low bars carry strong high partials for a fraction of a second, a ting at 4–9 kHz; the top bars are nearly a sine and a knock. A harder stroke is brighter as well as louder. The pitch itself rings for seconds (about 5 dB/s through the middle, 20 and more in the top octave), and nothing damps it unless the damping knob says the hand does. Two mallets play it, the engine’s own hands: they take the bars without crossing and alternate on a bar struck again, and the stage draws them where the engine has them.'),
        p('No two strokes of a player are alike, and the recordings say by how much: from one stroke to the next on the same bar each family of upper partials is 4–8 dB up or down (it is where the mallet lands), the stroke itself a decibel or so, and the two mallets are never quite a pair. The model’s hands play so: each stroke has its place on the bar, its strength and its instant, a millisecond or two late. A bar struck while it still rings has the stroke added to its motion (the mallet is on the bar a quarter of a millisecond and gives its blow whatever the bar is doing), so a repeated note comes out louder or softer as the stroke meets the bar’s swing, and a roll (the roll knob, or the wheel, on a held key) gathers into one sustained, wavering note.'),
      ],
    },
    {
      id: 'room',
      title: 'The room',
      body: [
        p('Everything is heard a few metres away in a modelled hall. Early reflections come from an image-source model of a shoebox room (Allen & Berkley 1979): the first- and second-order mirror images of the source, each with its own delay to each of two cardioid microphones 0.6 m apart, 1/r spreading, wall loss and more high-frequency absorption per bounce. The late reverberation is a 16-line feedback delay network (Jot & Chaigne 1991) with Hadamard mixing, slow delay modulation, and per-line filters that give the bass a longer and the treble a shorter decay:'),
        eq('T₆₀(mid) = 0.7 + 1.7·room  s,   T₆₀(low) ≈ 1.2×,   T₆₀(8 kHz) ≈ 0.5×'),
        p('The room changes continuously as it is turned, and its delays glide (~80 ms, read at fractional positions) instead of jumping: every jump was a click, up to 18 dB above the sound. Closing the grand’s lid removes up to 11 dB above 1.8 kHz from the direct sound and dims the wavefronts it throws. Both are turned on a knob on the stage, the room’s in its top right corner and the lid’s on the lid by its hinge, any opening and any room, left wherever they are let go. In 3D the room is the pool of light on the floor round the instrument, as large as the room (the light follows the sound in the room, its tail included), and its knob sits on the floor where the pool at its largest ends. The 3D grand’s lid rests where a real one does, on one of its two prop sticks (in its cup at full stick or half stick) or shut: its knob, beside the lid, clicks between those three. Taken by hand on the picture, the lid follows the hand, standing on the stick that reaches it, pressed down under it; let go, it comes onto the nearest rest.'),
      ],
    },
    {
      id: 'stage',
      title: 'The stage',
      body: [
        p('The stage draws the engine’s own state, about 30 times a second: every sounding string’s shape (each voice’s, not just the last note’s), the hammers and dampers, the soundboard’s or body’s modes as a Chladni-like field, the bow and its contact point, each string’s stopping point rocking with the vibrato, the flute’s covered and open holes pulsing with the breath vibrato, the oboe’s and the clarinet’s keys under the fingering and their reeds closing once a cycle, the trumpet’s pistons, lips and the standing wave in its bore, and wavefronts leaving the instrument and returning from the walls, fading with the room’s T₆₀. Keys light only for notes the engine is really sounding.'),
        p('The same frames drive a 3D view (the 3d button; drag to turn, pinch or scroll to zoom): the instruments built to their real measures in three.js, physically based materials under a studio light, the strings drawn as wires of their real gauges, moving and glowing as they sound. The waves and mode fields are the 2D view’s; the 3D view keeps to what an eye could see. It costs under a millisecond of CPU per frame; phones draw at reduced resolution and a lighter scene, and one held upright frames the instrument to its stage: whole, as large as fits, clear of the file player; without WebGL2 the button never appears.'),
        p('Where the keys do not all fit (a phone, a narrow window) a thin strip over them shows all 88 with a window on the ones in view. Dragging on the strip slides the keys; a drag on the keys themselves stays a glissando. A touch screen’s keys carry no computer-key letters.'),
        p('On the pianos, a click on a key or its strings opens that key’s action close up: in 2D a section drawn to scale, replayed slowly from the engine’s own record of the strike; in 3D the camera flies to the key and a section cuts away the keys in front of it (Esc, or a click off the keys, flies back). The I key, or the icon beside the view switch, lifts the case away and leaves the plate, strings, soundboard and action playing.'),
      ],
    },
    {
      id: 'ensemble',
      title: 'Ensemble',
      body: [
        p('The orchestra button puts several instruments on the stage at once; tap an instrument to add one (up to three violins, two of most others, two pianos; eight of any kind on a computer and six on a phone, more where they are light on the audio thread). Each is its own engine — its own AudioWorklet node on the page’s one audio context — so a quartet is four violins’ worth of physics, a few per cent of a core each; they share one bus and a limiter. Played by hand — the keys on the screen, the computer’s keys or a MIDI keyboard, its pedals, bend and wheel with them — the notes go to the instruments lit on the fallboard, where a single instrument has its knobs: the piano if one is on the stage, else the highest melodic instrument (a quartet’s first violin, a flute over strings), until others are chosen. A tap adds an instrument or takes one away, so one key can sound on several, each moving the note by octaves into its own range; the keys’ span follows. Split, the fork after them, is the other way: a chord is dealt out by register, one note to each melodic instrument (the lowest to the cello or double bass, the highest to the violin or flute), and a piano takes what is left.'),
        p('Drop a MIDI file with several parts and each part (a track, or a channel in a single-track file) gets an instrument of its own: by its name (“Violin I”, “Violoncello”, “Contrabass”, “Flauto”), else its General MIDI program, else its range and whether it plays chords; a name counts only if that instrument can play the part as written. A bass line goes to the double bass: “contrabass”, “double bass”, “Kontrabass”, “contrabbasso”, “basse”, “Cb.”, “violone”, General MIDI’s contrabass (43) and basses (32–39), or an unnamed part that goes below the cello’s C; a string quintet such as Max Richter’s On the Nature of Daylight (Violin I, II, Viola, Violoncello, Contrabass) plays on two violins, a viola, a cello and a bass. A part outside its instrument’s range moves by octaves into it. A wind staff that two players share (two flutes, two horns on one staff, as a score prints them and Mutopia’s Fifth Symphony is typeset: their chords, a unison written twice) is divided between two instruments of its kind: the first plays the top voice, the second the one under it, a single note is the first player’s; one instrument alone plays the top voice. Piano parts share one piano; with more parts than the stage holds, string parts become sections (double stops) and a piano takes the rest. With a lineup picked first, the parts are matched to it by register. The row of instruments under the player shows each part’s; tap one to move it, or to silence it.'),
        p('Routing is many to many. The grid button by the player sets out the instruments (rows) against the file’s parts (columns): a dot puts a part on an instrument as well, so a tune can play on a violin and a flute at once, or the whole file on two pianos (the last column takes every part). The row below adds an instrument, and another of a kind already there — a second cello, a second grand — is its own engine and seat, up to eight on a computer and six on a phone (a piece or an address may seat more, as long as they cost the audio thread no more than the heaviest eight or six did, two pianos and the heaviest others: Beethoven’s Fifth seats eighteen winds, timpani and strings, about 28 % of one core, where two pianos and six double basses took 51 %); a row’s glyph changes its instrument or takes it off. The bus stays at 1/√n of the instruments that play. Two of a kind on one part would be one instrument twice as loud, so the second is a second player: its own vibrato, bow, breath or hammer noise (another random stream) and its own intonation, a few cents off the first (players of one section in unison are 5–15 cents apart: Ternström 2003); a second grand is another piano of the same make, its unisons and tuning its own. Their sum then grows as power, not amplitude: La Réjouissance on two trumpets and two grands is as loud as on one of each (0.4 dB apart), where one player twice would be 3 dB louder.'),
        h3('The pieces'),
        ul(...PIECES.map((pc) => [h('a', { href: pc.source, target: '_blank', rel: 'noopener' }, `${pc.composer}, ${pc.title}`), '. ', pc.credit] as Kid[])),
        h3('Each instrument’s own piece'),
        p('With nothing loaded, the play icon at the top of the stage plays a short piece on the instrument shown, and the next instrument’s when you change it while it plays (in an ensemble, the built-in piece nearest its lineup). Beside it, the list holds the ensemble’s pieces above, and the folder opens a MIDI file from the device, for phones, where nothing can be dropped.'),
        ul(...INSTRUMENT_IDS.map((id) => DEMOS[id]).map((d) => [h('a', { href: d.source, target: '_blank', rel: 'noopener' }, `${INSTRUMENT_INFO[d.instrument].label}: ${d.composer}, ${d.title}`), '. ', d.credit] as Kid[])),
        p('The MIDI files are the Mutopia Project’s own (mutopiaproject.org), unchanged; each typesetting is placed in the public domain by its typesetter, but for the oboe’s (Creative Commons Attribution 3.0, as its credit above says). What a player would change (a line left out, a transposition, a tempo where the file has none, where it stops) is set beside the file, not in it.'),
        p('Three pieces were written for this page: ', h('a', { href: '/symphony' }, 'Toward Morning'), ', a movement for thirteen of these instruments, ', h('a', { href: '/everything' }, 'Everything So Far'), ', for eleven, and ', h('a', { href: '/passiton' }, 'Pass It On'), ', for all sixteen on seventeen seats, all by Fable 5.2, given to the public domain (CC0 1.0). Each has an address of its own, /symphony, /everything and /passiton, which seats its orchestra with the piece ready to play.'),
        h3('A file’s dynamics'),
        p('A file’s own dynamics are played as written: its velocities; its volume (CC7) and expression (CC11) as General MIDI has them, a gain on the instrument that plays each part (each 40·log₁₀(value/127) dB, the volume measured against the loudest the file sets, at least the default 100); and its mod wheel (CC1), where it moves, on a bowed or wind instrument as a plug-in keyboard’s wheel is (bow pressure, breath), kept in the upper half of its travel so a wheel at rest never takes the breath away. Pedals are as before.'),
        p('Many files have none: every note at one velocity, nothing that moves. Those parts are phrased, as players would (the KTH performance rules: Friberg, Bresin & Sundberg 2006; the phrase arch after Todd 1992): a crescendo and diminuendo over each phrase of two to eight bars, over each pair of phrases and over the piece, the phrases grouped where the parts breathe (a long note let go, a rest); higher notes a little louder, long notes a little louder and short ones softer, the downbeat leaned on, the top of a chord brought out, each part its own small unevenness. On the strings and winds a held note swells and fades (messa di voce): the bow goes faster and presses harder, the vibrato widens a little (MacLeod 2008), or the breath grows, exactly as a note begun that much harder would. All of it in velocity steps, about the file’s own level, so its terraces stay. A part that moves its own dynamics near a quarter of its notes or more is left as written, and where an otherwise flat part moves them (a fade at the end) the phrasing makes way. The hairpin by the progress line turns it off (it stays off on this device); a file with dynamics of its own plays the same either way.'),
      ],
    },
    {
      id: 'calibration',
      title: 'Calibration: measured against real instruments',
      body: [
        p('The models are tuned against recordings from the University of Iowa Musical Instrument Samples — a Steinway model B, and violin, viola, cello, double bass, flute, oboe, B♭ clarinet, bassoon, horn, trumpet, tenor and bass trombones, tuba and orchestra bells — and, for the timpani and the harp (Iowa has neither), the VSCO 2 Community Edition’s (Versilian Studios, CC0), used for analysis only. The same analysis runs on the recording and on a dry render of the model at the same notes and dynamics, and parameters move only to reduce the measured difference.'),
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
          ['Iowa, anechoic', 'harmonic error dB', 'spectrum dB', 'brightness ×', 'harmonics over noise vs recording dB', 'attack ×', 'pitch ¢'],
          [
            ['violin', '8.6', '2.8', '1.00', '−3.3', '0.30', '2.0'],
            ['viola', '8.6', '3.4', '0.97', '−2.5', '0.85', '1.6'],
            ['cello', '11.1', '4.2', '0.94', '+0.5', '0.93', '2.5'],
            ['double bass', '6.8', '4.9', '0.95', '+1.7', '1.37', '2.1'],
            ['flute', '7.1', '4.7', '0.97', '+5.4', '1.06', '1.0'],
            ['oboe', '8.0', '10.5', '0.92', '+2.0', '1.31', '0.8'],
            ['clarinet', '8.8', '4.0', '0.99', '−0.3', '0.80', '1.2'],
            ['bassoon', '8.6', '8.7', '1.05', '+1.6', '0.87', '0.3'],
            ['horn', '3.9', '14.4', '1.00', '+0.7', '1.14', '0.2'],
            ['trombone (tenor and bass)', '6.7', '5.5', '1.05', '+0.3', '0.79', '0.5'],
            ['tuba', '5.7', '14.4', '0.97', '0.0', '1.17', '0.2'],
            ['trumpet', '4.2', '3.3', '0.93', '+1.0', '0.64', '2.7'],
          ],
        ),
        table(
          ['VSCO 2 CE, a room', 'partials’ frequencies ¢', 'partials’ levels dB', 'spectrum dB', 'brightness ×', '(1,1) decay ×', 'pitch ¢'],
          [['timpani', '31', '8.1', '14.8', '0.98', '1.00', '0.3']],
          'Five pedal drums struck pp, mf and ff, two takes each (24 strokes; drums 2 and 4 held out of the fit: judge BETTER, held-out 9.25 → 3.50). Brightness pp 151 / 148 Hz, mf 195 / 201, ff 272 / 363 (model / recording).',
        ),
        table(
          ['VCSL', 'partials’ levels dB', 'spectrum dB', 'brightness ×', 'time to fall 20 dB ×', 'partials’ stretch ¢'],
          [['harp', '8.7', '11.5', '1.00', '1.09', '6.1']],
          'Twenty-three strings of one harp, E1–F7, each plucked at two dynamics (forty-five plucks; every second string held out of the fit). The voicing was first fitted to one pluck a string (VSCO 2 CE): against the voicing set by hand the judge said NO CLEAR CHANGE on the held-out strings (1.59 → 1.32, Δ 0.27 ± 0.15). With both dynamics it says NO CLEAR CHANGE again, for what a harder pluck now does (1.29 → 1.28, Δ 0.01 ± 0.02), and for a whole refit of the voicing, which was not kept (1.29 → 1.29): the strings differ from one another by more than any smooth voicing follows. What changed is measured by itself: a forte pluck against the softer one on the held-out strings, the recordings 0.17 of an octave brighter, 2.8 dB more attack; the model 0.13 and 0.8 (it had 0.02 and 0).',
        ),
        table(
          ['Iowa MIS bells', 'partials’ ratios ¢', 'partials’ levels dB', 'spectrum dB', 'brightness ×', 'pitch’s decay ×', 'time to fall 20 dB ×'],
          [['glockenspiel', '21', '7.6', '5.5', '1.00', '1.06', '1.10']],
          'The bars G5–C8 struck with plastic mallets at pp, mf and ff (84 clean strokes, each compared at the recorded bar’s own pitch; every second bar held out of the fit: judge BETTER against a thin free bar’s overtones, held-out 1.86 → 1.48, ratios 88 → 23 ¢). The upper partials’ levels were then fitted again through the model (a partial that dies in a tenth of a second reads lower than it began): 13.5 → 8.7 dB on the held-out bars, about what one recorded stroke differs from the next by, the spectrum 7.9 → 5.9 dB; the judge’s whole score says NO CLEAR CHANGE (1.34 → 1.28, Δ 0.06 ± 0.03). The brass mallets’ run is 15–25 dB lower and in its own noise: it is not fitted to nor judged by, and the mallet knob’s brass is set by hand from its clean strokes.',
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
          'Strings: the violin’s and viola’s bodies are fitted note by note to the recordings (long-term spectra within 4 dB RMS; brightness grows with the bow’s force), but single notes still miss the recording’s harmonic profile by about 9 dB, the violin’s fortissimo is still a little dark above 2 kHz and the viola’s dynamic range is wider than the recording’s. The cello’s body is unchanged and its loud notes are dark. Torsional waves and a finite bow width are the cello’s and the double bass’s only. The double bass’s pianissimo is 5–10 dB short between 600 Hz and 4 kHz (its fortissimo is within 2 dB), its notes’ levels still differ from the recording’s by 5–6 dB (SD) note to note, a few starts take up to a second to settle (the open E, at 48 kHz, can start on a higher partial), and an E3 on the G string can lock about 19 ¢ flat in a multiple-slip regime (two of 280 notes, dynamics and rates surveyed were still off after 0.85 s; the cello’s five). The bowed string is a chaotic self-oscillator, so its exact waveform depends on the smallest timing detail (its spectrum does not).',
          'Flute: the low register’s second harmonic at mf/ff is several dB short; about 5 dB less breath noise than the recording; no individual tone holes.',
          'Trumpet: at pianissimo its upper harmonics are 7–20 dB too strong in the middle and high registers (a real pp is nearly sinusoidal: the lips never close); the high register is a little short of second harmonic; its attacks are quicker than the recording’s (×0.64 on the median); the bore is an ideal loop with no mouthpiece or bell impedance curve; no mutes.',
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
        'A. Askenfelt, “Eigenmodes and tone quality of the double bass,” STL-QPSR 23(4), 1982',
        'T. A. Wilson & G. S. Beavers, “Operating modes of the clarinet,” JASA 56(2), 1974; J.-P. Dalmont, J. Gilbert & S. Ollivier, “Nonlinear characteristics of single-reed instruments,” JASA 114(4), 2003',
        'S. Ollivier, J.-P. Dalmont & J. Kergomard, “Idealized models of reed woodwinds,” Acta Acustica united with Acustica 90, 2004',
        'L. Fuks & J. Sundberg, “Blowing pressures in bassoon, clarinet, oboe and saxophone,” Acustica 85, 1999',
        'A. H. Benade, “On the mathematical theory of woodwind finger holes,” JASA 32(12), 1960',
        'A. Hirschberg, J. Gilbert, R. Msallam & A. P. J. Wijnands, “Shock waves in trombones,” JASA 99(3), 1996',
        'T. D. Rossing, “The physics of kettledrums,” Scientific American 247(5), 1982',
        'J.-L. Le Carrou, F. Gautier & R. Badeau, “Sympathetic string modes in the concert harp,” Acta Acustica united with Acustica 95(4), 2009; D. Chadefaux, J.-L. Le Carrou, B. Fabre & L. Daudet, “Experimentally based description of harp plucking,” JASA 131(1), 2012',
        'K. A. Legge & N. H. Fletcher, “Nonlinear generation of missing modes on a vibrating string,” JASA 76(1), 1984; J. Woodhouse, “Plucked guitar transients: comparison of measurements and synthesis,” Acta Acustica united with Acustica 90, 2004',
        'S. Ternström, “Choir acoustics: an overview of scientific research published to date,” Int. J. Research in Choral Singing 1, 2003',
        'A. Friberg, R. Bresin & J. Sundberg, “Overview of the KTH rule system for musical performance,” Advances in Cognitive Psychology 2, 2006; N. P. McA. Todd, “The dynamics of dynamics,” JASA 91(6), 1992',
        'R. B. MacLeod, Journal of Research in Music Education 56(1), 2008 (violinists’ and violists’ vibrato by dynamic and register)',
        'University of Iowa Musical Instrument Samples (analysis only; never played as the instrument)',
        'The vector lines’ type is AVHershey Simplex by S. C. Russell (CC0), from A. V. Hershey’s vector fonts, US Naval Weapons Laboratory, 1967',
      ].map((r) => h('li', {}, r)),
    ),
    // what the work stands on that is not a paper: named here, each a link (the pieces and the
    // recordings are credited where they are used, above)
    h(
      'p',
      { class: 'thanks' },
      'The vector view is after ',
      h('a', { href: 'https://github.com/jamesondh/chimera-vocal-synth', target: '_blank', rel: 'noopener' }, 'Chimera'),
      ', Jameson Hodge’s vocal synth: its screens were the inspiration, and none of its code is used. The pieces are the ',
      h('a', { href: 'https://www.mutopiaproject.org', target: '_blank', rel: 'noopener' }, 'Mutopia Project'),
      '’s; the recordings the models are measured against are the ',
      h('a', { href: 'https://theremin.music.uiowa.edu/MIS.html', target: '_blank', rel: 'noopener' }, 'University of Iowa Musical Instrument Samples'),
      ' and, for the timpani and the harp, Versilian Studios’ ',
      h('a', { href: 'https://github.com/sgossner/VSCO-2-CE', target: '_blank', rel: 'noopener' }, 'VSCO 2 Community Edition'),
      ' and ',
      h('a', { href: 'https://github.com/sgossner/VCSL', target: '_blank', rel: 'noopener' }, 'Versilian Community Sample Library'),
      '; the 3D stage is drawn with ',
      h('a', { href: 'https://threejs.org', target: '_blank', rel: 'noopener' }, 'three.js'),
      '.',
    ),
    h(
      'p',
      { class: 'credit' },
      h('span', { class: 'credit-line' }, 'Built by Stephen Wu with Opus 5.5 and Fable 5.2.'),
      h(
        'span',
        { class: 'credit-icons' },
        creditIcon('https://wustep.me', 'Stephen Wu’s site', '<g fill="none" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3.15 9h17.7M3.15 15h17.7"/></g>'),
        creditIcon('https://x.com/wustep', 'Stephen Wu on X', '<path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.749l7.73-8.835L1.5 2.25h7.914l4.258 5.464 5.572-5.464z"/>'),
      ),
    ),
  );
  return { el, dock: false };
}
