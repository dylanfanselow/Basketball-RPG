/**
 * Courtside celebrities: generic flamboyant front-row fans (no real people) between the benches and the
 * scorer's table. Fur coats, loud suits, sequined dresses, wide-brim hats, shades, chains, big hair, a phone up
 * filming. Front-view sprites in the same shaded style as the players.
 */
import { crispen, frontHead, frontChair, shade, tint, ART } from './sprites';
import { Appearance, randomAppearance, SKIN_TONES } from './appearance';

export const CELEB_W = 48, CELEB_H = 120;
/** 0 seated, 1 standing + arms up, 2 seated filming with a phone, 3 seated hands to face (shock) */
export const CELEB_FRAMES = 4;

export interface CelebLook {
  a: Appearance;
  outfit: 'fur' | 'suit' | 'dress' | 'tracksuit' | 'leather' | 'tee' | 'hoodie';
  color: string; accent: string;
  hat: 'none' | 'brim' | 'beanie' | 'cap';
  hatColor: string;
  shades: string | null;
  chain: boolean;
  longHair: string | null;
  /** chair color (default: plush red courtside seat) */
  seat?: string;
  /** plain fans: which side they root for (their shirt says so) */
  side?: 'home' | 'away' | 'neutral';
}

const LOUD = ['#ff4fa3', '#ffd400', '#00c2ff', '#7a3fd0', '#ff7a00', '#e8e8e8', '#111111', '#c0002b', '#00a86b', '#b8860b'];

/** A seeded celebrity look. rnd() returns [0,1). */
export function randomCeleb(rnd: () => number): CelebLook {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const a = randomAppearance(rnd);
  Object.assign(a, { headband: null, goggles: false, mask: false, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false });
  const long = rnd() < 0.45;
  if (long) a.facial = 'none';
  a.hair = pick(['afro', 'curly', 'bald', 'fade', 'waves', 'twists', 'buzz', 'hightop'] as const);
  a.hairColor = pick(['#141010', '#2b1d14', '#e8d08a', '#ff7ac8', '#dcdcdc', '#7a5230', '#ff3b2f', '#3fa9ff']);
  return {
    a,
    outfit: pick(['fur', 'fur', 'suit', 'suit', 'dress', 'tracksuit', 'leather'] as const),
    color: pick(LOUD), accent: pick(LOUD),
    hat: pick(['none', 'none', 'brim', 'beanie', 'cap'] as const), hatColor: pick(LOUD),
    shades: rnd() < 0.6 ? pick(['#111111', '#2a1a4a', '#8a5a00', '#c03060']) : null,
    chain: rnd() < 0.5,
    longHair: long ? a.hairColor : null,
  };
}

const NEUTRAL = ['#2a3550', '#585d68', '#1c1c22', '#5a4636', '#d4d4d4', '#6a2a32', '#3a5a80', '#7a6a58', '#33333d'];
const NATURAL_HAIR = ['#141010', '#141010', '#2b1d14', '#4a3020', '#7a5230', '#b88a4a', '#9a9a9a'];

/**
 * A plain fan for the row behind the sideline: tees, hoodies and team jackets, nothing flashy. Shirts follow the
 * home team: some fans wear its colors in a regular game, nearly everyone does in a big game (playoffs).
 */
export function randomFan(rnd: () => number, home: string[], away: string, bigGame: boolean): CelebLook {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const a = randomAppearance(rnd);
  Object.assign(a, { headband: null, goggles: false, mask: false, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false });
  a.hair = pick(['curly', 'bald', 'fade', 'waves', 'buzz', 'buzz', 'fade', 'twists'] as const);
  a.hairColor = pick(NATURAL_HAIR);
  const long = rnd() < 0.22;
  if (long) a.facial = 'none';
  const r = rnd();
  const homeShare = bigGame ? 0.85 : 0.35, awayShare = bigGame ? 0.04 : 0.08;
  const side = r < homeShare ? 'home' : r < homeShare + awayShare ? 'away' : 'neutral';
  const h1 = home[1] ?? home[0];
  const color = side === 'home' ? (rnd() < (bigGame ? 0.85 : 0.6) ? home[0] : h1) : side === 'away' ? away : pick(NEUTRAL);
  const accent = side === 'home' ? (color === home[0] ? h1 : home[0]) : pick(NEUTRAL);
  return {
    a,
    outfit: pick(['tee', 'tee', 'hoodie', 'hoodie', 'tracksuit'] as const),
    color: shade(color, 0.9), accent: shade(accent, 0.9),
    hat: rnd() < 0.16 ? 'cap' : 'none', hatColor: side === 'home' ? home[0] : pick(NEUTRAL),
    shades: rnd() < 0.05 ? '#111111' : null,
    chain: false,
    longHair: long ? a.hairColor : null,
    seat: '#2a2f45',
    side,
  };
}

