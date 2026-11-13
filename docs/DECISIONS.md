# Owner decisions (don't re-ask)

Chronological. "Superseded" marks decisions later changed by the owner.

## Platform & scope
- **Tech:** browser game, TypeScript + Phaser 3 + Vite, Vitest. Runs locally via `npm run dev`; also hosted as a
  private single-file artifact.
- **Scope:** vertical slice first, gameplay most important, but built with skill trees/abilities in mind.
- **Control:** you control **only your career player**; AI teammates; you must earn the ball (see VISION).
- **No shot meter.** Instead a **cone** points from the shooter to the rim; defenders inside it reduce accuracy. The
  **full shot equation** (base × rating × (1−contest) × fatigue × perks…) used to be on the top bar; since round 51 it
  is a **dev toggle** (dev panel → Attention → "Shot chance equation") and the top bar is the rhythm meter. Round 53:
  a **short shot-chance line** is always shown top-right while you have the ball (`3PT 37 ×.85 ×.67 = 21%`).
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
  **Round 20:** except a fake **on the catch, before the first dribble**: that keeps the dribble (attack the closeout).
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
  clips only (locomotion, stances, dribbles, hold), shots/moves stay side view toward the rim; defenders face their
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
  three-quarter: `W I · · · · I W`, each eye one white pixel on the **outside** and the iris on the **inside**,
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
- **Round 52: no fake shadows in the garage; footsteps in rooms.** The garage's baked footprint shadows (grey slabs
  offset under every piece) and the oil stain are gone. Walking in the apartment / garage plays a footstep per stride.
- **Round 80g (owner):** Kingston's lines wear out (each time he says one it's about half as likely to come out
  again, fresh lines preferred); iso lines are "Let's dance." and "Guard up."; **defenders learn your pump fake**:
  every time one bites on your fake he's 30% less likely to bite on it again (his teammates learn a little from
  watching), never below a quarter, and the feed tells you "They're reading your pump fake". Applies in every mode.
- **Round 80f (owner):** from behind, every hairstyle covers the back of the head (no bare patch); the rain is quieter;
  the national final is a **neutral site**: the left half of the arena is Lincoln's fans, the right half Crestview's,
  each cheering (and booing) for its own school; at halftime the **starters huddle round their head coach and face
  him** (open toward the camera); coming out, Kingston's mocking line is only "What'd your coach tell you in there? Pray?".
