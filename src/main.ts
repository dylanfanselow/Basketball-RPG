import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { PerkTreeScene } from './scenes/PerkTreeScene';
import { UltimateScene } from './scenes/UltimateScene';
import { PostGameScene } from './scenes/PostGameScene';
import { initDevPanel } from './dev/devPanel';
import './state';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  pixelArt: true,
  backgroundColor: '#0d0f1a',
  input: { gamepad: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, GameScene, HubScene, LevelUpScene, PerkTreeScene, UltimateScene, PostGameScene],
});
(window as any).__phaser = game;
initDevPanel();
