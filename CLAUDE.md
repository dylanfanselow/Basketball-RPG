# Basketball-RPG (Hoop Career)

Browser 5v5 NBA career basketball RPG (TypeScript + Phaser 3 + Vite). Hoopland-style pixel art with taller players,
Dunk City Dynasty-style controls, Skyrim-style progression, earn-the-ball team basketball.

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

Commands: `npm run dev`, `npm test`, `npx tsc --noEmit`, `npm run build:single`.
After each change: test → commit → `git pull --rebase origin main` → push → rebuild + republish the browser link
(see WORKFLOW.md) → update the docs (STATUS/HISTORY/BACKLOG/DECISIONS) if anything changed.
