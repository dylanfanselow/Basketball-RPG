/**
 * Round 84 (owner): "Burger Barn", the fast-food place you work the register at during the week after the scrimmage.
 * An original place (our own name and barn logo, red and yellow): seen from the customer's side of the counter, so you
 * stand behind it facing us. Drawn on a 640 x 360 pixel canvas (scaled up nearest), the counter on its own layer so it
 * goes in front of you.
 */
import { canvas, hn } from './roomArt';

export const BURGER_W = 640, BURGER_H = 360;
type C = CanvasRenderingContext2D;
const R = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const TXT = (c: C, s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'center') => {
  c.font = `bold ${size}px Arial, sans-serif`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y);
};

/** The barn logo: a red barn front (gambrel roof), a yellow X door, the name under it. */
function logo(c: C, x: number, y: number, s: number) {
  const red = '#c62a1e', dark = '#8e1a12', yel = '#ffcc2e';
  c.fillStyle = red; c.beginPath();
  c.moveTo(x - 16 * s, y + 10 * s); c.lineTo(x - 16 * s, y - 2 * s); c.lineTo(x - 10 * s, y - 10 * s); c.lineTo(x, y - 14 * s);
  c.lineTo(x + 10 * s, y - 10 * s); c.lineTo(x + 16 * s, y - 2 * s); c.lineTo(x + 16 * s, y + 10 * s); c.closePath(); c.fill();
  R(c, x - 6 * s, y, 12 * s, 10 * s, dark);
  c.strokeStyle = yel; c.lineWidth = 1.5 * s; c.beginPath();
  c.moveTo(x - 6 * s, y); c.lineTo(x + 6 * s, y + 10 * s); c.moveTo(x + 6 * s, y); c.lineTo(x - 6 * s, y + 10 * s); c.stroke();
  c.strokeRect(x - 6 * s, y, 12 * s, 10 * s);
}

