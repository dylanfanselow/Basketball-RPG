import { describe, it, expect } from 'vitest';
import { createCareer } from '../src/career/career';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import { FILM, FILM_COURSES, OPEN_COURSES, FilmDirector, buildFilm, filmUnlocked, markFilmDone, PRO_ID } from '../src/sim/film';
import { withPrereqs } from '../src/career/draftClass';
import { GameSim, UserInput, emptyInput } from '../src/sim/game';
import { dist, norm, scale, sub, v } from '../src/sim/math';
import type { Position } from '../src/sim/attributes';
import { CORE_STATS } from '../src/sim/data';
import { openTasks, claimTasks, FILM_TASK_LEVELS } from '../src/career/tasks';

function career(pos: Position = 'SF', perks: string[] = []) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos, heightIn: 80, appearance: defaultAppearance() });
  let s = 42; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.story = newStory(c, rnd);
  for (const st of CORE_STATS) { c.core[st] = 85; c.skills[st].level = 85; }
  c.nodes = withPrereqs([...c.nodes, ...perks]);
  return c;
}

/** A bot that does what each film prompt asks. */
function botInput(sim: GameSim, d: FilmDirector, t: number): UserInput {
  const inp = emptyInput();
  const me = sim.user!, L = d.lesson;
  if (!L || !sim.live || !me.isUser) return inp;
  const rim = sim.rim(0), toRim = norm(sub(rim, me.p)), lat = v(-toRim.y, toRim.x), rd = dist(me.p, rim);
  const hasBall = sim.holder() === me;
  const mate = sim.teams[0].onCourt.find((p) => p !== me)!;
  const pulse = Math.floor(t * 30) % 12 === 0; // an edge every 0.4 s
  const hold = (dir = v()) => { inp.move = dir; inp.aHeld = true; inp.a = !sim.ux.aPending && me.state !== 'shoot'; };
  const tap = (dir = v()) => { inp.move = dir; inp.a = pulse; inp.aHeld = false; };
  const drive = (to: number, then: () => void) => { if (rd > to + (sim.ux.aPending || me.state === 'shoot' ? 4 : 0)) { inp.move = toRim; } else then(); };
  const sinceMove = me.lastMove ? sim.time - me.lastMove.endAt : 99;
  if (!hasBall && L.ball === 'me' && L.id !== 'pointGod' && L.id !== 'postKick') return inp;
  switch (L.id) {
    case 'floater': drive(8.5, () => hold(scale(toRim, -1))); break;
    case 'push': drive(10.5, () => hold(v())); break;
    case 'hook': drive(7, () => hold(lat)); break;
    case 'euro': // full speed at the rim, ✕ down, flick the stick sideways as the shot goes up
      inp.move = toRim; inp.sprint = pulse;
      if (rd < 9.5) { hold(sim.ux.aPending && sim.time - sim.ux.aDownAt >= 0.14 ? lat : toRim); }
      break;
    case 'combo': case 'uncleDrew': {
      const fast = L.id === 'uncleDrew' ? Math.floor(t * 30) % 5 === 0 : pulse;
      inp.move = Math.floor(t * 2) % 2 ? lat : scale(lat, -1); inp.b = fast; inp.bHeld = inp.b;
      break;
    }
    case 'moveJumper':
      if (me.state === 'dribbleMove') break;
      if (sinceMove < 0.8) hold(v());
      else { inp.move = scale(toRim, -1); inp.b = pulse; inp.bHeld = inp.b; }
      break;
    case 'moveFinish':
      if (me.state === 'dribbleMove') break;
      if (sinceMove > 2.4 && rd > 9) { inp.move = lat; inp.b = pulse; inp.bHeld = inp.b; }
      else drive(5, () => hold(toRim));
      break;
    case 'postKick':
      if (!hasBall) break;
      if (me.post?.helpCalled) { inp.move = norm(sub(mate.p, me.p)); inp.y = pulse; inp.yHeld = false; }
      else { inp.postHeld = true; inp.move = scale(toRim, 0.6); }
      break;
    case 'help': {
      const other = sim.teams[1].onCourt.find((p) => p.id !== PRO_ID)!;
      const at = sim.holder() === other && dist(other.p, rim) < 20 ? sub(other.p, scale(norm(sub(other.p, rim)), 2.5)) : sim.players.find((p) => p.id === PRO_ID)!.p;
      inp.move = dist(at, me.p) > 0.7 ? norm(sub(at, me.p)) : v();
      inp.a = other.state === 'shoot' && pulse;
      break;
    }
    case 'dreamer': drive(8.5, () => (d.step === 0 ? tap(lat) : hold(toRim))); break;
    case 'pointGod':
      if (!hasBall) break;
      if (me.state === 'shoot') { inp.move = norm(sub(mate.p, me.p)); inp.y = true; inp.yHeld = false; }
      else drive(6, () => hold(toRim));
      break;
    case 'fade':
      if (d.step === 0) hold(scale(toRim, -1));
      else { inp.postHeld = !me.post || sim.time - me.post.since < 0.6; if (!inp.postHeld) hold(scale(toRim, -1)); else inp.move = scale(toRim, 0.5); }
      break;
    case 'jelly':
      if (me.state === 'shoot') { inp.a = pulse; inp.aHeld = false; }
      else drive(3.5, () => hold(toRim));
      break;
  }
  return inp;
}

