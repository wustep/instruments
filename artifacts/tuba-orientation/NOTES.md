# Tuba: the right way round in its seat

Stephen, 13 Nov: "btw you didn't fix the tuba orientation yet."

#68 had already turned the tuba from its mirror image into a front-action tuba seen from its valve side: the bell's stack at the left, the body and the valves at the right, the mouthpiece out at the left. That is how the 2D, vector and solo 3D stages draw it, and they agree with each other and with the makers' photographs (the Yamaha YFB-822 on Wikimedia Commons is laid out exactly so). This pass is about the tuba **as it is held in the Orchestra**, as the horn's was in #78.

## What was wrong (measured in the seated player's own frame: his right, up, back towards him)

1. **The mouthpiece pointed off to the side, at nobody.** The 3D model built the mouthpiece in the body's plane, as the 2D plan draws it in profile. The seat turns the body so its valves face half towards the hall, and that turned the mouthpiece with it. Its axis pointed 47° to the player's right of his lips: right 0.73, back 0.68. From the hall it stuck out sideways from the tuba, the same fault #78 fixed on the horn (53° there). It could not simply be pointed back: with the mouthpiece in the body's plane, pointing it back would put the bell's stack straight in front of the player's face.
2. **The tuba leaned the wrong way.** `TUBA_HELD` was meant to lean it "a little back towards him and to his left (away from the valves)". The two small rotations were written in the model's frame, before the seat's turn, so they leaned the bell back and to his **right**. From the hall the bell tipped towards the viewer's left, into the player's face side, instead of away to the viewer's right.

The layout seen from the valve side (2D, vector, solo 3D) was right and is unchanged. So are the body's turn on the lap and its height: the lips at 1.14 m, the bottom bow on the lap.

## What a seated tubist looks like

A seated tubist seen from the hall has the bell at the viewer's right of the head. The body and valves are in front, turned half to the hall, with the right hand across the front on the valves. The mouthpiece goes straight back into the face. This is #68's own reference (a U.S. Navy Band concert, a Concertgebouw principal's portrait), and the U.S. Coast Guard Band Brass Quintet at the 2010 tuba-euphonium conference shows the same ([Commons](https://commons.wikimedia.org/wiki/File:U.S._Coast_Guard_Band_Brass_Quintet_(4311945478).jpg)). Neither photograph is kept.

## What changed (`apps/web/src/ui/gl/tuba3d.ts`)

- **`MP_TURN` (47°):** the leadpipe's last bend, at its receiver, turns the mouthpiece out of the body's plane on the side away from the valves, towards the player. The leadpipe leaves the receiver along the mouthpiece's axis and bends into the plan's line over its first 0.12 m, coming forward to cross the front of the bell's stack as before. Seen from the valve side, the mouthpiece now points out at the left and away. The 2D plan still draws it in profile: a flat drawing of the valve side, with nothing else changed.
- **`TUBA_SEAT.turn`** is what that leaves, π/2 − `MP_TURN` (0.75 rad as before). Turned so, the body stands as it did and the mouthpiece points at the player.
- **`TUBA_HELD`:** the same two leans (6° to his left, 4° back), now made in the seat's frame through its turn.

Held now, from the player's lips:

| | before | after |
|---|---|---|
| the mouthpiece's axis | 47° to his right (right 0.73, back 0.68) | straight back into the lips (right 0.007, back 0.998, 4° down: the lean back) |
| the bell's rim | | 0.39 m over the lips, 0.14 m to his left, 0.12 m in front |
| the bell's stack (0.5 m up the model) | | 0.14 m to his left, 0.19 m in front |
| the valves' side | turned half to the hall | the same: right 0.67, towards the hall 0.73 |
| the pistons' buttons | | 0.36 m in front, at the lips' height, 0.21 m to his left, where the right hand reaches across the body as in the photographs |
| the lean | the bell tipped to his right | to his left |

Tests (`apps/web/test/tuba3d.test.ts`): a new case, "is held the right way round in its seat …", checks each row of that table. The model's own case now asks for the mouthpiece turned out of the body's plane away from the valves. It used to ask for the mouthpiece in the plane.

## Shots (`artifacts/tuba-orientation/`, each before | after)

`node scripts/shots-tuba-orientation.mjs`. The before set is from production (`main` at `9b5f2d9`, the same tuba as `a614d8f`); the after set is from this branch's build.

- **Scenes:** the tuba alone (`solo`), the brass quartet (`quartet`), low winds and strings (`low`), Pass It On's seventeen (`passiton`).
- **Devices:** a computer (1440×900) and a phone (390×844).
- **3D close-ups** of the seated tuba: from the hall (`front`), from behind its player (`behind`), and from either side.
- **2D and vector lines:** the solo and the quartet, unchanged, to show the three looks still agree. The Orchestra's 2D rows draw the tuba as its plan, which is how the hall sees it held: the bell's stack left of the body and valves, the player's place at the left.

Look at `desktop-quartet-3d.jpg` and `desktop-quartet-3d-tuba-front.jpg` first. Before, the silver mouthpiece sticks out at the tuba's left and the bell tips to the left. After, the mouthpiece goes away towards the player and the bell leans out to the right.

## Not changed

- The tuba's sound, limiter and gain (Stephen's call).
- The glockenspiel's and timpani's 3D glow.
- The solo views' camera.

`/symphony` (Toward Morning) has no tuba; its seat is in `/passiton` and in any Orchestra lineup with one.

## Open

One reading of "orientation" is left. No player is drawn, so a seated tuba seen from the hall still shows its valve side, as the photographs do. If Stephen meant the bell should face the hall, that is not how a tuba is played, and it would be his call to turn it against that.
