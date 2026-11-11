# README, repo links, and a Notes credit

Visual and docs only; the engine is untouched.

## README and links

The README still described production as planned at `https://piano-model-wustep.vercel.app`.
That host now sends a public visitor to the Vercel login wall (SSO). The live site is
`https://instruments-wustep.vercel.app` (HTTP 200). `https://piano-model.vercel.app` still
serves the same current bundle, but its meta description was the old piano-only line, and
it is not the canonical address.

The README now:

- points at the live production URL, with a link for each of the thirteen instruments,
  the Orchestra, Notes, Measurements, and the two Orchestra presets (Daylight quintet
  address and Beethoven 5 I–II);
- states that the Daylight quintet file itself is not bundled;
- mentions orchestral seating (five or more) and the chamber arc (up to four);
- drops the stale “Round 2 / not claimed live” status and the outdated test counts
  (they had said 52 unit tests and 18 Playwright tests).

`apps/web/index.html` meta description is updated to thirteen instruments (it still said
“a physically modelled acoustic piano”).

Every production path checked returned HTTP 200: `/`, `/piano`, `/piano/upright`, `/grand`,
`/upright`, `/violin`, `/viola`, `/cello`, `/bass`, `/double-bass`, `/contrabass`, `/flute`,
`/oboe`, `/clarinet`, `/bassoon`, `/horn`, `/french-horn`, `/trumpet`, `/trombone`,
`/timpani`, `/kettledrums`, `/orchestra`, `/ensemble`, `/measurements`, `/notes`, and both
preset query strings.

The GitHub repo description and homepage URL are updated with `gh repo edit` (not in this
tree): homepage `https://instruments-wustep.vercel.app`.

## Notes credit

At the foot of Notes, after Sources:

“Built by Stephen Wu [home] [X] with Opus 5.5 and Fable 5.2.”

The two marks are icon buttons (not text links) to `https://wustep.me` and
`https://x.com/wustep`, with accessible names (“Stephen Wu’s site”, “Stephen Wu on X”),
italic Newsreader at the Notes caption size, and a one-pixel amber focus ring matching
the Notes section buttons. No banned fonts.

Pictures: `notes-credit-desktop.jpg`, `notes-credit-phone.jpg`.
Regenerate: preview the build, then `SHOT_URL=http://localhost:<port> node scripts/shot-notes-credit.mjs`.
