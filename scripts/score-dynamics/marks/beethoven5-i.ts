// Beethoven, Symphony No. 5, I: the dynamics of the Breitkopf & Härtel edition (1862–1865) as Stelios
// Samelis typeset them for Mutopia (the source of the bundled file, whose MIDI was made with its dynamics
// left out), read from that source staff by staff (ly-marks.ts: every note of the file found in its place).
// Bars are the file's: the score's to bar 268, then five more (the oboe's cadenza is written out over six).
// An editor's: "cresc." run on to the forte it leads to (bars 34–44, 278–293: the source ends it where the
// sforzandi begin); a staff that comes in with no mark of its own, or with "cresc." alone, given the level
// of the staves around it (the flutes' mf at 38; a p before the "cresc." of the oboes at 84 and 217, the
// clarinets at 36 and 280, the bassoons at 36 and 279, the horns at 143 and 279; the horns' mf at 347);
// "più f" read as a third of the way from forte to fortissimo; the lower strings' fortissimo at 179 and the
// violins' forte at 403, where the staves beside them have it (review.ts lists every entry and its level).
import type { ScoreMarks } from '../dynamics.ts';

export const BEETHOVEN_5_I: ScoreMarks = {
  id: 'beethoven5-i',
  file: 'beethoven-op67-i.mid',
  from: '0ce1bca911ba8e6234fd2e474a9b6da4c968c5cfe85b0cccfe7e56505df52046',
  source: 'Breitkopf & Härtel (1862–1865), as typeset by Stelios Samelis for Mutopia (Mutopia-2017/11/05-941)',
  players: { 0: 'flute', 1: 'oboe', 2: 'clarinet', 3: 'bassoon', 4: 'horn', 5: 'trumpet', 6: 'timpani', 7: 'violin', 8: 'violin', 9: 'viola', 10: 'cello', 11: 'bass' },
  start: 'f',
  lines: {
    // flutes
    0: `18:1.5 p cresc  19 f  22:1.5 ff  38 mf cresc  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  71 p  91 <  93:2 !  94 ff  102 ff
        153:1.5 p  167:1.5 cresc  168 f  175:1.5 cresc  179 !  195:1.5 ff  211 dim  215 p  217 dim  221 pp  228:1.5 ff  233 pp  241:1.5 ff
        260 p  267 cresc  268 f  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff  316 p  343 cresc  350:2 !  351 ff  395:1.5 ff  444 ff  462 sf  484 ff`,
    // oboes
    1: `18:1.5 p cresc  19 f  22:1.5 ff  32:1.5 p  36 cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  84 p cresc  93:2 !  94 ff  102 ff
        153:1.5 p  167:1.5 cresc  168 f  175:1.5 cresc  179 !  195:1.5 ff  217 p dim  221 pp  228:1.5 ff  233 pp  241:1.5 ff
        254 p  266 cresc  268 f >  269:2 !  275 p  280 cresc  282 f  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff  316 p  351 ff  395:1.5 ff  444 ff  462 sf  484 ff  491:2 p  495:2 p`,
    // clarinets
    2: `1:1.5 ff  18:1.5 p cresc  19 f  22:1.5 ff  32:1.5 p  36 cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  67 p  83 cresc  93:2 !  94 ff  102 ff
        125:1.5 ff  130:1.5 p  146 p  153:1.5 p  167:1.5 cresc  168 f  175:1.5 cresc  179 !  195:1.5 ff  211 dim  217 dim  221 pp  228:1.5 ff  233 pp  241:1.5 ff
        256 p  267 cresc  268 f  280 p cresc  282 f  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff  330 p  341 cresc  350:2 !  351 ff  392:1.5 p  395:1.5 ff  444 ff  484 ff  489:2 p  496:1.5 ff`,
    // bassoons
    3: `7 p  18 cresc  19 f  22:1.5 ff  36 p cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  67 p  71 p  84 cresc  93:2 !  94 ff  102 ff
        126 ff  130 p  146 p  151:1.5 <  152:2.5 !  153 p  167:1.5 cresc  168 f  175:1.5 cresc  179 !  195:1.5 ff  211 dim  215 p  217 dim  221 pp  228:1.5 ff  233 pp  240:1.5 ff
        254 p  266 cresc  268 f  279 p cresc  282 f  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff  308:1.5 ff  309 sf  310 sf  311 sf >  312 p  336 cresc  340 !  341 cresc  350 !  351 ff
        392:1.5 p  395:1.5 ff  403:1.5 f  444 ff  462 sf  484 ff  488:2 p`,
    // horns
    4: `18:1.5 p cresc  19 f  22:1.5 ff  32:1.5 p  43 sf  44 f  52 ff  59:1.5 ff  60 sf  61 sf  62 sf >  63 p  83 p  84 cresc  93:2 !  94 ff  102 ff
        125:1.5 ff  143:2 p <  144:2 !  145 p  158:1.5 p  166:1.5 cresc  168 f  175:1.5 cresc  176 !  234 pp  240:1.5 ff
        279 p cresc  282 f  292 f  293 f  301 ff  311 sf >  312 p  347:2 mf cresc  351 ff  392:1.5 p  395:1.5 ff  462 sf  484 ff  496:1.5 ff  498:1.5 ff  500:1.5 ff`,
    // trumpets
    5: `18:1.5 p cresc  19 f  43 f  44 f  52 ff  94 ff  98 f  102 ff  158 pp  168 f  175:1.5 cresc  178 !  228:1.5 ff  248:1.5 ff
        267 p  268 f  283 f  292 f  293 f  301 ff  351 ff  395:1.5 ff  484 ff  496:1.5 ff`,
    // timpani
    6: `18:1.5 p cresc  19 f  43 f  44 f  52 ff  98 f  158 pp  168 f  175:1.5 cresc  178 !  248:1.5 ff
        267 p  268 f  283 f  292 f  293 f  301 f  318:1.5 p  351 ff  395:1.5 ff  484 ff  496:1.5 ff`,
    // first violins
    7: `1:1.5 ff  8:1.5 p  18 cresc  19 f  22:1.5 ff  25:1.5 p  34 cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  63 p  71 p  84 cresc  93:2 !  94 ff
        126:1.5 ff  131:1.5 p  142 <  144:2.5 !  145 p  150 <  153 ! p  166:1.5 cresc  168 f  175:1.5 cresc  179 !  179:1.5 ff  180 sf  181 sf  182 sf  188 sf  189 sf  190 sf
        210 dim  216 p  218 dim  222 pp  228 ff  234 pp  240 f  241:1.5 ff  254:1.5 p  266 cresc  268 ff  274:1.5 p  278:1.5 cresc  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff
        312 p  337 cresc  350:2 !  351 ff  379 sf  381 sf  383 sf  385 sf  387 ff  395:1.5 ff  403:1.5 f  428 sf  430 sf  461 sf  484 ff  489:1.5 pp  496:1.5 ff`,
    // second violins
    8: `1:1.5 ff  6:1.5 p  18 cresc  19 f  22:1.5 ff  26:1.5 p  34 cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  63 p  84 cresc  93:2 !  94 ff
        126:1.5 ff  129:1.5 p  146:1.5 p  150 <  153 ! p  166:1.5 cresc  168 f  175:1.5 cresc  179 !  179:1.5 ff  180 sf  181 sf  182 sf  188 sf  189 sf  190 sf
        210 dim  216 p  218 dim  222 pp  228 ff  234 pp  240 f  241:1.5 ff  253:1.5 p  266 cresc  268 ff  275:1.5 p  278:1.5 cresc  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff
        312 p  337 cresc  350:2 !  351 ff  379 sf  381 sf  383 sf  385 sf  387 ff  395:1.5 ff  403:1.5 f  428 sf  430 sf  461 sf  484 ff  488:1.5 pp  496:1.5 ff`,
    // violas
    9: `1:1.5 ff  7:1.5 p  18 cresc  19 f  22:1.5 ff  27:1.5 p  31:1.5 p  34 cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  63 p  84:1.5 cresc  93:2.5 !  94 ff  102 ff
        126:1.5 ff  130 p  142 <  145 ! p  150 <  153 ! p  166 cresc  168 f  175:1.5 f+  179:1.5 ff  210 dim  216 p  218 dim  222 pp  228 ff  234 pp  240 f  241:1.5 ff
        254 p  266 cresc  268 ff  276:1.5 p  278:1.5 cresc  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff  312 p  337:1.5 cresc  350:2 !  351 ff
        379 sf  381 sf  383 sf  385 sf  387 ff  395:1.5 ff  403:1.5 f  430 sf  461 sf  484 ff  496:1.5 ff`,
    // cellos
    10: `1:1.5 ff  7 p  18 cresc  19 f  22:1.5 ff  28:1.5 p  32:1.5 p  34:1.5 cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  65:1.5 p  84 cresc  93:2 !  94 ff  102 ff
        126:1.5 ff  130 p  142 <  145 ! p  150 <  153 ! p  166 cresc  168 f  175:1.5 f+  179:1.5 ff  210 dim  216 p  218 dim  222 pp  228 ff  234 pp  240 ff
        254 p  266 cresc  268 ff  277:1.5 p  278:1.5 cresc  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff  314:1.5 p  337 cresc  350:2 !  351 ff
        379 sf  381 sf  383 sf  385 sf  387 ff  395:1.5 ff  403:1.5 f  461 sf  484 ff  489 pp  496:1.5 ff`,
    // basses
    11: `1:1.5 ff  18:1.5 p cresc  19 f  22:1.5 ff  28:1.5 p  32:1.5 p  34:1.5 cresc  38 sf  39 sf  40 sf  41 sf  42 sf  43 sf  44 f  52 ff  65:1.5 p  84:1.5 cresc  93:2.5 !  94 ff  102 ff
        126:1.5 ff  145:2 p  166 cresc  168 f  175:1.5 f+  179:1.5 ff  210 dim  216 p  218 dim  222 pp  228 ff  234 pp  240 ff
        254 p  266 cresc  268 ff  277:1.5 p  278:1.5 cresc  287 sf  288 sf  289 sf  290 sf  291 sf  292 sf  293 f  301 ff  314:1.5 p  337:1.5 cresc  350:2 !  351 ff
        379 sf  381 sf  383 sf  385 sf  387 ff  395:1.5 ff  404 f  461 sf  484 ff  496:1.5 ff`,
  },
};
