import Phaser from 'phaser';
import type { GarageScene, GearBody } from './GarageScene';
import { RoomActor } from './roomActor';
import { casualKit } from './RoomScene';
import { FONT } from './ui';
import { ARENA_GYM, lapPoint, LAP_LEN } from '../world/arenaGym';
import { MiniGame, MiniInput, NO_INPUT, makeMiniGame, SquatGame, BenchGame, JumpGame, ShootGame } from '../world/minigames';
import { randomAppearance } from '../render/appearance';
import { Prospect, prospectLook } from '../career/draftClass';
import type { CombineTest } from '../career/career';
import { Station, V, syOf, sxOf } from '../world/apartment';

/** Round 87 / 88: the combine kit everybody wears (the prospects and you): a grey tee and navy shorts. */
export const COMBINE_SHIRT = '#8d939e', COMBINE_SHORTS = '#1d2b5a';
/** Round 87: which station each combine test happens at. */
export const TEST_STATION: Record<CombineTest, string> = { sprint: 'laps', squat: 'squat', bench: 'bench', jump: 'jump', shoot: 'shoot' };
const station = (id: string): Station => ({ ...ARENA_GYM.stations!.find((s) => s.id === id)! });
const WALK = 7; // ft/s between stations

/** One prospect at the combine: his body, the test he's on (or walking to), his own mini-game and its bot. */
interface Mate {
  p: Prospect; a: RoomActor; test: CombineTest | null; to: CombineTest | null; pos: V; mini: MiniGame | null;
  g: Phaser.GameObjects.Graphics; gb: Phaser.GameObjects.Graphics; ballG: Phaser.GameObjects.Graphics; tag: Phaser.GameObjects.Text;
  lapD: number; botT: number; next: number; aim: number; hold: boolean; rest: number; face: V | null;
  /** a scripted pose that overrides the station (the big jump, the flex, standing to talk) */
  pose: { clip: string; u: number; jumpFt: number; yaw: number; flip: boolean } | null;
}

/**
 * Round 87 (owner): the other prospects at the combine actually do the tests you aren't doing: each one is on a station
 * (laps, the squat rack, the bench, the jump pole, the shooting mark) running that station's real mini-game with a bot
 * on the buttons, the bar and the ball drawn like yours (`GarageScene.drawGearFor`). When you start a test, whoever
 * is on that station walks over to the one you just left. Cosmetic: none of it touches the story.
 */
