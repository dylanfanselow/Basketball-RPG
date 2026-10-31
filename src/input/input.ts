import Phaser from 'phaser';
import { UserInput } from '../sim/game';
import { Vec, len, scale } from '../sim/math';

/**
 * Gamepad-first input (Xbox layout):
 *   A (bottom) = Shoot / Block      Y (top)  = Pass / Call for ball / Steal
 *   B (right)  = Dribble move / Screen / Take charge
 *   X (left)   = Ultimate           Left stick = move, RT = sprint
 * Keyboard fallback mirrors the diamond on I/J/K/L: K=A, L=B, J=X, I=Y, WASD = move, Shift = sprint.
 */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class InputMapper {
  private prev: Record<string, boolean> = {};
  private cur: Record<string, boolean> = {};
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  move: Vec = { x: 0, y: 0 };
  sprint = false;
  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    for (const k of ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SHIFT', 'I', 'J', 'K', 'L', 'SPACE', 'ENTER', 'ESC', 'Q', 'E', 'BACKSPACE'])
      this.keys[k] = kb.addKey(k, false);
  }
  get pad(): Phaser.Input.Gamepad.Gamepad | null {
    const gp = this.scene.input.gamepad;
    if (!gp || gp.total === 0) return null;
    return gp.pad1 ?? gp.getPad(0) ?? null;
  }
  private btn(i: number) { const p = this.pad; return !!p && !!p.buttons[i] && p.buttons[i].value > 0.4; }
  private key(k: string) { return !!this.keys[k]?.isDown; }

  /** Call once per frame. */
  poll() {
    this.prev = this.cur;
    const pad = this.pad;
    let mx = 0, my = 0;
    if (pad) {
      mx = pad.axes.length > 0 ? pad.axes[0].getValue() : 0;
      my = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
      if (Math.hypot(mx, my) < 0.18) { mx = 0; my = 0; }
    }
    if (this.key('A') || this.key('LEFT')) mx = -1;
    if (this.key('D') || this.key('RIGHT')) mx = 1;
    if (this.key('W') || this.key('UP')) my = -1;
    if (this.key('S') || this.key('DOWN')) my = 1;
    let m = { x: mx, y: my };
    if (len(m) > 1) m = scale(m, 1 / len(m));
    this.move = m;
    this.sprint = this.btn(BTN.RT) || this.btn(BTN.RB) || this.key('SHIFT');
    this.cur = {
      a: this.btn(BTN.A) || this.key('K') || this.key('SPACE'),
      b: this.btn(BTN.B) || this.key('L'),
      x: this.btn(BTN.X) || this.key('J'),
      y: this.btn(BTN.Y) || this.key('I'),
      up: this.btn(BTN.UP) || this.key('UP') || this.key('W'),
      down: this.btn(BTN.DOWN) || this.key('DOWN') || this.key('S'),
      left: this.btn(BTN.LEFT) || this.key('LEFT') || this.key('A'),
      right: this.btn(BTN.RIGHT) || this.key('RIGHT') || this.key('D'),
      lb: this.btn(BTN.LB) || this.key('Q'), rb: this.btn(BTN.RB) || this.key('E'),
      start: this.btn(BTN.START) || this.key('ENTER'),
      back: this.btn(BTN.BACK) || this.key('ESC') || this.key('BACKSPACE'),
      dev: this.btn(BTN.BACK) && this.btn(BTN.START),
    };
  }
  pressed(k: string) { return !!this.cur[k] && !this.prev[k]; }
  held(k: string) { return !!this.cur[k]; }

  /** Menu confirm/cancel: A/Enter/Space and B/Esc. */
  confirm() { return this.pressed('a') || this.pressed('start'); }
  cancel() { return this.pressed('b') || this.pressed('back'); }

  gameInput(): UserInput {
    return {
      move: this.move, sprint: this.sprint,
      a: this.pressed('a'), b: this.pressed('b'), x: this.pressed('x'), y: this.pressed('y'),
      aHeld: this.held('a'), bHeld: this.held('b'),
    };
  }
}
