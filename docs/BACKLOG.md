# Backlog / known gaps

## Start here next session (after round 22)
1. **Ask how multi-angle players run on the owner's Mac**: frame rate in Quick 5v5 with 10 players turning, any
   stutter in the first seconds while angled frames are drawn (dev panel → "Multi-angle players" shows cached frames
   and ms per new frame), and how the angles look in-game. Headless numbers here (~4 ms/frame) are pessimistic.
2. **Known multi-angle follow-ups**: jersey numbers read mirrored on left-facing players (draw left views natively
   instead of flipping); three-quarter faces are a first pass; shoes switch profile↔front at ~60° instead of turning;
   shots/moves/passes/box-outs are still side view only; celebs and bench have no angles.
3. Polish carried over: faces are small at game zoom, celebs/bench have no walking frames, 1v1 shows both full
   benches, P2 in two-player 1v1 has no on-screen controller HUD or own cone.
4. **Pixel editor round-trip:** the owner edits celebs and saves them into `src/art/celebs/` → do the final touches
   on those PNGs (clean edges, match shading across the 4 frames). Plain fans / bench aren't editable yet.
5. Ask about round 22: box-score weights (does a steal/block = 3 pts feel right?), coach bubbles, the rebound ding.
   Coaches have no walking frames yet (they slide with a step bob).
6. Ask how the physical rim (round 21) looks and feels: long caroms on deep misses, rattles, swish rate (~30–45% of
   makes), rebound distances. Dunks are still scripted; blocks/tips don't interact with the physical ball yet.
7. Ask how round 20 feels: ball through the net + swish volume, held screens and knock-back length, how often isos
   get called, whether the AI now finds open men enough (and not too much), red unsafe-pass flash.
8. Ask whether the new fan row behind the sideline reads right (size, dimness, how many wear home colors).
9. Still unanswered from round 9: does the Step-Through feel right (pull-up and close finish), and do the
   stun/steal/block behavior and pass speed feel good?

## Not built yet (owner wants eventually)
- Ultimate unlock **story event + cutscene** (backstory-specific 1v1, then position-based ult choice).
- **Backstory selection** at character creation (data exists in `backstories.json`, effects are wired).
- **Random in-season events** and off-court **story** (`src/career/story.ts` has the types/effects).
- Character creator UI (appearance editing exists only in the dev panel).
- Season standings, other games simulated, playoffs (playoff games should set `GameConfig.bigGame` → home crowd in team colors).
- Post-up moves (Strength currently only affects contact, screens, box-outs).

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

## Not verified in this environment
- Frame rate and sheet-build time at 1920×1080 on real hardware (headless here: software GL, 4 cores).
- Web Workers inside the hosted artifact page (falls back to main-thread drawing, which is slower to load).
- Audio by ear (all sounds are procedural; only the AudioContext state was checked).
- A physical PlayStation controller (tested with a simulated pad; standard mapping assumed).
- Two-player 1v1 on two real controllers (pad slot split is unit-free logic; only keyboard + CPU were driven in the browser).
- Long-session performance of the animated crowd on slower machines.
