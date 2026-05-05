import { World } from '../physics/World';
import type { StageTheme } from '../render/StageRenderer';

/**
 * Battlefield — tournament-spec Smash Ultimate-style platform layout.
 * Main platform (collidable) + 3 small soft platforms above (one-way).
 *
 * Coordinates calibrated for a 1280×720 canvas:
 *   blast zones: x ∈ [-200, 1480], y ∈ [-300, 920]
 *   spawn pts: P1 (440, 400), P2 (840, 400)
 */
export const BattlefieldTheme: StageTheme = {
  skyTop: 0x0e2640,
  skyBottom: 0x2c4a55,
  far: 0x1a2c3a,
  mid: 0x152030,
  near: 0x0d1822,
  platTop: 0x6e5a35,
  platShadow: 0x402c1c
};

export const Battlefield = {
  build(): World {
    return new World(
      [
        // Main platform — solid collidable floor
        { x: 240, y: 540, w: 800, h: 40, oneWay: false },
        // Side platforms — one-way pass-through (drop with down + hold)
        { x: 360, y: 380, w: 200, h: 16, oneWay: true },
        { x: 720, y: 380, w: 200, h: 16, oneWay: true },
        // Top platform
        { x: 540, y: 240, w: 200, h: 16, oneWay: true }
      ],
      [
        { x: 240, y: 540, facing: 1, occupiedBy: null },
        { x: 1040, y: 540, facing: -1, occupiedBy: null }
      ],
      { left: -200, right: 1480, top: -300, bottom: 920 },
      [
        { x: 440, y: 400 },
        { x: 840, y: 400 }
      ]
    );
  },
  theme: BattlefieldTheme
};
