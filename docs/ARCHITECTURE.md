# Architecture

`src/sim/**` is pure TypeScript (no Phaser), so it's unit-testable and can run headless AI-vs-AI games.
Phaser (`src/scenes`, `src/render`) only renders and reads input.

## Sim (`src/sim`)
| File | Role |
|---|---|
| `game.ts` | `GameSim`: the whole game loop. `update(dt, input)` → user input (`handleUser`, tap/hold logic in `ux`), AI `think`, ults, `physics`, `collisions` (screens, charges, box-outs), `updateBall` (pass/shot/rim/loose/dead), plays, `rules`. Also `startShot`/`releaseShot`/`resolveShot`, `pass`, `dribbleMove`, `pumpFake`, `flickCross`, `startBurst`, `setScreen`, `swipe`, `takeCharge`, inbound system (`deadBall` → `startInbound` → `updateInbound`, `thinkInbound`, `clampFor`), `chaseBall` (rebounding), `boxOut`, `callPlay` (feature-me rotation + role swap), `playRole`. Emits events (`emit`, `quiet` for audio/anim-only). 1v1: `cfg.oneOnOne` (mode stays `'practice'`), both teams share a side, `checkBall(team)` replaces `practiceReset`, `scoreValue`, `checkWin`; second human `user2` + `ux2`, `update(dt, input, input2?)`, `handleUser(u, inp, ux)`, `isHuman`. Step-through: `stepThrough()` + `liftAt`/`liftVz` in `physics`, `stepThroughReady` (HUD). Blocks/strips: `stun(p, secs, anim)` (`stunnedUntil` gates `handleUser`/`think`/movement), loose ball `noGrabUntil`/`noGrabPid`/`noGrabPidUntil` (checked in `tryGrab`). Passing: `pass` sets `magnet` (short passes re-aim at the receiver each tick, 4.5 ft catch radius) and `riskMult` (short ×0.15 / medium ×0.6 / long ×1.8+); deflection radius grows with length. Icon pass: `iconTargets`/`iconTargetsFor` (`ICON_ORDER` ✕○□△ by role), `UserInput.l2Held`. |
| `player.ts` | `Player` state: core/sub ratings, `mods`, position/velocity/z, state machine, timers (many default to −9 so "time < x" checks work at t=0), box score, anim record. |
| `attributes.ts` | Core stats → sub-ratings via `statInfluence.json`; `statFactor`, `rmap`. |
| `modifiers.ts` | Effect/hook system (`sub`, `shot`, `contestIn`, `contestOut`, `param`, `move`, `shotType`; code hooks with expiry). |
| `shooting.ts` | `selectShotType` (step-through first: `STEP_THROUGH_WINDOW` 1.5 s, `stepStride`, `STEP_FINISH_FT` → `stepThrough` or `stepThroughJumper`), post shots first (`postShotType`), Fade Away for owners on stick-away, then directional close shots (away floater / toward layup-push / sideways hook, euro on drives); `fakeClipFor` + `FAKE_NAMES` (Dreamer fakes); `computeContest` (cone `coneHalf`, `contestReach`; post-locked = 0, sealed/leaned ×`POST_EVEN_CONTEST`; ×0.15 for defenders who `bitOnFake`), `evaluateShot` (equation terms), `formatEquation`, `isStepThrough`. |
| `post.ts` | Post up (L2): `POST` tuning, `postGap`/`postMode` (post vs postD, ±8), `postDefender`, `canPost`, `updatePost` (before physics; sets the pair's positions: bumps / push / bump-back), `endPost` (release window + lock/seal), `onPostShot`, `postLocked`, `postIntent` (user/AI intent per tick). |
| `moves.ts` | `classifyStick` (basket-relative), `resolveMove` (chains first), `availableMoves` (HUD), `moveDirection` (canonical directions), `sideOf`. |
| `boxScore.ts` | `topStats` / `STAT_WEIGHTS`: which 3 of your stats the HUD box score shows. |
| `ballPhysics.ts` | Physical shots: `simulateShot` (ball vs rim ring / glass / net, fixed 1/240 s step), `planShot` (outcome-steered launch search), `samplePlan`. Pure, deterministic. |
| `rim.ts` | Scripted rim sequences, now dunks only: `buildPath`, `sampleRim`. |
| `plays/runner.ts` | `PlayRunner`: phases, reset timer, role swap, focus player. |
| `ai/offense.ts` | Off-ball targets (play, freelance, transition lanes), handler AI (shoot/pass/drive/moves, transition reads, open-man bonuses, dead dribble). |
| `ai/defense.ts` | Man defense, help, drop, transition get-back, steals, charges. |
| `ai/trust.ts` | Trust deltas, pass factor, call bonus. |
| `rotation.ts` | Coach trust → minutes/stints. |
| `ultimates.ts` | Activation and per-tick logic for the 3 ultimates; milestone table. |
| `dunks.ts` | Dunk package: `DUNKS` (unlock by Dunk rating, power / flash, make ×, ult bonus, clip), `unlockedDunks`, `nextDunk`, `pickDunk` (contested → power, open → flashy). |
| `threes.ts` | Quick 3v3: `ThreeSetup`, slots `SLOTS`/`SLOT_POS` (Guard PG/SG, Wing SG/SF/PF, Big PF/C), `defaultLineup`, `slotChoices`, `slotForPos`, `buildThrees` (no bench; `halfCourt` option). On court a three-man team is roles 1/3/5 (`refreshOnCourt`); `callPlay` uses only plays tagged `3v3` when three a side (iso for the best player ~35%). |
| `oneOnOne.ts` | `OneOnOneSetup`, `DEFAULT_1V1`, `buildOneOnOne` (pure 1v1 game builder; same-team P2 ids get `-p2`). |
| `court.ts`, `math.ts`, `data.ts` | Geometry/spots, vector math + seeded RNG, JSON imports and types. |

## World (`src/world`)
`apartment.ts` (pure): room feet ↔ screen (`RS`, `RD`, `sxOf`/`syOf`, slanted `wallL`/`wallR`), `FURNITURE`
footprints (optional `poly`), `DOORS`, `solids`, circle-vs-polygon `resolve` / `moveWithCollision` (sub-steps, never
ends inside a gap narrower than the body), `isFree`, `doorNear`, cat (`newCat`, `catStep`, `CAT_SPOTS`).

## Career (`src/career`)
`career.ts` (state, XP, save/migration v3 with the `life` block, `nextKeyGame` / `isKeyGame` / `RIVALS`), `skilltree.ts` (unlock rules), `roster.ts` (real rosters from
`rosters.json`, procedural fallback), `story.ts` (future: events/story effects, `unlockUltimate`).

## Render & scenes
| File | Role |
|---|---|
| `render/view.ts` | Projection (`S`=22 px/ft, `D`=6.4, `OOB_FT`=10, `sx/sy`), court, hoops (`drawHoops`: glass pane via `pane()`, split rim on `back`/`rimG`, mesh net, stanchions). |
| `render/sprites.ts` | Shaded sprite drawing at `ART`=1.5 (side-view sheets, open-stance front-view poses via `drawOpen`, front-view bench sheets, `frontHead`, `frontChair`), `crispen`, kits, `figureHeight`, `SPRITE_SCALE`. |
| `render/playerBank.ts` | Shared player sprite sheets + multi-angle frame caches (`SHEET_CACHE`, `ANGLE_CACHE`, `sheetFor`, `angleCache`, `pumpSheet`, `dropSheet`, `playerSheetKey`, `hashStr`); used by GameScene and the apartment. |
| `render/roomArt.ts` | Apartment art drawn in code at art resolution (960×540 = scene × 0.75): background (exteriors, posts, walls, plank floor, windows, doors, calendar, poster, floor clutter, contact shadows), one cropped texture per furniture piece (`buildRoomArt`, multi-frame tank / fan), cat pixel maps (`buildCatTexture`), HUD icons, lamp glow. |
| `render/sheetPool.ts`, `render/sheetWorker.ts` | Build sheets in parallel Web Workers (`requestSheet`), main-thread fallback. |
| `render/celebs.ts` | Courtside celebrity looks (+ plain `randomFan` looks for the fan row) + 4-frame front sheets. |
| `render/faceParts.ts` | Face-part library (pure, worker-safe): part types/views, `variantOf`, `drawPart` with per-player recolor (`recolorPixels`), `partsFor` (pictures a sheet job needs), `partsVersion` (sprite cache keys). |
| `render/facePartsArt.ts` | Main-thread loader: `src/art/parts/*/*.png` (inline) + editor drafts → library (`loadFaceParts`, called from main.ts). |
| `render/celebArt.ts` | Fixed celeb cast (`CELEB_CAST` = 17, `castLook(i)`; `FEATURED_CELEBS` always get a seat (#16, #17 hand-picked), `RETIRED_CELEBS` never sit, `GLAM_CELEBS` wave / blow kisses, `CANE_CELEBS` tap their cane; `drawCaneMan` in celebs.ts), art source per member: local editor draft → `src/art/celebs/celeb_NN.png` (bundled inline) → generated. |
| `render/pose3d.ts` | Multi-angle: `lift` (side pose → 3D, `lat` spread), `project`/`view` at a yaw (+ per-joint depth), `DIRS`. |
| `render/frameCache.ts` | `FrameCache` (on-demand angled frames: request/drain/get, pages, LRU) and `yawFor` (angle → drawn yaw + mirror). |
| `render/anim.ts` | Keyframe clips, Catmull-Rom sampling, `SHOT_CLIP`, `shotU`, `frameAt`; fixed-length limb helpers `limb`/`arms`/`legs` (authoring time); arm rig `rigArms(pose, ballClip)` + `dropToward` (lower shoulders/jersey top, keyed arms in ball clips, full-length arms in free clips). |
| `render/appearance.ts` | Appearance type, random generator, defaults. |
| `render/hud.ts` | `ControllerHud`: button diamond, icons, sprint pill, ult ring, stick + move arcs + flash. |
| `render/crowd.ts` | Animated crowd: blob stands rows + `FanRow` (plain sprite fans behind the sideline), shared `reaction()` ripple, home-colored shirts (`bigGame` = mostly home colors). |
| `scenes/ui.ts` | `hiRes(scene)` (1.5× camera, origin 0), `MenuList`, `title`. Every scene calls `hiRes` in `create`. |
| `scenes/GameScene.ts` | Main renderer (async `sheetFor`/`evictSheets`, `ready` gate, reflections, celebs): sprite sheets cache, `clipFor` (anim selection; `defStance` for defender facing + shuffle phase), overlays (cones, gusts, markers), HUD, sideline (table, benches, coaches), audio event mapping, camera. |
| `scenes/MatchSetupScene.ts` | Quick 5v5 setup. `setup.ts` builds the `GameSim` for each mode (`GameInit` is kept for Restart/Rematch). |
| `scenes/ThreeSetupScene.ts` | Quick 3v3 setup: team / opponent lists + lineups & options column (6 slots, play as, court); Left/Right changes a row, R1/L2 (Q/E) switch columns. |
| `scenes/OneOnOneSetupScene.ts` | 1v1 setup: 4 list columns + 4 option columns (P2 human/CPU, game to, scoring, win by 2). PostGame has a 1v1 branch (rematch / change players / menu). |
| `scenes/ApartmentScene.ts` | The starter apartment: movement + collision, multi-angle player, depth sorting, doors, cat, roof HUD, dev collision overlay (`settings.debug.room`). |
| Other scenes | Menu (now the dev menu), Hub, LevelUp, PerkTree, Ultimate, PostGame. |
| `audio/sfx.ts` | Procedural Web Audio engine. |
| `input/input.ts` | `InputMapper` (Gamepad API + window keyboard state, edge detection, first poll ignores held buttons). Keys: `escape` (L1/Esc), `icon` (R1/Q, icon pass), `post` (L2/E, post up), `tabPrev`/`tabNext` (L2,Q / R1,E for menu columns), `start`, `back`, `dev`. Optional `slot` 1/2 for two-player 1v1 (pad 1 / pad 2; keyboard goes to the first slot without a pad). |
| `dev/devPanel.ts` | DOM dev tools overlay. |
| `dev/pixelEditor.ts` | Pixel editor overlay (dev panel buttons or `?editor` / `?editor=parts`): one editor, two documents (`CelebDoc`, `PartsDoc`); "Save to repo" POSTs to the dev-only `/__dev/save-art` endpoint in `vite.config.ts`. |
| `dev/partSeeds.ts` | Exports the code-drawn face parts as gray pictures (`renderSeedParts`, `seedLook`, `renderPartCanvas`); used once to seed `src/art/parts` and for the editor's head guide. |

## Data (`src/data`) — tune feel here
`statInfluence.json`, `shotTypes.json`, `moves.json` (dist/plantAt/dur/ankle/chains), `trees/*.json`,
`ultimates.json`, `plays/plays.json` (with `focus`), `league.json`, `rosters.json`, `backstories.json`, `events.json`.

## Tests (`tests/`)
`sim.test.ts` (mechanics, AI game stats, inbounds, rebounding, moves), `anim.test.ts` (clips, appearance, events),
`rosters.test.ts` (roster validity, play reset), `oneonone.test.ts` (pump fake, step-through incl. pull-up + perk stride, 1v1 rules, two humans, steals/blocks + stun, passing magnet/interceptions, R1 icon pass), `post.test.ts` (post-up modes, axis-only stick, release window, post shots, AI posts), `fade.test.ts` (Fade Away selection, cone, falloff), `dreamer.test.ts` (Dreamer fakes, bite rate, directional close shots), `bringup.test.ts` (half-court pickup, press, 8-second rule, speed with the ball), `apartment.test.ts` (collision, reachability, cat, save v3, key games), `helpers.ts` (`makeGame`, `simToEnd`).
`scripts/stats.test.ts` / `scripts/debug.test.ts` print headless game stats (run with
`npx vitest run scripts/stats.test.ts --dir . --config /dev/null`).
