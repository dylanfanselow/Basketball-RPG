# What's built (as of round 9, 2026-11-01)

All 74 Vitest tests pass. Modes: **Practice** (half court, configurable defenders/teammates), **Quick 5v5**
(team/opponent/player select), **1v1 Make It, Take It** (pick any NBA player per side, P2 human or CPU, scoring
options, result screen with rematch), **Career** (hub, level up, perk trees, ultimate panel, bench → earn minutes).

## Controls & HUD
- Tap/hold ✕ (fake/shoot), hold-○ drag moves with chains, jab tap, R2 burst sprint with cooldown pill,
  flick-cross during Side Drive, ○ box-out during shots, △ pass with target dot / call / steal, □ ultimate.
- Controller diamond with player-action icon badges (context labels; press-in effect; □ charge ring or padlock).
- Movement stick widget: basket-relative move arcs while ○ held (white base, gold chains, cyan flick window),
  flash on the move just done.
- Live shot-equation bar, score/clock/shot clock, trust bars (top left), play call line ("for YOU"), event feed,
  pass target dot, own contest cone, matchup cone on defense, play-assignment ghost path.
- Gamepad read straight from the browser Gamepad API (hot-plug notice), keyboard fallback. Two-player split
  (`InputMapper` slot 1/2: pad 1 / pad 2, keyboard to the first slot without a pad). Keyboard state comes from
  window events. Buttons held when a scene starts are ignored until released. Presses are latched until a sim
  step uses them (slow motion no longer drops them).
- L1 = escape everywhere (pause → quit in game). Pause menu stays open (it used to close on the same frame).
- **R1 (hold) icon pass** (keyboard Q): ✕ ○ □ △ glyphs over teammates, "hold R1 ICON PASS" hint above the diamond.
- **L2 (hold) post up** (keyboard E, round 27): `src/sim/post.ts` (stronger = bumps + stun-lock, even = slow push +
  half contest, weaker = bumped back + 1 s stun; release window with locked/sealed defender; `postShotType`), AI bigs
  (`ai/offense.ts` `wantsPost`/`postAI`), clips `postUp`/`postBump`/`postBumpedBack`/`postDefend`/`postBumped`
  (angled, `GameScene.postClip`), HUD label over you + ✕ shows the post shot, dev panel *Post test* + *Post up debug*.
- **Round 35:** bring-up: `GameSim.pressing` / `newPossession` / `backcourtRule` (8 s) / `pressured` / `pressHelp` /
  `callScreenFor` / `forcePress`, `topSpeed(p, hasBall)`; `ai/defense.ts` half-court pickup + trap; `ai/offense.ts`
  `bringUp`, `screenFor` big, press outlet; HUD `8 SEC` + `PRESS`. Headless: ball crosses half court in ~2 s, pace up
  (~120 FGA a game at 3-min quarters), FG% unchanged.
- **Round 34:** lob sets: `PlayPhase.lob`, 4 plays tagged `lob`, `callPlay` filter (`canOop`) + re-pick, AI lob read
  in `handlerAI` (`runner.lobPhase`), user credit in `lobPass`, play-line hint.
- **Round 33:** alley-oops: `GameSim.lobTarget` / `lobPass` / `oopArrive`, pass state `oop`, `UserInput.yHeld` + △
  tap/hold, shot types `alleyOop` / `alleyOopLayup` (+ `oopTiming` term), clips `passLob` / `oopReach` / `shot_oop` /
  `shot_oopLayup`, HUD "Pass / Lob" + LOB dot tag + landing ring ("✕ GO UP"), AI `throwTo` in `ai/offense.ts`.
- **Round 32:** Jelly Fake: `GameSim.canJelly` / `jellyFake` (`hangUntil`, `dunkStartAt`), `bitOnDunk` + `JELLY_HANG` /
  `JELLY_MULT` in `shooting.ts`, `shot_jelly` clip, HUD ✕ "Jelly", AI read in the timed-state loop.
