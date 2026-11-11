# Notes credit redesign

The #45 credit put a house glyph and the X mid-sentence, in 28 px boxes with wide side margins, so the line read as “Built by Stephen Wu [gap] [house] [X] [gap] with Opus 5.5 and Fable 5.2.” and the icons sat off the type baseline.

The sentence is now one piece of text: “Built by Stephen Wu with Opus 5.5 and Fable 5.2.” The two icons stand together at the end of the same rule (right-aligned on a wide measure, still on the line on a phone). They are about cap-height, in the same muted ink as the credit, and brighten to the main ink on hover and focus. A stroked globe marks wustep.me (not a house); the official filled X logo marks x.com/wustep, drawn a little smaller so the two match in weight. Accessible names are unchanged (“Stephen Wu’s site”, “Stephen Wu on X”).

## Shots

- `before/notes-credit-desktop-before.jpg`, `before/notes-credit-phone-before.jpg` — production at the #46 bundle, the mid-sentence house and X
- `after/notes-credit-desktop-after.jpg`, `after/notes-credit-phone-after.jpg` — this branch
- `notes-credit-desktop-before-after.jpg`, `notes-credit-phone-before-after.jpg` — paired

## Gate

- typecheck, production build
- vitest 772/772
- Playwright 256 passed / 24 skipped after one rerun of the known desktop “bow in the hand” flake (loudness 0.0015 then 0.00198 against a 0.002 floor; passed on the next retry). The flake was not loosened.
