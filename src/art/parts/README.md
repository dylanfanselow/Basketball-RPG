# Hand-drawn face parts

`<type>/<variant>_<view>.png`, one picture per face part, per view. Types: `hair` (over the skull), `hairBack`
(behind it: afro volume, dreads…), `beard`, `brows`, `eyes`, `nose`, `mouth`. Views: `side` (profile, also used
for the back of the head) and `front` (front and three-quarter). 44×44, centered on the head center.

Draw in **grays**: hair / hairBack / beard / brows take each player's hair color, nose / mouth the skin tone (by
brightness; any tint you add is kept). In eyes, pure green `#00ff00` becomes the eye color. Near-white stays white.

**Eyes** are plotted pixel by pixel (never stretched), mirrored around the head center, so draw them symmetric like
the celebs: front `W I · · · · I W` (white outside, iris inside), profile with both irises in front of their whites.
The tests check every `eyes/*_front.png` is mirrored with the irises inside.

Made with the pixel editor (dev panel → **Pixel editor: face parts**, or open the game with `?editor=parts`).
Built-in variants (afro, goatee, wide…) were exported from the original drawing code; **＋ New variant** makes
`hair_1`, `beard_2`… Give players parts in the dev panel's **NBA player looks** and **Save look to rosters.json**.
