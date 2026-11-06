import { describe, it, expect } from 'vitest';
import { FURNITURE, DOORS, SPAWN, PLAYER_R, ROOM, solids, moveWithCollision, isFree, footprint, doorNear, wallL, wallR, newCat, catStep, CAT_R, CAT_SPOTS, CAT_HOP, SPOTS } from '../src/world/apartment';
import { actorDepthFt, pieceDepthFt } from '../src/world/apartment';
import { newCareer, migrateCareer, nextKeyGame, isKeyGame, addSkillXp, skillXpToNext, SKILL_MAX, takeOrbEnergy, ORB_ENERGY, ORB_XP, spendStatPoint, advanceDay, sleepPlan, addEnergy, ENERGY_ORB, gameDay } from '../src/career/career';

const polys = solids();
const inside = (poly: { x: number; y: number }[], p: { x: number; y: number }) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    if (c !== 0) { if (s === 0) s = c; else if (c !== s) return false; }
  }
  return true;
};

describe('apartment collision', () => {
  it('spawn and door spots are free', () => {
    expect(isFree(SPAWN, PLAYER_R, polys)).toBe(true);
    for (const d of DOORS) expect(isFree(d.spot, PLAYER_R, polys)).toBe(true);
  });

  it('walking straight at any solid piece from any side never gets inside it', () => {
    for (const piece of FURNITURE.filter((f) => f.solid)) {
      const poly = footprint(piece);
      const cx = poly.reduce((a, p) => a + p.x, 0) / poly.length, cy = poly.reduce((a, p) => a + p.y, 0) / poly.length;
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        let p = { x: cx + Math.cos(ang) * 8, y: cy + Math.sin(ang) * 8 };
        if (!isFree(p, PLAYER_R, polys)) continue;
        for (let i = 0; i < 300; i++) {
          const dx = cx - p.x, dy = cy - p.y, d = Math.hypot(dx, dy) || 1;
          p = moveWithCollision(p, { x: (dx / d) * 0.12, y: (dy / d) * 0.12 }, PLAYER_R, polys);
          expect(inside(poly, p)).toBe(false);
        }
        expect(isFree(p, PLAYER_R * 0.98, polys)).toBe(true);
      }
    }
  });

  it('slides along an edge when pushed diagonally into it', () => {
    // couch front edge: push down-left into it (moving up/back and left) -> x keeps changing, y holds
    const couch = FURNITURE.find((f) => f.id === 'couch')!;
    let p = { x: couch.x + 5, y: couch.y + couch.d + PLAYER_R + 0.05 };
    for (let i = 0; i < 20; i++) p = moveWithCollision(p, { x: -0.1, y: -0.1 }, PLAYER_R, polys);
    expect(p.x).toBeLessThan(couch.x + 5 - 1.5);
    expect(p.y).toBeGreaterThan(couch.y + couch.d + PLAYER_R - 0.02);
  });

  it('the walls hold (slanted sides, back wall, front edge)', () => {
    const tries = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: 1, y: 1 }];
    for (const dir of tries) {
      let p = { ...SPAWN };
      for (let i = 0; i < 400; i++) p = moveWithCollision(p, { x: dir.x * 0.15, y: dir.y * 0.15 }, PLAYER_R, polys);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(ROOM.depth);
      expect(p.x).toBeGreaterThan(wallL(p.y));
      expect(p.x).toBeLessThan(wallR(p.y));
    }
  });

  it('every door and cat spot can be reached from the spawn point', () => {
    const step = 0.25, seen = new Set<string>(), q = [{ i: Math.round(SPAWN.x / step), j: Math.round(SPAWN.y / step) }];
    const key = (i: number, j: number) => `${i},${j}`;
    seen.add(key(q[0].i, q[0].j));
    while (q.length) {
      const c = q.pop()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = c.i + di, j = c.j + dj, k = key(i, j);
        if (seen.has(k) || !isFree({ x: i * step, y: j * step }, PLAYER_R, polys)) continue;
        seen.add(k); q.push({ i, j });
      }
    }
    const reach = (p: { x: number; y: number }, r = 1) => [...seen].some((k) => { const [i, j] = k.split(',').map(Number); return Math.hypot(i * step - p.x, j * step - p.y) < r; });
    for (const d of DOORS) { expect(reach(d.spot)).toBe(true); expect(doorNear(d.spot)?.id).toBe(d.id); }
    for (const s of [...CAT_SPOTS, CAT_HOP]) expect(isFree(s, CAT_R, polys)).toBe(true);
    for (const s of Object.values(SPOTS)) { expect(isFree(s, PLAYER_R, polys)).toBe(true); expect(reach(s, 0.5)).toBe(true); }
    expect(doorNear(SPAWN)).toBeNull();
  });

  it('the cat lives on the couch, hops down to wander (never into furniture) and comes back', () => {
    const cat = newCat();
    expect(cat.perch).toBe(true);
    let r = 1; const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const visited = new Set<string>();
    let perches = 0, wasPerch = true;
    for (let t = 0; t < 900; t += 1 / 30) {
      catStep(cat, t, 1 / 30, polys, rand);
      if (!cat.perch && !cat.hop) expect(isFree(cat.p, CAT_R * 0.97, polys)).toBe(true);
      if (!cat.perch && !cat.hop && cat.state !== 'walk') visited.add(`${cat.p.x.toFixed(0)},${cat.p.y.toFixed(0)}`);
      if (cat.perch && !wasPerch) perches++;
      wasPerch = cat.perch;
    }
    expect(visited.size).toBeGreaterThan(1);
    expect(perches).toBeGreaterThan(0);
  });
});

