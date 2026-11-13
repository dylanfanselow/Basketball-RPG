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
  | { run: () => void }
  /** round 84: in the backyard (screen px): he walks to `to` (x), then hops the fence (top at `fenceY`) and is gone */
  | { fenceJump: { from: { x: number; y: number }; to: number; fenceY: number } }
  /** round 84: a choice in the box (↑↓ + ✕); `pick` gets the index */
  | { choose: { who: BoxSpeaker; text: string; options: string[]; pick: (i: number) => void } };

/**
 * Round 81: the agent (round 84: Donovan Garcia), in a room (the apartment, the garage): a front-view figure in a dark suit (the
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
  private choice = 0;
  /** round 84: a screen-space position (the backyard, outside the room's floor) */
  private scr: { x: number; y: number } | null = null;
  private hopT = -1;

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
      if ('choose' in step) {
        const ch = step.choose;
        if (room.inp.pressed('down')) { this.choice = (this.choice + 1) % ch.options.length; sfx.blip(true); }
        if (room.inp.pressed('up')) { this.choice = (this.choice + ch.options.length - 1) % ch.options.length; sfx.blip(true); }
        this.box.show({ who: ch.who, text: '', blocking: true, choices: ch.options, choice: this.choice });
        if (room.inp.pressed('a')) { const k = this.choice; this.choice = 0; sfx.blip(true); this.next(); ch.pick(k); }
      } else if ('say' in step) {
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
        } else if ('fenceJump' in step) {
          // round 84 (owner): out in the backyard he walks to the fence and hops it, gone behind the pickets
          const f = step.fenceJump, left = f.to < f.from.x;
          if (!this.scr) { this.scr = { ...f.from }; this.sprite.setVisible(true).setAlpha(1).setFlipX(left); this.hopT = -1; this.sprite.setCrop(); }
          if (this.hopT < 0) {
            const dx = f.to - this.scr.x, sp = 95 * dt;
            if (Math.abs(dx) <= sp) { this.scr.x = f.to; this.hopT = 0; sfx.effort(); } else { this.scr.x += Math.sign(dx) * sp; walking = true; }
          } else {
            this.hopT += dt;
            const k = Math.min(1, this.hopT / 0.9), H = f.from.y - f.fenceY + 46;
            this.scr.x = f.to + (left ? -1 : 1) * 70 * k;
            this.scr.y = f.from.y - 14 * k - Math.sin(k * Math.PI) * H;
            // past the top, everything below the fence line is behind the pickets
            const top = this.scr.y - this.sprite.displayHeight, vis = (f.fenceY - top) / this.sprite.scaleY;
            if (k > 0.5) this.sprite.setCrop(0, 0, this.sprite.frame.width, Math.max(0, Math.min(this.sprite.frame.height, vis)));
            if (k >= 1) { this.sprite.setVisible(false); this.sprite.setCrop(); this.scr = null; this.next(); }
          }
        } else if ('wait' in step) { if (this.t >= step.wait) this.next(); }
        else { step.run(); this.next(); }
      }
    } else this.box.hide();
    this.box.draw();
    // you stand there while he talks (the room only draws you itself when it isn't in a cutscene)
    if (!youWalk && room.playerReady()) { room.drawPlayer(0); if (!room.player.visible) room.player.setVisible(true); }
    // the agent: talks with his hands now and then, bobs as he walks
    const talking = step && 'say' in step && step.say.who === 'agent' && Math.sin(this.t * 2.4) > 0.55;
    if (this.sprite.active && this.scr) this.sprite.setFrame(0).setPosition(this.scr.x, this.scr.y - (walking ? Math.abs(Math.sin(this.t * 9)) * 3 : 0)).setDepth(-500);
    else if (this.sprite.active) this.sprite.setFrame(talking ? 4 : 0).setPosition(sxOf(this.at.x), syOf(this.at.y) - (walking ? Math.abs(Math.sin(this.t * 9)) * 3 : 0)).setDepth(syOf(this.at.y));
    // round 82: a scene can end on a line (a phone call): put the box away with it
    if (this.done) { this.box.hide(); room.busy = false; return false; }
    return true;
  }

  private next() { this.i++; this.t = 0; this.wp = 0; void this.typing; }

}
