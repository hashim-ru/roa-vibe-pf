import type { Pose } from './Pose';
import type { CharacterId } from '../../config/GameMode';

/**
 * Per-attack key-pose table — three keyframe poses per move that the
 * FighterRenderer interpolates through. Structure mirrors Sakurai's
 * "anticipation → active → follow-through" beat:
 *
 *   anticipation: pose at frame 0 of windup. Eased TO this from the
 *                 fighter's resting idle pose.
 *   active:       pose held during the active hitbox window.
 *   followThrough: pose eased back to rest by `iasaFrame` /
 *                  `totalFrames`. With easeOutBack overshoot the
 *                  recovery feels weighted.
 *
 * Default pose blocks at the bottom of this file fall back to FighterRenderer's
 * generic 3-phase formula if a move isn't in the table.
 */
export interface AttackKeyPoses {
  anticipation?: Pose;
  active: Pose;
  followThrough?: Pose;
}

/**
 * Sand Lancer — Marth/Marcina-class. Each move is built around the spear
 * shaft as the dominant visual: thrusts emphasize forward extension,
 * smashes pull the polearm fully behind for windup, dolphin slash sweeps
 * upward, counter freezes pose then snaps forward.
 */
const LANCER: Record<string, AttackKeyPoses> = {
  // Quick forward stab — short windup, snappy commit.
  jab: {
    anticipation: { shoulderFront: -1.0, elbowFront: 0.55, torso: -Math.PI / 2 - 0.05 },
    active: { shoulderFront: 0.05, elbowFront: 0.05, torso: -Math.PI / 2 + 0.10 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.4 }
  },
  // Combo step — a touch tighter pose, slightly more body engagement.
  jab2: {
    anticipation: { shoulderFront: -0.9, elbowFront: 0.65, torso: -Math.PI / 2 - 0.04 },
    active: { shoulderFront: 0.10, elbowFront: 0.0, torso: -Math.PI / 2 + 0.12 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.4 }
  },
  // Forward spear thrust — body lunges, spear extends arm-straight.
  ftilt: {
    anticipation: { shoulderFront: -1.2, elbowFront: 0.7, torso: -Math.PI / 2 - 0.08, hipFront: Math.PI / 2 - 0.10 },
    active: { shoulderFront: 0.0, elbowFront: -0.05, torso: -Math.PI / 2 + 0.12, hipFront: Math.PI / 2 - 0.30 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.4 }
  },
  // Anti-air — spear thrust upward at ~95°.
  utilt: {
    anticipation: { shoulderFront: -1.6, elbowFront: 0.6, torso: -Math.PI / 2 - 0.05 },
    active: { shoulderFront: -1.45, elbowFront: 0.0, torso: -Math.PI / 2 - 0.12 },
    followThrough: { shoulderFront: -0.7, elbowFront: 0.3 }
  },
  // Low pokey thrust — body crouches.
  dtilt: {
    anticipation: { shoulderFront: -0.5, elbowFront: 0.7, hipBack: Math.PI / 2 + 0.45, hipFront: Math.PI / 2 - 0.45, kneeBack: -0.7, kneeFront: -0.7 },
    active: { shoulderFront: 0.30, elbowFront: 0.0, hipBack: Math.PI / 2 + 0.45, hipFront: Math.PI / 2 - 0.45, kneeBack: -0.7, kneeFront: -0.7 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  // Heavy fsmash — fully horizontal silhouette during windup, then
  // committed forward thrust with body pitched into the strike.
  fsmash: {
    anticipation: { shoulderFront: -1.55, elbowFront: 1.1, torso: -Math.PI / 2 - 0.15, hipBack: Math.PI / 2 + 0.30 },
    active: { shoulderFront: 0.20, elbowFront: -0.10, torso: -Math.PI / 2 + 0.18, hipFront: Math.PI / 2 - 0.32 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.4 }
  },
  // Vertical KO — both arms lift the spear overhead, plant.
  usmash: {
    anticipation: { shoulderFront: -2.2, elbowFront: 0.6, shoulderBack: -2.0, elbowBack: 0.4, torso: -Math.PI / 2 - 0.05 },
    active: { shoulderFront: -1.50, elbowFront: 0.0, shoulderBack: -1.3, elbowBack: 0.2, torso: -Math.PI / 2 - 0.20 },
    followThrough: { shoulderFront: -0.7, elbowFront: 0.3 }
  },
  // Wide sweep — body spins.
  dsmash: {
    anticipation: { shoulderFront: -0.4, elbowFront: 0.5, torso: -Math.PI / 2 + 0.10 },
    active: { shoulderFront: 0.25, elbowFront: 0.10, torso: -Math.PI / 2 + 0.10 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.4 }
  },
  // Spinning aerial — tucked legs.
  nair: {
    anticipation: { shoulderFront: -1.0, elbowFront: 0.7, kneeFront: -0.6, kneeBack: -0.6 },
    active: { shoulderFront: 0.05, elbowFront: 0.10, kneeFront: -0.5, kneeBack: -0.5 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  },
  // Forward aerial — extension out front + slight downward chop angle.
  fair: {
    anticipation: { shoulderFront: -1.3, elbowFront: 0.8, kneeFront: -0.45 },
    active: { shoulderFront: -0.05, elbowFront: 0.0, kneeFront: -0.45 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.5 }
  },
  // Reverse aerial — front shoulder rotates to back, body twists.
  bair: {
    anticipation: { shoulderFront: -0.4, elbowFront: 0.5, torso: -Math.PI / 2 + 0.20 },
    active: { shoulderFront: 1.20, elbowFront: 0.30, torso: -Math.PI / 2 + 0.30 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  },
  // Upward thrust.
  uair: {
    anticipation: { shoulderFront: -1.4, elbowFront: 0.5 },
    active: { shoulderFront: -1.55, elbowFront: -0.05 },
    followThrough: { shoulderFront: -0.7, elbowFront: 0.3 }
  },
  // Downward stab spike.
  dair: {
    anticipation: { shoulderFront: -1.2, elbowFront: 0.7 },
    active: { shoulderFront: 1.55, elbowFront: 0.05 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  },
  // Shield breaker (charge held + thrust).
  neutralB: {
    anticipation: { shoulderFront: -1.6, elbowFront: 0.95, torso: -Math.PI / 2 - 0.15 },
    active: { shoulderFront: 0.10, elbowFront: -0.05, torso: -Math.PI / 2 + 0.15 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  },
  // Dancing blade hit 1 — quick step forward + thrust.
  sideB: {
    anticipation: { shoulderFront: -1.1, elbowFront: 0.7 },
    active: { shoulderFront: 0.05, elbowFront: 0.0 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  },
  // Dolphin slash — vertical leap with arm raised, intangible f1-4.
  upB: {
    anticipation: { shoulderFront: -1.0, elbowFront: 0.5, kneeFront: -0.6, kneeBack: -0.6 },
    active: { shoulderFront: -1.55, elbowFront: -0.05, kneeFront: -0.30, kneeBack: -0.30, torso: -Math.PI / 2 - 0.15 },
    followThrough: { shoulderFront: -0.7, elbowFront: 0.3 }
  },
  // Counter — held intangible pose, then snap forward on parry.
  downB: {
    anticipation: { shoulderFront: 0.8, elbowFront: 1.4, torso: -Math.PI / 2 + 0.05 },
    active: { shoulderFront: 0.1, elbowFront: -0.05, torso: -Math.PI / 2 + 0.12 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.5 }
  }
};

/**
 * Hooded Skirmisher — Sheik-class. Daggers + speed; poses emphasize
 * compact tight movement, twirls, kicks, and the vanish teleport (which
 * reads as a low-stance "duck" then re-emerge). Many moves use legs
 * actively (kicks for fsmash/usmash/dair).
 */
const SKIRMISHER: Record<string, AttackKeyPoses> = {
  jab: {
    anticipation: { shoulderFront: -0.4, elbowFront: 0.6 },
    active: { shoulderFront: 0.10, elbowFront: 0.0 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  jab2: {
    anticipation: { shoulderFront: -0.3, elbowFront: 0.7 },
    active: { shoulderFront: 0.20, elbowFront: -0.05 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  // Variable-angle stab.
  ftilt: {
    anticipation: { shoulderFront: -0.6, elbowFront: 0.5 },
    active: { shoulderFront: 0.0, elbowFront: 0.0 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  // Scissors slash — both arms cut upward.
  utilt: {
    anticipation: { shoulderFront: -1.4, shoulderBack: -1.0, elbowFront: 0.5, elbowBack: 0.5 },
    active: { shoulderFront: -0.95, shoulderBack: -1.5, elbowFront: -0.05, elbowBack: -0.05 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.5 }
  },
  // Pop-up — body crouches, dagger flicks up.
  dtilt: {
    anticipation: { shoulderFront: -0.3, hipBack: Math.PI / 2 + 0.4, hipFront: Math.PI / 2 - 0.4, kneeBack: -0.7, kneeFront: -0.7 },
    active: { shoulderFront: -0.6, elbowFront: -0.1, hipBack: Math.PI / 2 + 0.4, hipFront: Math.PI / 2 - 0.4, kneeBack: -0.7, kneeFront: -0.7 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  // Multi-hit dagger spin — body spins (torso rotates).
  fsmash: {
    anticipation: { shoulderFront: -0.4, elbowFront: 0.5, torso: -Math.PI / 2 + 0.15 },
    active: { shoulderFront: 0.40, elbowFront: 0.10, torso: -Math.PI / 2 - 0.10 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  // Vault kick upward.
  usmash: {
    anticipation: { hipFront: Math.PI / 2 - 0.4, kneeFront: -1.0, hipBack: Math.PI / 2 + 0.5, kneeBack: -0.6 },
    active: { hipFront: -0.6, kneeFront: -0.2, hipBack: Math.PI / 2 + 0.4, kneeBack: -0.4, torso: -Math.PI / 2 - 0.30 },
    followThrough: { hipFront: Math.PI / 2 - 0.18, kneeFront: 0 }
  },
  // Spinning sweep both sides.
  dsmash: {
    anticipation: { hipBack: Math.PI / 2 + 0.5, hipFront: Math.PI / 2 - 0.5, kneeBack: -0.8, kneeFront: -0.8 },
    active: { hipFront: 0.4, kneeFront: -0.2, hipBack: Math.PI / 2 + 0.5, torso: -Math.PI / 2 + 0.15 },
    followThrough: { hipFront: Math.PI / 2 - 0.18, kneeFront: 0 }
  },
  // Sex-kick aerial — body horizontal.
  nair: {
    anticipation: { hipFront: Math.PI / 2 - 0.55, kneeFront: -0.3 },
    active: { hipFront: -0.1, kneeFront: -0.05, torso: -Math.PI / 2 + 0.15 },
    followThrough: { hipFront: Math.PI / 2 - 0.18, kneeFront: 0 }
  },
  fair: {
    anticipation: { shoulderFront: -0.5, elbowFront: 0.6 },
    active: { shoulderFront: 0.05, elbowFront: 0.05 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  // Reverse heel kick.
  bair: {
    anticipation: { hipBack: Math.PI / 2 + 0.4, kneeBack: -0.8 },
    active: { hipBack: 0.2, kneeBack: -0.1, torso: -Math.PI / 2 + 0.20 },
    followThrough: { hipBack: Math.PI / 2 + 0.18, kneeBack: 0 }
  },
  // Scissor stab upward.
  uair: {
    anticipation: { shoulderFront: -1.4, elbowFront: 0.5 },
    active: { shoulderFront: -1.55, elbowFront: -0.05 },
    followThrough: { shoulderFront: -0.55, elbowFront: 0.5 }
  },
  // Drill spike — body rotates downward, dagger pointing down.
  dair: {
    anticipation: { shoulderFront: 0.6, elbowFront: 1.0, torso: -Math.PI / 2 + 0.20 },
    active: { shoulderFront: 1.55, elbowFront: 0.05, torso: -Math.PI / 2 + 0.40 },
    followThrough: { shoulderFront: -0.4, elbowFront: 0.5 }
  },
  // Needle storm — drawn-bow-like nock pose.
  neutralB: {
    anticipation: { shoulderFront: -1.8, elbowFront: 1.0 },
    active: { shoulderFront: 0.10, elbowFront: 0.0 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  },
  // Chain whip — extended forward thrust.
  sideB: {
    anticipation: { shoulderFront: -0.6, elbowFront: 0.7 },
    active: { shoulderFront: 0.10, elbowFront: -0.05 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  },
  // Vanish — duck pose then disappear.
  upB: {
    anticipation: { hipBack: Math.PI / 2 + 0.6, hipFront: Math.PI / 2 - 0.6, kneeBack: -1.0, kneeFront: -1.0, torso: -Math.PI / 2 - 0.25 },
    active: { hipBack: Math.PI / 2 + 0.30, hipFront: Math.PI / 2 - 0.30, kneeBack: -0.4, kneeFront: -0.4, torso: -Math.PI / 2 + 0.10 },
    followThrough: { kneeBack: 0, kneeFront: 0 }
  },
  // Burst grenade — overhand throw.
  downB: {
    anticipation: { shoulderFront: -1.4, elbowFront: 0.6 },
    active: { shoulderFront: -0.30, elbowFront: 0.0 },
    followThrough: { shoulderFront: -0.5, elbowFront: 0.5 }
  }
};

const POSE_TABLES: Record<CharacterId, Record<string, AttackKeyPoses>> = {
  lancer: LANCER,
  huntress: SKIRMISHER
};

export function getAttackPoses(charId: CharacterId, moveId: string): AttackKeyPoses | null {
  const table = POSE_TABLES[charId];
  if (!table) return null;
  return table[moveId] ?? null;
}
