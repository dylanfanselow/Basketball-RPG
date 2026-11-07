import { describe, it, expect } from 'vitest';
import { createCareer, migrateCareer, newCareer, STARTER_CORE, storyKeyGame, nextKeyGame } from '../src/career/career';
import { defaultAppearance } from '../src/render/appearance';
import { newStory, buildTutorial, buildOnes, buildBigGame, complementPos, avgSpread, rivalPlayer, RIVAL_ID, LOCKED_IN } from '../src/sim/story';
import { TutorialDirector } from '../src/sim/tutorial';
import { GameSim, UserInput, emptyInput } from '../src/sim/game';
import { add, dist, norm, scale, sub, v } from '../src/sim/math';
import type { Position } from '../src/sim/attributes';

function career(pos: Position) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos, heightIn: 76, appearance: defaultAppearance() });
  let s = 42; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.story = newStory(c, rnd);
  return c;
}

/** A bot that does what each tutorial prompt asks. */
function botInput(sim: GameSim, d: TutorialDirector, t: number): UserInput {
  const inp = emptyInput();
  const me = sim.user!, L = d.lesson;
  if (!L || !sim.live) return inp;
  const rim = sim.rim(0), toRim = norm(sub(rim, me.p));
  const hasBall = sim.holder() === me;
  const mate = sim.teams[0].onCourt.find((p) => p !== me)!;
  const pulse = Math.floor(t * 30) % 12 === 0; // an edge every 0.4 s
  const hold = (dir = v()) => { inp.move = dir; inp.aHeld = true; inp.a = Math.floor(t * 30) % 30 === 0; };
  switch (L.id) {
    case 'move': inp.move = v(d.step === 0 ? 1 : -1, 0.3); inp.sprint = d.step === 1 && pulse; break;
    case 'shoot': if (hasBall) hold(); break;
    case 'pass':
      if (d.step === 0 && hasBall) { inp.move = norm(sub(mate.p, me.p)); inp.y = pulse; inp.yHeld = false; }
      if (d.step >= 1 && !hasBall) inp.y = pulse;
      break;
    case 'dribble':
      if (!hasBall) break;
      if (d.step === 0) { inp.move = v(-toRim.y, toRim.x); inp.b = pulse; inp.bHeld = inp.b; }
      else if (dist(me.p, rim) > 6) inp.move = toRim; else hold(toRim);
      break;
    case 'post':
      if (!hasBall) break;
      inp.postHeld = true;
      inp.move = scale(toRim, 0.6);
      if (d.step === 1 && me.post && sim.time - me.post.since > 0.6) hold(v(-toRim.y, toRim.x)); // hold ✕ in the post: a post shot
      break;
    case 'step':
      if (!hasBall) break;
      if (d.step === 0) { inp.a = pulse; inp.aHeld = false; }
      else { inp.move = toRim; inp.a = pulse; inp.aHeld = true; }
      break;
    case 'icon': if (hasBall) { inp.iconHeld = true; inp.a = pulse; } break;
    case 'screen': {
      const other = sim.teams[1].onCourt.find((p) => p.guarding === mate.id);
      if (other) { inp.move = norm(sub(other.p, me.p)); inp.b = dist(me.p, other.p) < 3.5 && pulse; inp.bHeld = inp.b; }
      break;
    }
    case 'play': {
      const a = sim.userAssignment();
      if (hasBall) hold(toRim);
      else if (a) { const to = sub(a.pos, me.p); inp.move = dist(a.pos, me.p) > 0.8 ? norm(to) : v(); inp.b = a.act === 'screen' && dist(a.pos, me.p) < 2.5 && pulse; inp.bHeld = inp.b; }
      break;
    }
    case 'defense': break; // he goes by you
  }
  return inp;
}

