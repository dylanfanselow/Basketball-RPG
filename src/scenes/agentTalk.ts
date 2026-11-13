import Phaser from 'phaser';
import type { RoomScene } from './RoomScene';
import { StoryBox, BoxSpeaker } from '../render/storyBox';
import { buildCelebSheet, CelebLook, CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';
import { randomAppearance } from '../render/appearance';
import { SPRITE_SCALE } from '../render/sprites';
import { V, sxOf, syOf } from '../world/apartment';
import { sfx } from '../audio/sfx';

/** One beat of the agent's scene: a line, the agent walking somewhere, you walking somewhere, or something to do. */
export type AgentStep =
  | { say: { who: BoxSpeaker; text: string; name?: string } }
  | { agentTo: V | V[] }
  | { youTo: V | V[] }
  /** round 81b: he walks out through a door: it opens, he steps through (toward `to`), it closes behind him */
  | { agentOut: V }
  | { wait: number }
  | { run: () => void };

/**
 * Round 81: Victor Hale, the agent, in a room (the apartment, the garage): a front-view figure in a dark suit (the
 * celebs' drawing), walking with a little bob, and a scripted scene of lines and moves. The room stays `busy` while
 * it runs; `update` returns false once it's over.
 */
export class AgentTalk {
  sprite: Phaser.GameObjects.Sprite;
  box: StoryBox;
  private at: V;
  private i = 0;
  private t = 0;
  private typing = false;
  /** the waypoint the current walk is on (round 81b: walks follow paths around the furniture) */
  private wp = 0;
  private outAt = -1;

  /** `phone` (round 82): he's on the phone, not in the room (no figure; the lines and the room's busy work the same). */
  constructor(private room: RoomScene & { inp: { pressed(k: string): boolean } }, start: V, private steps: AgentStep[], opts: { phone?: boolean } = {}) {
    const key = 'story_agent_v1', tm = room.textures;
    if (!tm.exists(key)) {
      const a = randomAppearance(() => 0.23);
      Object.assign(a, { skin: 2, hair: 'fade', hairColor: '#6e6a66', facial: 'goatee', headband: null, goggles: false, mask: false, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false, mouth: 'neutral' });
      const look: CelebLook = { a, outfit: 'suit', color: '#1d2433', accent: '#c9a14a', hat: 'none', hatColor: '#000000', shades: null, chain: false, longHair: null, stand: true, side: 'neutral' };
      const tex = tm.addCanvas(key, buildCelebSheet(look))!;
      for (let f = 0; f < CELEB_FRAMES; f++) tex.add(f, 0, f * CELEB_W, 0, CELEB_W, CELEB_H);
    }
    this.at = { ...start };
    this.sprite = room.add.sprite(sxOf(start.x), syOf(start.y), key, 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.95);
    if (opts.phone) this.sprite.setVisible(false);
    this.box = new StoryBox(room, { y: 590, depth: 9650 }); // over the apartment calendar
    room.busy = true;
  }

  get done() { return this.i >= this.steps.length; }

  /** Per frame. True while the scene is still running. */
  update(dt: number): boolean {
    const room = this.room, step = this.steps[this.i];
    this.t += dt;
    let walking = false, youWalk = false;
    if (step) {
      if ('say' in step) {
        const l = step.say;
        this.box.show({ who: l.who, text: l.text, name: l.name, blocking: true });
        if (room.inp.pressed('a')) { if (this.box.typing) this.box.finishTyping(); else { sfx.blip(true); this.next(); } }
      } else {
        this.box.hide();
        if ('agentTo' in step) {
          const path = Array.isArray(step.agentTo) ? step.agentTo : [step.agentTo], to = path[this.wp];
          const dx = to.x - this.at.x, dy = to.y - this.at.y, d = Math.hypot(dx, dy), sp = 4.2 * dt;
          if (d <= sp) { this.at = { ...to }; if (++this.wp >= path.length) this.next(); } else { this.at = { x: this.at.x + dx / d * sp, y: this.at.y + dy / d * sp }; walking = true; this.sprite.setFlipX(dx < 0); }
        } else if ('youTo' in step) {
          const path = Array.isArray(step.youTo) ? step.youTo : [step.youTo];
          if (room.walkTowards(path[this.wp], dt) || this.t > 5) { this.t = 0; if (++this.wp >= path.length) this.next(); }
          youWalk = true;
        } else if ('agentOut' in step) {
          // the door opens, he steps through it (fading as he passes the wall), it shuts behind him
          if (this.outAt < 0) { this.outAt = 0; sfx.doorOpen(); }
          this.outAt += dt;
          const dx = step.agentOut.x - this.at.x, dy = step.agentOut.y - this.at.y, d = Math.hypot(dx, dy), sp = 3.2 * dt;
          if (d > sp) { this.at = { x: this.at.x + dx / d * sp, y: this.at.y + dy / d * sp }; walking = true; this.sprite.setFlipX(dx < 0); }
          if (this.sprite.active) this.sprite.setAlpha(Math.max(0, 1 - this.outAt / 0.45));
          if (this.outAt >= 0.45) { this.sprite.setVisible(false); this.room.time.delayedCall(150, () => sfx.doorClose()); this.next(); }
        } else if ('wait' in step) { if (this.t >= step.wait) this.next(); }
        else { step.run(); this.next(); }
      }
    } else this.box.hide();
    this.box.draw();
    // you stand there while he talks (the room only draws you itself when it isn't in a cutscene)
    if (!youWalk && room.playerReady()) { room.drawPlayer(0); if (!room.player.visible) room.player.setVisible(true); }
    // the agent: talks with his hands now and then, bobs as he walks
    const talking = step && 'say' in step && step.say.who === 'agent' && Math.sin(this.t * 2.4) > 0.55;
    if (this.sprite.active) this.sprite.setFrame(talking ? 4 : 0).setPosition(sxOf(this.at.x), syOf(this.at.y) - (walking ? Math.abs(Math.sin(this.t * 9)) * 3 : 0)).setDepth(syOf(this.at.y));
    // round 82: a scene can end on a line (a phone call): put the box away with it
    if (this.done) { this.box.hide(); room.busy = false; return false; }
    return true;
  }

  private next() { this.i++; this.t = 0; this.wp = 0; void this.typing; }

}
