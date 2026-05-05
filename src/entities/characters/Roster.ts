import type { FighterStats } from '../FighterStats';
import type { MoveSet } from '../../data/schema/moves.schema';
import type { CharacterId } from '../../config/GameMode';
import type { CharacterVisual } from './CharacterVisual';
import { KNIGHT_MOVES } from './knight/Knight';
import { SKIRMISHER_MOVES } from './skirmisher/Skirmisher';
import { WETLANDS_MOVES } from './wetlands/Wetlands';

export interface CharacterDef {
  id: CharacterId;
  displayName: string;
  archetype: string;
  description: string;
  stats: FighterStats;
  moves: MoveSet;
  visual: CharacterVisual;
}

// Stat archetypes — re-used across characters with similar archetype.
const HEAVY_STATS: FighterStats = {
  weight: 115, walkSpeed: 1.9, runSpeed: 4.0,
  groundFriction: 0.76, airAccel: 0.18, airMaxSpeed: 3.4, airFriction: 0.96,
  fullHopVy: -12.5, shortHopVy: -8.0, doubleJumpVy: -11.0,
  fastFallVy: 14.0, maxFallSpeed: 9.5, jumpSquatFrames: 5,
  bodyW: 36, bodyH: 64
};

const MEDIUM_STATS: FighterStats = {
  weight: 95, walkSpeed: 2.2, runSpeed: 4.8,
  groundFriction: 0.80, airAccel: 0.22, airMaxSpeed: 3.8, airFriction: 0.96,
  fullHopVy: -13.0, shortHopVy: -8.5, doubleJumpVy: -11.5,
  fastFallVy: 14.0, maxFallSpeed: 9.5, jumpSquatFrames: 4,
  bodyW: 32, bodyH: 60
};

const LIGHT_STATS: FighterStats = {
  weight: 78, walkSpeed: 2.5, runSpeed: 5.6,
  groundFriction: 0.84, airAccel: 0.26, airMaxSpeed: 4.4, airFriction: 0.97,
  fullHopVy: -14.0, shortHopVy: -9.0, doubleJumpVy: -12.5,
  fastFallVy: 15.0, maxFallSpeed: 10.5, jumpSquatFrames: 3,
  bodyW: 28, bodyH: 54
};

const BOSS_STATS: FighterStats = {
  weight: 145, walkSpeed: 1.7, runSpeed: 3.4,
  groundFriction: 0.72, airAccel: 0.16, airMaxSpeed: 3.0, airFriction: 0.95,
  fullHopVy: -11.5, shortHopVy: -7.6, doubleJumpVy: -10.0,
  fastFallVy: 13.0, maxFallSpeed: 9.5, jumpSquatFrames: 6,
  bodyW: 48, bodyH: 76
};

