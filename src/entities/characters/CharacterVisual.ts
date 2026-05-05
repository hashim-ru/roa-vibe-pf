/**
 * Pure-config visual description of a character. The CodeFighterRenderer
 * draws every fighter from one of these. No sprite assets involved — the
 * character's silhouette is composed at runtime from primitive shapes.
 *
 * Halal-by-construction: no facial features ever drawn; helmets cover
 * everything; no religious symbols; no figurative art.
 */
export type HelmetStyle =
  | 'bucket' // simple flat-top great helm
  | 'pointed' // conical (norman/spangenhelm)
  | 'horned' // viking horns
  | 'hooded' // soft hood, no metal
  | 'crowned' // royal w/ raised crown
  | 'skull' // bare skull-mask wraith style
  | 'feathered'; // turban-ish layered

export type WeaponType =
  | 'sword' // straight blade
  | 'spear' // long pole + tip
  | 'axe' // short handle + big head
  | 'dagger' // short blade
  | 'mace' // ball on chain or stick
  | 'bow' // unstrung curve (no arrow string)
  | 'twohand' // big two-handed sword
  | 'none';

export type ShieldType = 'none' | 'kite' | 'round' | 'tower' | 'buckler';

export interface CharacterVisual {
  /** Primary armor color (body fill) */
  bodyColor: number;
  /** Trim and edges */
  accentColor: number;
  /** Highlights */
  highlightColor: number;
  /** Helmet style and trim color */
  helmet: HelmetStyle;
  helmetAccent: number;
  /** Optional plume color (use accent if not set) */
  plumeColor?: number;
  /** Weapon held in main hand */
  weapon: WeaponType;
  /** Color of the weapon's metal */
  weaponMetal: number;
  /** Color of the weapon's grip/handle */
  weaponGrip: number;
  /** Shield worn off-hand */
  shield: ShieldType;
  shieldColor: number;
  /** Proportional ratio of body width vs hitbox width (visual fudge) */
  bodyWidthRatio: number; // typically 0.85..1.05
  /** Render extends ABOVE hitbox by this many px (for plumes/crowns) */
  topPad: number;
  /** Cape behind body (looks dynamic on motion) */
  cape: 'none' | 'short' | 'long';
  capeColor: number;
  /**
   * Optional anticipation arm angle override. Default -0.78 rad (arm hangs
   * down/back). Per Sakurai's character-tell principle each fighter should
   * have a recognizable windup pose: e.g., reaver pulls axe overhead (-1.6),
   * skirmisher coils low (-0.45), wraith arms-up looming (-2.0).
   */
  windupArmAngle?: number;
  /**
   * Constant idle lean (radians). Reaver leans back ~0.06; Skirmisher
   * forward ~-0.05; Wraith hovers slight S-curve. Adds personality beyond
   * the default vertical stance.
   */
  idleLean?: number;
}