describe('round 60 story', () => {
  it('complementary positions and Kingston’s ratings', () => {
    expect(complementPos('PG')).toBe('C');
    expect(complementPos('SG')).toBe('C');
    for (const p of ['SF', 'PF', 'C'] as Position[]) expect(complementPos(p)).toBe('PG');
    const c = career('SG');
    expect(c.story!.rival!.pos).toBe('SG');
    expect(c.story!.rival!.first).toBe('Kingston');
    const tut = rivalPlayer(c, 'tutorial'), ones = rivalPlayer(c, 'ones');
    const mine = avgSpread('SG');
    for (const s of Object.keys(mine) as (keyof typeof mine)[]) expect(tut.core[s]).toBe(mine[s] + 6);
    expect(ones.core.shooting).toBe(99); expect(ones.core.finishing).toBe(99);
    expect(ones.core.mobility).toBe(99); expect(ones.core.playmaking).toBe(99);
    expect(ones.core.strength).toBe(tut.core.strength);
    // career stats untouched (still the builder's starter spread)
    expect(c.core.shooting).toBe(STARTER_CORE.SG.shooting);
  });

  it('2v2 is guard + big (roles 1 / 5), Kingston guards you', () => {
    const sim = buildTutorial(career('PG'), 3);
    const d = new TutorialDirector(sim); sim.director = d;
    expect(sim.teams[0].onCourt.map((p) => p.role).sort()).toEqual(['1', '5']);
    expect(sim.teams[1].onCourt.length).toBe(2);
    while (d.blocking) d.nextLine();
    sim.update(1 / 30, emptyInput());
    expect(sim.players.find((p) => p.id === RIVAL_ID)!.guarding).toBe(sim.user!.id);
  });

  for (const pos of ['PG', 'C'] as Position[]) it(`the tutorial plays through every lesson (${pos}) and every shot falls`, () => {
    const sim = buildTutorial(career(pos), 11);
    const d = new TutorialDirector(sim); sim.director = d;
    const dt = 1 / 30;
    const seen: string[] = [];
    let t = 0, lessonT = 0, last = '';
    const shots: { made: boolean; pct: number }[] = [];
    let lastShot = sim.lastShot;
    while (!d.finished && t < 900) {
      if (d.blocking) { d.nextLine(); continue; }
      if (d.lesson && d.lesson.id !== last) { last = d.lesson.id; seen.push(last); lessonT = 0; }
      sim.update(dt, botInput(sim, d, t)); t += dt; lessonT += dt;
      if (sim.lastShot !== lastShot && sim.lastShot && !sim.lastShot.blocked) { shots.push({ made: sim.lastShot.made, pct: sim.lastShot.ev.pct }); lastShot = sim.lastShot; }
      if (lessonT > 90) { if ((globalThis as any).process?.env?.DBG) console.log(sim.events.filter((e) => e.t > sim.time - 90 && /post|gather|tutorial|score|move/.test(e.kind)).slice(0, 40).map((e) => `${e.t.toFixed(1)} ${e.kind} ${e.pid} ${e.text} ${JSON.stringify(e.data ?? {})}`).join('\n')); d.skipLesson(); seen.push(`SKIPPED:${last}`); }
    }
    if ((globalThis as any).process?.env?.DBG) console.log(pos, t.toFixed(1), seen.join(" "), shots.length);
    expect(seen.filter((s) => s.startsWith("SKIPPED"))).toEqual([]);
    expect(d.finished).toBe(true);
    expect(shots.length).toBeGreaterThan(5);
    expect(shots.every((s) => s.made)).toBe(true);
    expect(shots.every((s) => s.pct < 0.98)).toBe(true); // the real chance, not 100%
  });

  it('the 1s: to 11 by 2, real odds, a maxed-out Kingston usually wins', () => {
    let kWins = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const sim = buildOnes(career('SF'), seed);
      sim.user!.isUser = false; // CPU vs CPU
      for (let t = 0; t < 1200 && !sim.over; t += 1 / 30) sim.update(1 / 30, emptyInput());
      expect(sim.over).toBe(true);
      const [a, b] = [sim.teams[0].score, sim.teams[1].score];
      expect(Math.max(a, b)).toBeGreaterThanOrEqual(11);
      expect(Math.abs(a - b)).toBeGreaterThanOrEqual(2);
      if (b > a) kWins++;
    }
    expect(kWins).toBeGreaterThanOrEqual(3);
  });

  it('the big game: you are clearly the best player on the floor', () => {
    const c = career('SG');
    const sim = buildBigGame(c, 5);
    const me = sim.user!;
    expect(sim.players.length).toBe(10);
    expect(me.core.shooting).toBe(avgSpread('SG').shooting + LOCKED_IN);
    for (const p of sim.players) if (p !== me) expect(me.overall - p.overall).toBeGreaterThanOrEqual(15);
  });

  it('old saves skip the prologue; new careers start it', () => {
    const old = JSON.parse(JSON.stringify(newCareer('Old', 'PG')));
    delete old.story;
    expect(migrateCareer(old)!.story).toEqual({ stage: 'done', rival: null, home: 'apartment' });
    expect(career('C').story!.stage).toBe('tutorial');
  });
  it('round 60b: the schedule card shows the big game while you are in high school', () => {
    const c = career('PG');
    for (const st of ['tutorial', 'ones', 'night'] as const) { c.story!.stage = st; expect(storyKeyGame(c)).toEqual({ when: '1 DAY', what: 'Big game vs JEF' }); }
    c.story!.stage = 'bigGame'; expect(storyKeyGame(c)!.when).toBe('TODAY');
    c.story!.stage = 'done'; expect(storyKeyGame(c)!.when).toBe('PLAYED');
    // older saves (apartment home): the NBA schedule as before
    const old = migrateCareer(JSON.parse(JSON.stringify({ ...newCareer('Old', 'SG'), story: undefined })))!;
    expect(storyKeyGame(old)).toBeNull();
    expect(nextKeyGame(old)).not.toBeNull();
  });
  it('round 60c: Kingston is Black with goggles (new and old saves)', () => {
    const c = career('SF');
    const k = rivalPlayer(c, 'tutorial');
    expect(k.appearance.skin).toBeGreaterThanOrEqual(3);
    expect(k.appearance.goggles).toBe(true);
    c.story!.rival!.appearance = { ...c.story!.rival!.appearance, skin: 0, goggles: false }; // a save from before
    expect(rivalPlayer(c, 'ones').appearance.skin).toBeGreaterThanOrEqual(3);
    expect(rivalPlayer(c, 'ones').appearance.goggles).toBe(true);
  });

  it('round 60c: blowing the Step-Through after the fake goes back to the fake', () => {
    const sim = buildTutorial(career('SG'), 21);
    const d = new TutorialDirector(sim); sim.director = d;
    d.skipLesson(); d.skipLesson(); d.skipLesson(); d.skipLesson(); d.skipLesson(); // → step-through
    expect(d.lesson!.id).toBe('step');
    const dt = 1 / 30;
    let t = 0;
    const run = (secs: number, inp: (s: GameSim) => UserInput) => { for (let k = 0; k < secs / dt; k++) { if (d.blocking) { d.nextLine(); continue; } sim.update(dt, inp(sim)); t += dt; } };
    // wait out the demo until it's your try
    for (let k = 0; k < 2000 && !(d.phase === 'try'); k++) { if (d.blocking) { d.nextLine(); continue; } sim.update(dt, emptyInput()); }
    expect(d.phase).toBe('try');
    // fake (tap ✕)
    run(0.1, () => ({ ...emptyInput(), a: true }));
    run(0.4, () => emptyInput());
    expect(d.step).toBe(1);
    // then a plain jumper (hold ✕ with no stick): back to step 1
    run(0.8, (s) => ({ ...emptyInput(), a: s.time % 1 < dt, aHeld: true }));
    expect(d.step).toBe(0);
    expect(d.failAt).toBeGreaterThan(0);
  });
});