- **Round 31:** `sim/dunks.ts` (`DUNKS`, `pickDunk`, `unlockedDunks`, `nextDunk`) + 8 `shot_dunk_*` clips (`dk`, `turned`
  helpers) and `_wm` Windmill Gather variants (`windmillGatherOf`) of layup / Euro / every dunk; `ShotContext.dunk` /
  `.windmill` terms; flash dunks: `net` event `flash`, crowd + shake, extra ult. `GameSim.playTarget()` + High IQ
  banner / marker (`GameScene.highIQ`). `GameSim.dive` / `diveable` (state `dive`, clip `dive`, HUD "Dive"). Dunk
  package shown in the dev live readout and on the level-up screen.
- **Quick 3v3** (round 30): `sim/threes.ts` + `ThreeSetupScene`; `GameConfig.halfCourt` (same hoop, `checkBall` for
  three, no inbounds / transition); 9 plays tagged `3v3` (pnr3, pop3, dho3, pindown3, post3, giveGo3, iso3Top,
  iso3Wing, iso3Post). Headless: full court ~60-80 pts a side at 48% FG, half court ~80-110 at 42%.
- **Dreamer** (`fi_dreamer`, round 28): `pumpFake(p, stick)` picks `fakeClipFor(selectShotType(...))` for owners
  (`fake_hook` / `fake_floater` / `fake_layup` clips via `fakePose`), `fakeBite` ×1.35, `FAKE_NAMES` event text, HUD ✕
  "Hook / Fake" etc.; AI hook fake in `postAI` (`aiFakeFollow`). Close-shot selection is directional (euro only on
  drives; post toward = layup / push).
- **Fade Away** (`sh_fade` ability, round 27): `fade` shot type, `coneHalf`/`contestReach`, `fadeFalloff` term, backward
  drift (`FADE_DRIFT`), `shot_fade` clip (the jumper leaned back via `leanBack`), AI uses it on contested looks.
- ✕ badge reads **"Step-Through"** while a recent fake + stick toward the rim lines one up.
- **Fullscreen**: F key, ⛶ corner button (DOM, `main.ts`), main-menu and pause-menu items.

## Shooting
- Shot types: dunk, layup, euro, step-through, floater, hook, push, mid, three, deep3 (`shotTypes.json`).
- Equation: base(distance) × stat factor × (1 − contest) × contact × fatigue × perk/ult terms.
- Contest cone per defender (distance, angle, height, hand up, perimeter/post D, stagger/screen state).
- Physical shots (`src/sim/ballPhysics.ts`): `planShot` searches up to 40 launches (arc by shot type, higher for close
  shots; aim error growing with distance/contest; bank layups) for one whose `simulateShot` result matches the decided
  make/miss/airball, then the sim plays the 60 Hz samples back and fires each rim/glass contact as a sound. Rim =
  torus (restitution 0.58), glass plane (0.62), net drag; real 32 ft/s² gravity (24 ft three ≈ 1.3 s hang).
  Misses leave as loose balls with the physics exit velocity; makes hand off at the ring to the dead-ball fall.
  Scripted fallback exists but doesn't fire in simulated games. Dunks still use `rim.ts` (`buildPath`).
  Airballs on bad shots, shooting fouls, and-ones, free throws, blocks (chase-down rules), assists.

## Dribbling
- Moves (`moves.json`): hesi, retreat, jab, Side Drive, change of direction, crossover, double cross, in-and-out,
  between-the-legs, behind-the-back, shammgod, snatch-back, spin, step-back, hesi blow-by, hesi pull-back.
- Basket-relative stick classification, fixed distances, sell → plant → burst, input buffering, chain windows,
  ankle breaks / stagger vs nearest defender, defenders bite on pump fakes.
- Pump fake: 0.42 s sell with its own 14-frame clip (a shot cuts it short). Step-Through (everyone, 1.5 s window, any
  range ≤ 28 ft): fake + stick toward rim + shoot → grounded lunge angled around the defender, lift at 55% of the
  gather; ≤ 11 ft after the stride = one-hand finish, else `stepThroughJumper` pull-up; bitten defenders ×0.15
  contest and no block; "STEP-THROUGH! X bit" callout; ✕ badge reads Step-Through when lined up.
