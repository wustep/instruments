# The zephyr: a seventeenth instrument, and the first that does not exist

An instrument from the future: invented, but one a maker of about 2080 could build from physics that is
already known. Engine `packages/engine/src/core/zephyr.ts`; address `/zephyr`.

## What it is

A string in a steady wind sings: the aeolian harp, a ship's rigging, the ribbon that drones on a kite. It
was never an instrument because the wind is not a key, and because a gut or steel string is so heavy for
its width that the air barely takes hold of it (J. J. Schnell's *anémocorde*, Paris 1789, blew a
keyboard's strings from bellows and was given up as too faint and too slow to speak).

The zephyr is that instrument with a string the air can take hold of. Sixty-one ribbons of carbon-nanotube
film, C2–C7, 3.2 mm wide in the bass to 0.6 mm at the top and 12 g to the square metre, each embossed to a
shallow D with its flat to the wind, stand over their own keys between a low bridge on a soundboard and a
pin in the frame. Each passes through a slot in a wind rail (the blade), 0.38 of the way up. Its key opens
the slot, and a flat jet from a quiet blower crosses the ribbon. Nothing touches it.

It is built like a sail: a hollow mast at the bass end (the wind's way up from the blower at its foot), a
yard falling from the mast's head over the ribbons' tops, a boom at a keyboard's height that is the case,
the soundboard and the five-octave keyboard. 2.1 m tall, 1.2 m across.

## How it makes sound

* **The wind's push.** A bluff section moving across a wind sees the wind come at an angle, and the lift
  that angle makes is in the direction of the motion. That is a negative damping: iced power lines gallop
  for it (Den Hartog 1932), and the force is measured: ½ρU²D·C(ẏ/U), C(α) = A₁α − A₃α³, A₁ = 2.69 for a
  square section (Parkinson & Smith 1964). The jet is a bow with no hair: it feeds the ribbon's motion
  until, near a fifth of the wind's speed, the flow lets go.
* **The air's drag.** What holds the ribbon back is the still air along the rest of it (Stokes 1851:
  2πρa√(2νω) per length), far more than its own friction. A ribbon this light has a Q of 15 in the bass and
  65 at the top, and carries a quarter of its own mass in air in the bass, a twentieth at the top.
* **Why it had to wait for the material.** The push and the drag both go with the ribbon's width, so their
  ratio does not depend on its mass at all; but how fast a note speaks goes as one over the mass. Gut is a
  hundred times too heavy: it would sing, in a minute.
* **No dampers.** The wind stops and the note is 30 dB down in a fifth of a second (a tenth at the top).
* **The model.** Each ribbon is a travelling-wave string in two parts, either side of its slot (the bridge
  side carries the Stokes loss as a fitted one-pole filter; the far side is rigid and carries the fine
  tuning), and at the slot the wind's force is solved every sample (Newton, three steps) against the
  ribbon's speed as the flow has caught up with it. The jet's turbulence (7 % of its dynamic pressure) is
  in the force: it is the breath under a note. What leaves is the force on the bridge, through a light
  soundboard's few resonances. Cost: 6.7 % of real time for twelve notes at 48 kHz on this Mac.

## What the model does (`npx tsx scripts/zephyr-tune.ts`, the model alone, 48 kHz)

| string | length | width | Q | wind at ff | pitch pp / mf / ff | speaks (to half) pp / mf / ff | gone (−20 dB) | level pp → ff |
|---|---|---|---|---|---|---|---|---|
| C2 | 1250 mm | 3.20 mm | 15 | 7.6 m/s | −11.4 / −0.2 / +4.7 ¢ | 180 / 68 / 49 ms | 140 ms | 13.8 dB |
| C3 | 769 | 2.29 | 19 | 9.2 | −9.4 / −0.2 / +4.2 | 84 / 60 / 44 | 93 | 12.3 |
| C4 | 473 | 1.64 | 26 | 11.4 | −7.2 / 0.0 / +3.0 | 77 / 50 / 36 | 62 | 11.4 |
| C5 | 291 | 1.17 | 35 | 14.3 | −5.0 / 0.0 / +2.6 | 110 / 41 / 29 | 45 | 10.4 |
| C6 | 179 | 0.84 | 48 | 18.1 | −3.9 / 0.0 / +2.5 | 58 / 30 / 22 | 38 | 9.9 |
| C7 | 110 | 0.60 | 65 | 23.0 | −2.3 / 0.0 / +1.0 | 28 / 18 / 17 | 30 | 8.3 |

* **Pitch.** The force follows the ribbon's speed a little late (the wind's travel over the ribbon, the
  wave's across the slot), and late it is partly a mass: an untuned string plays 6–25 ¢ flat at
  mezzo-forte. `zephyr-tuning.json` (`scripts/zephyr-tune.ts --write`) draws each string sharp by that, so
  every note is on its pitch at mezzo-forte (within 2 ¢, tested; within 1 ¢ at 44.1 and 96 kHz, 4 ¢ at
  22.05). The rest is the instrument's own and stays: a whisper is a few cents under, a shout a few over,
  and a note comes up to its pitch as it speaks.
* **Tone.** A ribbon square to the wind is pushed the same either way: odd harmonics only (the second 30 dB
  and more under the first), a hollow tone. Turned in its slot (the tilt knob, 4° as it comes) it has them
  all: at mezzo-forte the second harmonic 5–11 dB under the first, the third 12–18, the fourth 11–20, and
  the third comes up 12–15 dB against the first from pp to ff. The wind's steady lean on a tilted ribbon as
  the slot opens is the small pluck its note starts from.
* **Level, as played** (`scripts/levels-table.ts`, a walk F♯3–F♯5): mf −22 LUFS, ff −18, between the cello
  and the violin at mezzo-forte and level with the cello at fortissimo; its piece's fullest chord (seven ribbons, fortissimo) peaks 1.6 dB under full scale, under
  the limiter's threshold.
* No clicks at a key down or up (`audio-measure.ts` `clicks`: none at four pitches, two dynamics, two
  rates). What stands between the harmonics is the jet's noise on the string's own resonances, 33–60 dB
  under the note: nothing folds back from above the sampling rate.

## The player, and the instrument's own unevenness

A key's depth is its slot's opening: the fall of the key opens it wide for a moment and where the key rests
is the wind the note is held at (velocity: from a push 1.2 times the air's drag, just over the least that
keeps the ribbon moving, to 4.5–6.5 times it). The reservoir sags 2 % for each slot wide open and swings back at 2.6 Hz. With `human`
(1 by default): each key's depth and fall its own (3.5 %, 12 %), a moment late (1.6 ms), a held key's
depth wandering (2 %), the reservoir never quite still, each ribbon a cent or two from its pitch. Told the
notes to come (a file playing: `foresee`), a key is begun up to 45 ms ahead of a note that is slow to
speak, a short note is given more of the fall, and a note of a second or more is breathed (the wind 4–11 %
up at its middle, under at its ends: about 1 dB over a three-second note). `human` 0 is the model alone;
the same notes give the same samples either way.

## Its piece

*Still Air* (`apps/web/public/pieces/fable-still-air.mid`, written by `scripts/compose-zephyr.ts`; CC0):
E♭ major, 115 notes, 79 s. Voices come in one at a time and are held, a tune is passed over a slow bass,
the harmony steps aside to C♭ at the top of a long crescendo, and the voices leave as they came. Rendered
as the page plays it, its loudness second by second runs −33 dB at the first note, −14 at the C♭ chord,
−31 at the last. It is the zephyr's play icon; nothing else was ever written for it.

## Here

* `still-air.mp3` its piece as the file player plays it (told ahead, the player in the engine);
  `still-air-0.mp3` the same notes, the model alone
* `scale.mp3` C2 to C7 in fourths, pp then mf then ff; `tilt.mp3` one chord square to the wind, at 4°, at
  8°; `swell.mp3` one chord taken from pp to ff and back under the fingers
* `zephyr-2d.jpg`, `zephyr-vector.jpg`, `zephyr-3d.jpg`, `zephyr-3d-close.jpg`, `zephyr-3d-behind.jpg`,
  `zephyr-phone-2d.jpg`, `zephyr-phone-3d.jpg`: a chord held; `orchestra-2d.jpg`, `orchestra-3d.jpg`:
  seated where a harp would be
* `npx tsx scripts/render-zephyr.ts` makes the clips again, `node scripts/shots-zephyr.mjs` the pictures

## What is not known

* Nobody has heard it: it was voiced by its numbers alone (pitch, speaking time, levels, harmonics), and
  there is no recording to say whether a real one would sound so.
* The force curve is a square prism's, measured at wind-tunnel scale and a few hertz. A 3 mm ribbon at
  65–2000 Hz is far from that: the quasi-steady theory wants the wind to cross many widths in a period
  (U/fD ≫ 10) and at the top of the compass it crosses 15. The lateness of the force (one width of travel,
  a fifth of the slot's) is an estimate; so is the turbulence's share. Change them and the tuning table
  must be written again.
* A ribbon 12 g/m² that keeps an embossed profile under tension, and its tuning for years, is the
  material's promise, not a measurement.
* The soundboard is a few resonances and a tilt, not a model of a plate.
