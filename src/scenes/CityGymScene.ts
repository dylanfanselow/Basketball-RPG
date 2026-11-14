import Phaser from 'phaser';
import { GarageScene } from './GarageScene';
import { RoomDef } from '../world/apartment';
import { CITY_GYM } from '../world/cityGym';
import { GYM_XP_MULT } from '../world/city';
import { buildCityGymArt } from '../render/cityGymArt';
import { ORB_XP } from '../career/career';
import { FONT } from './ui';

/**
 * Round 93 (owner): Iron Works, the big gym downtown (from the city map, after a day pass). The garage's machines and
 * mini-games, but every orb carries GYM_XP_MULT x the XP for the same energy. The door and L1 go back to the map.
 */
export class CityGymScene extends GarageScene {
  constructor() { super('CityGym'); }
  room(): RoomDef { return CITY_GYM; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildCityGymArt(tm); }
  orbXp() { return ORB_XP * GYM_XP_MULT; }
  leaveTo(): [string, object | undefined] { return ['City', { at: 'gym' }]; }
  onCreate() {
    super.onCreate();
    this.add.text(640, 690, `IRON WORKS  ·  ${GYM_XP_MULT}x GAINS PER ENERGY`, { fontFamily: FONT, fontSize: '15px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(9001);
  }
}