- Blocks launch the ball 20–26 ft/s with a 0.7 s no-grab window; strips pop it past the stealer; the victim is
  stunned (`stunnedUntil`, `stripped`/`blockedLand` clips, stars) and can't regrab.
- Passing 55–90 ft/s; short passes (≤ 0.6 × safe range) home in, ×0.15 pick chance; long ones riskier with wider
  deflection lanes. R1 icon pass.

## Team play & AI
- 8 real sets (`plays.json`) with focus roles, reads/options, screen assignments; reset + new call; feature-me
  role swap; freelance 5-out + backdoor cuts.
- Stars + isos: `Player.star` (roster tier ≥ 4, max 2, else the best player; `markStars` in `career/roster.ts`; the
  career user at coach trust ≥ 85 with a top-2 rating). Iso sets `isoTop` / `isoWing` (tag `iso`) only for stars,
  ~30% of calls (50% clutch); the star attacks more and kicks out only when help commits.
- Reads (`ai/offense.ts`): open-man read (`openForPass`, timing/chance by `readSkill`), catch read (`catchRead`:
  catch-and-shoot / pump fake / attack the closeout, once per catch), fast-break throw-aheads to anyone past his man.
- Passing: `GameSim.passSafety` (lead point, safe range `rmap(passRange, 30, 60)`, overhead ×1.35 for runners /
  transition; overhead passes arc over the middle). Unsafe targets flash red (dot + R1 icons).
- Handler utility AI: shot EV vs pass value (openness, separation, ahead-of-defense, lane risk, trust) vs drive.
- Transition reads: throw ahead, attack numbers, outlet, fill lanes; otherwise walk it up.
- Walk-out inbounds (baseline after makes by C/PF, sideline otherwise, midcourt for quarters).
- Defense: man-to-man with help, drop coverage, optional switch-all, closeouts, steals, charges, get-back in transition.
- Rebounding: crash roles, box-out stance, strength push-back with bumped animation, screen knockbacks.
- Screens: hold ○ to keep screening (≤ 6 s); AI screens 1.6 s. `screenImpact` (game.ts): stun 0.3–2.4 s and
  knock-back 0.6–2.8 ft from screen rating, strength gap, defender mobility, `screenStun` (Brick Wall ×1.3, Screen
  Assassin ×1.5) and `screenStunTaken` / `screenKnock` (Screen Navigator `pd_navigate`). Knock-back slides; long
  stuns hold the stumble pose (`bumpedU` in GameScene).
- Made shots: rim path continues below the net, then a falling `dead` ball (gravity, bounces, roll); the inbounder
  picks it up off the bounce. Animated nets (`drawNet` in view.ts, `updateNets` in GameScene). Loud `sfx.swish` only
  on clean swishes. A pump fake before the first dribble after a catch keeps the dribble.
- Trust model (`ai/trust.ts`) and rotation/minutes from coach trust (`rotation.ts`).

## Progression
- 5 core stats → ~28 sub-ratings via `statInfluence.json`; level-up screen; 8 perk constellations (`data/trees`);
  modifier/hook system (`modifiers.ts`) drives perks, traits, backstories, ultimates.
- Ultimates: Deep Step-Back, FT-Line Takeoff, Chase-Down Block, each with 3 evolution levels; locked "???" panel
  until `flags.ult_unlocked`; milestone evo points.
- Career: XP/levels, stat & perk points, season schedule (10 games), post-game XP, save in localStorage (v2 with
  migration). Backstory effects wired but not selectable yet.
- **Save v3 (round 36):** `life` block (`day`, `money` 250, `energy` / `food` 0-100, static for now) + `nextKeyGame`
  (opener, finale, rivals from `RIVALS`, national TV every 4th game; games every other day).

