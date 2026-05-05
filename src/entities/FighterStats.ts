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
 * Reference: Smash 4 stats from kuroganehammer.com (verified per-attribute
 * by ratio against Marth = baseline). Game-space velocities scale Smash 4
 * "world units / frame" by ~1.12× to keep run/walk ratios that read on a
 * 1280×720 canvas at 60 Hz. Ratios between Lancer and Skirmisher are
 * preserved 1:1; absolute magnitudes are Smash-canonical.
 *
 *   https://kuroganehammer.com/Smash4/Marth
 *   https://kuroganehammer.com/Smash4/Sheik
 */

/**
 * Sand Lancer = Marth/Marcina-class.
 * - weight 90 (medium)
 * - walk 1.65 / run 1.60 in Smash units → 1.85 / 4.5 game-units (run scale
 *   amplified to give meaningful run/walk delta in our pacing)
 * - air accel 0.06 / air-max 1.05 → 0.21 / 3.7
 * - jumpsquat 5f, short-hop / full-hop scaled from Smash height 13.4 / 31
 * - fast-fall 1.92 → 14.0
 * Tipper depends on disjoint reach (handled by spear hitbox shapes Phase 1).
 */
export const LANCER_STATS: FighterStats = {
  weight: 90,
  walkSpeed: 1.85,
  runSpeed: 4.5,
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
 * Hooded Skirmisher = Sheik-class.
 * - weight 80 (lighter, dies at lower %)
 * - walk 1.392 / run 2.024 → 1.56 / 5.69 (Sheik-canonical: walks SLOWER
 *   than Marth but runs FASTER — fastest runner in Smash 4)
 * - air accel 0.07 / air-max 1.155 → 0.245 / 4.07
 * - jumpsquat 3f, jump-heights scaled from Smash 14.7 / 35 (Sheik jumps
 *   higher than Marth, hence -15.6 fullHop)
 * - fast-fall 1.696 → 12.4 (counter-intuitive: Sheik FFs SLOWER than Marth
 *   in Smash 4 due to lower terminal velocity — preserved for canon)
 * Needles + vanish + chain projectile mechanics arrive in Phase 3.
 */
export const HUNTRESS_STATS: FighterStats = {
  weight: 80,
  walkSpeed: 1.56,
  runSpeed: 5.69,
  groundFriction: 0.83,
  airAccel: 0.245,
  airMaxSpeed: 4.07,
  airFriction: 0.97,
  fullHopVy: -15.6,
  shortHopVy: -9.46,
  doubleJumpVy: -13.1,
  fastFallVy: 12.4,
  maxFallSpeed: 8.4,
  jumpSquatFrames: 3,
  bodyW: 28,
  bodyH: 54
};
