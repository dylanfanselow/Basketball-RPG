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

## Controls (gamepad, Xbox layout)

| Button | With ball | Offense, off ball | Defense |
|---|---|---|---|
| **A** (bottom) | Shoot. Near the rim: layup/dunk; hold stick **back** = floater, **sideways** = hook (or Euro Step if unlocked) | — | Block / contest |
| **Y** (top) | Pass to the teammate under the yellow **dot** (aim with the stick) | Call for the ball (a *request*: trust decides) | Swipe steal / deflect passes |
| **B** (right) | Dribble move + stick direction (uses the moves you've unlocked) | Set a screen | Take a charge |
| **X** (left) | Ultimate | Ultimate | Ultimate |
| Left stick / RT | Move / sprint | | |

Keyboard: WASD move, **K**=A, **L**=B, **J**=X, **I**=Y, Shift sprint, Enter pause. **F1** or **`** toggles dev tools
(gamepad: Back+Start).

## How it's built

- `src/sim/**`: pure TypeScript simulation (no Phaser), so it can be unit-tested and simmed headless.
  - `shooting.ts`: shot type selection, contest cone, and the full shot equation shown in the HUD.
  - `moves.ts`: dribble move resolver + chains (Crossover → Behind-the-Back → Snatch-Back).
  - `modifiers.ts`: the hook system. Perks, traits, backstories, event buffs and ultimates are all `ModSource`s.
  - `ai/trust.ts`: why teammates do or don't pass to you. `ai/offense.ts` and `ai/defense.ts` run sets, reads, help and closeouts.
  - `plays/runner.ts` + `src/data/plays/plays.json`: real sets (High PnR, Spain, Horns Flare, Floppy, Chicago, …).
  - `ultimates.ts`: a separate ultimate system (Deep Step-Back, FT-Line Takeoff, Chase-Down Block) with evolutions.
- `src/data/**`: everything tunable. `statInfluence.json` (core stat → sub-ratings), `shotTypes.json`, `moves.json`,
  `trees/*.json` (perk constellations), `ultimates.json`, `league.json` (placeholder teams, swap freely).
- `src/career/**`: level/XP/stat points, skill tree rules, rotation/minutes, plus stubs for story, random events and backstories.
- `src/dev/devPanel.ts`: the dev tools overlay.
