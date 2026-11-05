# Owner decisions (don't re-ask)

Chronological. "Superseded" marks decisions later changed by the owner.

## Platform & scope
- **Tech:** browser game, TypeScript + Phaser 3 + Vite, Vitest. Runs locally via `npm run dev`; also hosted as a
  private single-file artifact.
- **Scope:** vertical slice first, gameplay most important, but built with skill trees/abilities in mind.
- **Control:** you control **only your career player**; AI teammates; you must earn the ball (see VISION).
- **No shot meter.** Instead a **cone** points from the shooter to the rim; defenders inside it reduce accuracy; the
  **full shot equation** (base × rating × (1−contest) × fatigue × perks…) is shown at the top of the screen.
- **Dev tools are high priority:** quick grant/remove of moves, abilities, stats, ultimates (dev panel, F1 / `).
- Random events / story: not now, just don't block them.

## Controls (PlayStation labels; standard gamepad mapping)
- ✕ (bottom) = shoot / block; △ (top) = pass (to the player the stick points at, shown by a dot) / call for ball /
  swipe steal; ○ (right) = dribble move / screen / take charge; □ (left) = ultimate; left stick = move;
  R2 = sprint. Keyboard mirrors: K=✕, L=○, J=□, I=△, WASD, Shift, Enter, M mute, F1/` dev.
- Near the rim, shot type by stick: hold back = floater, sideways = hook (or euro if unlocked).
- **Labels are PlayStation** (switched from Xbox at the owner's request).
- **Sprint = tap** for a timed burst, then a cooldown driven by stats; gust/speed lines while active.
- **Pump fake = short tap of ✕** (< ~0.18s); **hold ✕ past that = shoot**. Repeatable fakes.
- **A pump fake picks up the dribble:** no moving or dribbling; you can **pass or shoot** (Step-Through still works).
  **Round 20:** except a fake **on the catch, before the first dribble** — that keeps the dribble (attack the closeout).
- **○ moves:** press ○ with the stick pushed = move now; **hold ○ and drag** = move per flick (chains on later
  flicks while held); quick neutral ○ tap = **Jab Step** (keeps dribble).
- **Side Drive** (lateral ○) is a hard, long drive that creates real separation; **flicking the stick the other way
  during it (no button) = crossover** (basic change of direction without the Crossover perk).
- **Crossover input:** first "up/down on screen only" → **superseded**: directions are **relative to the
  player→basket line** (toward = hesi, away = step-back, across = crossover/side drive).
- **Every dribble move travels a fixed distance**, regardless of stick angle/tilt. The stick picks move + side only.
- **○ while a shot is in the air = box out.**

- **Step-Through input:** pump fake, then within 1.5 s **hold the stick toward the rim + shoot**. ~~Perk-only~~
  → **superseded (round 9): everyone, from any range** (close = finish, far = stride into a pull-up jumper); the
  `fi_stepthru` perk is an upgrade (7 ft stride, ×1.12). A defender who jumped on the fake gets ×0.15 contest and
  can't block it.
- **R1 = icon pass** (was L2 until round 27): hold R1 (keyboard Q), teammates wear ✕ ○ □ △ (by role), press one to pass
  to him; other actions are paused while R1 is held. R1 is no longer a second sprint button (sprint = R2 / Shift).
- **Blocks/steals:** the ball flies (block) or pops (steal) with a short no-grab window; the victim is stunned
  ~1 s with an animation and can't regrab it.
- **Passes:** faster (55–90 ft/s); short passes home in and are rarely picked; long passes are riskier.
- **L1 = escape:** back in every menu; in a game the first L1 opens pause with Quit highlighted, a second L1 quits.
  (Column/tab switching moved to R1 / L2 / d-pad.)

## HUD
- **Fullscreen:** F key, a ⛶ button, and a menu/pause item.
- **Round 22: top-left box score** under the trust bars: your name, FG, and your **top 3 stats** by value × weight
  (**PTS 1, REB 1.3, AST 1.5, STL 3, BLK 3**; ties PTS > AST > REB > STL > BLK; padded with PTS/REB/AST). Your
  rebounds play a **ding** and a floating **REBOUND +1**.
- Bottom-right **button diamond** (△○✕□) with round badges showing the user's own sprite doing the action + label
  underneath (style reference: Dunk City "Backboard" badge). Badges visibly press in.
- Bottom-left **movement stick**; **holding ○ highlights arc edges** for each available move, labeled; chain moves
  (e.g. Double Crossover after a cross) in **gold**; the arc of the move just performed **flashes**.
- On defense, show **your matchup's shot cone** (colored by how much you contest him).

## AI / basketball behavior
- Coach calls real sets; when a set ends without a shot and the shot clock is >7s: **reset (swing to the top),
  then call a different play**.
- **Pass to the open man** over running the play (half court and transition). Fast breaks: throw ahead to runners.
  But not every possession is a break: after makes, **a C or PF walks out of bounds and inbounds to the PG**.
- **Rebounding:** C almost always crashes; PF crashes only if he's not a good shooter; guards get back.
- Box-outs: crouched, arms out; stronger boxer knocks the other player back (stun animation). **Screens knock
  defenders back with the same animation.**
- Shots fly **slower** to give time for rebounding position. Misses play **live rim sequences** (rattles, rolls,
  in-and-outs, high bounces); bad shots can **airball**. **Round 21:** the ball is a **physics object** at the hoop
  (real arc, solid rim ring, glass, net), but make/miss is **still decided at release by the shot equation**: the sim
  finds a physical launch that produces that result. Dunks keep a scripted path.
- **Floaters** have an accuracy penalty; **contest cones are shorter** (jumpers 5.5 ft, floaters 4 ft).
- For testing, **"feature me equally"**: the coach runs plays for the user ~1/5 of the time (roles swapped so the
  user gets the featured role at any position) and teammates treat trust as ≥70. **On in Practice/Quick, off in
  Career.**

## Presentation
- **Art direction (round 9):** match the owner's reference (90s 2D arcade basketball look): shaded, muscular players
  with bigger detailed heads, dark purple-navy arena, dense crowd, glossy floor with reflections.
- **Same framing, more detail:** keep the player-to-court size and what's on screen; render at **1920×1080** with a
  1.5× camera and 1.5× art resolution (owner's choice over zooming in).
- **Body proportions (rounds 10–11):** shoulders well below the chin (neck visible). Arms are long on defense and
  off-ball, but dribbles/moves/shots keep their hand-keyed arm length and bend. **No finger overlay** on the ball.
- **Round 12:** jumpers release fast (mid 0.32 / three 0.35 / deep3 0.39 s windup; owner chose a real gameplay
  speed-up over animation-only). Dribbling hand stays at the hip and the ball comes up to it (arm length constant).
  Defense = slight squat, arms not jutting. Bench players and celebs are slightly smaller than on-court players
  (perspective), celebs shorter than players.
- **Round 13:** sprint bursts get their own forward-leaning, long-stride run (with and without the ball); anonymous
  lower-bowl fans fill the space behind the bench and celebs.
- **Round 14:** defenders shuffle with planted feet and face their man; they only turn and run when faster than a walk.
- **Round 15:** defenders in their stance are drawn **three-quarter / open to the camera** (owner's pick over a
  profile stance) with live motion (active hands, weight shifts, bounce); head in profile toward the man.
- **Round 16: multi-angle players** (owner's idea, approved from a turntable preview): 5 drawn yaws + mirror; turning
  clips only (locomotion, stances, dribbles, hold) — shots/moves stay side view toward the rim; defenders face their
  man turned toward the camera; angled frames drawn on demand (never block, side view until ready). Supersedes the
  round-15 front-view stance.
- **Round 17:** defensive stance is calm (small hand drift, no flicker between stance/shuffle or between views);
  shorts keep a visible waistband and leg split from every angle.
- **Round 19:** a row of plain fans drawn like the celebs but less eye-catching sits right behind the bench / celebs /
  table and bridges into the blob stands (replaces the lower-bowl blob rows). Fans dress in the **home team's**
  colors: only some in a regular game, nearly all in big games (playoffs).
- **Round 20:** made shots go **through the net** (net stretches/sways), drop, bounce and get picked up for the
  inbound; makes mix swishes with rim-ins/rolls; a clean swish plays a **loud swish** sound. **Hold ○ = keep
  screening until release.** Screen stun/knock-back scale with screen rating, **strength gap and the defender's
  mobility**; Brick Wall adds stun, new Perimeter perk **Screen Navigator** reduces it. **Designated stars** (top
  roster tier, at most 2; the user earns it at coach trust ≥ 85 + top-2 rating) get **iso** sets (~30%, 50% clutch).
  AI makes the **open-man read** (sooner/more often for better passers), throws ahead on breaks (overhead lead
  passes, ×1.35 range), and receivers read the catch (shoot / pump fake / attack the closeout). Safe pass range
  30–60 ft; an unsafe pass target **flashes red** (dot and R1 icons). **Celebs are a fixed cast of 16**, hand-editable
  in the dev panel's **pixel editor**; saved edits live in `src/art/celebs/` and replace the generated sprites.
- **Round 22:** loose-ball grabs depend on the ball's height (scoop / chest catch / reach, jump only above standing
  reach). **Coaches face the camera**, drift slowly, raise an arm with a **speech bubble** naming the play.
- **Workflow:** after planning, build without waiting for a separate go-ahead.
- **Sideline people (round 25):** three generic broadcasters (suits, headsets) behind the scorer's table, chatting,
  no reactions; two assistant coaches in suits at the midcourt end of each bench; the sprite fan row is all home colors
  and wraps behind both baskets (front-facing seats running toward the camera). The cane man taps ~1×/s.
- **Courtside cast:** 02 and 04 retired (`RETIRED_CELEBS`); #16 (blonde) and #17 (the cane man: all-black suit, top
  hat, original silver skull mask, gold dragon-head cane he keeps tapping, ignores reactions) always get a seat.
- **Glam celebs (01, 09, 12, 16)** wave and blow kisses courtside (celeb sheets have 8 frames: + wave ×2, kiss,
  kiss blown); they do it now and then, and blow your team a kiss after its big plays.
- **Hold ○ on defense = stay set for the charge** until released (mirrors held screens). Screen / charge / box-out arms
  use the defense's elbows-down, fixed-length arms (no backwards-bending forearms).
- **Eyes (round 26, applies to every face, now and in future art):** follow the owner's hand-drawn celebs. Front /
  three-quarter: `W I · · · · I W` — each eye one white pixel on the **outside** and the iris on the **inside**,
  mirrored exactly, the same white on both eyes, looking straight ahead (wide-set = 6 px gap). Profile: both irises in
  front of their whites (looking forward). Eyes are **plotted pixel by pixel, snapped symmetrically**
  (`faceParts.plotEyeCells` / `snapCell`), never scaled with drawImage. `tests/faceParts.test.ts` fails if an eye
  picture or the code pair stops being mirrored. No cross-eyed / wall-eyed / uneven-white eyes anywhere.
- **Round 36: the starter apartment (off-court life).**
  - **End goal:** the game opens on **Start Game / Load Game**; no Career Hub, no mode menu. The current main menu
    stays as a **dev tool** for testing modes.
  - The career starts in a small apartment, the **base of operations**, recreated from the owner's reference room
    (a cutaway house). **Art direction:** keep the reference's warm, cluttered charm, but on our pixel grid with our
    sprite shading so the player doesn't look out of place.
  - Walk around (stick / WASD, R2 / Shift to hurry); **furniture and walls are solid**. This round only the doors work
    (✕ at a door): **left door → garage** (future: workout equipment; placeholder toast for now), **front door → leave**.
  - Planned objects (owner): **fridge = food you must eat**, **sleep on the couch to end the day**, a **calendar** with
    upcoming key games and special events, a **cute cat you can pet** (the cat is in and wanders; petting later).
  - **Top HUD:** level + XP, days until the next key game, money, plus **energy** and **food** bars (styled like the
    reference's bar panel).
  - **Round 36b (owner's fixes):** the **cat lives on the couch** (sits on the blanket, hops down to wander, comes
    back); the **calendar hangs on the left wall** (the garage-door wall) next to the fridge so it can be used later;
    the **TV faces the couch** (couch → coffee table → TV, we see the TV's back); the kitchen is a **peninsula joined to
    the back counter**, cabinet doors on its **left side**, a cooktop under a **fume hood** with a duct up to the
    ceiling and one along the top, the **pole drops from that duct to the peninsula's end**; dish rack by the sink, a
    **bonsai** with a **dirty cereal bowl** behind it; plump pillow, draped blanket; shorter doors; the bookshelf
    stands off the wall (top, thickness, shadow).
  - **Round 36c:** the cat is **taller and more angular** (sharp ears with pink insides, tabby stripes, white chest;
    owner's pixel-cat reference for style only, eyes still `W I … I W`); the **pillow sits on the seat cushion and
    leans on the back cushion**, the **blanket is one draped sheet** (round 36d: not a heap) over the back cushion, down
    across the seat and over the front edge, both shaded with volume; the **armchair by the front door faces left**; the dirty cereal bowl is gone.
  - **Round 36e:** no pole and no duct along the top (hood + ceiling duct stay); no slippers; the **wardrobe is turned
    90° counter-clockwise**: back against the left wall, doors facing right into the room.
  - **Round 36f:** the hood's duct runs up to the ceiling (collar at the beam); a pair of nice shoes and a pair of
    workout shoes by the garage doormat; a mound of mail instead of magazines; **tribute posters** on the back wall
    (original art, no real logos): **BE LIKE IKE** (riff on the classic ad), **KING 23** (chalk toss), **MAMBA 24**
    (fadeaway), **CHEF 30** (night night).
  - **Round 36g:** posters hung at **random-looking spots, heights and slight tilts** (`hang`); a **trash can** by the
    kitchen stuffed with paper balls, and **missed shots** on the floor around it.
- **Round 37: the garage gym + an art rule.**
  - **Rule (owner):** for this and all future drawings, **follow the reference material's orientation** for every
    object — don't draw things facing the camera by default. (Also in CLAUDE.md.)
  - The apartment's left door leads to a **garage gym** built from the owner's reference, with these changes: the
    cupboard → a **hoop like the arena's** (base, padded pole, arm, glass board, orange rim, net; facing right from
    the left wall); the wing-chun dummy → a **squat rack**; posters: keep **STONEY**, add **KG** and **ADMIRAL 50**
    (David Robinson), drop the others; no chairs by the jump rope. Everything else follows the reference: bench press
    (bar into the room, plates face-on), treadmill (console at the back), dip station + speed bag, shelves, duct and
    hanging lamps, door to the house, gym mat, jump rope, kettlebells, boxes, an old van along the right wall (our own
    design), outdoor pull-up bars in the yard.
  - **Round 37b:** no right wall — the garage runs to the **right brick post, which cuts things off** (like the
    reference's edge); the van → a **super broken classic fastback** (our own drawing, no badges: faded red, primer,
    rust, a front wheel gone and the drum on cinder blocks, flat tyre, cracked windshield, missing headlight, hanging
    bumper), parked nose toward us and cut off by the post; the **door from the apartment is on the left wall** (the
    back-wall door = outside, coming soon); **posters hang under the lamps** (lamps and duct in front); the gym mat
    sits further back.
- **Round 35: bringing it up.** Defenders pick up around half court (sag gap 4–12 ft in the backcourt) unless
  **pressing**: situational (Q4/OT, last 25% of the quarter, trailing 3–15; after made baskets 3–18% by team perimeter
  D; dev "Force full-court press"), on-ball tight full court + a trap near the sideline / half court. **8-second rule**
  in full-court games (HUD `8 SEC` countdown). AI handler `bringUp`: runs it up, vs pressure reads the open man, breaks
  the defender with a move + burst, and after 1.2 s (press) / 2 s of pressure a big comes up to screen (for the user
  too); a guard flashes back as the press outlet. **With the ball:** `ballSpeedMult` 0.78–0.92 and the sprint burst
  gives half its gain (`BALL_BURST`).
- **Round 34: lob sets.** Phases can name a `lob` role; sets tagged `lob`: `pnrLob`, `backScreenLob` (5v5) and
  `pnrLob3`, `backScreenLob3` (3v3). Called only when the focus player can dunk; a lob set is re-picked 70% of the time
  (45% with a good lob passer on the floor) so they're ~8% of calls. AI handler lobs to the lob man once per phase when
  he's cutting (user gated by trust); the user handler gets a hint and a play-execution credit for throwing it.
  Improvised AI lobs (`throwTo`) were toned down to 6% + 20%·lob (+20% Lob City); ~6-7 alley-oops per game.
- **Round 33: Alley-oops.** △ tap = pass (on release), **hold △ = lob** (`TAP_S`, like ✕). To a `lobTarget` (heading
  to the rim, in lob range: 35 ft, Lob City 50) it's an alley-oop: lands ≤ 4 ft from the rim at 10.2 ft, error from the
  `lob` sub (Lob City ×0.6). Receiver in the air within 3 ft (+0.8 Lob Threat) = `alleyOop` (can dunk) or
  `alleyOopLayup`; AI receivers time their leap, the user presses ✕ (timing term 0.75–1 from vertical speed at the
  catch); no leap = floor catch; nobody = loose. **Everyone can lob**; AI passers throw oops to cutters. Lob City /
  Lob Threat effects rewritten for this.
- **Round 32: Jelly Fake** (`fi_jelly`, Finishing ability, cost 3, after Posterizer = far down the dunk prong): ✕ again
  during a dunk windup aborts it into a hang (gravity ×0.25 until the release, +0.5 s) and a jelly layup (shot type
  `jelly`: base 0.46 → 0.36, × `JELLY_MULT` 0.85 = the large penalty). Defenders who jumped at the dunk and are coming
  down (`bitOnDunk`) can't block and contest ×0.3. AI owners jelly over a jumping shot blocker ~50%.
- **Round 31: dunk package, Windmill Gather, High IQ, dives.**
  - Dunk styles unlock by Dunk rating (`dunks.ts`): flush / two-hand (all), tomahawk 62, hammer 68, cock-back 74,
    reverse 78, windmill 84, 360 90, 360 windmill 95. **Small risk / reward:** contested = power dunks; open = leaning to
    the flashiest, which carry a make term (×0.99–0.93) but a bigger crowd pop + camera shake and more ult charge.
  - **Windmill Gather** = Driving ability (`dv_windmill`, 2 pts, after Downhill or Drive & Kick): owner's layup / Euro /
    dunk on a drive (> 6 ft/s at the rim) gets the windmill-swing gather: no strips, blocks ×0.6, contest ×0.85.
  - **High IQ** = Perimeter D passive (`pd_iq`, after Interceptor): on defense, banner with the set + who it's for and
    a marker over him (play + target only, no routes).
  - **Loose ball on the floor (z < 3 ft): ✕ = dive** (lunge, slide, get up; grab radius +1.6 ft; a diving grab is a
    dead dribble: pass it). AI dives on 50/50 balls.
- **Round 30: Quick 3v3** (menu, after Quick 5v5): real teams, three a side: Guard (PG/SG), Wing (SG/SF/PF), Big
  (PF/C), best fits by default and every slot swappable on the setup screen (both teams); play as any of the three or
  My Player. **No subs, normal 2s and 3s.** **Full court and half court are both available** (setup toggle) so the
  owner can test which works better; half court = one basket, check it up top after every score / stop / dead ball,
  14 s shot clock. 3v3 playbook (tag `3v3`, roles 1/3/5) + isos for the team's best player (~35% of calls).
- **Round 28: Dreamer + directional close shots.**
  - Close shots follow the stick: **away = floater** (Fade Away owners: fade, everywhere), **toward = layup** (push
    shot from 6.5–12 ft), **perpendicular = hook**. The Euro Step only replaces the hook for owners **on a drive**
    (moving at the rim > 6 ft/s). In the post, toward = layup / push.
  - **Dreamer** (Finishing ability `fi_dreamer`, cost 2, after Sky Hook or Euro Step): the ✕ tap fakes the lined-up
    close shot with its own animation (`fake_hook` / `fake_floater` / `fake_layup`), bite chance ×1.35. **Without it
    everyone keeps the one generic pump fake** (and Step-Through off it). Jumpers / fades keep the generic fake even
    with Dreamer. Post-locked or sealed defenders never bite. The 8 real centers with Sky Hook have Dreamer; AI
    Dreamer bigs sometimes hook-fake out of an even post and step through if the man bit.
- **Round 27: Fade Away + Post Up.**
  - **Fade Away** is an unlockable ability (the Shooting tree's old "Fadeaway" passive `sh_fade` became it). Stick away
    from the basket + shoot = fade **anywhere** (it replaces the floater for players who own it). Smaller cone (3.5 ft
    reach, 0.45 rad half-angle) but accuracy × e^(−(d−8)/16), shown as a `fade` equation term. AI owners use it on
    contested mid-range looks.
  - **Post Up = hold L2** (keyboard E), **everyone** can (no perk). The stick only goes straight toward / away from
    the rim. Strength battle = post vs post D, ±8 = "noticeably":
    - stronger: discrete bumps (1.5 ft every 0.8 s) that stun-lock the defender (no contest, no actions);
    - even: a slow continuous push (1.1 ft/s), the defender contests at ×0.55 (lower than a true contest);
    - weaker: you barely move and he can bump you back 1.5 ft and stun you for 1 s.
    Letting go opens a 0.6 s window where the defender stays locked (stronger) or sealed (even) in his bumped pose:
    post hook / layup / floater (or fade). Post animations turn with the angle to the basket like the defensive
    stance. **AI bigs post up too** (C/PF or strong post players with an edge), and kick out of doubles.
- **Round 24: faces are mix-and-match parts** the owner can hand-draw (hair front/back, beard, brows, eyes, nose,
  mouth; side + front views), drawn in grays and recolored per player; players pick variants by name
  (e.g. Tatum = hair_2 / beard_1 / eyes_3) saved in rosters.json. The owner sends edits by Save to repo + push.
- **Sideline:** benches near the baselines; **courtside celebrities** (generic flamboyant looks, not real people)
  between each bench and the scorer's table; the crowd wave stays.
- **Finer pixels** (PIXEL=2). Players slightly smaller than court scale; heads slightly bigger with real faces.
- Rounder chest; shorts fitted around each leg.
- Smooth animation with many in-betweens; distinct jumper / floater / hook / layup / euro / dunk animations; very
  smooth crossover.
- Zoomed out enough to see out-of-bounds; hoops on a **stanchion** (not floating).
- Scorer's table, coaches in suits, benches with real bench players **facing the court**; dynamic crowd.
- **Audio:** procedural Web Audio; crowd + whistles + buzzer ON. Swish must be loud and satisfying; blocks a loud clap.

## Rosters & modes
- **Real 2026-27 NBA rosters** with look-alike appearances, **committed to the public repo** (owner accepted the
  takedown risk). Repo was made **public** by the owner.
- Quick 5v5: pick **your team, opponent, and play as any real starter or "My Player"**.
- Quick/Practice use a sandbox trust (60) that doesn't touch the career save.
- **1v1 Make It, Take It:** half court, each side picks any real roster player; **P2 = human or CPU toggle**
  (2nd controller, or keyboard if only one controller). Defaults **1s & 2s, to 11, win by 2** (changeable on the setup
  screen). Make → scorer keeps it; stops/def boards → check at the top. Fouls: no FTs (make counts, miss = ball back).
  14 s shot clock, no ultimates, no trust grading.
