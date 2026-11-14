# The strings, played: the bow and the left hand

Stephen's request: "improve the bow movement algorithm (specifically what I mean is playing stringed music
better. if it needs to pick up the bow between pauses, it can) and make other improvements to the stringing
in general". Violin, viola, cello, double bass; alone and in the orchestra; 2D, vector lines, 3D.

Nobody has listened to this yet. Everything below is measured, not heard: listen before merging.

## What was wrong

Read on `main` at `a614d8f`, a file playing (the notes told ahead, as the player tells them):

1. **The bow never left the string.** In 3D it lay on the string through every rest, and slid along it,
   silent, to where the next stroke would begin. (2D faded it whenever nothing sounded, which also made it
   flicker between detached notes.) The engine already planned a retake in a rest; no picture showed one.
2. **A bow to every note.** A typed file's notes end as the next begin (Mutopia's string lines are 80–100 %
   joined: `scripts/strings-survey.ts`), and a score's slurs are not in its MIDI. So the bow turned on every
   note: 160 bows for the first 160 notes of Bach's Prélude, 143 for 143 in the Brandenburg's violin.
3. **A slurred scale hopped from string to string.** A note written over the end of the last (how a file
   does write a slur) always went to another string, because the last one's was still busy: every second
   note of a slurred scale was played high up the next string down.
4. **Quick notes did not speak on the viola, the cello and the bass.** Every note, joined or not, began with
   the long tone's attack the recordings were fitted on (a bow that takes 0.1–0.4 s to come up to speed).
   In a line of quavers no note reached the level it has when held: over a scale in 0.12 s notes each stood
   14 dB (viola), 9 dB (cello) and 13 dB (bass) from it.
5. **A finger was always there at once**, a fifth up the string as much as the next finger down.

## What changed

All of it is the player's (`bowed.ts` `BOW_PLAYER`, `BOW_AIR`): a file playing, `human` over 0. With
`human` 0, and from the keys at any setting, the engine renders the samples it did before, bit for bit.

- **The bow comes off the string in a rest.** The engine says how far it is lifted (it is never heard). Up
  as the stroke ends, higher the longer the rest (a hop for a short one, the whole height from 1.2 s), over
  the hair to where the next stroke begins, and down onto the string in the last fifth of a second before
  the note. A gap under 0.12 s is too short to lift it in: it stops on the string. From the keys it waits
  a moment (another note may come), is taken off, and after six seconds of silence is laid back across the
  strings, where it lies before anything is played. 3D lifts it clear of the strings (5 cm on a violin,
  10 on a bass); 2D and vector lines fade it by the same measure inside a phrase, and no longer start to
  fade after every note.
- **Slurs.** Quick notes (0.26 s at most) that are joined and move by step share a bow: about 0.72 s of
  them, never more than eight, a run shared out evenly (six notes as three and three). Leaps, repeated
  notes and longer notes keep a bow each. This is the rule of thumb a player applies to an unmarked part
  (Leopold Mozart, 1756: slur what lies close together, bow what leaps). It is a guess at the bowing, not
  the score's: a part that was written détaché throughout is now partly slurred.
- **One string under a slur.** The hand stays where it is if it can: the fourth finger instead of the open
  string above, the same string for a note written over the end of the last, the top string shifted on.
- **A joined note is a change of bow**, 45 ms (the violin's own attack), not a note from rest; and a note
  known to be short speaks within 0.3 of its length, never faster than 30 ms.
- **A shift takes its time**: under a slur, a move of a minor third or more along the string travels there
  (3 ms a semitone, 18 ms at most). Short on purpose: a shift, not a glissando.

## The numbers

Each quick note against the same note held alone, RMS over a scale of eight (dB; `scripts/strings-speak.ts`,
`--engine` for main; `human` 1 both):

| notes of | violin | viola | cello | bass |
|---|---|---|---|---|
| 0.12 s, before → after | 5.8 → 3.1 | 14.0 → 5.3 | 8.7 → 2.9 | 12.8 → 4.1 |
| 0.20 s | 1.9 → 2.9 | 7.4 → 3.8 | 5.4 → 2.9 | 10.8 → 2.7 |
| 0.30 s | 3.4 → 3.4 | 5.4 → 3.7 | 3.7 → 1.5 | 5.2 → 2.5 |

(The violin at 0.2 s is one note, C♯5, 7 dB under its held level where it was 4: the left hand's placing by
ear moves a short note's level that much from run to run; its attack there is unchanged.)

Bows for the first notes of a part (`scripts/strings-notes.ts`): Bach's Prélude on the cello 160 notes,
160 → 99 bows; Brandenburg 5 III, the solo violin, 143 → 79; Menuet II on the bass 107 → 76; Menuet I on the
viola 111 → 76. Greensleeves (crotchets and longer) 78 → 78. No note lost its pitch.

The étude of the solo clip (`bow-trace-etude.png`: the bow's place on the hair, before over after; dashed
blue, the bow in the air): 40 → 31 bows, 20 → 16 string crossings, the bow off the string for 0 → 83 % of
the time nothing sounds.

`human` 0 against `a614d8f`: `scripts/same-sound.ts --instrument violin,viola,cello,bass --params
'{"human":0}'`, 44.1 and 48 kHz, dry and through the room: largest difference 0 in all sixteen.

## A side effect to listen for

The viola's, the cello's and the bass's quick notes are louder than they were, by what they were missing:
4–9 dB on a line of short notes (a held note is where it was). In the orchestra the lower strings' running
passages come forward by that much. That is the point of the change, and it moves the balance.

## The clips

Not in the repository (`*.mp4` is ignored here). Filmed from the app itself, the stage and nothing else,
1920×1080, 30 fps; the same camera and the same notes before and after.

- `solo-violin-3d-before.mp4`, `solo-violin-3d-after.mp4`: a violin alone, an étude written for this
  (`tools/etude.mjs`; not bundled). Watch for: 0:06, the rest after the opening tune (the bow leaves the
  string and comes down where the run begins); 0:06–0:08, the run of twelve semiquavers (three bows, not
  twelve); 0:10, four short notes apart (a hop between each); 0:11–0:12, the long rest (the bow up, then
  over to the start of the next stroke before it lands); 0:18–0:20, the two slurs (one string, a shift up
  it; before, a hop to the next string); the end (the bow taken off after the last note).
- `symphony-strings-3d-before.mp4`, `symphony-strings-3d-after.mp4`: the five string seats of Toward
  Morning, 60–92 s of the piece. The first violins rest from 0:11 to 0:21; each part's bow is off its
  string while it rests and comes down for its entry.

## Found and left

- **A short A5 on the violin is a quarter tone flat** (−49 ¢ in a 0.2 s note, on `main` as here; −22 ¢
  with `human` 0). It is the octave of the open A, which rings in sympathy and pins the bowed string; the
  viola was given a looser coupling for the same fault in audio audit 3, the violin kept the full one. A
  fix is a change to the violin's voicing and needs the judge: not done here.
- **The slurs are a guess.** A file that marks its slurs (notes overlapping) is played as written. A typed
  one gets the rule above. If it reads as too much legato, `BOW_PLAYER.quick` and `.span` are the two
  numbers; `human` 0 turns it off.
- The bow's speed for a dynamic is the fitted one (5–25 cm/s on the violin): a loud short note still uses
  little hair. Drawing it larger than the engine has it would be a picture of something else.
- No player's arm or hand is drawn: the bow is lifted, the hand that lifts it is not there.
- The ensemble's timing (#76) and the hand's vibrato (#76) are as they were.