/** The back of the restaurant: wall, menu boards, the sign, fryers, the drink machine, the floor. */
export function drawBurgerBack(): HTMLCanvasElement {
  const cv = canvas(BURGER_W, BURGER_H), c = cv.getContext('2d')!;
  // wall: warm tile, a red stripe
  for (let y = 0; y < 250; y++) for (let x = 0; x < BURGER_W; x++) {
    const tile = (x % 16 === 0 || y % 16 === 0) ? '#d8c9a8' : hn(x >> 4, y >> 4, 3) < 0.5 ? '#efe2c4' : '#f3e8cd';
    c.fillStyle = tile; c.fillRect(x, y, 1, 1);
  }
  R(c, 0, 150, BURGER_W, 10, '#c62a1e'); R(c, 0, 160, BURGER_W, 3, '#ffcc2e');
  // the sign: the barn and the name
  R(c, 220, 8, 200, 40, '#2a1712'); R(c, 222, 10, 196, 36, '#3a2018');
  logo(c, 250, 30, 1.1);
  TXT(c, 'BURGER BARN', 340, 29, 18, '#ffcc2e');
  // three menu boards (lit), burgers, fries, drinks with prices
  const board = (x: number, title: string, items: [string, string][], icon: (cx: number, cy: number) => void) => {
    R(c, x - 2, 56, 164, 86, '#151515'); R(c, x, 58, 160, 82, '#22201e');
    R(c, x, 58, 160, 16, '#c62a1e'); TXT(c, title, x + 80, 66, 10, '#ffffff');
    icon(x + 28, 104);
    items.forEach(([n, p], i) => { TXT(c, n, x + 56, 86 + i * 15, 9, '#f3e8cd', 'left'); TXT(c, p, x + 154, 86 + i * 15, 9, '#ffcc2e', 'right'); });
  };
  const burger = (cx: number, cy: number) => {
    c.fillStyle = '#d9962f'; c.beginPath(); c.ellipse(cx, cy - 6, 16, 9, 0, Math.PI, 0); c.fill();
    R(c, cx - 16, cy - 6, 32, 3, '#5aa83a'); R(c, cx - 16, cy - 3, 32, 5, '#6b3a1e'); R(c, cx - 15, cy + 2, 30, 4, '#d9962f');
  };
  const fries = (cx: number, cy: number) => {
    for (let i = -3; i <= 3; i++) R(c, cx + i * 3 - 1, cy - 16 + Math.abs(i) * 2, 2, 12, '#ffd34a');
    c.fillStyle = '#c62a1e'; c.beginPath(); c.moveTo(cx - 12, cy - 6); c.lineTo(cx + 12, cy - 6); c.lineTo(cx + 9, cy + 12); c.lineTo(cx - 9, cy + 12); c.fill();
    logo(c, cx, cy + 3, 0.35);
  };
  const cup = (cx: number, cy: number) => {
    c.fillStyle = '#f3f3f3'; c.beginPath(); c.moveTo(cx - 10, cy - 14); c.lineTo(cx + 10, cy - 14); c.lineTo(cx + 7, cy + 14); c.lineTo(cx - 7, cy + 14); c.fill();
    R(c, cx - 9, cy - 4, 18, 6, '#c62a1e'); R(c, cx - 11, cy - 17, 22, 3, '#d8d8d8'); R(c, cx + 3, cy - 26, 2, 10, '#ffcc2e');
  };
  board(36, 'BURGERS', [['Barn Burger', '$3.49'], ['Double Barn', '$4.99'], ['Silo Stack', '$5.79']], burger);
  board(240, 'COMBOS', [['#1 Barn Meal', '$6.99'], ['#2 Double Meal', '$8.49'], ['#3 Chicken Coop', '$7.29']], fries);
  board(444, 'DRINKS', [['Small', '$1.29'], ['Medium', '$1.69'], ['Large', '$1.99']], cup);
  // fryers (left) and the drink machine (right), behind the counter
  for (const x of [40, 96]) {
    R(c, x, 176, 50, 74, '#9aa2a6'); R(c, x + 2, 178, 46, 8, '#c9cfd4'); R(c, x + 6, 188, 38, 20, '#3a2a14');
    for (let i = 0; i < 6; i++) R(c, x + 8 + i * 6, 190 + (i % 2) * 2, 3, 14, '#e8b22e');
    R(c, x + 20, 168, 10, 10, '#5a6068');
  }
  R(c, 520, 172, 84, 78, '#2a2d33'); R(c, 524, 176, 76, 30, '#c62a1e'); TXT(c, 'FOUNTAIN', 562, 191, 9, '#ffffff');
  for (let i = 0; i < 4; i++) { R(c, 530 + i * 18, 212, 12, 16, ['#3b2416', '#e8e2d0', '#ff8a2e', '#7ad04a'][i]); R(c, 534 + i * 18, 228, 4, 6, '#9aa2a6'); }
  // the heat-lamp shelf with wrapped burgers (back middle)
  R(c, 250, 176, 140, 6, '#5a6068'); for (let i = 0; i < 4; i++) { R(c, 262 + i * 32, 166, 4, 10, '#5a6068'); R(c, 254 + i * 32, 162, 20, 5, '#ff9a3a'); }
  for (let i = 0; i < 6; i++) R(c, 258 + i * 21, 184, 16, 9, i % 2 ? '#ffcc2e' : '#f3e8cd');
  // floor (behind the counter, barely seen) and the shadow line
  R(c, 0, 250, BURGER_W, 110, '#b8a58a');
  for (let x = 0; x < BURGER_W; x += 20) R(c, x, 250, 1, 110, '#a8957a');
  return cv;
}

/** The counter in front of you (its own layer, in front of the player): the top, the front panel, the register. */
export function drawBurgerCounter(): HTMLCanvasElement {
  const cv = canvas(BURGER_W, BURGER_H), c = cv.getContext('2d')!;
  R(c, 0, 262, BURGER_W, 8, '#e8e2d6'); R(c, 0, 270, BURGER_W, 2, '#bfb6a6');            // the counter top
  R(c, 0, 272, BURGER_W, 88, '#c62a1e');                                                    // the front panel
  for (let x = 0; x < BURGER_W; x += 40) R(c, x, 272, 2, 88, '#a8231a');
  R(c, 0, 300, BURGER_W, 4, '#ffcc2e');
  logo(c, 320, 330, 1.2);
  // the register on the counter (its screen toward you, a little to the right of where you stand)
  R(c, 336, 236, 58, 28, '#2a2d33'); R(c, 340, 240, 50, 14, '#1d3a2a'); TXT(c, '$6.99', 365, 247, 8, '#7dff9a');
  R(c, 342, 256, 46, 6, '#4a4f58'); R(c, 330, 262, 70, 4, '#3a3d42');
  // a tray with a meal at the left end of the counter
  R(c, 186, 258, 54, 6, '#8a5a2a'); R(c, 192, 250, 14, 8, '#ffcc2e'); R(c, 212, 246, 10, 12, '#f3f3f3'); R(c, 226, 250, 10, 8, '#c62a1e');
  return cv;
}
