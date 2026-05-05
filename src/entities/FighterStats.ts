export interface FighterStats {
  weight: number;
  walkSpeed: number;
  runSpeed: number;
  groundFriction: number;
  airAccel: number;
  airMaxSpeed: number;
  airFriction: number;
  fullHopVy: number;
  shortHopVy: number;
  doubleJumpVy: number;
  fastFallVy: number;
  maxFallSpeed: number;
  jumpSquatFrames: number;
  bodyW: number;
  bodyH: number;
}

// Sizes calibrated so on-screen height roughly matches sprite scale:
//   Knight ~70px tall  →  bodyH 64
//   Huntress ~58px tall →  bodyH 52
//   Wetlands ~88px tall →  bodyH 80
// Weight follows archetype, not visual size: heavier weight = takes less KB.

export const KNIGHT_STATS: FighterStats = {
  weight: 105,
  walkSpeed: 2.0,
  runSpeed: 4.4,
  groundFriction: 0.78,
  airAccel: 0.22,
  airMaxSpeed: 3.6,
  airFriction: 0.96,
  fullHopVy: -13.0,
  shortHopVy: -8.5,
  doubleJumpVy: -11.5,
  fastFallVy: 14.0,
  maxFallSpeed: 9.5,
  jumpSquatFrames: 4,
  bodyW: 36,
  bodyH: 64
};

export const WETLANDS_STATS: FighterStats = {
  weight: 150,
  walkSpeed: 1.7,
  runSpeed: 3.4,
  groundFriction: 0.72,
  airAccel: 0.16,
  airMaxSpeed: 3.0,
  airFriction: 0.95,
  fullHopVy: -11.5,
  shortHopVy: -7.6,
  doubleJumpVy: -10.0,
  fastFallVy: 13.0,
  maxFallSpeed: 9.5,
  jumpSquatFrames: 6,
  bodyW: 56,
  bodyH: 80
};

export const SKIRMISHER_STATS: FighterStats = {
  weight: 78,
  walkSpeed: 2.4,
  runSpeed: 5.6,
  groundFriction: 0.82,
  airAccel: 0.26,
  airMaxSpeed: 4.4,
  airFriction: 0.97,
  fullHopVy: -14.0,
  shortHopVy: -9.2,
  doubleJumpVy: -12.5,
  fastFallVy: 15.5,
  maxFallSpeed: 10.5,
  jumpSquatFrames: 3,
  bodyW: 28,
  bodyH: 52
};