describe('apartment draw order', () => {
  const P = (id: string) => FURNITURE.find((f) => f.id === id)!;
  it('furniture keeps a stable order: back chair under the table, counter under the peninsula', () => {
    expect(pieceDepthFt(P('chairBack'))).toBeLessThan(pieceDepthFt(P('diningTable')));
    expect(pieceDepthFt(P('counter'))).toBeLessThan(pieceDepthFt(P('island')));
  });
  it('a walker beside a long piece is drawn in front of it; behind a piece, it is drawn behind', () => {
    // only pieces whose picture could overlap the walker count (the scene checks real sprite rectangles)
    const near = (pos: { x: number; y: number }) => (p: (typeof FURNITURE)[number]) => p.x < pos.x + 2.5 && p.x + p.w > pos.x - 2.5;
    const depth = (pos: { x: number; y: number }) => actorDepthFt(pos, FURNITURE, near(pos));
    // left of the slanted bookshelf
    const shelf = P('bookshelf');
    const bySelf = { x: wallR(19) - 1.9 - PLAYER_R - 0.1, y: 19 };
    expect(isFree(bySelf, PLAYER_R, polys)).toBe(true);
    expect(depth(bySelf)).toBeGreaterThan(pieceDepthFt(shelf));
    // beside the peninsula, the dining table
    expect(depth({ x: 14.3, y: 7 })).toBeGreaterThan(pieceDepthFt(P('island')));
    const byTable = { x: 16.75, y: 21.05 };
    expect(isFree(byTable, PLAYER_R, polys)).toBe(true);
    expect(depth(byTable)).toBeGreaterThan(pieceDepthFt(P('diningTable')));
    // behind the back chair: under the chair and the table
    const behind = { x: 20.2, y: 15.0 };
    expect(isFree(behind, PLAYER_R, polys)).toBe(true);
    const d = depth(behind);
    expect(d).toBeLessThan(pieceDepthFt(P('chairBack')));
    expect(d).toBeLessThan(pieceDepthFt(P('diningTable')));
  });
});

