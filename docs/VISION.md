# Vision

A **5v5 NBA career basketball RPG** in the browser.

- **Visuals:** inspired by *Hoopland* (side-view pixel art), but players are **taller / more realistic proportions**
  (owner dislikes Hoopland's short chibi look). Finer pixels (2×2 screen px per art px). Varied looks: hairstyles,
  faces (eye color, nose, mouth, eye/mouth height), facial hair, accessories (headbands, arm/leg/wrist sleeves,
  knee pads, sock heights, goggles, masks, colored shoes).
- **Gameplay:** inspired by *Dunk City Dynasty*: 4 face buttons, dribble moves on a button + stick, an ultimate
  button, skill/ability unlocks that change how you play. **Gameplay and the feel of the moves are the top priority.**
- **Real basketball, not iso ball:** you control only your career player. Teammates do **not** pass to you just
  because you press pass (the owner explicitly hates 2K's "press pass and they always throw it to you"). You earn
  the ball through **teammate trust**, running plays correctly, and getting open; you earn **minutes/rotation**
  through **coach trust**. The coach calls real NBA sets and you run your assignment.
- **Progression (Skyrim-like):**
  1. Level up → put points into 5 broad core stats: **Shooting, Finishing, Strength, Mobility, Playmaking**
     (each influences many sub-ratings with weights: e.g. Shooting mostly 3s/mid, less floaters/step-throughs).
  2. Then spend perk points in **constellation trees**: Screens, Shooting (a **V**: 3PT arm / 2PT arm / shared
     inside), Driving, Dribbling (move chains: Crossover → Behind-the-Back …), Passing, Finishing (a **trident**:
     dunks / layups / floaters-hooks-push), Perimeter D (incl. charges), Post D & Rebounding (e.g. **Get Low**).
     Trees mix passives and abilities differently.
- **Ultimates:** a **separate system**, unlocked by a **story event in the first season**, then evolved with
  milestone points (50-pt game, game-winner, triple-double…). Example unlock: "Generator Kid" plays 1s against a
  high-school rival who was better but never made it, gets cooked, cutscene, then picks an ult by position
  (guards: Luka-style step-back from the arc to deep 3, Ja-style free-throw-line dunk; bigs: chase-down block that
  locks onto the handler and blocks from behind, normally hard). Evolutions (e.g. step-back → step-through;
  faster chase-down). In the real game the ult panel is visible but **locked ("???")** to create curiosity.
- **Backstories (future):** choose one at creation. Examples from the owner:
  - *Lights on a generator*: grew up hustling → starter bonuses to hustle attributes.
  - *Child of an NBA player*: pressure to live up to the legacy → **Clutch Gene**.
  - *European player in a new environment*: struggles to connect with teammates → **Unicorn** trait (can take
    abilities from other positions, e.g. a center with a 3-ball ultimate).
- **Season content (future):** random in-season events and off-court story. Not a priority yet, but the
  architecture must allow it (it does: `src/career/story.ts`, effect system).
- **Leagues/rosters:** real 2026-27 NBA teams and players (owner's choice, committed to the public repo).