/** Play a course start to finish with the bot. Returns the lessons it saw (SKIPPED:x when one stalled). */
function playCourse(id: string, pos: Position = 'SF', seed = 7) {
  const f = FILM[id];
  const sim = buildFilm(career(pos, f.perk ? [f.perk] : []), id, seed);
  const d = sim.director as FilmDirector;
  const dt = 1 / 30, seen: string[] = [];
  let t = 0, lessonT = 0, last = '';
  const demos: string[] = [];
  while (!d.finished && t < 600) {
    if (d.blocking) { d.nextLine(); continue; }
    if (d.lesson && d.lesson.id !== last) { last = d.lesson.id; seen.push(last); lessonT = 0; }
    if (d.phase === 'demo' && !demos.includes(last)) demos.push(last);
    sim.update(dt, botInput(sim, d, t)); t += dt; lessonT += dt;
    if (lessonT > 90) {
      if ((globalThis as any).process?.env?.DBG) console.log(id, last, d.phase, d.step, sim.events.filter((e) => e.t > sim.time - 20 && /post|gather|tutorial|score|move|shotLog|pass/.test(e.kind)).slice(-40).map((e) => `${e.t.toFixed(1)} ${e.kind} ${e.pid} ${e.text} ${JSON.stringify(e.data ?? {})}`).join('\n'));
      d.skipLesson(); seen.push(`SKIPPED:${last}`);
    }
  }
  return { d, sim, seen, demos };
}

describe('round 91 film study', () => {
  it('courses: five open from the start, the rest locked behind their skill', () => {
    expect(OPEN_COURSES).toEqual(['finishing', 'combos', 'comboShots', 'postPass', 'help']);
    const c = career();
    for (const f of FILM_COURSES) expect(filmUnlocked(c, f.id)).toBe(!f.perk);
    c.nodes.push('fi_dreamer');
    expect(filmUnlocked(c, 'dreamer')).toBe(true);
    expect(markFilmDone(c, 'combos')).toBe(true);
    expect(markFilmDone(c, 'combos')).toBe(false);
    expect(c.film!.done).toEqual(['combos']);
  });

  it('the to-do task: the five starter courses pay +1 in every skill, once', () => {
    const c = career();
    c.story!.home = 'apartment';
    expect(openTasks(c).map((t) => t.id)).toEqual(['film']);
    c.nodes.push('fi_dreamer'); markFilmDone(c, 'dreamer'); // a locked course doesn't count
    for (const id of OPEN_COURSES.slice(0, 4)) markFilmDone(c, id);
    expect(openTasks(c)[0].progress(c)).toBe(4);
    expect(claimTasks(c)).toEqual([]);
    markFilmDone(c, OPEN_COURSES[4]);
    const before = CORE_STATS.map((s) => c.skills[s].level);
    expect(claimTasks(c).map((t) => t.id)).toEqual(['film']);
    expect(CORE_STATS.map((s) => c.skills[s].level)).toEqual(before.map((l) => l + FILM_TASK_LEVELS));
    expect(CORE_STATS.map((s) => c.core[s])).toEqual(before.map((l) => l + FILM_TASK_LEVELS));
    expect(claimTasks(c)).toEqual([]);
    expect(openTasks(c)).toEqual([]);
  });

  it('the to-do list waits for the apartment (the TV)', () => {
    const c = career();
    c.story!.home = 'trailer';
    expect(openTasks(c)).toEqual([]);
  });

  it('the tape is a real player; you watch it (the CPU plays you), then it is your ball', () => {
    const sim = buildFilm(career(), 'postPass', 3);
    const d = sim.director as FilmDirector;
    expect(sim.players.find((p) => p.id === PRO_ID)!.name).toBe('Nikola Jokić');
    while (d.blocking) d.nextLine();
    sim.update(1 / 30, emptyInput());
    expect(d.phase).toBe('demo');
    expect(sim.user!.isUser).toBe(false);
    expect(sim.cfg.story!.forceMake).toBe(true);
  });

  it('the finishing course keeps the floater even if you own Fade Away', () => {
    const sim = buildFilm(career('SF', ['sh_fade', 'fi_euro']), 'finishing', 3);
    expect(sim.user!.hasShot('fade')).toBe(false);
    expect(sim.user!.hasShot('euro')).toBe(false);
  });

  for (const f of FILM_COURSES) it(`${f.id}: the tape plays and the bot finishes every lesson`, () => {
    const { d, sim, seen, demos } = playCourse(f.id, f.id === 'postPass' ? 'C' : f.id === 'jelly' ? 'PF' : 'SF');
    expect(seen.filter((s) => s.startsWith('SKIPPED'))).toEqual([]);
    expect(d.finished).toBe(true);
    expect(demos.length).toBe(d.lessons.filter((l) => l.demo).length);
    if ((globalThis as any).process?.env?.SANITY) {
      const pro = sim.events.filter((e) => e.pid === PRO_ID && /gather|move|pass|post|jelly/.test(e.kind)).map((e) => `${e.t.toFixed(1)}:${e.kind}:${e.text || JSON.stringify(e.data)}`);
      const user = sim.events.filter((e) => e.kind === 'tutorialCheck').map((e) => `${e.t.toFixed(1)}:${JSON.stringify(e.data)}`);
      console.log(f.id, 'simT', sim.time.toFixed(1), '\n PRO', pro.slice(0, 8).join(' | '), '\n CHECKS', user.join(' | '));
    }
  });
});
