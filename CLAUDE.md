# Basketball-RPG (Hoop Career)

Browser 5v5 NBA career basketball RPG (TypeScript + Phaser 3 + Vite). 90s arcade-style shaded players (the owner's
reference image) rendered at 1920×1080 with the original framing, Dunk City Dynasty-style controls, Skyrim-style
progression, earn-the-ball team basketball. Modes: Practice, Quick 5v5, 1v1 Make It Take It, Career.

**Before changing anything, read `docs/` — start with `docs/README.md`.** Especially:
- `docs/DECISIONS.md`: choices the owner already made (don't re-ask).
- `docs/STATUS.md` + `docs/ARCHITECTURE.md`: what exists and where.
- `docs/WORKFLOW.md`: build/test/publish routine, browser link, gotchas.
- `docs/BACKLOG.md`: open work.

Key rules from the owner:
- Gameplay feel comes first; dev tools must make testing fast.
- You control only your player; teammates pass based on trust/openness, never on demand.
- PlayStation button labels. No shot meter (cone + full equation on screen).
- Real 2026-27 rosters are intentionally committed.
- L1 = escape/back everywhere; L2 (hold) = icon pass; everyone can Step-Through (fake → stick to rim + ✕).

Code rules that bite (details in WORKFLOW.md "Gotchas"):
- The canvas is 1920×1080 but scenes lay out in **1280×720 units**: every scene calls `hiRes(this)` first in `create()`.
- Player sprite sheets are built **asynchronously in Web Workers** (`render/sheetPool.ts`); `GameScene.sheetFor`
  returns null until ready. Sheet drawing must work on an OffscreenCanvas (no `document`).
- `src/sim/**` stays Phaser-free and must not import `src/state.ts` (touches `window`).

Commands: `npm run dev`, `npm test`, `npx tsc --noEmit`, `npm run build:single`.
After each change: test → commit → `git pull --rebase origin main` → push → rebuild + republish the browser link
(see WORKFLOW.md) → update the docs (STATUS/HISTORY/BACKLOG/DECISIONS) if anything changed.
