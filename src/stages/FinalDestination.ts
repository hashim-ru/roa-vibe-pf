import { World } from '../physics/World';
import type { StageTheme } from '../render/StageRenderer';

/**
 * Final Destination — 1 wide flat platform, no aerial cover. Esport
 * pure-neutral stage where positioning + spacing decide every match.
 * No edges to grab? No — we keep 2 ledges so recoveries still work
 * and edge-guarding mind-games still apply.
 *
 * Theme: cold mountain peak with misty silhouettes and steely sky.
 * Calibrated against the same blast zones as Battlefield so frame data
 * timings stay consistent.
 */
export const FinalDestinationTheme: StageTheme = {
  skyTop: 0x1a2030,
  skyBottom: 0x4a5a6a,
  far: 0x223040,
  mid: 0x1a2532,
  near: 0x101820,
  platTop: 0x6a6e7a,
  platShadow: 0x2a2e3a
};

export const FinalDestination = {
  build(): World {
    return new World(
      [
        // Single wide flat platform, slightly lower than Battlefield's
        // main so the same jump heights still clear the side platforms
        // mentally — keeps muscle memory consistent across stages.
        { x: 180, y: 540, w: 920, h: 60, oneWay: false }
      ],
      [
        { x: 180, y: 540, facing: 1, occupiedBy: null },
        { x: 1100, y: 540, facing: -1, occupiedBy: null }
      ],
      { left: -200, right: 1480, top: -300, bottom: 920 },
      [
        { x: 460, y: 400 },
        { x: 820, y: 400 }
      ]
    );
  },
  theme: FinalDestinationTheme
};