export class CombineCrew {
  mates: Mate[] = [];
  constructor(private scene: GarageScene, who: Prospect[], tests: CombineTest[], userFirst: CombineTest) {
    const free = tests.filter((t) => t !== userFirst);
    who.forEach((p, i) => {
      const look = prospectLook(p);
      Object.assign(look, { shirt: COMBINE_SHIRT, pants: COMBINE_SHORTS, longPants: false });
      const a = new RoomActor(scene, `prospect_${p.id}_${p.look}_v2`, look, p.heightIn / 12, casualKit(look, COMBINE_SHORTS));
      const test = free[i] ?? null, st = test ? station(TEST_STATION[test]) : null;
      const [first, ...rest] = p.name.split(' ');
      const tag = scene.add.text(0, 0, `${first[0]}. ${rest.join(' ')}`, { fontFamily: FONT, fontSize: '10px', color: '#d8e0ee', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(9000).setVisible(false);
      const m: Mate = { p, a, test, to: null, pos: st ? { ...st.at } : { x: 24 + i, y: 18 }, mini: null, g: scene.add.graphics(), gb: scene.add.graphics(), ballG: scene.add.graphics(), tag,
        lapD: LAP_LEN * (0.2 + i * 0.2), botT: 0, next: 0, aim: 0.87, hold: false, rest: 0, face: null, pose: null };
      if (test) this.arrive(m, test);
      this.mates.push(m);
    });
  }
  mateOf(id: string) { return this.mates.find((m) => m.p.id === id); }

  /** You start `test`: whoever is on it walks to `left` (the station you just left, or whichever is free). */
  userOn(test: CombineTest | null, left: CombineTest | null) {
    const m = test ? this.mates.find((x) => x.test === test || x.to === test) : null;
    if (!m) return;
    const busy = new Set(this.mates.flatMap((x) => [x.test, x.to]).filter((t) => t && t !== test));
    const dest = left && left !== test && !busy.has(left) ? left : (Object.keys(TEST_STATION) as CombineTest[]).find((t) => t !== test && !busy.has(t)) ?? null;
    this.sendTo(m, dest);
  }
  /** Walk `m` to `dest`'s station (null: just stop where he is). */
  sendTo(m: Mate, dest: CombineTest | null) {
    if (m.test === 'sprint') m.pos = lapPoint(m.lapD).p;
    else if (m.test) m.pos = { ...station(TEST_STATION[m.test]).spot };
    m.test = null; m.mini = null; m.to = dest; m.pose = null;
  }
  private arrive(m: Mate, test: CombineTest) {
    const st = station(TEST_STATION[test]);
    m.test = test; m.to = null; m.pos = { ...st.at };
    m.mini = test === 'sprint' ? null : makeMiniGame(st.id, Math.random);
    m.next = 0; m.hold = false; m.rest = 0; m.aim = 0.82 + Math.random() * 0.1;
    if (test === 'sprint') { const best = this.closestLap(m.pos); m.lapD = best; }
  }
  private closestLap(p: V) { let best = 0, bd = 1e9; for (let d = 0; d < LAP_LEN; d += 0.5) { const q = lapPoint(d).p, e = Math.hypot(q.x - p.x, q.y - p.y); if (e < bd) { bd = e; best = d; } } return best; }
  /** Is anyone using this station right now (the rack / bench show the bar off its hooks)? */
  using(stationId: string) { return this.mates.some((m) => m.test && TEST_STATION[m.test] === stationId && !m.pose); }

  /** The bot's buttons this frame for its mini-game. */
  private bot(m: Mate, dt: number): MiniInput {
    const g = m.mini!, inp: MiniInput = { ...NO_INPUT, stick: { x: 0, y: 0 } };
    m.botT += dt;
    if (g instanceof SquatGame) { if (m.botT >= m.next) { m.next = m.botT + 1 / 6.5; const l = (Math.round(m.botT * 6.5) % 2) === 0; inp.l2 = l; inp.r2 = !l; } }
    else if (g instanceof BenchGame) { inp.aHeld = !g.descending; inp.stick = { x: Math.max(-1, Math.min(1, -g.tilt * 3)), y: 0 }; }
    else if (g instanceof JumpGame) {
      if (g.over) { m.rest += dt; if (m.rest > 2.5) { m.mini = makeMiniGame('jump', Math.random); m.rest = 0; } }
      else if (g.phase === 'load' && m.botT >= m.next) { m.next = m.botT + 1 / 8; inp.a = true; }
    } else if (g instanceof ShootGame) {
      if (g.state === 'idle') { m.rest += dt; if (m.rest > 0.9) { m.hold = true; m.rest = 0; m.aim = 0.8 + Math.random() * 0.14; } }
      if (g.state === 'meter' && g.meter >= m.aim) m.hold = false;
      inp.aHeld = m.hold;
    }
    return inp;
  }

  update(dt: number, t: number) {
    for (const m of this.mates) {
      for (const gg of [m.g, m.gb, m.ballG]) gg.clear();
      // a scripted pose (the jump beat) wins over everything
      if (m.pose) {
        const ok = m.a.show(m.pose.clip, m.pose.u, m.pos, { yaw: m.pose.yaw, flip: m.pose.flip, jumpFt: m.pose.jumpFt, depth: syOf(m.pos.y) });
        this.tag(m, ok); continue;
      }
      // walking between stations
      if (m.to || (!m.test && m.face === null)) {
        const dest = m.to ? station(TEST_STATION[m.to]).spot : m.pos;
        const dx = dest.x - m.pos.x, dy = dest.y - m.pos.y, d = Math.hypot(dx, dy), sp = WALK * dt;
        if (m.to && d <= sp) { this.arrive(m, m.to); }
        else if (m.to) {
          m.pos = { x: m.pos.x + dx / d * sp, y: m.pos.y + dy / d * sp };
          const ok = m.a.show('jog', (t * 1.6) % 1, m.pos, { flip: dx < 0, depth: syOf(m.pos.y) });
          this.tag(m, ok); continue;
        } else { const ok = m.a.show('idle', (t * 0.5) % 1, m.pos, { depth: syOf(m.pos.y) }); this.tag(m, ok); continue; }
      }
      if (m.face) { // stopped to talk: standing, turned toward whoever he's talking to
        const ok = m.a.show('idle', (t * 0.5) % 1, m.pos, { flip: m.face.x < m.pos.x, depth: syOf(m.pos.y) }); this.tag(m, ok); continue;
      }
      if (m.test === 'sprint') {
        m.lapD += 5.2 * dt;
        const { p, dir } = lapPoint(m.lapD); m.pos = p;
        const yaw = Math.abs(dir.x) > 0.5 ? 0 : dir.y > 0 ? 90 : -90;
        const ok = m.a.show('jog', (m.lapD / 4.6) % 1, p, { yaw, flip: dir.x < -0.5, depth: syOf(p.y) });
        this.tag(m, ok); continue;
      }
      const st = station(TEST_STATION[m.test!]), g = m.mini!;
      g.update(dt, this.bot(m, dt)); g.takeEvents();
      const own = g.clip(), clip = own?.clip ?? st.clip, u = own ? own.u : g.animU();
      const depth = syOf(st.depthFt ?? st.at.y) + 0.05;
      const ok = m.a.show(clip, u, st.at, { yaw: st.yaw, flip: st.flip, jumpFt: g.jumpFt(), lift: st.lift, depth });
      this.tag(m, ok);
      if (!ok || !m.a.pose) continue;
      const sheet = m.a.sheet; if (!sheet) continue;
      const body: GearBody = { x: m.a.x, y: m.a.y, depth, flip: m.a.flip, pose: m.a.pose, sheet, joint: (j) => m.a.joint(j) };
      this.scene.drawGearFor(body, st, g, m.g, m.gb, m.ballG, false);
    }
  }
  private tag(m: Mate, ok: boolean) { m.tag.setVisible(ok).setPosition(m.a.x, m.a.floorY + 4); }
}

/**
 * Round 87 (owner): the scouts, fully side-on in folding chairs that face the court (left), drawn like players (their
 * own sheets, the 'sit' clip, flipped to look left). They stand up when something happens (#2's jump). One more stands
 * on the left with a clipboard, facing right (the court).
 */
export class ScoutRow {
  seated: { a: RoomActor; at: V; chair: Phaser.GameObjects.Graphics; stand: boolean }[] = [];
  standing: { a: RoomActor; at: V; board: Phaser.GameObjects.Graphics }[] = [];
  constructor(private scene: Phaser.Scene, color: string) {
    const mk = (i: number) => {
      let seed = 4241 + i * 977;
      const look = randomAppearance(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
      Object.assign(look, { shirt: color, pants: '#2a2d36', longPants: true, facial: i % 2 ? 'stubble' : 'none' });
      return new RoomActor(scene, `scout_${i}_${color}`, look, 5.9 + (i % 3) * 0.12, casualKit(look, '#2a2d36'));
    };
    for (let i = 0; i < 6; i++) {
      const fy = 10 + i * 2.1, at = { x: 34.2 + 0.39 * fy + 0.6, y: fy };
      this.seated.push({ a: mk(i), at, chair: scene.add.graphics(), stand: false });
    }
    this.standing.push({ a: mk(7), at: { x: 12.5, y: 1.6 }, board: scene.add.graphics() });
  }
  /** Everybody up (or back down). */
  standUp(on: boolean) { for (const s of this.seated) s.stand = on; }
  update(t: number) {
    for (const [i, s] of this.seated.entries()) {
      const ok = s.a.show(s.stand ? 'idle' : 'sit', ((t + i * 0.37) * 0.25) % 1, s.at, { flip: true, depth: syOf(s.at.y), shadow: false });
      this.drawChair(s, ok);
    }
    for (const s of this.standing) {
      const ok = s.a.show('idle', (t * 0.4) % 1, s.at, { flip: false, depth: syOf(s.at.y) });
      s.board.clear();
      if (ok && s.a.pose) { // a clipboard in his near hand
        const h = s.a.joint(s.a.pose.hF);
        s.board.setDepth(s.a.spr.depth + 0.1).fillStyle(0x6b4a2a, 1).fillRect(h.x - 2, h.y - 14, 12, 16).fillStyle(0xf2efe6, 1).fillRect(h.x - 1, h.y - 12, 10, 13).fillStyle(0x9aa0aa, 1).fillRect(h.x + 1, h.y - 15, 6, 3);
      }
    }
  }
  /**
   * A folding chair seen from the side, facing left (the way the scout sits): the seat under his thighs, the back
   * behind him on the right, two legs. In the scout's own pose units (so it fits him), drawn behind him.
   */
  private drawChair(s: { a: RoomActor; at: V; chair: Phaser.GameObjects.Graphics }, ok: boolean) {
    const g = s.chair.clear(); if (!ok) return;
    const k = s.a.k, x0 = sxOf(s.at.x), y0 = syOf(s.at.y);
    const X = (u: number) => x0 - u * k, Y = (v: number) => y0 - v * k; // flipped: +u is toward the court (left)
    g.setDepth(s.a.spr.depth - 0.2);
    g.fillStyle(0x000000, 0.25).fillEllipse(x0 - 4 * k, y0 + 1, 26 * k, 4 * k);
    g.lineStyle(Math.max(2, 1.6 * k), 0x23262d, 1);
    g.lineBetween(X(-6), Y(0), X(-4), Y(25)); g.lineBetween(X(13), Y(0), X(11), Y(24));      // back and front legs
    g.lineBetween(X(-6), Y(0), X(13), Y(0));                                                    // floor rail
    g.fillStyle(0x30343d, 1).fillRect(X(13), Y(27.5), (13 + 6) * k, 3.2 * k);                 // the seat
    g.fillStyle(0x30343d, 1).fillRect(X(-4), Y(62), 3.2 * k, (62 - 26) * k);                   // the back
    g.fillStyle(0x4a505c, 1).fillRect(X(-4), Y(62), 3.2 * k, 1.2 * k);
  }
}
