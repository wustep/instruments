# Instruments UI alternate — brief

You are Fable 5.2 (claude-fable-5-2, effort xhigh) in a dedicated git worktree of https://github.com/wustep/instruments (local clone lives at ~/Projects/piano-model; this worktree is already on the named branch, at origin/main = 977d621). Production: https://instruments-wustep.vercel.app.

Stephen asked for three distinct, coherent alternate UIs. You own **only this one direction**. The other two run in parallel in other worktrees. Do not look at, copy, or converge toward those branches. Do not merge anything. Stephen will pick.

## Impeccable (required)

A current project-scoped Impeccable **4.10.0** is already installed in this worktree at `.claude/skills/impeccable`. Use **that** copy, not the older user-level skill at `~/.claude/skills/impeccable` (4.7.0, via dotfiles).

Follow the skill's real workflow:

1. Run the project skill's context loader once (`./.claude/skills/impeccable/scripts/impeccable context`), keep cwd at the worktree root, then load the matching playbooks (critique / shape / new-work / audit / polish / craft-floor) from `.claude/skills/impeccable/`.
2. **First:** `/impeccable critique` the **current** UI (this checkout as it stands on main, and production). Look at it rendered: 2D and 3D, desktop and phone. Write the critique down (e.g. `artifacts/ui-alt/CRITIQUE.md`).
3. **Then:** `/impeccable shape` this direction into a brief, then `/impeccable design` / the new-work path, and implement it. Record the system in `DESIGN.md` (and `PRODUCT.md` if init wants it). These may be committed. This is a **redesign**, not a polish of the incumbent night-bench look: treat the current UI as evidence and anti-reference. Do not split the difference.
4. After the UI is in and working: `/impeccable audit`, then `/impeccable polish`. Run the detector (`npx impeccable detect` or the skill's check) on the screens you changed and fix what it finds that is in scope.
5. Do the commands and checks for real. Do not skip them or only mention their names.

Do **not** commit Impeccable vendor files (`.claude/skills/impeccable/`, `.claude/agents/impeccable-*.md`, `.claude/settings.local.json`). They are already in this repo's exclude.

## What to change

A complete, **functional** alternate of the Instruments site — not a mockup, not a theme toggle, not a prototype parked beside the old UI. This branch *is* the new UI.

Cover all of:

- Layout and navigation (top bar, picker, view switch, orchestra, player, pages)
- Typography and color (new type and a new palette; see bans below)
- Controls (knobs, buttons, sheets, keyboard, player, readouts)
- **This direction's own 2D background treatment** (page ground, the 2D stage backdrop, the vector style's ground, any vignette/grain/wash — both default 2D and vector)
- **This direction's own 3D environment and lighting** (the generated studio / backdrop in `apps/web/src/ui/gl/three3d.ts`, key / fill / rim lights, environment intensity, ground, exposure / tone. Today it is a product-studio shot: warm key, cool rim, softboxes, dark walls. Replace that world.)

The app must keep working: 2D, vector, 3D, orchestra, file player, sheet-music (the page icon), measurements, notes, all sixteen instruments, URL state, phone and desktop. Do not change DSP / engine audio unless a visual hook already reads a value you need. Do not add a theme picker.

## Taste and bans

Stephen's taste: simple, easy to navigate, low on text, and it should feel crafted. The stage is already nearly wordless — keep it that way. No new permanent explanatory copy.

**Banned fonts** (do not use, even as fallbacks you expect to hit): Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young Serif, Bodoni, Geist, Syne. The incumbent Newsreader + IBM Plex is the *current* look; pick a new pairing that fits **this** direction and is not in that ban list.

Crafted, specific, coherent. Not "SaaS dashboard." Not a thin recolor of the current night bench.

## Key files

- `apps/web/src/styles.css`, `panel.css`, `vector.css`, `not-found.css` — color, type, chrome
- `apps/web/src/ui/readout.ts`, `views/stage.ts`, `nav.ts` — bar and navigation
- 2D drawers under `apps/web/src/ui/` (`stage-draw.ts`, `ensemble-draw.ts`, instrument drawers)
- 3D lighting and environment: `apps/web/src/ui/gl/three3d.ts` (`studio()`, key/rim/fill, backdrop). Scenes: `scenes3d.ts`. Keep performance knobs (`lite`, phone AO/shadows) working.
- Orchestra seating stays as it is in `orchestra/seats.ts` unless a visual frame change is required.

## Tests and quality

From the worktree root (`pnpm@10`):

1. `pnpm typecheck`
2. `pnpm build`
3. `pnpm test`

