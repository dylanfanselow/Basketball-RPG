# Architecture

`src/sim/**` is pure TypeScript (no Phaser), so it's unit-testable and can run headless AI-vs-AI games.
Phaser (`src/scenes`, `src/render`) only renders and reads input.

## Sim (`src/sim`)
| File | Role |
|---|---|
| `game.ts` | `GameSim`: the whole game loop. `update(dt, input)` → user input (`handleUser`, tap/hold logic in `ux`), AI `think`, ults, `physics`, `collisions` (screens, charges, box-outs), `updateBall` (pass/shot/rim/loose/dead), plays, `rules`. Also `startShot`/`releaseShot`/`resolveShot`, `pass`, `dribbleMove`, `pumpFake`, `flickCross`, `startBurst`, `setScreen`, `swipe`, `takeCharge`, inbound system (`deadBall` → `startInbound` → `updateInbound`, `thinkInbound`, `clampFor`), `chaseBall` (rebounding), `boxOut`, `callPlay` (feature-me rotation + role swap), `playRole`. Emits events (`emit`, `quiet` for audio/anim-only). 1v1: `cfg.oneOnOne` (mode stays `'practice'`), both teams share a side, `checkBall(team)` replaces `practiceReset`, `scoreValue`, `checkWin`; second human `user2` + `ux2`, `update(dt, input, input2?)`, `handleUser(u, inp, ux)`, `isHuman`. Step-through: `stepThrough()` + `liftAt` in `physics`. |
| `player.ts` | `Player` state: core/sub ratings, `mods`, position/velocity/z, state machine, timers (many default to −9 so "time < x" checks work at t=0), box score, anim record. |
| `attributes.ts` | Core stats → sub-ratings via `statInfluence.json`; `statFactor`, `rmap`. |
| `modifiers.ts` | Effect/hook system (`sub`, `shot`, `contestIn`, `contestOut`, `param`, `move`, `shotType`; code hooks with expiry). |
| `shooting.ts` | `selectShotType`, `computeContest` (cone, `contestReach`), `evaluateShot` (equation terms), `formatEquation`. |
| `moves.ts` | `classifyStick` (basket-relative), `resolveMove` (chains first), `availableMoves` (HUD), `moveDirection` (canonical directions), `sideOf`. |
| `rim.ts` | Live rim sequences: `pickSeq`, `buildPath`, `sampleRim`. |
| `plays/runner.ts` | `PlayRunner`: phases, reset timer, role swap, focus player. |
| `ai/offense.ts` | Off-ball targets (play, freelance, transition lanes), handler AI (shoot/pass/drive/moves, transition reads, open-man bonuses, dead dribble). |
| `ai/defense.ts` | Man defense, help, drop, transition get-back, steals, charges. |
| `ai/trust.ts` | Trust deltas, pass factor, call bonus. |
| `rotation.ts` | Coach trust → minutes/stints. |
| `ultimates.ts` | Activation and per-tick logic for the 3 ultimates; milestone table. |
| `oneOnOne.ts` | `OneOnOneSetup`, `DEFAULT_1V1`, `buildOneOnOne` (pure 1v1 game builder; same-team P2 ids get `-p2`). |
| `court.ts`, `math.ts`, `data.ts` | Geometry/spots, vector math + seeded RNG, JSON imports and types. |

## Career (`src/career`)
`career.ts` (state, XP, save/migration v2), `skilltree.ts` (unlock rules), `roster.ts` (real rosters from
`rosters.json`, procedural fallback), `story.ts` (future: events/story effects, `unlockUltimate`).

## Render & scenes
| File | Role |
|---|---|
| `render/view.ts` | Projection (`S`=22 px/ft, `D`=6.4, `OOB_FT`=10, `sx/sy`), court, stanchions. |
| `render/sprites.ts` | Shaded sprite drawing at `ART`=1.5 (side-view sheets, front-view bench sheets, `frontHead`, `frontChair`), `crispen`, kits, `figureHeight`, `SPRITE_SCALE`. |
| `render/sheetPool.ts`, `render/sheetWorker.ts` | Build sheets in parallel Web Workers (`requestSheet`), main-thread fallback. |
| `render/celebs.ts` | Courtside celebrity looks + 4-frame front sheets. |
| `render/anim.ts` | Keyframe clips, Catmull-Rom sampling, `SHOT_CLIP`, `shotU`, `frameAt`. |
| `render/appearance.ts` | Appearance type, random generator, defaults. |
| `render/hud.ts` | `ControllerHud`: button diamond, icons, sprint pill, ult ring, stick + move arcs + flash. |
| `render/crowd.ts` | Animated crowd. |
| `scenes/ui.ts` | `hiRes(scene)` (1.5× camera, origin 0), `MenuList`, `title`. Every scene calls `hiRes` in `create`. |
| `scenes/GameScene.ts` | Main renderer (async `sheetFor`/`evictSheets`, `ready` gate, reflections, celebs): sprite sheets cache, `clipFor` (anim selection), overlays (cones, gusts, markers), HUD, sideline (table, benches, coaches), audio event mapping, camera. |
| `scenes/MatchSetupScene.ts` | Quick 5v5 setup. `setup.ts` builds the `GameSim` for each mode (`GameInit` is kept for Restart/Rematch). |
| `scenes/OneOnOneSetupScene.ts` | 1v1 setup: 4 list columns + 4 option columns (P2 human/CPU, game to, scoring, win by 2). PostGame has a 1v1 branch (rematch / change players / menu). |
| Other scenes | Menu, Hub, LevelUp, PerkTree, Ultimate, PostGame. |
| `audio/sfx.ts` | Procedural Web Audio engine. |
| `input/input.ts` | `InputMapper` (Gamepad API + keyboard, edge detection). |
| `dev/devPanel.ts` | DOM dev tools overlay. |

## Data (`src/data`) — tune feel here
`statInfluence.json`, `shotTypes.json`, `moves.json` (dist/plantAt/dur/ankle/chains), `trees/*.json`,
`ultimates.json`, `plays/plays.json` (with `focus`), `league.json`, `rosters.json`, `backstories.json`, `events.json`.

## Tests (`tests/`)
`sim.test.ts` (mechanics, AI game stats, inbounds, rebounding, moves), `anim.test.ts` (clips, appearance, events),
`rosters.test.ts` (roster validity, play reset), `oneonone.test.ts` (pump fake, step-through, 1v1 rules, two humans), `helpers.ts` (`makeGame`, `simToEnd`).
`scripts/stats.test.ts` / `scripts/debug.test.ts` print headless game stats (run with
`npx vitest run scripts/stats.test.ts --dir . --config /dev/null`).
