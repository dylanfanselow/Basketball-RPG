# Backlog / known gaps

## Start here next session (after round 24)
1. **Ask how multi-angle players run on the owner's Mac**: frame rate in Quick 5v5 with 10 players turning, any
   stutter in the first seconds while angled frames are drawn (dev panel → "Multi-angle players" shows cached frames
   and ms per new frame), and how the angles look in-game. Headless numbers here (~4 ms/frame) are pessimistic.
2. **Known multi-angle follow-ups**: jersey numbers read mirrored on left-facing players (draw left views natively
   instead of flipping); three-quarter faces are a first pass; shoes switch profile↔front at ~60° instead of turning;
   jump shots are angled (round 45) but layups/dunks, moves, passes and box-outs are still side view only; celebs and bench have no angles.
3. Polish carried over: faces are small at game zoom, celebs/bench have no walking frames, 1v1 shows both full
   benches, P2 in two-player 1v1 has no on-screen controller HUD or own cone.
4. **Face parts round-trip:** when the owner pushes `src/art/parts` / rosters.json changes, clean up the pictures
   (edges, matching side vs front, shading) and check them in-game at every angle (¾ uses the front picture slid
   sideways; nearest-neighbour scaling at k≈1.1–1.4 can roughen thin lines).
5. **Pixel editor round-trip:** the owner edits celebs and saves them into `src/art/celebs/` → do the final touches
   on those PNGs (clean edges, match shading across the 4 frames). Plain fans / bench aren't editable yet.
6. Ask about round 22: box-score weights (does a steal/block = 3 pts feel right?), coach bubbles, the rebound ding.
   Coaches have no walking frames yet (they slide with a step bob).
7. Ask how the physical rim (round 21) looks and feels: long caroms on deep misses, rattles, swish rate (~30–45% of
   makes), rebound distances. Dunks are still scripted; blocks/tips don't interact with the physical ball yet.
8. Ask how round 20 feels: ball through the net + swish volume, held screens and knock-back length, how often isos
   get called, whether the AI now finds open men enough (and not too much), red unsafe-pass flash.
9. Ask whether the new fan row behind the sideline reads right (size, dimness, how many wear home colors).
10. Still unanswered from round 9: does the Step-Through feel right (pull-up and close finish), and do the
   stun/steal/block behavior and pass speed feel good?

- **Round 61b follow-ups (passing):** watch passes to you in real play (headless used a wandering stand-in). Most
  pick-offs are tipped right out of the passer's hands by his own defender on long passes; tune that if it feels like
  too many. `PASS` in game.ts holds the homing numbers.
- **Round 61 follow-ups (1v1 CPU):** tune Easy / Medium / Hard with the owner (`CPU_LEVELS` in `ai/levels.ts`;
  `scripts/oneOnOne.test.ts` for numbers). Strong post players lean on the post a lot once it works (memory); Hard
  only plays them off outside ~10 ft. Use the brain for CPU isos in 3v3 / 5v5 (owner: later). Not played against a
  real person here: only CPU vs CPU headless plus browser screenshots.

## Not built yet (owner wants eventually)
- **Calendar games + day loop:** what happens when you sleep past a game day (play it / miss it), the food bar
  (fridge, eating); games could send skill orbs too; stat points from level-ups
  vs skill XP may need a balance pass.
- **Garage follow-ups (round 39):** the mini-games score reps but don't train yet, tune difficulty with the owner, stat gains / energy + food cost per rep or
  session, speed bag and dip station, the hoop for shooting practice, maybe fix up the car.
- **Apartment follow-ups (round 36):** fridge = eat
  (food bar), special events on the calendar (the screen + key games are in, round 46), pet the cat, energy / food drain and money income, **Start Game / Load Game** front end that drops you in
  the apartment (menu stays a dev tool). Ask the owner how the room reads (size of the cat, door visibility on the
  slanted walls, the island, lamp glow).
