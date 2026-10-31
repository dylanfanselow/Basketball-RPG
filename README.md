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
- **Pump fake** (○ with no stick) picks up your dribble: you can only pass or shoot.
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
- `src/render/sprites.ts` + `appearance.ts`: procedural pixel players with hair, faces and gear (sleeves, socks, goggles, masks, shoes).
- `src/audio/sfx.ts`: all sound effects and crowd synthesized with Web Audio (no audio files).
- `src/dev/devPanel.ts`: the dev tools overlay, including Appearance and Audio sections.
