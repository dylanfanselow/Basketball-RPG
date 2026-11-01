# Backlog / known gaps

## Start here next session (after round 18)
1. **Ask how multi-angle players run on the owner's Mac**: frame rate in Quick 5v5 with 10 players turning, any
   stutter in the first seconds while angled frames are drawn (dev panel → "Multi-angle players" shows cached frames
   and ms per new frame), and how the angles look in-game. Headless numbers here (~4 ms/frame) are pessimistic.
2. **Known multi-angle follow-ups**: jersey numbers read mirrored on left-facing players (draw left views natively
   instead of flipping); three-quarter faces are a first pass; shoes switch profile↔front at ~60° instead of turning;
   shots/moves/passes/box-outs are still side view only; celebs and bench have no angles.
3. Polish carried over: faces are small at game zoom, celebs/bench have no walking frames, 1v1 shows both full
   benches, P2 in two-player 1v1 has no on-screen controller HUD or own cone.
4. Still unanswered from round 9: does the Step-Through feel right (pull-up and close finish), and do the
   stun/steal/block behavior and pass speed feel good?

## Not built yet (owner wants eventually)
- Ultimate unlock **story event + cutscene** (backstory-specific 1v1, then position-based ult choice).
- **Backstory selection** at character creation (data exists in `backstories.json`, effects are wired).
- **Random in-season events** and off-court **story** (`src/career/story.ts` has the types/effects).
- Character creator UI (appearance editing exists only in the dev panel).
- Season standings, other games simulated, playoffs.
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
