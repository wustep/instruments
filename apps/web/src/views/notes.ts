import { h, type View } from '../ui/dom.ts';

const item = (t: string, ...body: (string | Node)[]) => h('div', { class: 'note-item' }, h('h3', {}, t), h('p', {}, ...body));

export function notesView(): View {
  const el = h(
    'div',
    { class: 'view notes' },
    h('h2', {}, 'How it works'),
    h(
      'div',
      { class: 'prose note-list' },
      item('Piano', 'Each string is a pair of travelling waves in a delay line; stiff wire makes high partials sharp, reproduced per key by all-pass filters. A felt hammer is solved every sample. All strings share one bridge on a ~150-mode soundboard, so two-stage decay, beating and sympathetic resonance come from the coupling itself.'),
      item('Violin, viola, cello', 'The bow grips the string by friction until it slips, once per period: Helmholtz motion, not programmed. One bow with a length and direction; four strings on one bridge over a modal body.'),
      item('Flute', 'A jet of breath, deflected by the sound in the tube, feeds its resonance. Blow harder and the jet speeds up, the tone brightens and the tube leaps an octave.'),
      item('Approximate', 'Bodies and soundboard are plausible rather than measured; their radiation is fitted to recordings. Room and lid are audio effects.'),
      item('Running it', 'An AudioWorklet in TypeScript; the piano’s filter designs are computed at build time, so it starts in a fraction of a second. ', h('code', {}, 'createPiano(ctx)'), ' is a small, separate engine.'),
    ),
    h('h3', { style: 'margin-top:36px' }, 'Sources'),
    h(
      'ol',
      { class: 'refs' },
      [
        'Smith, digital waveguides, CMJ 1992',
        'Bank, piano synthesis, 2000; Bank, Zambon & Fontana, IEEE TASLP 2010',
        'Chabassier, Chaigne & Joly, JASA 2013',
        'Chaigne & Askenfelt, JASA 1994',
        'Weinreich, coupled piano strings, JASA 1977',
        'Fletcher, stiff piano strings, JASA 1964',
        'Abel, Välimäki & Smith, dispersion all-passes, IEEE SPL 2010',
        'Stulov, JASA 1995; Hunt & Crossley, 1975',
        'Ege, Boutillon & Rébillat, soundboard, JSV 2013',
        'Askenfelt & Jansson, JASA 1990/1991',
        'Bank & Sujbert, longitudinal vibrations, JASA 2005',
        'McIntyre, Schumacher & Woodhouse, JASA 1983; Woodhouse, Acta Acustica 2003',
        'Fletcher & Rossing, The Physics of Musical Instruments, 1998',
        'Fabre, Hirschberg & Wijnands, 1996; Auvray, Fabre & Lagrée, JASA 2012',
        'Jot & Chaigne, FDN reverberation, AES 1991',
        'University of Iowa Musical Instrument Samples (analysis only)',
      ].map((r) => h('li', {}, r)),
    ),
  );
  return { el, dock: false };
}
