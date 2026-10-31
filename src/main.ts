import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { PerkTreeScene } from './scenes/PerkTreeScene';
import { UltimateScene } from './scenes/UltimateScene';
import { PostGameScene } from './scenes/PostGameScene';
import { initDevPanel } from './dev/devPanel';
import { activePad } from './input/input';
import './state';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  pixelArt: true,
  backgroundColor: '#0d0f1a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, GameScene, HubScene, LevelUpScene, PerkTreeScene, UltimateScene, PostGameScene],
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
setTimeout(() => { if (!activePad()) showToast('Using a controller? Plug it in and press any button on it.'); }, 1500);
