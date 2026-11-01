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
- **L2 (hold) icon pass** (keyboard Q): ✕ ○ □ △ glyphs over teammates, "hold L2 ICON PASS" hint above the diamond.
- ✕ badge reads **"Step-Through"** while a recent fake + stick toward the rim lines one up.
- **Fullscreen**: F key, ⛶ corner button (DOM, `main.ts`), main-menu and pause-menu items.

## Shooting
- Shot types: dunk, layup, euro, step-through, floater, hook, push, mid, three, deep3 (`shotTypes.json`).
- Equation: base(distance) × stat factor × (1 − contest) × contact × fatigue × perk/ult terms.
- Contest cone per defender (distance, angle, height, hand up, perimeter/post D, stagger/screen state).
- Slower flight (0.6 + 0.03·dist s), live rim sequences (`src/sim/rim.ts`), airballs on bad shots, shooting fouls,
  and-ones, free throws, blocks (chase-down rules), assists.

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
  deflection lanes. L2 icon pass.

## Team play & AI
- 8 real sets (`plays.json`) with focus roles, reads/options, screen assignments; reset + new call; feature-me
  role swap; freelance 5-out + backdoor cuts.
- Handler utility AI: shot EV vs pass value (openness, separation, ahead-of-defense, lane risk, trust) vs drive.
- Transition reads: throw ahead, attack numbers, outlet, fill lanes; otherwise walk it up.
- Walk-out inbounds (baseline after makes by C/PF, sideline otherwise, midcourt for quarters).
- Defense: man-to-man with help, drop coverage, optional switch-all, closeouts, steals, charges, get-back in transition.
- Rebounding: crash roles, box-out stance, strength push-back with bumped animation, screen knockbacks.
- Trust model (`ai/trust.ts`) and rotation/minutes from coach trust (`rotation.ts`).

## Progression
- 5 core stats → ~28 sub-ratings via `statInfluence.json`; level-up screen; 8 perk constellations (`data/trees`);
  modifier/hook system (`modifiers.ts`) drives perks, traits, backstories, ultimates.
- Ultimates: Deep Step-Back, FT-Line Takeoff, Chase-Down Block, each with 3 evolution levels; locked "???" panel
  until `flags.ult_unlocked`; milestone evo points.
- Career: XP/levels, stat & perk points, season schedule (10 games), post-game XP, save in localStorage (v2 with
  migration). Backstory effects wired but not selectable yet.

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
  fitted shorts, 12×13 heads with faces/hair/gear; front-view bench sprites; coaches in suits.
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
- Lower bowl: `FRONT_ROWS` (2) of bigger anonymous fans (`crowd.ts`) fill the space behind the bench and celebs;
  the old LED ribbon is gone.
- Sideline scale: bench players `BENCH_SCALE` (0.92×) and courtside celebs `CELEB_SCALE` (0.82×) of on-court sprites.
- Keyframe clips with Catmull-Rom in-betweens (`anim.ts`): locomotion, dribbles, every move, every shot type,
  block/swipe/screen/charge/falls, box-out(+push), bumped, rebound, pump fake, hold, inbound, sit/cheer/point,
  ready crossing dribble.
- Court zoomed out with out-of-bounds space, stanchions with shot clocks, scorer's table with LED, benches,
  coaches, animated crowd (wave reactions, boos, clutch standing, flashes).
- Procedural audio (`sfx.ts`): dribbles synced to animation, squeaks, swish (big), rim ticks/clanks/board,
  dunk rattle, thuds, block clap, steals, whistles, buzzer, crowd murmur/cheers/groans, airball chant.

## Dev tools (F1 or `)
Live readout, core stat sliders, perk grant/remove per tree, ultimate unlock/equip/evolve/fill, appearance editor,
NBA player look editor, game controls (give ball, spawn defender in cone, freeze AI, clutch, switch-all,
feature-me, shot/game clock, call any play), practice config, trust/minutes, debug draw, audio volumes and test
buttons, presets. When playing as a real NBA player, edits apply to that player for the game only.
