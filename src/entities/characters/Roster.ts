import type { FighterStats } from '../FighterStats';
import { LANCER_STATS, HUNTRESS_STATS } from '../FighterStats';
import type { MoveSet } from '../../data/schema/moves.schema';
import type { CharacterId } from '../../config/GameMode';
import type { CharacterVisual } from './CharacterVisual';
import { LANCER_MOVES } from './lancer/Lancer';
import { HUNTRESS_MOVES } from './skirmisher/Skirmisher';

export interface CharacterDef {
  id: CharacterId;
  displayName: string;
  archetype: string;
  description: string;
  stats: FighterStats;
  moves: MoveSet;
  visual: CharacterVisual;
}

/**
 * Tech-demo roster. Two characters built to Marth-class / Sheik-class
 * reference depth, chosen because they're the most-different pair to
 * stress-test the matchup balance:
 *
 *   - Sand Lancer: medium weight, long disjoint reach, tipper sweetspots
 *     (Marth/Marcina-class).
 *   - Hooded Skirmisher: featherweight, fastest jab in the cast,
 *     combo-heavy with needle storm and vanish teleport (Sheik-class).
 *
 * Visual style: smooth flat-vector (Hollow Knight / Death's Door / Hades).
 * Halal-relaxed: ambient stage audio OK, but no melodic music, no female
 * characters, helmets always cover faces, no religious symbols.
 */
export const ROSTER: Record<CharacterId, CharacterDef> = {
  lancer: {
    id: 'lancer',
    displayName: 'Sand Lancer',
    archetype: 'Spearman',
    description:
      'Conical helm, long polearm. Tipper sweetspots reward disciplined spacing — patient zoner with brutal punishes.',
    stats: LANCER_STATS,
    moves: LANCER_MOVES,
    visual: {
      bodyColor: 0xb59060,
      accentColor: 0x6e3a1f,
      highlightColor: 0xf2d7a0,
      helmet: 'pointed',
      helmetAccent: 0x6e3a1f,
      plumeColor: 0xc94a4a,
      weapon: 'spear',
      weaponMetal: 0xd8dde6,
      weaponGrip: 0x4a3a22,
      shield: 'round',
      shieldColor: 0x6e3a1f,
      bodyWidthRatio: 0.95,
      topPad: 18,
      cape: 'short',
      capeColor: 0x6e3a1f,
      // Strict vertical drill — spear pulled fully behind into a
      // horizontal silhouette during anticipation.
      windupArmAngle: -1.4,
      idleLean: 0
    }
  },
  huntress: {
    id: 'huntress',
    displayName: 'Hooded Skirmisher',
    archetype: 'Trickster',
    description:
      'Hooded scout, twin daggers + needle storm. Fragile but lightning fast — combo-heavy with teleport mixups.',
    stats: HUNTRESS_STATS,
    moves: HUNTRESS_MOVES,
    visual: {
      bodyColor: 0x4a6e3a,
      accentColor: 0x2a3e1f,
      highlightColor: 0x88a86a,
      helmet: 'hooded',
      helmetAccent: 0x2a3e1f,
      weapon: 'dagger',
      weaponMetal: 0xb6c4cc,
      weaponGrip: 0x3a2a16,
      shield: 'none',
      shieldColor: 0,
      bodyWidthRatio: 0.85,
      topPad: 10,
      cape: 'long',
      capeColor: 0x2a3e1f,
      // Coiled-low backflip-step windup (dagger thrown from hip).
      windupArmAngle: -0.45,
      idleLean: -0.05
    }
  }
};

export const ALL_CHARACTERS: CharacterId[] = ['lancer', 'huntress'];