## Garage gym (round 37)
- `Garage` scene (`GarageScene` → `RoomScene`, layout `world/garage.ts`, art `render/garageArt.ts`): reached through the
  apartment's left door (you arrive at the garage's left-wall door, which takes you back; the back-wall door is
  "Outside — coming soon"), or the dev menu "Garage (gym)". No right wall: the room runs to the right brick post
  (`RoomDef.rightX`), which cuts off the broken fastback parked nose-first along the right. Hoop (arena style, facing
  right from the left wall), squat rack, bench press, treadmill, dip station + speed bag, shelves, duct + three
  hanging lamps with STONEY / KG / ADMIRAL posters under them, gym mat, jump rope, trainers, kettlebells, boxes; yard
  with a tree and pull-up bars outside. All solid,
  same HUD and draw order as the apartment. No training interactions yet.

## Apartment (round 36)
- `Apartment` scene (dev menu "Apartment (career home)", Career Hub "Go Home"): cutaway starter apartment drawn in
  code on the players' pixel grid — kitchen (fridge, counter + sink + dish rack, peninsula joined to it with left-side
  cabinet doors, cooktop, fume hood + duct to the ceiling, bonsai), floor lamp with a warm glow,
  couch (plump pillow on seat + back, blanket draped as a sheet over back cushion + seat) → coffee table → TV facing the couch (seen from behind), aquarium (animated),
  armchair facing left, bookshelf standing off the slanted right wall, wardrobe against the left wall (doors facing right), dining table + chairs, moving box, ball, ceiling
  fan (animated), calendar on the left wall by the fridge, tribute posters (BE LIKE IKE, KING 23, MAMBA 24, CHEF 30; 3x5 pixel
  font `text3`), a purple poster on the right wall, two windows, shoes by the garage doormat, a mound of mail, a trash can full of paper balls with missed shots around
  it; neighbour's garage on the
  left, tree + fence on the right. `SPOTS` (calendar, fridge, couch) mark where you'll use things later.
- Your career player (casual tee + team-colour shorts, warm room tint) walks with multi-angle frames; walls (slanted
  sides) and furniture are solid (circle vs polygon, slides along edges). Draw order: furniture keeps a fixed depth (front edge of its footprint, `pieceDepthFt`);
  you and the cat get `actorDepthFt` — in front of every overlapping piece you're behind or beside, behind every piece
  that starts in front of your feet (footprint polygons, so the slanted shelf / wardrobe work).
- Doors: ✕ at the garage door = the garage gym (round 37); ✕ at the front door or L1 / Esc = back to the menu.
- Orange tabby cat lives on the couch (sits / loafs on the blanket), hops down now and then, walks to favourite spots
  with grid pathfinding (`findPath`), avoids furniture and you, and hops back up.
- HUD on the roof: energy + food bars, level + XP bar, days to the next key game (+ why / opponent), money, day.

## Rosters & looks
- `src/data/rosters.json`: 30 teams, 323 players (2026-27, compiled from preseason depth-chart reporting via web
  search; deep bench/numbers/looks partly guessed). Fallback procedural rosters exist.
- Dev panel "NBA player looks" editor + "Save look to rosters.json" (works only under `npm run dev`).

## Art, animation, arena, audio
- Rendered at 1920×1080 with a 1.5× camera (scenes still lay out in 1280×720 units); Text at resolution 2.
- Sprites (`sprites.ts`) drawn at 1.5× art resolution with canvas paths: tapered shaded limbs with muscle bulges,
  3-tone fabric, trims, high-tops, big shaded heads; `crispen()` snaps alpha + darkens silhouette edges. Sheets are
  built in Web Workers (`sheetPool.ts`/`sheetWorker.ts`, OffscreenCanvas; main-thread fallback); LRU eviction keeps
  ≤ 16 (~28 MB each); the game waits ("Lacing up…") until on-court sheets exist.
- Arena: purple-navy backdrop, glossy maple with light pools, floor reflections, dense shaded crowd (wave kept),
  benches near the baselines with chairs, courtside celebrity row (`celebs.ts`), fullscreen (F / ⛶ / menus).
