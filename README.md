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
| **✕** (bottom) | Shoot. Close shots follow the stick: **away** = floater (or **Fade Away** anywhere, if unlocked), **toward** = layup / push shot, **sideways** = hook (Euro Step instead on a drive, if unlocked). Tap = pump fake | — | Block / contest |
| **△** (top) | Tap: pass to the teammate under the yellow **dot** (aim with the stick). **Hold: lob** (an alley-oop when the dot says LOB) | Call for the ball (a *request*: trust decides) | Swipe steal / deflect passes |
| **○** (right) | Dribble move. Dribbling up/down the screen, push the stick the **other way** = Crossover; toward the hoop = hesi/spin; away = step-back; same way = in-and-out | Set a screen | Take a charge |
| **□** (left) | Ultimate | Ultimate | Ultimate |
| Left stick / R2 | Move / tap for a sprint burst (then a cooldown) | | |
| **L2** (hold) | **Post up**: back your man down (stick toward / away from the rim only) | | |
| **R1** (hold) | Icon pass: teammates wear ✕ ○ □ △ | | |

Keyboard: WASD move, **K**=✕, **L**=○, **J**=□, **I**=△, Shift sprint, **E** post up (L2), **Q** icon pass (R1), Enter pause, **M** mute. **F1** or **`** toggles dev tools
(gamepad: Create+Options): edit your player's name, position, height, number, stats, perks (with search) and looks live.

## Things to know while testing
- **Box score (top left):** your name, field goals, and your three most valuable stats. Steals and blocks count about 3× a point, assists 1.5×, rebounds 1.3×. Your rebounds also play a ding and pop **REBOUND +1**.

- **Bringing it up:** defenders normally pick you up around half court. Teams **full-court press** when they're trailing late (and now and then after a made basket): `PRESS` shows by the shot clock, the defender stays on you the whole way and a second one comes to trap near the sideline or half court. Beat it with a move and a burst, find the man the trap left open, or wait for the big who comes up to set a screen (a guard also flashes back for an outlet). **8-second rule:** get it past half court in 8 seconds (`8 SEC 3…2…1` shows at the end). With the ball you're a little slower, and the sprint burst gives only half its boost (dribble moves are how you beat your man). Dev panel: *Force full-court press*.
- **Sprint** is a tap: R2 (or Shift) gives a short burst, shown by speed lines and the ring next to the trust bars, then it recharges. Mobility and stamina change both.
- **Side Drive**: ○ + stick up or down while dribbling. While you're driving, flick the stick the other way (no button) to cross over.
- **✕ tap = pump fake** (fake as many times as you like; it picks up your dribble so you can only pass or shoot). **✕ hold = shoot.**
- **Step-Through** (everyone): within 1.5 seconds of a pump fake, **hold the stick toward the rim and hold ✕** (the ✕ badge says "Step-Through" when it's lined up). You take one long stride around your man: close in you finish at the rim, from mid-range or the arc you stride into a pull-up jumper. A defender who jumped on the fake can't contest or block it. The Finishing-tree Step-Through perk makes the stride longer and the finish better.
- **Blocks and steals stick:** a block swats the ball away hard and nobody can touch it for a moment; a strip pops it past the defender. The player who lost it is rocked (stars over his head) for about a second and can't grab it back.
- **Passing:** passes are faster. Short passes curve to your teammate and are rarely picked off; long passes through traffic get intercepted. **Hold R1 (Q)** for icon passing: each teammate wears ✕ ○ □ △, press his button to pass to him.
- **Apartment (career home)** (top of the dev menu, or Career Hub → Go Home): walk around your first apartment with the stick / WASD (R2 / Shift to hurry). Furniture is solid. ✕ at the left door = the garage gym (its back-wall door brings you back), ✕ at the front door or L1 = leave. Dev panel → Debug draw → "Apartment collision boxes" shows the footprints. In the garage, stand at the squat rack, bench, push-up mat, jump rope or treadmill and press ✕ to start its mini-game (the controls show on screen; L1 stops): squat (alternate L2 / R2), treadmill (○ when the dot is in the square), push-ups (press the button shown), shooting on the red square (hold ✕, release in the green; the tiny red slice = perfect), bench (hold ✕, keep it level with the stick).
- **Fullscreen:** press **F**, click ⛶ in the top-right corner, or pick Fullscreen in the main menu / pause menu. (Browsers only allow it from a key or click, not a controller button.)
- **L1 = back / escape.** In menus it goes back a screen. In a game, L1 opens the pause menu with Quit highlighted, and a second L1 leaves. Options (Enter) also pauses. On the keyboard, Esc does the same as L1.
- **1v1 · Make It, Take It** (main menu): pick a team and any player on its roster for each side. P2 can be a **second player** (a second controller, or the keyboard if only one controller is plugged in) or the **CPU**. Score and you keep the ball. A defensive board or steal means the other player checks it up top. The default is 1s & 2s to 11, win by 2, and you can change it on the setup screen. 14-second shot clock, no ultimates.
- **Hold ○** and the left-stick widget shows which move each direction does; drag that way to do it. Directions are relative to **your line to the hoop** (toward it = hesi, away = step-back, across it = crossover / side drive), and every move travels a fixed distance. While ○ is still held, flick again for the chain move (gold arcs). A quick **○ tap** = jab step (keeps your dribble).
- **○ while a shot is in the air = box out.** Stronger box-outs knock players back, and so do screens.
- **Hold ○ to keep a screen up** (on offense) or **stay set for a charge** (on defense) until you let go. How long a defender stays stuck depends on your screen rating, your strength vs his, and how mobile he is (Brick Wall makes it longer, Screen Navigator on defense makes it shorter).
- **Passing range:** the yellow pass dot (and the R1 icons) **flash red** when the target is beyond your safe passing distance. Long leads to a teammate running the floor go overhead and reach further.
- **Post up (hold L2 / E)** within 20 ft with a live dribble: you turn your back to the basket and the stick only goes straight toward or away from the rim. Your post rating vs his post D (mostly Strength) decides it, shown over your head:
  - **Stronger:** each push is a bump that knocks him back a step and **stun-locks** him (no contest while you keep bumping).
  - **Even:** a slow steady push; he only half-contests.
  - **Weaker:** you barely move, and he can **bump you back** and stun you for a second.
  Let go of L2 and he stays locked in his bumped pose for a moment (**SHOOT!**): stick sideways = hook, toward the rim = layup/floater, away = fade (if unlocked) or floater. AI bigs post up too. Dev panel → *Post test* sets one up.
- **Dunks unlock with your Dunk rating** (Finishing, plus some Mobility and Strength): one-hand and two-hand flushes for everyone, then tomahawk (62), two-hand hammer (68), cock-back (74), reverse (78), windmill (84), 360 (90), 360 windmill (95). Contested dunks are power dunks; open ones lean to your flashiest, which are a hair less reliable (shown in the equation) but bring the crowd up and charge your ultimate more. The level-up screen shows what you have and the next one.
- **Alley-oops:** **hold △** to lob it to the dot target. When he's heading to the rim the dot says **LOB** and it's an alley-oop: the lob comes down at rim height, a ring shows where, and he goes up and finishes in the air (a dunk if he can dunk, else a layup off the glass). When the lob is to **you**, the ring is yellow: press **✕** to go up — catching it at the top of your leap is clean, early or late adds an `oop timing` penalty, no ✕ = you catch it on the floor. Anyone can lob; the lob rating (Playmaking) decides accuracy, **Lob City** makes lobs tighter, harder to tip and longer (50 ft), **Lob Threat** widens the catch and boosts the finish. AI passers throw oops to cutters too, and the coach calls **lob sets** (Pick & Roll Lob, Back-Screen Lob; 3v3 versions too) when the man they're for can dunk: if you have the ball the play line says `hold △ = LOB to <name>`, if you're the lob man cut to the rim and go up.
- **Jelly Fake** (Finishing tree, the far end of the dunk line after Posterizer, 3 pts): going up for a dunk, press **✕ again** (the ✕ badge says Jelly): you abort the dunk, hang in the air ~0.5 s and flick a jelly layup. A shot blocker who jumped at the dunk comes down first (no block, contest ×0.3), but the jelly is a much harder shot (its own low base + a `Jelly Fake ×0.85` term).
- **Windmill Gather** (Driving tree ability, D-Wade / Donovan Mitchell): on drive finishes the ball swings around in a big windmill before the layup or dunk: can't be stripped, blocks ×0.6, contest ×0.85.
- **High IQ** (Perimeter D perk): on defense a banner shows the set they're running and who it's for, with a red marker over him.
- **Loose ball on the floor: ✕ = dive** for it (the ✕ badge says Dive). The dive reaches further than a normal grab; if you get it you're on the floor holding it, so pass it out. AI hustle players dive on 50/50 balls too.
- **Dreamer** (Finishing tree ability, after Sky Hook or Euro Step): a ✕ tap fakes the close shot you have lined up with its own animation (hook fake, floater fake, layup fake; the ✕ badge says which), and defenders bite on them 35% more. Without it everyone has the one regular pump fake. Step-Through works off any fake. Several real centers (Jokić, Embiid, Sabonis…) have it.
- **Fade Away** (Shooting tree, replaces the old Fadeaway passive): hold the stick away from the basket and shoot, from anywhere. The contest cone gets much smaller, but accuracy drops off exponentially with distance (the `fade` term in the equation).
- **Pump fake on the catch** (before your first dribble) keeps your dribble, so you can fake and drive past the closeout.
- **Pixel editor:** dev panel → *Pixel editor: celebs* or *Pixel editor: face parts* (or open the game with `?editor` / `?editor=parts`). Edits show up in your next game; under `npm run dev`, *Save to repo* writes the PNGs into `src/art/`.
- **Editing faces (mix and match):** heads are built from parts — hair (front + back layer), beard, brows, eyes, nose, mouth — each a small picture per view (side, front). In *Face parts* mode pick a part and view, draw in grays (they take each player's hair color / skin tone; pure green in eyes = eye color), or *＋ New variant* to make `hair_1`, `beard_2`…; the preview shows any roster player wearing it. Then in the dev panel's **NBA player looks**, pick the player, set his hair / facial hair / nose / mouth / eyes / brows to your variants and *Save look to rosters.json*.
- **Sending art to Claude:** run `npm run dev`, use *Save to repo* (and *Save look to rosters.json* for players), then `git add src/art src/data/rosters.json && git commit -m "Face parts" && git push`, and say "pushed face parts" (plus anything to polish).
- On defense you see **your man's shot cone**: green = you're contesting him, red = he's open.
- **Quick 5v5**: pick your team, the opponent, and play as any of the five starters or your own player.
- **Quick 3v3**: same real teams, three a side: **Guard** (PG/SG), **Wing** (SG/SF/PF), **Big** (PF/C). The setup screen fills each slot with the best fit; Left/Right swaps any slot (both teams). Play as any of your three or your own player. Pick **Full court** (like 5v5) or **Half court** (one basket; after every score, stop or dead ball the team with the ball checks it up top, 14-second shot clock). The coach calls 3v3 sets (pick & roll, pick & pop, handoff, pin-down, post-up, give & go) and plenty of isos. No subs, normal 2s and 3s.
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
- `src/render/pose3d.ts` + `frameCache.ts`: multi-angle players (poses turned to any of 8 directions; angled frames drawn on demand).
- `src/audio/sfx.ts`: all sound effects and crowd synthesized with Web Audio (no audio files).
- `src/dev/devPanel.ts`: the dev tools overlay, including Appearance and Audio sections.
