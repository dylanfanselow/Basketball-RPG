# Workflow

## Where things live
- **GitHub:** https://github.com/dylanfanselow/Basketball-RPG (public, branch `main`).
  The owner sometimes edits files on GitHub, so **`git pull --rebase origin main` before pushing**.
- **Browser link (private artifact):** https://claude.ai/artifact/Vfg8WiUU3S3ACrfuEDx4qX
  Rebuild with `npm run build:single` → `dist/hoop-career.html`, then republish that file to the same URL
  (Artifact tool with `url`).
- Owner plays locally on a Mac in Chrome: `cd Basketball-RPG && git pull` then `npm run dev`
  (http://localhost:5173). No new npm packages so far; tell the owner to `npm install` if one is added.

## Commands
```bash
npm run dev          # dev server (hot reload)
npm test             # Vitest: sim + anim + roster tests
npx tsc --noEmit     # typecheck
npm run build:single # single-file build for the browser link
```

## How each round goes
1. Owner sends feedback → plan in plan mode (ask only genuinely open questions; see DECISIONS.md first).
2. Implement sim first, tests next, then render/HUD/audio.
3. Verify: `npm test`, headless stats (`scripts/stats.test.ts`), Playwright screenshots against a dev server
   (pre-installed Chromium; `require('playwright')`; scripts live in the session scratchpad).
4. Update README "Things to know while testing" if controls changed.
5. Commit (attribution lines from the system reminder), `git pull --rebase`, push, rebuild single file, republish.
6. Summarize for the owner: what changed, how to test it, what wasn't verified.

## Gotchas
- There is **no `strength` sub-rating**: use `p.core.strength`. (A box-out bug came from `sub.strength`.)
- Many player timers default to **−9** (`bumpedUntil`, `lastBumpAt`, `screenedUntil`) so checks work at time 0.
- The user can be any roster player in Quick 5v5: never assume the user id is `'USER'`; use `sim.user`.
- Cosmetic randomness must not consume `sim.rng` (it changes whole games and breaks seeded tests).
- Phaser scenes are reused between games: clear per-game maps in `GameScene.init`; textures persist in
  `SHEET_CACHE`. **Never lazily create game objects in `update()` behind `if (!this.x)`**: on re-entry the field
  still points at the destroyed object, `setText` throws, and the scene freezes (this was the "can't leave a menu" bug).
- The canvas is **1920×1080** but every scene lays out in **1280×720** units: call `hiRes(this)` first in any new
  scene's `create()`. Don't `setBounds` the main camera (with origin 0 its clamp is off); clamp scroll manually.
- Sprite sheets are built **asynchronously** (workers). Anything that needs a sheet must handle `null` until ready
  (`GameScene.sheetFor`). Sheet-drawing code must work on an `OffscreenCanvas` (no `document` in workers).
- **Angled frames are lazy** (`FrameCache`): never assume an angled frame exists — go through `cache.get` and fall
  back to the side-view sheet frame. New turning clips must be added to `ANGLED` in GameScene; a pose's sideways
  spread goes in `Pose.lat` (invisible at yaw 0). Headless draws ~4 ms per angled frame (software canvas).
- Headless Chromium renders WebGL in software here: fps/load numbers from Playwright are far worse than on a real
  machine; JS profiling showed ~98% of frame time in native rendering.
- `src/state.ts` touches `window`, so anything tests import must not import it (that's why `sim/oneOnOne.ts` exists).
- Official NBA/roster sites are blocked from the cloud environment; use web search results.
- Stick space = court space (x along the court, y across it); move directions are relative to the player→rim vector.
