import { describe, it, expect } from 'vitest';
import { buildSeason, opponentTiers, TIERS, KEY_PER_TIER, RIVALS, gameDayOf, settleSeason, nextKeyIndex, simResult, teamStrength, nextFall, ROOKIE_SEASON_START } from '../src/career/schedule';
import { newCareer, applyGameResult, migrateCareer, isKeyGame, advanceDay } from '../src/career/career';
import { dateLabel, dayOf } from '../src/career/calendar';
import { TEAMS } from '../src/sim/data';

const box = () => ({ pts: 10, fgm: 4, fga: 9, tpm: 1, tpa: 3, ftm: 1, fta: 2, ast: 3, reb: 4, oreb: 1, stl: 1, blk: 0, tov: 1, secs: 600, usage: 0, touches: 0 }) as any;

describe('round 83: the NBA season (every team once, key games by tier)', () => {
  it('opponents split into three tiers by roster strength: 10 / 10 / 9', () => {
    const t = opponentTiers('LAL');
    expect(t.length).toBe(29);
    expect(t.map((o) => o.tier).filter((x) => x === 'Contender').length).toBe(10);
    expect(t.map((o) => o.tier).filter((x) => x === 'Playoff').length).toBe(10);
    expect(t.map((o) => o.tier).filter((x) => x === 'Lottery').length).toBe(9);
    const s = t.map((o) => teamStrength(o.id));
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThanOrEqual(s[i - 1]);
  });
  for (const team of ['LAL', 'BOS', 'MEM', 'OKC']) it(`${team}: every other team once, ${KEY_PER_TIER} key games per tier, key first and last`, () => {
    const s = buildSeason(team, ROOKIE_SEASON_START, 99);
    expect(s.schedule.length).toBe(TEAMS.length - 1);
    expect(new Set(s.schedule).size).toBe(TEAMS.length - 1);
    expect(s.schedule).not.toContain(team);
    for (const tier of TIERS) expect(s.schedule.filter((_, i) => s.key![i] && s.tier![i] === tier).length).toBe(KEY_PER_TIER);
    expect(s.key!.filter(Boolean).length).toBe(KEY_PER_TIER * TIERS.length);
    expect(s.key![0]).toBe(true); expect(s.key![s.schedule.length - 1]).toBe(true);
    // rivals are key games (each tier has room for them)
    for (const r of RIVALS[team] ?? []) expect(s.key![s.schedule.indexOf(r)]).toBe(true);
    // Fall 1 to Winter 28, one game a day at most
    const days = s.schedule.map((_, i) => gameDayOf(s, i));
    expect(dateLabel(days[0])).toBe('Fall 1'); expect(dateLabel(days[days.length - 1])).toBe('Winter 28');
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    expect(buildSeason(team, ROOKIE_SEASON_START, 99)).toEqual(s);
  });
  it('off-screen games resolve once their day has passed; key games wait for you', () => {
    const c = newCareer('A', 'SG', 'LAL');
    c.story = { stage: 'done', rival: null, home: 'apartment' };
    const s = c.season, start = s.start!;
    c.life.day = start + 10;
    const n = settleSeason(s, c.teamId, c.life.day);
    const past = s.schedule.map((_, i) => i).filter((i) => !s.key![i] && gameDayOf(s, i) < c.life.day);
    expect(n).toBe(past.length);
    expect(s.wins + s.losses).toBe(n);
    for (let i = 0; i < s.schedule.length; i++) if (s.key![i]) expect(s.results![i]).toBeNull();
    expect(settleSeason(s, c.teamId, c.life.day)).toBe(0); // only once
    advanceDay(c); // sleeping settles too
    expect(nextKeyIndex(s)).toBe(0);
  });
  it('playing a key game records it and moves on to the next key game', () => {
    const c = newCareer('A', 'SG', 'LAL');
    c.story = { stage: 'done', rival: null, home: 'apartment' };
    applyGameResult(c, { box: box(), won: true, us: 110, them: 99, grade: { good: 1, bad: 0, points: 0 }, milestones: [] });
    const s = c.season;
    expect(s.results![0]).toEqual({ won: true, us: 110, them: 99 });
    expect(s.key![s.gameNo]).toBe(true);
    expect(isKeyGame(c, s.gameNo)).toBeTruthy();
    for (let i = 1; i < s.gameNo; i++) expect(s.key![i]).toBe(false);
  });
  it('a stronger team usually wins; results are deterministic', () => {
    let w = 0; for (let k = 0; k < 200; k++) if (simResult('PHI', 'BKN', k).won) w++;
    expect(w).toBeGreaterThan(130);
    expect(simResult('PHI', 'BKN', 5)).toEqual(simResult('PHI', 'BKN', 5));
    const r = simResult('LAL', 'BOS', 3); expect(r.won ? r.us > r.them : r.us < r.them).toBe(true);
  });
  it('old 10-game saves get a real season: the next Fall, or the rookie season during the story', () => {
    const old: any = newCareer('Old', 'PG'); old.season = { gameNo: 3, wins: 2, losses: 1, schedule: ['BOS', 'NYK'] };
    old.story = { stage: 'done', rival: null, home: 'apartment' }; old.life.day = 40;
    const m = migrateCareer(JSON.parse(JSON.stringify(old)))!;
    expect(m.season.schedule.length).toBe(29); expect(m.season.start).toBe(nextFall(40)); expect(m.season.wins).toBe(0);
    expect(nextFall(40)).toBe(dayOf(2, 0, 1)); expect(nextFall(1)).toBe(1);
    old.story = { stage: 'letter', rival: null, home: 'trailer' };
    expect(migrateCareer(JSON.parse(JSON.stringify(old)))!.season.start).toBe(ROOKIE_SEASON_START);
  });
});