- Procedural pixel sprites (`sprites.ts`): skeleton poses, layered limbs (sleeves/socks/shoes), shaped torso,
  fitted shorts, 12×13 heads with faces/hair/gear; front-view bench sprites; coaches in suits facing the camera
  (`buildCoachSheet`: standing / calling a play / celebrating; speech bubble with the play via `GameScene.coachCall`).
- Loose-ball grabs (`tryGrab`): `scoop` clip below 2.8 ft, `reboundChest` (catch clip) to head height, `rebound`
  above, jumping only above standing reach. Your rebounds: `rebound` quiet event → `sfx.ding` + `popText`.
- Sideline: `buildAnnouncerSheet` broadcasters behind the table (`GameScene.announcers`), assistant coaches
  (`GameScene.assistants`, seated suit trousers in `drawFront`), baseline fan seats in `crowd.ts` `FanRow` (all home colors).
- Crowd murmur only plays during games (`sfx.setArena`, opened in GameScene, closed on shutdown); menus are quiet.
- Box score (top left, `drawBoxScore`, FG right-aligned, long names shortened): `topStats` in `sim/boxScore.ts` (weights PTS 1, REB 1.3, AST 1.5, STL 3, BLK 3).
- Arm rig (`anim.ts` `rigArms(pose, ballClip)`, applied in `drawPose`): arm sockets sit `ARM_DROP` (6) and the
  jersey top `TORSO_DROP` (4.5) below the keys so the neck shows. Ball clips (any key has the ball) move arms rigidly
  with their keyed shape/length and carry a held ball down with the hands; free clips (defense, off-ball) scale arms
  to ≥ `UPPER_ARM + FOREARM`. No IK, no finger overlay.
- Fixed-length limbs (`anim.ts` `limb`/`arms`/`legs`, authoring time, explicit bend side): `dribble`, `dribbleRun`,
  `dribbleReady` keep a constant arm length (hand at the hip, ball comes up to it); `shot_jumper` goes dribble →
  gather → pocket in front of the chest → set point → release (jumper windups mid 0.32 / three 0.35 / deep3 0.39 s,
  0.35 s follow-through); `defend`/`slide` are a slight squat with arms out and angled down.
- Hoops (`view.ts` `drawHoops`): glass pane (frame, shooter's square, padding all through one `pane()` mapping),
  elliptical rim with the far half behind the ball and the near half in front, mesh net, boxed support arm.
- Side drive (`move_lateral`) uses fixed-length arms too (ball bounces up to the hand). Sprint bursts play their own
  `burst` / `dribbleBurst` clips (big forward lean, long stride, high knee drive, arm pump; `clipFor` while
  `now < burstUntil`).
- **Multi-angle players** (preview: `docs/previews/turntable-preview.png`): `pose3d.ts` lifts each side-view pose to
  3D (near/far limbs to ± lateral, optional per-pose `lat` spread) and projects it at a yaw; `sprites.ts`
  `drawAngled` draws limbs far→near around a projected torso with a turning head (front / ¾ / back). Turning clips
  (`ANGLED` in GameScene: idle, jog, sprint, burst, defend, slide, dribbles, hold) show one of 5 drawn yaws (+ mirror)
  chosen by `viewFor` (`yawFor` snapping with hysteresis); defenders face their man turned 35° toward the camera.
  Shots/moves/passes stay side view. Angled frames are drawn on demand by `FrameCache` (`frameCache.ts`) into 8×6
  canvas-texture pages (≤ 6 per look, LRU), ≤ ~4 ms a frame (your player first) plus idle prewarm; the side-view
  frame shows until ready. Ball drawn behind the body when it's on the far side. Dev panel: force angle + readout.
- Angled-view clothing: legs always draw under the torso; the shorts' waistband is drawn with the shorts (same
  shading, full width); an inseam line and a soft notch (only when the legs touch) split the shorts' legs; side-seam
  stripes in front/back views. Defensive elbows are placed (not solved) so both point at the floor from any angle.
