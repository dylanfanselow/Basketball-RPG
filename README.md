# Basketball-RPG (Hoop Career)

Basketball career simulation game with RPG elements.

A gameplay-first vertical slice of a 5v5 career basketball RPG: Hoopland-inspired side-view pixel art with taller,
more realistic proportions; Dunk City Dynasty-style 4-button controls; Skyrim-style progression; and team basketball
where you have to *earn* the ball.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # sim unit tests + a headless AI-vs-AI game

cd Basketball-RPG && git pull
npm run dev
```

## Controls (gamepad, PlayStation layout)

| Button | With ball | Offense, off ball | Defense |
|---|---|---|---|
| **✕** (bottom) | Shoot. Near the rim: layup/dunk; hold stick **back** = floater, **sideways** = hook (or Euro Step if unlocked) | — | Block / contest |
| **△** (top) | Pass to the teammate under the yellow **dot** (aim with the stick) | Call for the ball (a *request*: trust decides) | Swipe steal / deflect passes |
| **○** (right) | Dribble move. Dribbling up/down the screen, push the stick the **other way** = Crossover; toward the hoop = hesi/spin; away = step-back; same way = in-and-out | Set a screen | Take a charge |
| **□** (left) | Ultimate | Ultimate | Ultimate |
| Left stick / R2 | Move / tap for a sprint burst (then a cooldown) | | |

Keyboard: WASD move, **K**=✕, **L**=○, **J**=□, **I**=△, Shift sprint, Enter pause, **M** mute. **F1** or **`** toggles dev tools
(gamepad: Create+Options).

## Things to know while testing

- **Sprint** is a tap: R2 (or Shift) gives a short burst, shown by speed lines and the ring next to the trust bars, then it recharges. Mobility and stamina change both.
- **Side Drive**: ○ + stick up or down while dribbling. While you're driving, flick the stick the other way (no button) to cross over.
- **✕ tap = pump fake** (fake as many times as you like; it picks up your dribble so you can only pass or shoot). **✕ hold = shoot.**
- **Step-Through** (everyone): within 1.5 seconds of a pump fake, **hold the stick toward the rim and hold ✕** (the ✕ badge says "Step-Through" when it's lined up). You take one long stride around your man: close in you finish at the rim, from mid-range or the arc you stride into a pull-up jumper. A defender who jumped on the fake can't contest or block it. The Finishing-tree Step-Through perk makes the stride longer and the finish better.
- **Blocks and steals stick:** a block swats the ball away hard and nobody can touch it for a moment; a strip pops it past the defender. The player who lost it is rocked (stars over his head) for about a second and can't grab it back.
- **Passing:** passes are faster. Short passes curve to your teammate and are rarely picked off; long passes through traffic get intercepted. **Hold L2 (Q)** for icon passing: each teammate wears ✕ ○ □ △, press his button to pass to him.
- **Fullscreen:** press **F**, click ⛶ in the top-right corner, or pick Fullscreen in the main menu / pause menu. (Browsers only allow it from a key or click, not a controller button.)
- **L1 = back / escape.** In menus it goes back a screen. In a game, L1 opens the pause menu with Quit highlighted, and a second L1 leaves. Options (Enter) also pauses. On the keyboard, Esc does the same as L1.
- **1v1 · Make It, Take It** (main menu): pick a team and any player on its roster for each side. P2 can be a **second player** (a second controller, or the keyboard if only one controller is plugged in) or the **CPU**. Score and you keep the ball. A defensive board or steal means the other player checks it up top. The default is 1s & 2s to 11, win by 2, and you can change it on the setup screen. 14-second shot clock, no ultimates.
- **Hold ○** and the left-stick widget shows which move each direction does; drag that way to do it. Directions are relative to **your line to the hoop** (toward it = hesi, away = step-back, across it = crossover / side drive), and every move travels a fixed distance. While ○ is still held, flick again for the chain move (gold arcs). A quick **○ tap** = jab step (keeps your dribble).
- **○ while a shot is in the air = box out.** Stronger box-outs knock players back, and so do screens.
- On defense you see **your man's shot cone**: green = you're contesting him, red = he's open.
- **Quick 5v5**: pick your team, the opponent, and play as any of the five starters or your own player.
- **Feature me equally** (on in Practice and Quick Game, toggle in the dev panel): the coach rotates who each set is run for, including you, even when you're not the position the play was written for.
- After a make, a big walks the ball out of bounds and inbounds it to the point guard. Steals and defensive boards can turn into fast breaks.

## How it's built

- `src/sim/**`: pure TypeScript simulation (no Phaser), so it can be unit-tested and simmed headless.
  - `shooting.ts`: shot type selection, contest cone, and the full shot equation shown in the HUD.
  - `moves.ts`: dribble move resolver + chains (Crossover → Behind-the-Back → Snatch-Back).
  - `modifiers.ts`: the hook system. Perks, traits, backstories, event buffs and ultimates are all `ModSource`s.
  - `ai/trust.ts`: why teammates do or don't pass to you. `ai/offense.ts` and `ai/defense.ts` run sets, reads, help and closeouts.
  - `plays/runner.ts` + `src/data/plays/plays.json`: real sets (High PnR, Spain, Horns Flare, Floppy, Chicago, …).
  - `ultimates.ts`: a separate ultimate system (Deep Step-Back, FT-Line Takeoff, Chase-Down Block) with evolutions.
- `src/data/rosters.json`: real 2026-27 NBA rosters (names, numbers, ratings, perks, looks). Edit it directly, or use the dev panel's **NBA player looks** section and "Save look to rosters.json" (works under `npm run dev`).
- `src/data/**`: everything tunable. `statInfluence.json` (core stat → sub-ratings), `shotTypes.json`, `moves.json`,
  `trees/*.json` (perk constellations), `ultimates.json`, `league.json` (placeholder teams, swap freely).
- `src/career/**`: level/XP/stat points, skill tree rules, rotation/minutes, plus stubs for story, random events and backstories.
- `src/render/anim.ts`: keyframed animation clips (jumper, floater, hook, layup, Euro, dunk, every dribble move…), sampled into smooth in-between frames.
- `src/render/sprites.ts` + `appearance.ts`: procedural pixel players with hair, faces and gear (sleeves, socks, goggles, masks, shoes); `anim.ts` `rigArms` sets shoulder height and arm length.
- `src/audio/sfx.ts`: all sound effects and crowd synthesized with Web Audio (no audio files).
- `src/dev/devPanel.ts`: the dev tools overlay, including Appearance and Audio sections.
