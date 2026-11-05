import Phaser from 'phaser';
import { buildGarageArt } from '../render/garageArt';
import { RoomDef } from '../world/apartment';
import { GARAGE } from '../world/garage';
import { RoomScene } from './RoomScene';

/**
 * The garage gym behind the apartment's left door (round 37): hoop, squat rack, bench press, treadmill, dip station +
 * speed bag, the van. The back door leads back into the apartment. (Training interactions come later.)
 */
export class GarageScene extends RoomScene {
  constructor() { super('Garage'); }
  room(): RoomDef { return GARAGE; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildGarageArt(tm); }
}
