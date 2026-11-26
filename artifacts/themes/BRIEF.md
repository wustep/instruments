# Four themes + Player chrome — brief

You are Fable 5.2 (`claude-fable-5-2`, effort xhigh) in a fresh worktree of https://github.com/wustep/instruments.

- Worktree: `/Users/wustep/Projects/piano-model-themes`
- Branch: `feat/themes` (already created from `origin/main` = `977d621`). It may still track `origin/main`; when you push, use `git push -u origin HEAD`.
- Production: https://instruments-wustep.vercel.app
- Do **not** merge anything. Do **not** close other PRs (the parent will close the alt drafts after this PR is open).

Stephen picked **all four looks** and asked for a theme button, plus a small chrome change on Measurements and Notes.

## 1. Four themes, as a real framework

Include:

1. **The current look on main** (the incumbent night bench: warm near-black, ivory linework, vermilion accent, Newsreader + IBM Plex, 3D product-studio lighting). Give it a short name in the same family as the others. Suggested: **Night Bench** (from the existing "instrument bench at night" art direction). You may pick a better short name if it sits more cleanly with the other three, but do not rename Evening Hall, Day Studio, or Night Gallery.
2. **Evening Hall** — branch `ui-alt-a`, draft PR https://github.com/wustep/instruments/pull/103 (worktree also at `/Users/wustep/Projects/piano-model-ui-alt-a` and `origin/ui-alt-a`). Concert hall at night: stage boards, one spotlight, velvet rail, Libre Caslon + Cabin.
3. **Day Studio** — branch `ui-alt-b`, draft PR https://github.com/wustep/instruments/pull/105 (worktree `/Users/wustep/Projects/piano-model-ui-alt-b`, `origin/ui-alt-b`). Bright daylight studio: plaster white, soft north light, ink for selection and one blue for sound.
4. **Night Gallery** — branch `ui-alt-c`, draft PR https://github.com/wustep/instruments/pull/104 (worktree `/Users/wustep/Projects/piano-model-ui-alt-c`, `origin/ui-alt-c`). Museum after hours: cool charcoal, rim light, Libre Franklin, light as the only signal.

Each theme must carry that look's **layout chrome, type, color, 2D background treatment (default 2D and vector), and 3D environment and lighting**. This is not a recolor of CSS variables only. Port the real work from those branches; do not reinvent the three alts from memory.

**Refactor into a clean theming framework** (Stephen said feel free to refactor):

- A theme registry and tokens. One place per theme for colors, typography, 2D backgrounds/washes, and 3D environment/lighting (the generated studio / key / fill / rim / ground / exposure in `apps/web/src/ui/gl/three3d.ts` and related).
- Switching a theme must update chrome, 2D stage, vector style, and 3D lights/environment together.
- Persist the choice in `localStorage`.
- **No flash of the wrong theme on load**: apply the stored theme before first paint (inline boot script in `index.html` / early attribute on `:root`, then hydrate). Default is the current (Night Bench / incumbent) look for first-time visitors.
- Keep `lite`, phone AO/shadow switches, and shader warming working in every theme.
- Do not add a theme picker that feels like a SaaS settings page. **A simple theme button** that cycles or opens a small pick, low on text, in the top bar, fitting the nearly wordless stage. It should be obvious enough to find, including on a phone.
- All routes and modes stay functional: 2D, vector, 3D, orchestra, file player, sheet music, measurements, notes, all sixteen instruments, URL state, desktop and phone.
- Do not change DSP / engine audio.
- Do not commit huge screenshot binaries if you can attach them only to the PR body. Do not commit Impeccable vendor files.

Read the three alt branches for the real token/lighting/CSS/draw changes. Cherry-picks or file copies are fine; a single messy merge of those PRs is not — rebuild them as themes in the new framework.

## 2. Hide MIDI and sound chrome on Measurements and Notes; add Player

In `apps/web/src/main.ts` the header status is the lamp + "tap a key" / sound status (`lampText`) and the "midi" indicator (`midiText`). Those belong on the stage. On **Measurements** (`/measurements`) and **Notes** (`/notes`):

- Hide the MIDI indicator and the sound/lamp status ("tap a key", etc.). Do not remove MIDI input or audio; just this chrome, and only on those two pages. Keep the lamp on the main player/stage.
- Add a **Player** control that returns to the main tab: the instrument/stage (the current instrument or orchestra address, not a blank home). Style it with the other page links. It should be easy to hit on a phone.
- If you find other literal "MIDI" or "Sound" header buttons that only clutter those pages, hide those there too.

When the user is on the stage again, the Player control goes away (or is not shown); Measurements and Notes links stay as they are.

## Tests and quality

From the worktree root (`pnpm@10`):

1. `pnpm typecheck`
2. `pnpm build`
3. `pnpm test`

Fix e2e selectors if the chrome change or theme button breaks them. Prefer a focused Playwright run of top-panel / notes / measurements / a couple of 2D+3D specs, plus phone, over a piled-on full matrix if the machine is busy — but do not loosen tests. If you have time and load allows, run `pnpm e2e` or the full Playwright suite. This repo has **no GitHub Actions**; the gate is local, then Vercel preview. A branch named `feat/themes` will get a preview (only `claude/*`, `codex/*`, `agent/*` are ignored).

## Screenshots (required in the PR body)

Save under `artifacts/themes/shots/` (gitignore the binaries if the repo already ignores that pattern; do not force-commit 14 MB of PNGs). Capture **each of the four themes** at least:

- Piano 2D desktop (1440×900)
- Piano 3D desktop
- Piano 2D or 3D phone (390×844 / Pixel 7 class)

Also one after of the Measurements or Notes page showing the new Player button (and no MIDI/sound lamp), desktop or phone. Wait for 3D to actually draw.

Include **before** shots from production (https://instruments-wustep.vercel.app) for the incumbent chrome, and afters for all four themes.

## Git / PR (one push, do not merge)

- Small useful commits are fine; **one push** at the end.
- Open a pull request against `main` of **wustep/instruments** only: `gh pr create -R wustep/instruments --base main --title "…" --body-file …`. Not a draft unless you have a strong reason; it should be ready for review. Immediately confirm the URL is `https://github.com/wustep/instruments/pull/…`.
- After the push, wait for the Vercel preview and put the URL in the PR body.
- Put before/after screenshots **in the PR body** (not a comment) with `~/.local/bin/gh-attach pr edit <n> --repo wustep/instruments`. Paths in the body must match `--attach`. Use a markdown table (rows of themes, desktop and phone).
- PR title idea: `Four themes (Night Bench, Evening Hall, Day Studio, Night Gallery), and a Player link on Measurements and Notes`.
- PR body must explain the theming framework (tokens, registry, persistence, no-flash boot), name the four themes, mention the Player/MIDI/sound chrome change, include the preview URL and the screenshot table, and say **do not merge until Stephen says so**.
- **Do not merge. Do not squash-merge. Do not click merge.** Do not close #103, #104, or #105.

When done, write `artifacts/themes/STATUS.md` with: PR URL, preview URL, a short description of the theming design, CI/Vercel status, and absolute screenshot paths.

If Claude/Fable usage is exhausted, stop cleanly, commit what is safe, write STATUS, and do not loop.