describe('skill levels (round 41)', () => {
  it('new careers start every skill at 40 with no XP', () => {
    const c = newCareer('A', 'SG');
    expect(Object.keys(c.skills)).toEqual(['shooting', 'finishing', 'strength', 'mobility', 'playmaking']);
    for (const s of Object.values(c.skills)) expect(s).toEqual({ level: 40, xp: 0 });
  });
  it('skill XP levels up with carry-over and stops at the cap', () => {
    const c = newCareer('A', 'SG');
    expect(addSkillXp(c, 'strength', skillXpToNext(40) + 5)).toBe(1);
    expect(c.skills.strength).toEqual({ level: 41, xp: 5 });
    expect(c.skills.shooting.level).toBe(40);
    addSkillXp(c, 'mobility', 1e6);
    expect(c.skills.mobility).toEqual({ level: SKILL_MAX, xp: 0 });
  });
  it('round 42: skill levels are the real ratings, and higher levels need more orbs', () => {
    const c = newCareer('A', 'SG');
    expect(c.core.strength).toBe(40);
    addSkillXp(c, 'strength', skillXpToNext(40));
    expect(c.core.strength).toBe(41);
    spendStatPoint(c, 'shooting');
    expect(c.skills.shooting.level).toBe(c.core.shooting);
    const orbs = (lv: number) => Math.ceil(skillXpToNext(lv) / ORB_XP);
    expect(orbs(40)).toBeLessThan(orbs(60)); expect(orbs(60)).toBeLessThan(orbs(90));
  });
  it('round 42: each orb costs energy; none when too tired', () => {
    const c = newCareer('A', 'SG');
    c.life.energy = ORB_ENERGY + 1;
    expect(takeOrbEnergy(c)).toBe(true); expect(c.life.energy).toBe(1);
    expect(takeOrbEnergy(c)).toBe(false); expect(c.life.energy).toBe(1);
  });
  it('v3 saves migrate to v4 with skills', () => {
    const old: any = { ...newCareer('Old', 'PG'), version: 3 };
    delete old.skills;
    const m = migrateCareer(old)!;
    expect(m.version).toBe(4);
    expect(m.skills.playmaking).toEqual({ level: m.core.playmaking, xp: 0 }); // the cards show the save's ratings
  });
});

describe('round 43: sleep + calendar', () => {
  it('each night counts the key game down by one, to today (0)', () => {
    const c = newCareer('A', 'SG', 'LAL');
    c.season.gameNo = 1;
    const k = nextKeyGame(c)!, start = k.daysAway;
    advanceDay(c);
    expect(nextKeyGame(c)!.daysAway).toBe(start - 1);
    for (let i = 0; i < 40; i++) advanceDay(c);
    expect(nextKeyGame(c)!.daysAway).toBe(0);
    expect(c.life.day).toBe(42);
  });
  it('sleep sends enough energy orbs to refill the bar, capped at 100', () => {
    const c = newCareer('A', 'SG');
    c.life.energy = 33;
    expect(sleepPlan(c)).toBe(Math.ceil(67 / ENERGY_ORB));
    for (let i = sleepPlan(c); i > 0; i--) addEnergy(c, ENERGY_ORB);
    expect(c.life.energy).toBe(100);
    c.life.energy = 100; expect(sleepPlan(c)).toBe(0);
  });
});

describe('career life + key games', () => {
  it('new careers have a life block; v2 saves migrate to v3', () => {
    const c = newCareer('A', 'SG');
    expect(c.life).toEqual({ day: 1, money: 250, energy: 100, food: 100 });
    const old: any = { ...newCareer('Old', 'PG'), version: 2 };
    delete old.life;
    const m = migrateCareer(old)!;
    expect(m.version).toBe(4);
    expect(m.life.energy).toBe(100);
  });
  it('the next key game is the opener first, then a later one after it is played', () => {
    const c = newCareer('A', 'SG', 'LAL');
    const k = nextKeyGame(c)!;
    expect(k.index).toBe(0);
    expect(k.daysAway).toBe(1);
    c.season.gameNo = 1; c.life.day = 2;
    const k2 = nextKeyGame(c)!;
    expect(k2.index).toBeGreaterThan(0);
    expect(k2.daysAway).toBe(gameDay(k2.index) - 2);
    expect(isKeyGame(c, k2.index)).toBeTruthy();
  });
});