- Ultimate unlock **story event + cutscene** (backstory-specific 1v1, then position-based ult choice).
- **Backstory selection** at character creation (data exists in `backstories.json`, effects are wired).
- **Random in-season events** and off-court **story** (`src/career/story.ts` has the types/effects).
- Character creator UI (appearance editing exists only in the dev panel).
- Season standings, other games simulated, playoffs (playoff games should set `GameConfig.bigGame` → home crowd in team colors).
- Post moves beyond the basics (drop step, up-and-under, spin out of the post), post perks (e.g. a post-hook / anchor
  tree branch), AI double-team rules against post-ups.

## Known gaps / polish
- Courtside celebrities and bench players only have seated / standing / phone / shock frames (no walking).
- Players are still strictly side-on (no 3/4 turn); faces are small at game zoom.
- 1v1: benches/coaches still show both full rosters; no "clear the ball" rule (stops just check it up top); P2 has no on-screen
  controller HUD or own shot cone.
- Substitutes appear instantly instead of walking from the bench.
- Camera doesn't pan to an inbounder behind the far baseline.
- Rosters: starters solid; deep bench, some jersey numbers and many looks are best guesses (sources were
  search snippets; official roster pages are blocked from the cloud environment).
- Coaches/officials/fans are simple; no animated referees on court.
- Animation blending between clips is not implemented (Catmull-Rom in-betweens smooth within a clip).
- Round 65: Mamba / Chef / Finger Wag aren't on any CPU player; the shaped trees' lines are straight segments (the
  ball and arc are polygons over a faint backdrop).
- Round 73: CPU players never pass out of a shot (Point God is user-only in practice); Freight Train's contact
  effect has no dedicated test (the speed boost does).
- Round 72: Uncle Drew only matters for the user (CPU dribblers don't press ○ mid-move); the empty top knob of the
  Handles valve has no perk yet.
- Round 64 perks: no CPU player owns Magic, Roller/Popper, Gimme That! yet (only the user, via perk points or
  the dev panel). No-look passes reuse the plain pass clip (the head stays forward); a wraparound shares the
  behind-the-back clip. Foresight only shows planned (physical) misses and loose balls, not scripted dunk misses.

## Not verified in this environment
- Frame rate and sheet-build time at 1920×1080 on real hardware (headless here: software GL, 4 cores).
- Web Workers inside the hosted artifact page (falls back to main-thread drawing, which is slower to load).
- Audio by ear (all sounds are procedural; only the AudioContext state was checked).
- A physical PlayStation controller (tested with a simulated pad; standard mapping assumed).
- Two-player 1v1 on two real controllers (pad slot split is unit-free logic; only keyboard + CPU were driven in the browser).
- Long-session performance of the animated crowd on slower machines.
- **School court (round 56):** maybe a thunder sound for the lightning.
- **Draft (later):** when you join an NBA team, if your number is already worn on that roster, ask for a new one
  (`takenNumbers()` in roster.ts is ready for it).
- **Prologue follow-ups (round 60):** Mom tells you the scout's first reaction (round 60d); still open: where the
  career goes from high school to the NBA life / apartment, what the scout does next; the **coffee / poisoning reveal** (Kingston finds out, then you do); Kingston
  as the high-school rival in the ult-unlock 1v1 (VISION). The trailer's roof HUD still shows NBA key games ("Opener
  vs ATL"), fixed in 60b (Big game vs JEF). Kingston walks off since 60b (he uses the jog cycle at walking pace;
  ask if it reads as a walk). Mom is a front-view standing figure in the doorway (ask about her look). Ask the owner how
  the lesson order / wording feels, whether Kingston's demos read clearly, and whether the 1s are too hard.
- **Check on Kingston (round 71):** the door blocks with "I should check on Kingston." after Mom's second talk, but
  that visit doesn't exist yet: build it and clear `StoryState.checkKingston` there (until then the trailer's day loop
  can't continue in a story save). Real mail for the mailbox later.
- **Trailer yard (round 57):** the story element at the door (`TRAILER_DOOR_STORY` in TrailerScene), a trailer interior, and tying it to the "Lights on a generator" backstory at career creation.
- **Character builder (round 59):** the backstory pick (VISION) as another step.