export const ROSTER: Record<CharacterId, CharacterDef> = {
  knight: {
    id: 'knight',
    displayName: 'Iron Knight',
    archetype: 'Heavy',
    description: 'Plate armor, sword & kite shield. Slow but punishing — big f-smash, sturdy weight.',
    stats: HEAVY_STATS,
    moves: KNIGHT_MOVES,
    visual: {
      // Heraldic azure (loyalty) — primary brand color, distinct from
      // Vanguard silver and Lancer tan at 50% screen size silhouette test.
      bodyColor: 0x3a6da6, accentColor: 0x1f3a66, highlightColor: 0x9ec3e8,
      helmet: 'bucket', helmetAccent: 0x1f3a66, plumeColor: 0xc94a4a,
      weapon: 'sword', weaponMetal: 0xd8dde6, weaponGrip: 0x4a3a22,
      shield: 'kite', shieldColor: 0x1f3a66,
      bodyWidthRatio: 1.0, topPad: 14, cape: 'short', capeColor: 0x142648
    }
  },
  huntress: {
    id: 'huntress',
    displayName: 'Hooded Skirmisher',
    archetype: 'Light',
    description: 'Hooded scout, twin daggers. Fragile but lightning fast — quick combos, weak knockout.',
    stats: LIGHT_STATS,
    moves: SKIRMISHER_MOVES,
    visual: {
      bodyColor: 0x4a6e3a, accentColor: 0x2a3e1f, highlightColor: 0x88a86a,
      helmet: 'hooded', helmetAccent: 0x2a3e1f,
      weapon: 'dagger', weaponMetal: 0xb6c4cc, weaponGrip: 0x3a2a16,
      shield: 'none', shieldColor: 0,
      bodyWidthRatio: 0.85, topPad: 10, cape: 'long', capeColor: 0x2a3e1f,
      // Coiled-low backflip-step windup (dagger thrown from hip)
      windupArmAngle: -0.45,
      idleLean: -0.05
    }
  },
  wetlands: {
    id: 'wetlands',
    displayName: 'Marsh Wraith',
    archetype: 'Boss',
    description: 'Skull-faced specter from the wetlands. Massive reach, heaviest weight, slow but devastating.',
    stats: BOSS_STATS,
    moves: WETLANDS_MOVES,
    visual: {
      bodyColor: 0x141622, accentColor: 0x33363f, highlightColor: 0x6a6e7a,
      helmet: 'skull', helmetAccent: 0xe8e0c0,
      weapon: 'twohand', weaponMetal: 0x55504a, weaponGrip: 0x1a1a1f,
      shield: 'none', shieldColor: 0,
      bodyWidthRatio: 1.15, topPad: 18, cape: 'long', capeColor: 0x0e0e16,
      // Arms-up looming windup (specter-pose)
      windupArmAngle: -2.0,
      idleLean: 0.04
    }
  },
  lancer: {
    id: 'lancer',
    displayName: 'Sand Lancer',
    archetype: 'Medium',
    description: 'Conical helm, long spear. Excellent reach, moderate speed, unflinching jab.',
    stats: MEDIUM_STATS,
    moves: KNIGHT_MOVES,
    visual: {
      bodyColor: 0xb59060, accentColor: 0x6e3a1f, highlightColor: 0xf2d7a0,
      helmet: 'pointed', helmetAccent: 0x6e3a1f, plumeColor: 0xc94a4a,
      weapon: 'spear', weaponMetal: 0xd8dde6, weaponGrip: 0x4a3a22,
      shield: 'round', shieldColor: 0x6e3a1f,
      bodyWidthRatio: 0.95, topPad: 18, cape: 'short', capeColor: 0x6e3a1f,
      // Strict vertical drill — spear pulled fully behind in horizontal silhouette
      windupArmAngle: -1.4,
      idleLean: 0
    }
  },
  reaver: {
    id: 'reaver',
    displayName: 'Highland Reaver',
    archetype: 'Heavy',
    description: 'Horned helm, two-handed axe. Huge damage, leaves himself open — bait & punish.',
    stats: HEAVY_STATS,
    moves: KNIGHT_MOVES,
    visual: {
      bodyColor: 0x8a4a2a, accentColor: 0x3a1f0e, highlightColor: 0xc28855,
      helmet: 'horned', helmetAccent: 0x3a1f0e, plumeColor: 0xb88a3a,
      weapon: 'axe', weaponMetal: 0xb0b8c0, weaponGrip: 0x3a2316,
      shield: 'none', shieldColor: 0,
      bodyWidthRatio: 1.05, topPad: 20, cape: 'short', capeColor: 0x3a1f0e,
      // Axe-overhead full-body lean back (Reaver = Falcon Punch energy)
      windupArmAngle: -1.6,
      idleLean: 0.06
    }
  },
  guardian: {
    id: 'guardian',
    displayName: 'Royal Guardian',
    archetype: 'Heavy',
    description: 'Crowned plumed helm, mace & tower shield. Wall-of-meat tank with stagger-heavy hits.',
    stats: HEAVY_STATS,
    moves: KNIGHT_MOVES,
    visual: {
      bodyColor: 0x4a3578, accentColor: 0xc5a04a, highlightColor: 0x9e6cd2,
      helmet: 'crowned', helmetAccent: 0xc5a04a, plumeColor: 0xc5a04a,
      weapon: 'mace', weaponMetal: 0xa0a4a8, weaponGrip: 0x35225a,
      shield: 'tower', shieldColor: 0x35225a,
      bodyWidthRatio: 1.05, topPad: 24, cape: 'long', capeColor: 0x4a3578,
      // Total stillness — mace coiled behind shield with deep windup
      windupArmAngle: -1.2,
      idleLean: 0
    }
  },
  ranger: {
    id: 'ranger',
    displayName: 'Forest Ranger',
    archetype: 'Light',
    description: 'Hooded bowman. Tricky zoner, fast aerials, weak ground combat.',
    stats: LIGHT_STATS,
    moves: SKIRMISHER_MOVES,
    visual: {
      // Deep teal — separates Ranger from Skirmisher's forest green so the
      // two hooded silhouettes never blur together in 2v2 mental parsing.
      bodyColor: 0x2a7a78, accentColor: 0x153c3c, highlightColor: 0x55b8b3,
      helmet: 'hooded', helmetAccent: 0x153c3c,
      weapon: 'bow', weaponMetal: 0x6a4a22, weaponGrip: 0x3a2316,
      shield: 'buckler', shieldColor: 0x4a2e16,
      bodyWidthRatio: 0.88, topPad: 12, cape: 'long', capeColor: 0x153c3c,
      // Drawing-the-bow — arm pulls way back like nocking an arrow
      windupArmAngle: -1.8,
      idleLean: -0.03
    }
  },
  vanguard: {
    id: 'vanguard',
    displayName: 'Steel Vanguard',
    archetype: 'Medium',
    description: 'Feathered helm, long sword. All-rounder — solid kit, no glaring weakness.',
    stats: MEDIUM_STATS,
    moves: KNIGHT_MOVES,
    visual: {
      bodyColor: 0xb0b4bc, accentColor: 0x4a5566, highlightColor: 0xe6eaf0,
      helmet: 'feathered', helmetAccent: 0x4a5566, plumeColor: 0xc8d0e0,
      weapon: 'twohand', weaponMetal: 0xd8dde6, weaponGrip: 0x35435a,
      shield: 'none', shieldColor: 0,
      bodyWidthRatio: 1.0, topPad: 16, cape: 'short', capeColor: 0x4a5566
    }
  }
};

export const ALL_CHARACTERS: CharacterId[] = [
  'knight', 'huntress', 'wetlands', 'lancer',
  'reaver', 'guardian', 'ranger', 'vanguard'
];
