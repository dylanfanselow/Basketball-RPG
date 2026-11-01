import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { PerkTreeScene } from './scenes/PerkTreeScene';
import { UltimateScene } from './scenes/UltimateScene';
import { PostGameScene } from './scenes/PostGameScene';
import { MatchSetupScene } from './scenes/MatchSetupScene';
import { OneOnOneSetupScene } from './scenes/OneOnOneSetupScene';
import { initDevPanel } from './dev/devPanel';
import { activePad } from './input/input';
import { sfx } from './audio/sfx';
import './state';

// sharp text at the 1.5x camera: every Text renders its canvas at 2x unless a scene says otherwise
const textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (this: Phaser.GameObjects.GameObjectFactory, x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) {
  return textFactory.call(this, x, y, text, { resolution: 2, ...(style ?? {}) });
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // rendered at 1920x1080 for detail; every scene lays out in 1280x720 units with a 1.5x camera (scenes/ui.ts hiRes)
  width: 1920,
  height: 1080,
  pixelArt: true,
  backgroundColor: '#0d0f1a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, GameScene, HubScene, LevelUpScene, PerkTreeScene, UltimateScene, PostGameScene, MatchSetupScene, OneOnOneSetupScene],
});
(window as any).__phaser = game;
initDevPanel();

// Controller connect/disconnect notice. Browsers only reveal a controller after one of its buttons is pressed.
const toast = document.createElement('div');
toast.id = 'padToast';
document.body.append(toast);
let toastTimer = 0;
function showToast(text: string) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3500);
}
window.addEventListener('gamepadconnected', (e) => {
  const g = (e as GamepadEvent).gamepad;
  showToast(`🎮 Controller connected: ${g.id.replace(/\(.*\)/, '').trim() || 'Gamepad'}${g.mapping === 'standard' ? '' : ' (non-standard mapping — buttons may differ)'}`);
});
window.addEventListener('gamepaddisconnected', () => showToast('Controller disconnected — keyboard still works'));

// Fullscreen: F key or the ⛶ button (browsers only allow it from a key press or click, not a controller button)
export function toggleFullscreen(): boolean {
  try {
    if (document.fullscreenElement) { void document.exitFullscreen(); return true; }
    const el = document.documentElement;
    if (!el.requestFullscreen) { showToast('Fullscreen is not available in this browser'); return false; }
    el.requestFullscreen().catch(() => showToast('Press F or click ⛶ (top right) for fullscreen'));
    return true;
  } catch { showToast('Press F or click ⛶ (top right) for fullscreen'); return false; }
}
(window as any).__toggleFullscreen = toggleFullscreen;
(window as any).__toast = showToast;
const fsBtn = document.createElement('button');
fsBtn.id = 'fsBtn'; fsBtn.title = 'Fullscreen (F)'; fsBtn.textContent = '⛶';
fsBtn.addEventListener('click', () => { toggleFullscreen(); fsBtn.blur(); });
document.body.append(fsBtn);
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (e.code === 'KeyF' && !e.repeat && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) toggleFullscreen();
});
document.addEventListener('fullscreenchange', () => { fsBtn.textContent = document.fullscreenElement ? '🗗' : '⛶'; });
setTimeout(() => { if (!activePad()) showToast('Using a controller? Plug it in and press any button on it.'); }, 1500);

// Browsers only allow sound after a key press or click (gamepad presses don't count everywhere).
const unlockAudio = () => sfx.unlock();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('gamepadconnected', unlockAudio);
