import Phaser from 'phaser';
import { UserInput } from '../sim/game';
import { Vec, len, scale } from '../sim/math';

/**
 * Gamepad-first input (PlayStation labels; standard mapping indices):
 *   ✕ (bottom, 0) = Shoot / Block      △ (top, 3) = Pass / Call for ball / Steal
 *   ○ (right, 1)  = Dribble move / Screen / Take charge
 *   □ (left, 2)   = Ultimate           Left stick = move, R2 (7) = sprint burst (tap)
 * Keyboard fallback mirrors the diamond on I/J/K/L: K=✕, L=○, J=□, I=△, WASD = move, Shift = sprint.
 */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class InputMapper {
  private prev: Record<string, boolean> = {};
  private cur: Record<string, boolean> = {};
  move: Vec = { x: 0, y: 0 };
  sprint = false;
  private first = true;
  /**
   * slot: undefined = single player (first controller + keyboard). 1 / 2 = two-player split:
   * slot 1 gets the first controller, slot 2 the second; the keyboard goes to the first slot without a controller.
   */
  constructor(_scene: Phaser.Scene, public slot?: 1 | 2) { installKeyboard(); }
  /** Read the browser Gamepad API directly so a controller plugged in at any time is picked up. */
  get pad(): Gamepad | null {
    if (!this.slot) return activePad();
    return livePads()[this.slot - 1] ?? null;
  }
  /** Does this mapper read the keyboard? (two-player: only the first slot without a controller) */
  get usesKeyboard(): boolean {
    if (!this.slot) return true;
    const n = livePads().length;
    return this.slot === 1 ? n === 0 : n === 1;
  }
  /** Human-readable input source for setup screens. */
  get source(): string {
    const p = this.pad;
    if (p) return `controller ${this.slot ?? 1}`;
    return this.usesKeyboard ? 'keyboard' : 'not connected';
  }
  private btn(i: number) { const p = this.pad; return !!p && !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4); }
  private key(k: string) { return this.usesKeyboard && (KEY_CODES[k] ?? []).some((c) => KEYS_DOWN.has(c)); }

  /** Call once per frame. */
  poll() {
    this.prev = this.cur;
    const pad = this.pad;
    let mx = 0, my = 0;
    if (pad) {
      mx = pad.axes[0] ?? 0;
      my = pad.axes[1] ?? 0;
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
      lb: this.btn(BTN.LB), rb: this.btn(BTN.RB),
      // menu tabs / columns: L2 or Q = previous, R1 or E = next (L1 is the escape button)
      tabPrev: this.btn(BTN.LT) || this.key('Q'), tabNext: this.btn(BTN.RB) || this.key('E'),
      // L1 = escape / back out of any screen (keyboard Esc)
      escape: this.btn(BTN.LB) || this.key('ESC'),
      start: this.btn(BTN.START) || this.key('ENTER'),
      back: this.btn(BTN.BACK) || this.key('ESC') || this.key('BACKSPACE'),
      dev: this.btn(BTN.BACK) && this.btn(BTN.START),
      mute: this.key('M'),
      sprint: this.btn(BTN.RT) || this.btn(BTN.RB) || this.key('SHIFT'),
    };
    // Anything already held when the scene starts (e.g. the ✕ that picked this mode) is ignored until released,
    // so a fresh screen never reads a leftover press as a new one.
    if (this.first) { this.first = false; this.prev = { ...this.cur }; }
  }
  pressed(k: string) { return !!this.cur[k] && !this.prev[k]; }
  held(k: string) { return !!this.cur[k]; }

  /** Menu confirm/cancel: ✕/Enter/Space and ○/L1/Esc. */
  confirm() { return this.pressed('a') || this.pressed('start'); }
  cancel() { return this.pressed('b') || this.pressed('back') || this.pressed('escape'); }

  gameInput(): UserInput {
    return {
      move: this.move, sprint: this.pressed('sprint'),
      a: this.pressed('a'), b: this.pressed('b'), x: this.pressed('x'), y: this.pressed('y'),
      aHeld: this.held('a'), bHeld: this.held('b'),
    };
  }
}

/**
 * Keyboard state read from window events, shared by every scene. (Phaser's per-scene Key objects stopped
 * updating after a scene was left and re-entered, which froze keyboard menus.)
 */
const KEYS_DOWN = new Set<string>();
const KEY_CODES: Record<string, string[]> = {
  UP: ['ArrowUp'], DOWN: ['ArrowDown'], LEFT: ['ArrowLeft'], RIGHT: ['ArrowRight'],
  SHIFT: ['ShiftLeft', 'ShiftRight'], SPACE: ['Space'], ENTER: ['Enter', 'NumpadEnter'], ESC: ['Escape'], BACKSPACE: ['Backspace'],
};
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') KEY_CODES[c] = ['Key' + c];
let keyboardInstalled = false;
function installKeyboard() {
  if (keyboardInstalled || typeof window === 'undefined') return;
  keyboardInstalled = true;
  const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName); };
  window.addEventListener('keydown', (e) => { if (!typing(e)) KEYS_DOWN.add(e.code); });
  window.addEventListener('keyup', (e) => KEYS_DOWN.delete(e.code));
  window.addEventListener('blur', () => KEYS_DOWN.clear());
}

/** Connected controllers in browser index order. */
export function livePads(): Gamepad[] {
  let pads: (Gamepad | null)[] = [];
  try { pads = Array.from(navigator.getGamepads?.() ?? []); } catch { return []; }
  return pads.filter((p): p is Gamepad => !!p && p.connected);
}

/** First connected controller (prefers ones using the standard Xbox-style mapping). */
export function activePad(): Gamepad | null {
  const live = livePads();
  return live.find((p) => p.mapping === 'standard') ?? live[0] ?? null;
}