- **Round 80e (owner): the final, more.**
  - **More isos for Kingston** (about 45% of Crestview's sets are his iso).
  - Kingston's lines: the step-back ult and some isos "Let's dance."; a post-up bucket or his ult dunk "Too small.";
    a block / Chase-Down **"Get that **** outta here!"** (censored, owner's pick); a steal "Gimme that."; a three
    "Splash."; and "This guy." among the general ones.
  - **Halftime at the bench:** everyone walks over to their bench; the reserves sit next to the assistant coaches and
    the coach, the starters' five seats are empty (they stand in front of them); after the coach's talk they walk
    back out. Coming out, Kingston says "Time to turn on the gas." if Crestview is down (or tied), and mocks your
    coach if they're up.
  - The captain's tag is **(Captain)**, and he's the teammate who says you look tired before the big game (the big
    game has the same Lincoln guys as the bus and the final).
- **Round 80d (owner): the face mask and Kingston's skin.** The face mask looks like the owner's photo: a
  carbon-fibre shell (near-black graphite, diagonal weave, a soft sheen) from the brow over the nose with eye openings,
  and a black strap with a small silver clip. It shows from **every angle** (side, front, three-quarter and the strap
  from behind). Kingston is **skin tone 5** (builder numbering; saved rivals too).
- **Round 80c (owner): the national final.**
  - The clutch-time hush works in the final like any 5v5 (close score in the last ~40 s of the second half).
  - **Kingston's perks fit his position** (only in the final; the 1s keep every perk): every perk of the trees his
    position plays plus one signature GOAT: PG shooting / handles / passing / driving / perimeter + Point God; SG
    shooting / handles / driving / perimeter + Lethal Shooter; SF shooting / finishing / driving / perimeter +
    Unstoppable; PF finishing / screens / post / driving + Freight Train; C post / screens / finishing + Block Party.
    His stats: average +13 (you're +10 locked in).
  - **The captain is buffed** (+10 on every stat): clearly your best teammate.
  - **Kingston talks trash** in a bubble over his head (when he scores, blocks or steals, sometimes when you score,
    and once when clutch time starts).
  - **Halftime:** down, the coach says focus on the game, not your emotions, then **I NEED TO WIN THIS** (+6 on every
    stat, on top of locked in); up or tied, he warns against complacency (Kingston still has tricks in his bag).
  - **Kingston's ult waits for the clutch-time clock** (last ~40 s of the second half or overtime, any score).
- **Round 80b (owner): all writing must be clearly legible** (the newspaper, perk names, everything). Text is smooth
  (LINEAR) even though the art is pixel art; small print on drawn objects is real type, not thresholded pixels.
- **Round 80 (owner): the next chapter of the story.**
  - ✕ at the **trailer's path end** (after Mom's talk, while you should check on Kingston) leads to **Kingston on the
    school court in the day**. He can't explain being sick for one day (fine, ate, had his coffee, then his stomach
    turned, gone by the end of the game), then it turns to jealousy ("a guy like you gets the chance? why not me?"),
    "I'm done with this place, I'll figure out a way", and he walks off. A cutscene, no game HUD.
  - **Three months later:** a newspaper in the owner's reference style (tilted cream newsprint on a table, pixel
    type, a dithered photo of you): Lincoln is headed to the **national championship**, **record low temperatures**,
    and at the bottom **Crestview Prep** (the owner's pick, navy + silver Falcons) adds **transfer Kingston Williams**.
  - Black, Mom: "you better wake up, that bus is not gonna wait on you". The **trailer yard is snowy** from here on.
  - ✕ at the path end catches the **bus**: side view, front to the right like the reference, snowy pines and road.
    The **captain is a teammate**: a C if you're the PG, otherwise the PG; the talk alludes to him being captain.
    Jokes (the heater, "it's sewn on"), one joke (a face mask, "you tryna be Kingston now?") brings him up, a short
    talk about him, then **Mom calls: the generator broke**. Choice: "I'll be right there" (she: no, play your heart
    out, she'll figure it out) or "Hold out, I'll be back right after the game" (she: "I'll try"). Saved
    (`momCall`), no consequence yet.
  - Fade to black → the **national final in the arena**, a full game (two 4-minute halves) vs Crestview with Kingston
    their star. No NBA celebs courtside at a high-school final. Afterwards home is the snowy trailer (the generator
    is dead); the story continues later.
- **Round 60g (owner): any jersey number.** You start in high school, not on an NBA team, so the builder lets you
  pick any number 0-99 (no team's numbers are skipped); the preview jersey is Lincoln's maroon and gold.
- **Round 60f (owner): perks.** In the 1s Kingston has **every perk in every tree**. Every new career starts with
  the first perk of two trees that fit the position (free): PG Shooter's Touch + Floor General, SG Shooter's Touch +
  Tight Handle, SF Shooter's Touch + Rim Instincts, PF Rim Instincts + Brick Wall, C Glass Cleaner + Rim Instincts.
  Shown on the builder's POSITION step.
- **Round 60e (owner): polish.**
  - The tutorial's shot-chance lines are plain and clear (no "everything falls" / "the number is the truth"): the top
    right number is your chance to make the shot you're lined up for; it starts from the shot's base % and moves with
    your rating, how open you are and how tired you are; the cone is where a defender has to be to contest.
  - At the end of a game everyone lands and goes back to their base animation (no frozen jump shots); in the 1s
    Kingston waits a moment before he talks and walks off.
  - The red fuel can by the generator sits still (only the generator shakes).
- **Round 60d (owner): Mom after the big game; no em dashes.**
  - **No em dashes, ever** (U+2014): not in code, comments, in-game text, docs, commit messages or replies. Use a
    comma, colon, period or parentheses. All existing ones were removed; `tests/style.test.ts` fails on any new one.
  - **After the big game** (the same day, daytime trailer yard): you walk up the path, Mom comes out ("Sad Story"
    plays). **Great game** = Lincoln won AND your points + rebounds + assists + blocks + steals is the highest of anyone
    in the game (a tie counts): she's so proud you got your opportunity and made the most of it. **Otherwise**: she
    talked to the scout after the game and he said you have promise (he wrote your name down). Either way she ends
    with "go check on Kingston. That poor boy was sick as a dog." Then she goes inside and the yard is yours.
- **Round 60c (owner): polish, preloading, music.**
  - **Music** (royalty-free, the owner's files in `public/music/`): mondamusic "Retro Arcade Game Music" loops in
    **every basketball game**; alexgrohl "Sad Story" plays in the **scene with Mom** (it fades in on the walk up,
    the game music fades out as Kingston walks off). Music volume in Settings (default 50%).
  - **Kingston is Black and wears goggles** (also applied to rivals already in saves). Round 71 (owner): skin
    **tone 4** (round 80d: **tone 5**) (builder numbering), a **face mask** (no goggles) and a **high top**, saved rivals too.
  - The tutorial no longer mentions the ultimate (the rhythm / ult line is gone).
  - **Multi-step lessons start over on a miss:** in the Step-Through lesson a plain shot after the fake (or letting
    the fake's window run out) goes back to "pump fake" with a red "Missed it"; same for shooting outside the post in
    the post-up lesson, and when a new possession starts mid-lesson.
  - **No waiting between story scenes:** the next game / sprite is built while you're still in the current one; the
    trailer walk starts only once you're drawn. Rain is a little quieter.
- **Round 60b (owner): prologue follow-ups.**
  - After "See you tomorrow. Don't be late." **Kingston turns and walks off** the court into the rain (no dip to
    black); your thoughts play while he goes.
  - **Mom at the trailer that night** (after the fade): you walk up the path, she comes out onto the step. You tell
    her Kingston's so much better and nobody will look at you; she says keep putting in the work and be ready when
    the **golden opportunity** comes, then waves you in to get some sleep. You follow her inside → the next day.
  - **"You look tired":** on game day a teammate says you look dead tired; you: "Didn't get much sleep last night."
    (More foreshadowing of the coffee / poisoning.)
  - **Schedule card in high school:** "1 DAY · Big game vs JEF" until game day, "TODAY" on it, "PLAYED" after; the
    NBA schedule comes back only outside the prologue (older saves).
- **Round 60: the prologue (high school).** After the builder you're on the **rainy school court** (night) in a
  **2v2** with your best friend **Kingston Williams**: same position as you, he's the starter ahead of you. Your
  teammate and his are a complementary position (PG / SG → a C; SF / PF / C → a PG).
  - **Tutorial:** a nameless text box at the bottom (no tutor character); Kingston talks in the same box with his name
    (big game tomorrow, scouts in the stands, his chance to get out of this shithole, his game-day morning: lucky
    breakfast and his **pregame coffee**: the coffee is a Chekhov's gun: later the story reveals **you poisoned him**,
    to him and to you). Each lesson: Kingston demos the move on his ball, then you try it. Order: move / sprint →
    shoot (shot chance line + cone explained) → pass + call for it (trust, never on demand) → dribble move → post up
    (L2) → pump fake + Step-Through → icon pass (R1) → screens → plays: follow the circles → defense (+ rhythm).
    Ends with "y'all can head home, we'll finish with some 1s".
  - In the tutorial **every shot goes in** but the shot-chance line still shows the real odds; no blocks, fouls,
    CPU swipes or interceptions. You play with an **average player's spread** (your starter spread +12 on each
    stat; your career stats don't change), Kingston +6 on top of that.
  - **The 1s:** real odds, make it take it, 1s & 2s to 11, win by 2; Kingston's shooting / finishing / mobility /
    playmaking are 99. After it: "See you tomorrow. Don't be late." He leaves and you think: you want out too, but
    he's so much better, the scout will never notice you.
  - **Home is the trailer** (you're in high school): night, go inside → the next day.
  - **The big game** (school court, day, 5v5 vs Jefferson): the coach throws a fit, Kingston is out with a
    **stomach virus**: then names you the starter and tells everyone to lock in and play good fundamental ball
    because a **scout** is here (drawn by the bleachers with a clipboard). You're **LOCKED IN: +10 all stats**
    (high-schoolers are ~38-52), clearly the best player on the floor. Round 70 (owner): LOCKED IN is the pop-text
    banner only (shown when the coach's last line closes), no narrator box.
  - The stage is saved; Load Save resumes it. Older saves skip the prologue (home stays the apartment).
- **Round 59: character builder** (New Game → it). Steps: **LOOK** (every appearance option: skin, hair incl. the
  hand-drawn parts, colours, face, gear; live front / 3-4 / side preview), **POSITION**, **HEIGHT** (a range per
  position: PG 6'0"–6'5", SG 6'3"–6'7", SF 6'5"–6'9", PF 6'7"–6'11", C 6'9"–7'3"), **READY** → the apartment.
  **Starter skills by position, never below 40, same total for everyone:** PG 52/44/40/52/52, SG 56/46/40/52/46,
  SF 50/50/44/50/46, PF 44/50/54/46/46, C 40/52/60/44/44 (shooting / finishing / strength / mobility / playmaking).
  Round 59b: steps are NAME (first + last, ≤ 12 characters, letters / space / - / '; typed on a keyboard or with the
  controller's on-screen letters, R1 = a random name) → LOOK → POSITION → HEIGHT → **NUMBER** (0-99; numbers your
  team already wears are skipped, shown on your jersey) → READY.
- **Round 58: the real main menu** (owner's layout): NEW GAME + LOAD SAVE top left, SETTINGS bottom left, the title
  "BASKETBALL RPG" top right. Background = the game itself under a gradient, changing with the highlighted option:
  NEW GAME → the rainy school court (night, rain, lightning), LOAD SAVE → the apartment, SETTINGS → the arena (crowd).
  The game boots into it; the old every-mode menu is the **dev menu** (Settings → Dev menu, dev panel button; its L1
  goes back). New Game asks before replacing a save, then starts a fresh career in the apartment; Load Save (greyed
  without a save) continues in the apartment. Rooms' L1 / the apartment's Leave / the trailer's Leave → main menu.
- **Round 57: the trailer yard** (owner's photo + generator sketch): the "Lights on a generator" backstory place,
  its own walkable scene (menu: Trailer (backstory); story events later). Orientation as in the photo: camper long side
  to us, rounded front end + big curtained windows on the left, door centre-right with wooden steps, rusty hitch
  pointing left, the generator (black, yellow lightning logo) right of the steps with its **power cord** zig-zagging
  up and over to the trailer, a chest cooler front right, bushes + chain-link fence right, the neighbour's house left.
  You walk up the steps (you rise a step at a time). **✕ at the door opens it and ends the day** (night, "DAY n",
  morning on the top step, energy refilled); the owner will add a story element there (`TRAILER_DOOR_STORY`). The
  inside isn't drawn yet. Round 57b (owner): more trailers in the background, trash strewn around, unkept wild
  foliage, trees with trunks.
  Round 57c (owner): the generator is run down and sits further right / back (by the trailer's right end); a night
  version (the generator keeps the trailer's lamps on); ✕ at the end of the path (the mailbox) leaves.
  Round 71 (owner): ✕ at the **generator**: "I'm surprised this piece of junk still works, but I'm glad it does."
  The **mailbox** is solid and ✕ checks it: "No mail." for now (its flag is down). After Mom's talk following the
  big game, ✕ at the **door** only says "I should check on Kingston." (`StoryState.checkKingston`) until that part
  of the story exists. These are your thoughts in the story box (YOU, thinking).
- **Round 56: the school court venue** (owner's sketch + photo), a real game venue for story events.
  - Side-on like the arena: asphalt court, a chain-link fence along the back of the court (posts, top rail, knuckled
    top), then the school: tan portable classrooms long side to us with white wall AC units, barred windows, a ramp
    (as in the photo), the brick main building ("LINCOLN HIGH SCHOOL"), a flag pole, lunch tables, bike rack, trash
    cans, tetherball, banners. Hoops on single poles with a gooseneck and a steel board, chain nets, facing in.
  - Drawn in the apartment / garage pixel style, baked once per variant (`render/schoolArt.ts`).
  - **Day:** a few kids by the fence and on a small bleacher (cheer big plays, softer crowd sound). **Rainy night:**
    no kids, wet asphalt with puddles and long reflections, lit windows, light poles, rain + splashes + lightning,
    rain sound. No announcer, table, benches, coaches or celebs at the school.
  - Picked by `GameInit.venue` (story events) or the dev panel "venue (next game)"; default arena.
- **Round 55: ultimates (owner's design).**
  - **Cinematic:** slow-mo (0.38×, game clock too; ≤ 1.7 sim s, 2.2 for the chase-down), screen darkened around the ult
    player (+ ball, chase target), sound ducked with a deep whoosh. For **your ult and any ult against your team**; a
    CPU teammate's ult gets aura + banner only. Every ult gets a banner. Only stars have ults.
  - **Aura by position:** PG blue, SG purple, SF yellow, PF green, C red, a thick pixel outline glow with flame wisps
    rising (owner's reference image).
  - **Double Step-Back** (PG, SG): Lv2 fake (□ again) into Step-Through, Lv3 pass out (△). **Free-Throw-Line Dunk**
    (SG, SF, PF): posterizes everyone in its lane; Lv2 Hang Time stall (□ in the air), Lv3 Kick-Out (△ in the air).
    Round 71 (owner): he floats up to the rim with the ball in his hands and lets go there (he used to be falling,
    feet ~1 ft up and short of the rim, while the ball flew on alone).
    **Chase-Down** (PF, C): lock-on, speed ×1.9, ~93% block from any angle; Lv2 Pinned to the Glass, Lv3 Swat & Go.
  - Owner: the fake uses the ult button (□); passing out is △.
- **Round 54: lobs, oop dunks, dunk variety, closing time, rhythm pop.**
  - **Lobs a little less automatic:** alley-oop base 84% / 76% (0 / 5 ft, was 90 / 82), oop layup 68 / 56 (was 78 / 66),
    contestW 0.6, oop windup 0.2 s (was 0.16, so the slam reads), timing term 0.65–1. Sims: ~61% made (was 74%).
  - **Oops get dunked:** `canOopDunk` = dunk ≥ 40 + (7 − height) × 25 (easier than off the dribble). Oop slam styles
    (`OOP_DUNKS`, own clips): two-hand, one-hand, tomahawk 62, reverse 78, windmill 86.
  - **Dunks look different:** each has its own takeoff (one / two feet), body lean and finish (owner: "too similar").
  - **Closing time:** last ~12% of Q4 / OT → isos for the team's top scorer (+0.3 coach score; random coach 75%); the
    user gets it when he's the top scorer and coach trust ≥ 60.
  - **Rhythm pop:** held ~3.5 s; two lines with FRESH (green) / STALE ×decay (orange) spelled out. Same effect, clearer.
- **Round 53: rhythm tuning + switches.**
  - **No rhythm loss for a missed play assignment** (trust still drops). **Ran the play:** you executed a phase of
    the play and your team scored off it (not your shot, not your assist) → +3 rhythm.
  - **Defense:** posterized still costs rhythm (owner). "Left your man" costs rhythm only when nobody contested the
    shot (contest < 20%) and not within 1.5 s of a switch.
  - **Quarter multiplier on gains:** Q1 ×0.6, Q2 ×0.9, Q3 ×1.2, Q4/OT ×1.4 (practice ×1). Hidden from the pops.
  - **Pops show the math** like the shot equation: `+5  2pts ×2.6 ×0.6² · mid · step-back`; the number is the applied
    amount (includes the hidden game-length / quarter scale).
  - **Rhythm card:** like the garage skill cards (owner's reference: icon + big number, tag + pill bar), **deep purple**.
  - **Short shot chance top-right**, always on (owner's choice), few characters.
  - **Forced switches move your assignment:** fast-break cross-matching (pairs swap men when each is 6+ ft closer to
    the other's) includes you; the red circle / cone follow and flash "SWITCH → name". Switches stick after the break.
- **Round 51: rhythm.**
  - **What it is:** a meter on the top bar (styled like the garage skill cards). Every player builds it with points and assists, plus smaller amounts from steals, blocks, charges, forced pick-ups and stops.
  - **Variety:** each scoring method (shot type × how it was made: catch, step-back, off the dribble, drive, post, transition, lob) gives ×0.6 less each time it's repeated in a game.
  - **Losses:** missed assignments, getting posterized, turnovers, leaving your man, ankles, bad shots and blocks.
  - **Notches:** three, at 25 / 50 / 75, each boosting every stat (bigger for lower stats; the career stats are untouched).
  - **Ultimate:** a full meter powers it, **once a game**, then the meter drops to the 3rd notch. Your ult comes from the career; CPU stars get a fitting one and use it when the moment fits. Tuned so the ult lands around the 4th quarter and only the best nights max out.
  - **Rules:** no fade over time; gains scale with quarter length.
  - **Replaces** the old ult charge.
- **Round 50: Pick-Up Pressure.** A high-level Perimeter Defense ability (top of the tree, needs Floor Burn, 2
  points): when a swipe misses (and isn't a foul), a separate roll makes the dribbler pick up his dribble. Elite CPU
  perimeter defenders (top ~10%) have it and reach more against a live dribble.
- **Round 49: make the CPU better, not the player worse.**
  - Play calls are data-driven: a play lab sims every set by focus style, and the coach scores (play, focus) from those values, the matchups, tonight's results and the situation, then picks with some randomness.
  - The defense adapts to the human only: repeated moves are read and the favourite side is shaded; ball screens get under / blitz / switch by his shooting.
  - Career scouting report starts a known scorer keyed in (or doubled for a known hog).
  - A CPU team down 15+ plays harder (no rating buffs). Owner: no hidden rating boosts; difficulty from decisions and schemes.
- **Round 48: help by how he scores, crowded rims, finish the run.** The double / triple follows the scorer's buckets
  this game (prior from his style): rim scorer → **wall off the drive** (helpers deep on his line to the rim, so a
  move only beats his own man); shooter → **pack him** (tight on-ball, one over, one under); post → dig; mixed → one
  high, one deep. Finishing into 2+ contesters shows `crowd at the rim (n)` and, on dunks, `poster over n` on the
  equation. A runner with nobody ahead (or alongside) finishes instead of passing back. In transition defenders pick up
  the nearest man; scouting matchups return at the next dead ball.
- **Round 47: defenses react to outliers, not normal stars.** Contests keep stacking as 1 − Π(1 − cᵢ) (owner: keep it,
  get help into the cone). **Who guards whom** is computed (3v3 + 5v5): best-fitting defender on the biggest threat,
  the weakest defender hidden (Knicks–Lakers: Brunson doesn't guard Luka). **Heat** is mostly the share of the
  team's shots (and points); a star at ~30% is left alone (owner: target the 75–100% outliers; 114–123 team PPG is
  fine). Heat **never cools**; a tier only rises while he beats the current coverage (if his % drops, the defense is
  working and doesn't send another man). Keyed in = help shading + **deny the catch only for post / catch-and-shoot
  scorers**; doubles; **full triples anywhere** when hot enough, with the other defenders rotating. No usage fatigue.
- **Round 46: season calendar + sleep fixes.** The calendar follows the owner's parchment reference (pixel grid,
  `M T W Th F Sa Su`) but with **our own damage** (torn top-left, notched right edge, dog-eared bottom-left, coffee
  ring), the **month name at the top** (year beside it) and **key games only** (pennant in the opponent's colours +
  OPENER / RIVAL / NAT TV / FINALE) instead of the reference's events. Day 1 = Mon 19 Oct 2026, so the opener is
  Tue 20 Oct (2026-27 opening night). ✕ at the wall calendar opens it; ◀ ▶ months, L1 closes. Sleeping: the whole
  head stays in frame (propped up on the pillow, knees softly bent) and **the couch's own blanket** comes off the
  couch and covers his legs (no second blanket).
- **Round 45: you lie on the couch to sleep; jump shots face the basket.** Sleeping shows the player on his back on
  the couch (`sleep` clip, head propped on the pillow, the couch blanket pulled over his legs, the cat stays on top),
  under a lighter night tint with Zzz off his head. **Jump shots (jumper, fade, push, floater, hook, step-through
  jumper) are drawn at the shooter's angle to the basket**: back view from the near baseline, front from the far side,
  three-quarter on the wings, side-on from the top; the view is locked for the whole shot. **Layups, dunks, oops and the
  jelly stay side-on** so the hand still meets the rim on screen. (Owner clarified: animation only, not percentages.)
  Also: player sheets are now 24 frames wide (they'd grown past 8192 px tall, which some GPUs draw black).
- **Round 44: posting is a commitment, doubles + kick-outs.** Mashing L2 was overpowered (each press re-started the
  post with an instant bump and a free window). Now: a post lasts at least `COMMIT` 0.9 s (letting go early doesn't end
  it), the first bump comes `FIRST_BUMP` 0.55 s in, the window only opens if a bump landed (stronger) or you leaned
  ≥ 0.35 s (even), and re-posting waits `REPOST_CD` 1.4 s ("Post up recovering…"). **Posting exposes the ball**: swipes
  on a posting player ×1.6, and the man on your back reaches in at 0.8 (was 0.4 from behind). **Help defense**: with a
  strength edge (gap ≥ 4) the defense may rotate the nearest other defender over (15 % → 85 % as the gap grows,
  0.5–1 s to rotate); he leaves his man, sets up beside the post ("DOUBLE TEAM … pass it out!") and starts digging
  after 0.55 s. **△ passes out of the post** with its own animation (`postPass`: pivot up, ball overhead, two-handed
  whip); the AI kicks out of doubles too.
- **Round 43: colour-coded orbs + sleep.** Orbs wear their target's colour (Shooting green, Finishing blue, Strength
  red, Mobility light blue, Playmaking yellow; energy = the owner's lime green). **✕ Sleep at the couch** ends the day:
  the room goes dark with Zzz, a "DAY n" banner, then the lights come back and **green orbs rise from the couch into
  the energy bar** (10 each) until it's full. Games are on the calendar (game i on day 2 + 2i), so sleeping counts the
  key game down; on its day the HUD says **TODAY**. Missing / playing games by date isn't built yet; food unchanged.
- **Round 42: workouts send XP orbs** (green, like the owner's picture) from you to the skill cards; the XP lands when
  the orb hits its card (bar fills, pling; a level-up flashes + chimes). **Each orb costs energy** (2); at 0 energy
  nothing is sent ("TOO TIRED · REST TO TRAIN"). What earns orbs: one full bar on the squat / bench / dribbling mat,
  every 5 treadmill hits, every made shot (its orbs fly out of the rim once the ball is through the net). Orbs per set:
  **treadmill 2 Mobility · squat 1 Strength + 1 Mobility · shooting 1 Shooting + 1 Finishing · bench 1 Strength + 1
  Finishing · dribbling 1 Playmaking + 1 Shooting**. Each orb = 20 XP; **higher levels need more XP** (40 → 6 orbs,
  60 → 12, 80 → 18). **The card numbers are the real ratings**: a skill's level is its `core` rating (new careers start
  every stat at 40; spending stat points or dev sliders move both).
- **Round 41: skill cards on the room HUD** (from the owner's reference): the red LV box became a level block, "LVL n"
  + a long orange XP bar, then five chunky cards left to right: **Shooting** (green, ball on a shooting hand),
  **Finishing** (blue, ball through the rim + net), **Strength** (red, pink kettlebell with a 5), **Mobility** (light
  blue, winged sneaker), **Playmaking** (yellow, clipboard play). Each card: icon + level number on top, a darker
  strip with a pill XP bar (+ a faint 3-letter tag) below; a card flashes and pops "+1" when its level rises.
  **Each skill has its own level + XP (Skyrim-style), starting at 40** (`CareerState.skills`, save v4). They're
  (round 42: they are the ratings, and workouts award the XP).
- **Round 40: the push-up mat is now a dribbling mat** (from the owner's photo: a low, wide stance facing the camera,
  pounding the ball low beside the feet). **Same mini-game**: press the random button shown (✕ ○ □ △) to fill a falling
  bar, a wrong one = ✗ for a second. Each right button plays a dribble move, drawn facing us: **✕ crossover (and
  back), ○ between the legs (and back), □ behind the back, △ in-and-out**; between moves you keep a pound dribble.
  Bounce sounds on every floor hit, a squeak + blip per move. The mat is a dark rubber mat with a white border, a ball
  logo and worn foot marks (Claude's design). Push-ups are gone.
- **Round 39e: Fade Away smoother**: the `shot_fade` clip is resampled from the jumper at 21 points with a smoothly
  easing lean and drawn with 24 frames (was 14 with a stepped lean). The fade's smaller cone (3.5 ft, 0.45 rad) was
  already used; the user's cone now **eases to its new size** (~0.2 s) so you can see it shrink when you pull back.
- **Round 39: workout mini-games** (controls shown on a card when one starts, then a hint line; panel by the player
  with reps + the game's widget; a wrong input = red ✗ and a 1 s lock; **L1 is the only way out**: ✕ / ○ are game
  buttons):
  - **Jump rope:** spin the L-stick to swing the rope, ○ when it's under your feet (miss / mistime = trip).
  - **Squat:** alternate L2 / R2 to push up a bar that keeps falling; full = a rep.
  - **Treadmill:** a dot slides back and forth along a line, ○ while it's in the centre square; each hit speeds it
    up, a press outside = ✗ and slower.
  - **Push-ups** (a dribbling mat since round 40)**:** press the random button shown (✕ ○ □ △) to fill a falling bar; wrong button = ✗ for a second.
  - **Shooting (red square):** a **shot meter** on ✕ (hold to load, release in the green = make, else it clanks off
    the front rim). This is the garage practice spot only, **games still have no shot meter**.
  - **Bench press (Claude's design, "keep it level"):** hold ✕ to press while the bar wobbles; keep the level gauge
    centred with the L-stick (it tips faster the more it leans); tipping over drops the bar.
  No stat / energy rewards yet.
  - **Round 39b:** the garage shot is a **real jump shot** (you rise with the meter, release at the top of the jump,
    land after) with a **2K-style curved meter** beside you (fills up the curve, green window at the top, freezes on
    release, "GREEN!"). **Sound effects for every mini-game**: rope whoosh / floor tap / trip, effort breaths, plate
    clinks + rep ding, bar drop, treadmill belt hum + footfalls, HUD blip / buzzer, meter ticks, release, green chime,
    swish / clank, ball bounces.
  - **Round 39c:** the garage's **back-wall door** is the one to the apartment (the left-wall door = outside, soon);
    the **jump rope is removed**; push-ups and bench are **easier**; the shot meter has a **tiny red "perfect" slice**
    in the middle of the green, releasing there plays a bigger success sound and **sets the meter on fire** for a
    second ("PERFECT!"); the ball now visibly drops **through** the rim and net (front of the rim + net drawn over it,
    the net stretches on a swish).
- **Round 38: garage workouts.** Animations for the player using the **squat rack, push-up mat, jump rope, bench
  press and treadmill**: ✕ at the equipment starts it, ✕ / ○ / L1 stops. Orientation follows the equipment: squat
  facing us inside the rack (bar across the shoulders, off the hooks), bench press lying along the bench with the head
  under the uprights (bar into the room, plates face-on, off the uprights), push-ups and jump rope side-on (the rope
  loops around you; the coiled rope leaves the floor), treadmill from behind running toward the console.
  - **Round 38b:** push-up face stays in frame; squat hands grip the bar from below (elbows down, bar through the
    hands); bench press: back of the head on the bench, looking up, feet pointing away, and the torso drawn with its
    full rounded volume when lying (chest / belly protrudes); **shooting**: a **red square** on the floor straight out
    from the garage rim, ✕ there loops jump shots at the hoop (ball arcs in, through the net, bounces back).
- **Round 37: the garage gym + an art rule.**
  - **Rule (owner):** for this and all future drawings, **follow the reference material's orientation** for every
    object, don't draw things facing the camera by default. (Also in CLAUDE.md.)
  - The apartment's left door leads to a **garage gym** built from the owner's reference, with these changes: the
    cupboard → a **hoop like the arena's** (base, padded pole, arm, glass board, orange rim, net; facing right from
    the left wall); the wing-chun dummy → a **squat rack**; posters: keep **STONEY**, add **KG** and **ADMIRAL 50**
    (David Robinson), drop the others; no chairs by the jump rope. Everything else follows the reference: bench press
    (bar into the room, plates face-on), treadmill (console at the back), dip station + speed bag, shelves, duct and
    hanging lamps, door to the house, gym mat, jump rope, kettlebells, boxes, an old van along the right wall (our own
    design), outdoor pull-up bars in the yard.
  - **Round 37b/c:** keep the **slanted right wall** (the owner likes that angle) but show **nothing past the right
    brick post**: the post is where the picture ends (no house siding outside). The van → a **super broken classic fastback** (our own drawing, no badges: faded red, primer,
    rust, a front wheel gone and the drum on cinder blocks, flat tyre, cracked windshield, missing headlight, hanging
    bumper), parked along the right wall nose toward us; the **door from the apartment is on the left wall** (the
    back-wall door = outside, coming soon); **posters hang under the lamps** (lamps and duct in front); the gym mat
    sits further back.
  - **Round 37d/e:** the garage hoop is drawn in **pure side view, no perspective**: it faces fully right, so the
    board is a thin vertical slab (its edge), the rim sticks straight out to the right as a flat ring, net below.
    (A slanted edge-on pane looked strange; a board turned toward the camera wasn't facing fully right.)
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
- **Round 69:** CPU stars always have their ultimate (no rhythm needed, once a game; still none in 1v1 or practice).
  Offensive ults (Deep Step-Back, FT-Line Dunk) are saved for the last period (Q4 / OT, the big game's 2nd half),
  and the coach calls an iso for the star to use it (up to 3 forced isos, more in the clutch). Chase-Down any time.
- **Round 79 (owner): Mamba** saves threes less often: missed threes have their own count and every **fourth** goes in
  (`SHOOT_TUNE.mambaThreeEvery`); midrange and close shots stay every other miss (their own count). Rhythm cost
  unchanged. Why: the Lethal study showed Lethal is worth ~1 pt a game, while Mamba (owned by all four Lethal
  Shooters) saved ~2.5 shots a game each.
- **Round 78 (owner):** **Chase-Down** fires when the finisher actually goes up (a layup / Euro / dunk / alley-oop /
  Step-Through / jelly / push started, `CHASE.finishes`) and the big can get there: trailing (on the break, or farther
  from the rim than the shooter) within 15 ft, or in the last period any rim finish within 12 ft. He arrives by the
  release (up to 45 ft/s) and blocks from up to 7 ft whatever his jump (`CHASE.reach`). Same 40 games: 3 of 15
  chase-downs blocked before, 13 of 15 after. **Lethal Shooter**: every third green miss goes in (was every other);
  measured against Chef x0.88 and Lethal 40% + Chef x0.85 on the four Lethal teams' 116 games
  (`scripts/goatTune.test.ts`): their 3P% 63.4% now, 61.1% (every third), 59.7% (Chef x0.88), 63.9% (40% + x0.85).
  **Steals** x0.7 (on-ball swipes and passing-lane pick-offs, `STEAL`): 7.85 to 5.44 per team per game.
- **Round 77 (owner): rosters brought up to date** (`scripts/rosterPerks.ts`, run once with WRITE=1): every perk's
  prerequisites are owned (Uncle Drew = the whole Handles tree, so Kyrie has all of it; GOAT holders own their full
  paths), and the 33 perks nobody had went to the players they fit (FITS by core ratings, position, height and
  archetype; rarest fit first) within a perk-point budget by tier (5: 20, 4: 15, 3: 11, 2: 8, 1: 6). GOATs are never
  handed out. Box score gains FTM/FTA and offensive rebounds. **Season runner** `scripts/season.test.ts`: every team
  plays every other once (435 games), 3-minute quarters, starters only (CPU teams don't substitute), one JSON out.
- **Round 76 (owner):** the arena hush follows **clutch time** (`sim.clutch`: final period or OT, the last 17% of the
  quarter, score within 5), not a flat last 30 s. **The step-back ult's three is automatic when uncontested**
  (contest under the green line, `GREEN_CONTEST` 0.15, now in shooting.ts), user and CPU. **Clock management**
  (`GameSim.clockPlan`, `CLOCK`): game clock under the shot clock = **hold for the last shot** (dribble it out up top,
  get it to the go-to scorer, attack at 7 s); 31-44 s left = **2-for-1** (get a shot up by 31 s); up late in the final
  period (last 60 s) = **milk the clock** (only great looks until 7 on the shot clock); trailing late in the final
  period = no plan, just score. The coach announces each once per team per quarter. Headless: the quarter's last
  shot comes with a median 1.3-1.5 s left (was 1.9-2.4), ~8% fewer shots per game (the held possessions), same FG%.
- **Round 75 (owner): crunch time.** Every shot (not dunks) released in the **last 30 seconds** of the game (final
  period or OT, game clock) hushes the arena: the crowd and the music drop out while it's in the air (sound effects
  stay, so each bounce on the iron is heard). A miss, airball or block brings everything back; a make is a **big
  crowd pop** (louder than any cheer: roar, low rumble, whistles; the road crowd 70%), the music returns after it.
  **Rim suspense:** crunch-time shots pick a flight that bounces on the rim 2+ times (94% of them vs 4% of ordinary
  shots) with a softer, higher arc; 20% of ordinary shots get the same treatment. The result is still decided before
  the flight (FG% unchanged in 12 headless games: 43.0% vs 43.6%).
- **Round 74 (owner):** **Freight Train** only fires on a **fast break** (a live steal, block or defensive board in a
  full-court game, i.e. `changePossessionLive`), for the new offense only, **2 s** (was 3.5 s on any change); the
  drive-contact effect stays. **Star bigs post up:** the coach adds +0.15 to post sets when the team's go-to scorer is
  a big ("feed the post") and +0.1 when a guard or a man 4+ inches shorter is on him ("mismatch"); a big star's iso
  call is a post set; `wantsPost` doubles for a star big and posts a size mismatch half the time (anyone with Post
  50+). **Post doubles** also come for who he is: 60% for a star or heat tier 2+, 35% for Post 75+ (the strength
  rule still applies); kick-outs have a lower bar and look first for the man the helper left. **Chase-Down** works
  now (it was checked after the get-back branch, which always returned first) and also fires when a star big is
  beaten on a half-court drive. **Jokić's ult = the Deep Step-Back three** (roster field `ult`).
- **Round 73 (GOAT skills, owner):** every tree but Post/Perimeter/Shooting gets a new GOAT at its end (cost 5, gold
  star). **Point God** (Passing, upper arm past the baton's end, after Magic): △ during any shot before the release
  passes out of it. **Unstoppable** (Finishing, owner first called it Crafty; middle fingertip, needs Jelly Fake,
  And-One Artist and Dreamer): a shot that would be blocked is only contested (Block Party too; the Chase-Down ult
  still blocks), and contests on his shots ×0.75. **Freight Train** (Driving, the head; Windmill Gather moved to the
  chest): speed ×1.15 for 3.5 s after **every** change of possession (both ways), and drive contact takes 60% less
  speed. **Gravity** (Screens, top brick): while he holds a screen, defenders within 11 ft drift toward him (up to
  4.5 ft/s, stopping 3 ft away); purple rings close in on him on the floor with tug lines to the pulled defenders.
  The Screens wall is now **1, 4, 3, 1** bricks from the bottom (Screen Assassin moved to the middle of row 3 and
  sits on Roll Man + Pick & Pop). League: Point God = Jokić, Haliburton; Freight Train = Giannis, LeBron; Gravity =
  Jokić; Unstoppable = Brunson, Kyrie, Giannis; Uncle Drew = Kyrie.
- **Round 72 (shaped trees, owner's pictures):** Driving = the dribbler from the NBA logo (start at the planted
  foot, Windmill Gather at the head, Drive & Kick on the ball), Passing = a relay baton hand-off (start at the lower
  fist bottom left, Magic at the baton's top end), Finishing = an open hand (start at the wrist; pinky and ring finger
  dunks, middle finger layups, index and thumb floaters/hooks), Handles = a red valve wheel (start at the bottom knob,
  work around the wheel). Outlines are **traced from the reference images**, not drawn freehand. New Handles GOAT
  skill **Uncle Drew** sits in the hub: needs **every** Handles perk; ○ mid-move cancels into the next move at once
  (after 0.08 s), and every chain move works off any move. Only **Kyrie Irving** has it in the league.
- **Round 68:** a shot off a pump fake is its own scoring method for the rhythm STALE count (`mid · pump fake`),
  not "off dribble".
- **Round 67:** Mamba also keeps made midrange jumpers from going **stale** (no repeat decay on their rhythm).
- **Round 66:** **Bang!** = clutch 3s x1.15 (was pull-up 3s). **Quarter length is not a player option** (Options
  lost it; 3-minute quarters, the dev panel slider stays). The story's **big game is two 4-minute halves**
  (`periods: 2`, H1/H2 on the clock, OT is 2 minutes). The **scout's verdict is weighted** like the box score: a
  block or steal is worth 3 points, an assist 1.5, a rebound 1.3.
- **Round 65 (shaped trees, owner's sketches):** Shooting = a shooting hand under a ball (threes along the bottom
  and up the left to **Chef**, midrange up the right to **Mamba**, both into **Lethal Shooter**), Perimeter = the
  court perimeter (start **Hand in Face** under the basket; possession perks Charge Magnet, Quick Hands,
  Interceptor, High IQ up the left; Closeout King, Screen Navigator, Off Night, Pick-Up Pressure up the right; Iron
  Nate at the top of the arc), Post = the key (Gimme That! / Foresight / Finger Wag on the free-throw line, Block
  Party at the top of the circle), Screens = a brick wall. Lockdown Stance and Floor Burn removed, Swat Team folded
  into Anchor. **GOAT skills** cost 5 and only a few CPU players have them: Block Party = Wembanyama only, Iron
  Nate = Kawhi Leonard, Lethal Shooter = SGA, Curry, Luka, Brunson. Mamba pays with **rhythm** (the game's
  "morale"); a **green** jumper = the contest cone is green (barely contested). Lethal Shooter says
  "I understand it now".
- **Round 64 (perks):** a perk with two or more lines into it needs **all** of them (was any). Trees: **Post** (was Post
  D & Rebounding), **Perimeter** (was Perimeter Defense), **Handles** (was Dribbling); Limitless Range = **Way Down
  Town**, Pull-Up Threat = **Bang!**. Dime Vision merged into **Floor General**. New: **Magic** (fancy passes,
  **automatic** when they fit, no button; harder to pick off, track harder, easier to catch), **Popper** / **Roller**
  (speed away from / toward the rim right after a screen), **Iron Nate** (end of Perimeter, needs all three branch
  ends; no ankle breaks), **Gimme That!** (blocks are snatch blocks), **Foresight** (shadow where the ball will land).
- **Round 63:** rebounds build rhythm (offensive boards more). **Off Night** (Perimeter D, after Hand in Face, cost 2):
  the man you guard builds rhythm ×0.6, the rest of his team ×0.85, while you're on the floor. **Threes are always
  jumpers** (a post shot from beyond the arc is a jumper, never a hook). Shooting tree: **Mid-Range Maestro removed**,
  Mid-Range Rhythm renamed **Rhythm Shooter** (takes Maestro's slot), Elbow Assassin renamed **Killer**.
- **Round 62: Mid-Range Rhythm** (renamed Rhythm Shooter in round 63) (Shooting tree, right arm after Mid-Range Maestro, cost 1): made midrange jumpers
  build ×1.5 rhythm. Midrange = 2-point pull-ups, plus fades and step-through pull-ups from 10 ft out (not layups,
  floaters or threes).
- **Round 61b: passes go to the receiver.** Aimed where he'll be when it arrives (flight time), and every pass homes
  in on him during the flight, so a turning route, a cut or you moving after the throw no longer sends it to a stale
  spot. It only misses if he runs far from it. Aiming at where a CPU is *supposed* to go (his route spot) was tried
  and drew more pick-offs, so the aim follows what he's actually doing. The CPU doesn't throw to someone who can't
  catch; a pass to a screener takes him off the screen.
- **Round 61: 1v1 CPU levels Easy / Medium / Hard** (setup screen, default Medium). The level changes **offense and
  defense**, decisions only (no rating boosts). **The key read: the CPU shoots the moment it works out the defender
  can't get a meaningful contest up by the release** (a forecast of the release, not the contest now). It strings
  options together (dribble combos, sprint drives, post up → let go → step back, pump fake → Step-Through if he
  jumps), counters what the defender gives it, takes open looks at once, settles at a clock time drawn per possession
  (not always the last second) and throws one up before the buzzer. **The prologue 1s vs Kingston uses Medium** (round 70, owner; was Hard). **No CPU level tag over
  the CPU's head** (round 70, owner): only a human P2 gets a tag. The
  brain is **1v1 only** for now; 3v3/5v5 isos can use it later.
