# History of feedback rounds

| # | Commit | Owner asked for | What changed |
|---|---|---|---|
| 1 | `02213f1`, `f0b969b` | Initial design: Hoopland look, Dunk City controls, Skyrim progression, trust-earned touches, real plays, ultimates as a separate locked system, dev tools, no shot meter (cone + equation) | Vertical slice: sim, shot equation, moves + chains, trust, 8 plays, perk trees, 3 ultimates, career shell, dev panel, procedural sprites, tests, headless AI game |
| 2 | `968f017` | Run with npm locally; controller should connect when plugged in | Gamepad API read directly, connect toasts, `npm run build:single` |
| 3 | `d41f078` | Sound effects (dribble, crossover, swish, rim, screens); smaller players, more variety (hair, accessories, faces); fluid animations with distinct shot animations | Procedural audio + crowd, appearance system, keyframe clips, PIXEL 3→2 |
| 4 | `8c5932c` | Re-call a play when one fizzles; deeper dribble moves; crossover by changing direction; real rosters with look-alike gear | Play reset, new moves, change-of-direction crossover, 323-player 2026-27 rosters |
| 5 | `23cf374` | Pass to the open man / fast breaks vs check-up with walk-out inbounds; tap sprint with cooldown + gusts; PlayStation labels; stronger side drive + flick crossover; shorter cones, floater penalty; pump fake picks up dribble; equal touches for testing; hoop stanchions, zoom out, smaller players, scorer's table, coaches, benches, lively crowd | All of those |
| — | `bdf3fc3` | (Owner edited README on GitHub) | — |
| 6 | `f369833` | On-screen PS button diamond with action icons + press effect; stick widget showing moves while ○ held; pump fake on ✕ tap (repeatable); rounder chests, fitted shorts; box-outs with push-back; random rim bounces + airballs; C/PF crash roles; Quick 5v5 team/player select; bench facing court; loud swish, block clap | All of those |
| 7 | `4109854` | See your matchup's cone; screens knock back like box-outs; slower shots + exaggerated box-out/rebound animation; smoother crossover; stick arcs flash on use and fixed move distances; ready crossing dribble while holding ○; flick directions relative to the basket | All of those |

Each round was planned in plan mode, the owner approved, then implemented with tests + Playwright screenshots,
committed, pushed to `main`, and the browser link republished.