- Defensive stance: profile squat with a `lat` spread (feet wide, knees out, arms out to the sides) — reads as an
  open stance when turned; `defend` is alive (bounce, weight shift, hands); `slide` steps sideways.
- Defensive movement (`GameScene.defStance`): near their man and slower than a walk, defenders face him (render-only
  facing with hysteresis) and play the `slide` shuffle (planted trail foot, lead foot steps out) from 0.4 ft/s,
  phased by distance (cycle = 0.16 × height, ≤ 3 cycles/s), reversed when retreating; idle `defend` below that.
- Fan row (`crowd.ts` `FanRow`): one row of plain sprite fans (tees, hoodies, team jackets via `randomFan` in
  `celebs.ts`; 0.7× scale, dimmed tint, dark arena seats, riser wall hides their feet) right behind the bench, celebs
  and table; they stand / film / cover their faces off the same reaction ripple as the blob stands (`Crowd.reaction`).
  The old lower-bowl blob rows are gone; stand blobs grow slightly toward the front.
- Crowd colors follow the **home team** (teams[0]): ~35% home colors / 8% visitors in a regular game, ~85% home in a
  big game (`GameConfig.bigGame`; dev panel "Big game crowd" until playoffs exist).
- Sideline scale: bench players `BENCH_SCALE` (0.92×) and courtside celebs `CELEB_SCALE` (0.82×) of on-court sprites.
- Keyframe clips with Catmull-Rom in-betweens (`anim.ts`): locomotion, dribbles, every move, every shot type,
  block/swipe/screen/charge/falls, box-out(+push), bumped, rebound, pump fake, hold, inbound, sit/cheer/point,
  ready crossing dribble.
- Court zoomed out with out-of-bounds space, stanchions with shot clocks, scorer's table with LED, benches,
  coaches, animated crowd (wave reactions, boos, clutch standing, flashes).
- Procedural audio (`sfx.ts`): dribbles synced to animation, squeaks, swish (big), rim ticks/clanks/board,
  dunk rattle, thuds, block clap, steals, whistles, buzzer, crowd murmur/cheers/groans, airball chant.

## Dev tools (F1 or `)
Live readout, **My player** (name, position, height, jersey #, all live), core stat sliders, perk grant/remove per
tree with a search box, ultimate unlock/equip/evolve/fill, appearance editor,
NBA player look editor, game controls (give ball, spawn defender in cone, freeze AI, clutch, switch-all,
feature-me, shot/game clock, call any play), practice config, trust/minutes, debug draw, audio volumes and test
buttons, presets, big-game crowd toggle. When playing as a real NBA player, edits apply to that player for the game only.
**Pixel editor** (button at the top of the dev panel, or `?editor`): the 16-celeb cast, 4 frames each; pencil, eraser,
fill, picker, line, undo/redo, zoom, grid, copy frame to all, mirror, in-game preview; drafts in localStorage (used by
the game, dropped when the art underneath changes); "Save to repo" (dev server) → `src/art/celebs/celeb_NN.png`.

**Face parts** (round 24): heads in `drawHead` (side/back) and `frontHead` (front/¾) are layered parts — hairBack, base
head, eyes, brows, nose, mouth, beard, hair — each drawn from a picture in `src/art/parts` when one exists (recolored
per player by `faceParts.recolorPixels`), else by the original code. 59 built-in pictures were exported from the code
(`partSeeds.ts`). Looks can use drawn variants (`hair: 'hair_1'`, optional `eyes` / `brows` fields); the dev panel's
look editor lists them. Pictures reach the sheet workers with each job (`sheetPool` → `partsFor`).
Eyes (round 26) are plotted pixel by pixel with mirror-exact snapping (`snapCell` / `plotEyeCells` / `frontEyeCells`
in `faceParts.ts`), so every face shows the owner's `W I · · · · I W` at any scale or head position; the code
fallbacks in `drawHead` / `frontHead` use the same cells as `src/art/parts/eyes/*.png`.