type Ctx = CanvasRenderingContext2D;
const ell = (ctx: Ctx, x: number, y: number, rx: number, ry: number, c: string | CanvasGradient) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); ctx.fill(); };
const poly = (ctx: Ctx, pts: [number, number][], c: string | CanvasGradient) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); };
const line = (ctx: Ctx, pts: [number, number][], w: number, c: string) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke(); };

function drawCeleb(ctx: Ctx, ox: number, c: CelebLook, frame: number) {
  const k = ART / 1.5; // art scale (1 at 1.5x)
  const L = (n: number) => n * k;
  const cx = ox + CELEB_W / 2, floor = CELEB_H - 3;
  const standing = frame === 1;
  const [skin] = SKIN_TONES[c.a.skin % SKIN_TONES.length];
  if (!standing) frontChair(ctx, cx, floor, floor - L(25), floor - L(60), c.seat ?? '#b01c34', k); // plush courtside seat (or a plain arena seat)
  const col = c.color, hi = tint(col, 0.3), sh = shade(col, 0.7), dk = shade(col, 0.5);
  // legs + shoes (dress: bare legs with heels; otherwise trousers)
  const shinTop = standing ? floor - L(38) : floor - L(21);
  const plain = c.outfit === 'tee' || c.outfit === 'hoodie';
  const legCol = c.outfit === 'dress' ? skin : c.outfit === 'suit' ? col : c.outfit === 'tracksuit' ? col : plain ? '#2c3a58' : '#1a1a22'; // plain fans wear jeans
  for (const s of [-1, 1]) {
    const lx = cx + s * L(4);
    line(ctx, [[lx, shinTop], [lx, floor - L(3)]], L(5), legCol);
    poly(ctx, [[lx - L(3), floor - L(3.5)], [lx + L(3.2), floor - L(3.5)], [lx + L(3.6), floor], [lx - L(3.2), floor]], c.outfit === 'dress' ? c.accent : '#101010');
  }
  // seat / lap
  const hipY = standing ? shinTop - L(22) : shinTop - L(7);
  const lap = c.outfit === 'dress' ? col : legCol;
  poly(ctx, [[cx - L(10), hipY], [cx + L(10), hipY], [cx + L(9.5), shinTop + 1], [cx - L(9.5), shinTop + 1]], lap);
  // torso / outfit
  const shY = hipY - L(28);
  const g = ctx.createLinearGradient(cx - L(12), shY, cx + L(12), hipY);
  g.addColorStop(0, hi); g.addColorStop(0.4, col); g.addColorStop(1, sh);
  const wide = c.outfit === 'fur' ? 3 : 0;
  poly(ctx, [[cx - L(8 + wide), shY], [cx + L(8 + wide), shY], [cx + L(11.5 + wide), shY + L(4)], [cx + L(11 + wide), hipY + L(c.outfit === 'fur' ? 4 : 0)], [cx - L(11 + wide), hipY + L(c.outfit === 'fur' ? 4 : 0)], [cx - L(11.5 + wide), shY + L(4)]], g);
  if (c.outfit === 'fur') {
    // shaggy texture: little tufts along the edges and down the front
    for (let i = 0; i < 26; i++) {
      const t = i / 25, y = shY + (hipY - shY) * t;
      ell(ctx, cx - L(11.5 + wide) + ((i * 7) % 3), y, L(1.8), L(1.4), i % 2 ? hi : col);
      ell(ctx, cx + L(11.5 + wide) - ((i * 5) % 3), y, L(1.8), L(1.4), i % 2 ? col : sh);
    }
    poly(ctx, [[cx - L(3), shY], [cx + L(3), shY], [cx + L(2), hipY], [cx - L(2), hipY]], c.accent); // top underneath
  } else if (c.outfit === 'suit' || c.outfit === 'leather') {
    poly(ctx, [[cx - L(3.5), shY], [cx + L(3.5), shY], [cx, shY + L(16)]], c.outfit === 'suit' ? '#f4f4f4' : c.accent);
    line(ctx, [[cx - L(3.5), shY], [cx - L(1), shY + L(16)]], L(1.6), dk); line(ctx, [[cx + L(3.5), shY], [cx + L(1), shY + L(16)]], L(1.6), dk);
    if (c.outfit === 'leather') for (let i = 0; i < 4; i++) ell(ctx, cx + L(-7 + i * 4.5), shY + L(6 + (i % 2) * 3), L(1.2), L(0.8), tint(col, 0.6)); // shine
  } else if (c.outfit === 'dress') {
    for (let i = 0; i < 18; i++) ell(ctx, cx + L(((i * 37) % 19) - 9), shY + L(3 + ((i * 13) % 24)), L(0.6), L(0.6), '#ffffff'); // sequins
    poly(ctx, [[cx - L(4), shY], [cx + L(4), shY], [cx, shY + L(6)]], skin);
  } else if (c.outfit === 'tee') {
    line(ctx, [[cx - L(3.5), shY + L(0.5)], [cx, shY + L(2.5)], [cx + L(3.5), shY + L(0.5)]], L(1.4), dk); // crew neck
    poly(ctx, [[cx - L(4), shY + L(7)], [cx + L(4), shY + L(7)], [cx + L(4), shY + L(12)], [cx - L(4), shY + L(12)]], c.accent); // chest print
  } else if (c.outfit === 'hoodie') {
    ell(ctx, cx, shY + L(1), L(7), L(3), sh); // hood bunched around the neck
    line(ctx, [[cx - L(1.5), shY + L(2)], [cx - L(1.8), shY + L(8)]], L(0.8), tint(col, 0.5)); line(ctx, [[cx + L(1.5), shY + L(2)], [cx + L(1.8), shY + L(8)]], L(0.8), tint(col, 0.5)); // drawstrings
    poly(ctx, [[cx - L(6), hipY - L(9)], [cx + L(6), hipY - L(9)], [cx + L(7), hipY - L(2)], [cx - L(7), hipY - L(2)]], sh); // front pocket
  } else {
    line(ctx, [[cx - L(10), shY + L(6)], [cx - L(10), hipY]], L(1.6), c.accent); line(ctx, [[cx + L(10), shY + L(6)], [cx + L(10), hipY]], L(1.6), c.accent);
    line(ctx, [[cx, shY + L(1)], [cx, hipY]], L(1), dk);
  }
  if (c.chain) line(ctx, [[cx - L(4), shY + L(1)], [cx, shY + L(9)], [cx + L(4), shY + L(1)]], L(1.2), '#ffd84a');
  // arms
  const sleeve = c.outfit === 'dress' ? skin : col;
  for (const s of [-1, 1]) {
    const sh0: [number, number] = [cx + s * L(10 + wide * 0.5), shY + L(3)];
    let el: [number, number], hand: [number, number];
    if (frame === 1) { el = [sh0[0] + s * L(5), shY - L(6)]; hand = [sh0[0] + s * L(4), shY - L(18)]; }
    else if (frame === 2 && s === 1) { el = [sh0[0] + L(3), shY + L(10)]; hand = [cx + L(4), shY - L(2)]; }
    else if (frame === 3) { el = [sh0[0] + s * L(2), shY + L(12)]; hand = [cx + s * L(2.5), shY - L(9)]; }
    else { el = [sh0[0] + s * L(2), shY + L(15)]; hand = [sh0[0] - s * L(1), hipY + L(3)]; }
    // a tee leaves the forearm and most of the upper arm bare under a short sleeve
    line(ctx, [sh0, el], L(c.outfit === 'fur' ? 7 : 5), c.outfit === 'tee' ? skin : sleeve);
    if (c.outfit === 'tee') line(ctx, [sh0, [sh0[0] + (el[0] - sh0[0]) * 0.45, sh0[1] + (el[1] - sh0[1]) * 0.45]], L(6), sleeve);
    line(ctx, [el, hand], L(c.outfit === 'fur' ? 6 : 4.4), c.outfit === 'tee' ? skin : sleeve);
    ell(ctx, hand[0], hand[1], L(2.2), L(2.2), skin);
    if (frame === 2 && s === 1) { poly(ctx, [[hand[0] - L(2.5), hand[1] - L(5)], [hand[0] + L(2.5), hand[1] - L(5)], [hand[0] + L(2.5), hand[1] + L(1)], [hand[0] - L(2.5), hand[1] + L(1)]], '#151515'); ell(ctx, hand[0] - L(1), hand[1] - L(4), L(0.7), L(0.7), '#9fe6ff'); }
  }
  // long hair behind the head
  const hy = shY - L(12);
  if (c.longHair) poly(ctx, [[cx - L(8.5), hy - L(5)], [cx + L(8.5), hy - L(5)], [cx + L(10), shY + L(8)], [cx - L(10), shY + L(8)]], shade(c.longHair, 0.85));
  line(ctx, [[cx, shY + L(1)], [cx, shY - L(5)]], L(6), shade(skin, 0.9)); // neck
  frontHead(ctx, cx, hy, c.a, k, { open: frame === 1, shades: frame === 3 ? null : c.shades });
  if (c.longHair) { poly(ctx, [[cx - L(8), hy - L(4)], [cx + L(8), hy - L(4)], [cx + L(7.5), hy - L(8)], [cx, hy - L(10.5)], [cx - L(7.5), hy - L(8)]], c.longHair); line(ctx, [[cx - L(8), hy - L(3)], [cx - L(9), hy + L(10)]], L(2.4), c.longHair); line(ctx, [[cx + L(8), hy - L(3)], [cx + L(9), hy + L(10)]], L(2.4), c.longHair); }
  // hats
  if (c.hat === 'brim') { ell(ctx, cx, hy - L(7), L(14), L(2.6), shade(c.hatColor, 0.8)); poly(ctx, [[cx - L(7), hy - L(7)], [cx + L(7), hy - L(7)], [cx + L(6), hy - L(15)], [cx - L(6), hy - L(15)]], c.hatColor); line(ctx, [[cx - L(7), hy - L(8.5)], [cx + L(7), hy - L(8.5)]], L(1.4), c.accent); }
  if (c.hat === 'beanie') { poly(ctx, [[cx - L(8), hy - L(4)], [cx + L(8), hy - L(4)], [cx + L(7), hy - L(11)], [cx, hy - L(13)], [cx - L(7), hy - L(11)]], c.hatColor); ell(ctx, cx, hy - L(13.5), L(2.2), L(2), c.accent); }
  if (c.hat === 'cap') { poly(ctx, [[cx - L(8), hy - L(5)], [cx + L(8), hy - L(5)], [cx + L(7), hy - L(11)], [cx - L(7), hy - L(11)]], c.hatColor); ell(ctx, cx, hy - L(4.5), L(9), L(1.6), shade(c.hatColor, 0.75)); }
}

/** Sheet with CELEB_FRAMES front-view frames side by side. */
export function buildCelebSheet(c: CelebLook): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CELEB_W * CELEB_FRAMES; cv.height = CELEB_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  for (let f = 0; f < CELEB_FRAMES; f++) { ctx.save(); ctx.beginPath(); ctx.rect(f * CELEB_W, 0, CELEB_W, CELEB_H); ctx.clip(); drawCeleb(ctx, f * CELEB_W, c, f); ctx.restore(); }
  crispen(cv);
  return cv;
}
