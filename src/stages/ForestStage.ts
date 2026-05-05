import { World } from '../physics/World';
import type { StageDef } from './Stage';

export const ForestStage: StageDef = {
  id: 'forest',
  build(): World {
    return new World(
      [
        { x: 240, y: 540, w: 800, h: 40, oneWay: false },
        { x: 320, y: 420, w: 220, h: 16, oneWay: true },
        { x: 740, y: 420, w: 220, h: 16, oneWay: true },
        { x: 540, y: 300, w: 200, h: 16, oneWay: true }
      ],
      [
        { x: 240, y: 540, facing: 1, occupiedBy: null },
        { x: 1040, y: 540, facing: -1, occupiedBy: null }
      ],
      { left: -100, right: 1380, top: -200, bottom: 820 },
      [
        { x: 540, y: 400 },
        { x: 740, y: 400 }
      ]
    );
  }
};
