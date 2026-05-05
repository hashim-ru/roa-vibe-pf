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

/**
 * Sand Lancer — Marth/Marcina-class. Medium weight, long disjoint reach,
 * tipper sweetspot game. Stats are placeholder (~Marth ratios) and will
 * be tuned 1:1 against kuroganehammer.com Smash 4 + SmashWiki Melee in
 * Phase 3 alongside the moveset frame data.
 *
 * jumpSquat 5f matches Marth (Brawl/Smash 4); shortHop differential
 * matches Marth's full/short ratio.
 */
export const LANCER_STATS: FighterStats = {
  weight: 90,
  walkSpeed: 1.85,
  runSpeed: 5.0,
  groundFriction: 0.79,
  airAccel: 0.21,
  airMaxSpeed: 3.7,
  airFriction: 0.96,
  fullHopVy: -13.2,
  shortHopVy: -8.6,
  doubleJumpVy: -11.6,
  fastFallVy: 14.0,
  maxFallSpeed: 9.5,
  jumpSquatFrames: 5,
  bodyW: 32,
  bodyH: 60
};

/**
 * Hooded Skirmisher — Sheik-class. Featherweight, fastest jab in the cast,
 * combo-heavy with lightning movement. Stats placeholder (~Sheik ratios)
 * tuned 1:1 in Phase 3 against kuroganehammer.com Sheik frame data.
 *
 * jumpSquat 3f matches Sheik (Smash 4); fastFall/maxFall mirror her
 * vertical control profile.
 */
export const HUNTRESS_STATS: FighterStats = {
  weight: 80,
  walkSpeed: 2.4,
  runSpeed: 5.6,
  groundFriction: 0.83,
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
  bodyH: 54
};
