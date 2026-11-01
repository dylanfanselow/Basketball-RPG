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
- **L2 = icon pass:** hold L2 (keyboard Q), teammates wear ✕ ○ □ △ (by role), press one to pass to him; other
  actions are paused while L2 is held.
- **Blocks/steals:** the ball flies (block) or pops (steal) with a short no-grab window; the victim is stunned
  ~1 s with an animation and can't regrab it.
- **Passes:** faster (55–90 ft/s); short passes home in and are rarely picked; long passes are riskier.
- **L1 = escape:** back in every menu; in a game the first L1 opens pause with Quit highlighted, a second L1 quits.
  (Column/tab switching moved to R1 / L2 / d-pad.)

## HUD
- **Fullscreen:** F key, a ⛶ button, and a menu/pause item.
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
  in-and-outs, high bounces); bad shots can **airball**.
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