If selectors or screenshots in e2e broke because of the new chrome, fix those tests. The machine is under load from other Playwright work, so **do not** run the full `pnpm e2e` suite until the design is done, and prefer a focused Playwright run over the whole matrix if the full suite would pile on. Do not loosen tests to get green. If esbuild's build script was ignored by pnpm, `pnpm approve-builds esbuild` (or rebuild) only if `pnpm dev` / `pnpm build` actually fail.

## Screenshots (required for the PR)

Save everything under `artifacts/ui-alt/shots/` in this worktree (create it). Do **one planned burst of befores**, then implement, then **one planned burst of afters**. Do not screenshot after every tweak. The machine is already running other headless Chromes; keep this modest.

**Befores** from production (the current UI): https://instruments-wustep.vercel.app

**Afters** from this branch's dev server (`pnpm dev`) or `pnpm preview` after build.

Capture at least:

| File | What |
| --- | --- |
| `before-piano-2d-desktop.png` | `/piano` (or `/piano?view=2d`), 1440×900 |
| `before-piano-3d-desktop.png` | `/piano?view=3d`, 1440×900 |
| `before-piano-2d-phone.png` | same, Pixel 7 / 390×844 class |
| `before-piano-3d-phone.png` | 3D, phone |
| `before-orchestra-3d-desktop.png` | `/symphony` or `/orchestra` in 3D, desktop |
| `after-…` | the same five (or more) on this branch |

Also grab one after of another instrument (e.g. cello or violin) in 3D desktop if it shows the new environment clearly. Wait for the 3D stage to actually appear (not a blank/loading frame).

## Git / PR (one push, draft only)

- Branch name is already correct. It may still track `origin/main`; when you push, use `git push -u origin HEAD` (or the branch name).
- Small, useful commits are fine; **one push** at the end (or once, after the work is ready). Do not push WIP just to have a PR early, unless you then force-push only before the PR exists. Prefer: finish, commit, push once, open the draft PR.
- Open a **DRAFT** pull request against `main` of **wustep/instruments** only (this is not a fork, but still pass `-R wustep/instruments --base main --draft`). There is no `gh-pr-create` wrapper on this machine; use `gh pr create -R wustep/instruments --base main --draft --title "…" --body-file …`. Immediately confirm the returned URL is `https://github.com/wustep/instruments/pull/…`. If it landed on any other repo, close it and open the correct one.
- After the push, wait for the Vercel preview and put the preview URL in the PR body. Branches named `ui-alt-*` should get previews (only `claude/*`, `codex/*`, `agent/*` are ignored).
- Put before/after screenshots **in the PR body** (not a comment) with `~/.local/bin/gh-attach pr edit <n> --repo wustep/instruments`, using a markdown table. Paths in the body must match `--attach`. See the pattern in this machine's memory: `--attach '/path/to/before-piano-2d-desktop.png#before-piano-2d-desktop'` etc.
- PR title: something like `WIP: UI alt — <Direction Name>`.
- PR body must include: the direction name, a 2-line description, what changed (layout/nav, type/color, controls, 2D backgrounds, 3D environment/lighting), the preview URL, and the screenshot table. Say clearly this is one of three alternatives and should **not** be merged until Stephen picks.
- **Do not merge. Do not squash-merge. Do not click merge.**

## Stop conditions

If Claude or Fable usage is exhausted, or you hit a weekly/session limit, stop cleanly, commit what is safe to keep, write status in `artifacts/ui-alt/STATUS.md`, and do not retry in a way that would burn a banked reset (there isn't one for Claude; just don't loop). Do not keep relaunching.

When you are done, write `artifacts/ui-alt/STATUS.md` with: direction name, 2-line description, PR URL, Vercel preview URL, and the screenshot paths (absolute).

## Your direction: Day Studio

A bright, minimal daylight studio. High-key, pale ground, soft north light, the feeling of a quiet photography studio or a modern practice room at midday. Air, space, and clarity. The opposite of the current night bench.

2D: a light ground (paper, plaster, or pale cyc), soft even illumination, very little vignette, instruments read as objects on a bright field. The vector style should also go light, not stay a dark Chimera plate unless you invent a light counterpart that still feels like the same direction.

3D: replace the dark-walled product studio with a bright cyc / daylight environment: a large soft skylight or north-window key, gentle warm-white fill, almost no dramatic rim, soft shadows, higher exposure. Metal and lacquer should look like they do in daylight, not in a jewelry-box spotlight.

Type and chrome: calm, minimal, easy to scan, almost no decoration. Pale surfaces, a small number of weights, one precise accent. It must still feel crafted and musical, not like a generic SaaS light theme.

Name this direction **Day Studio** in DESIGN.md, the PR, and STATUS.md.

Start by critiquing the current UI (rendered), then shape and design this direction, then build it, then audit and polish, then screenshots, tests, one push, draft PR.
