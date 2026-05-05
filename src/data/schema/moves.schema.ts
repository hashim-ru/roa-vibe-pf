export type MoveCategory = 'ground' | 'aerial' | 'special';

/**
 * Hitbox shape variants. Most moves use `rect` (the AABB you'd find in
 * Smash for stubby weapons or kicks), but Lancer's spear and Skirmisher's
 * chain need long thin polygons that don't read well as rects, and large
 * sweep attacks read better as circle/arc.
 *
 *   - rect:   AABB centred on (ox, oy) with size (w, h). Default.
 *   - circle: disc centred on (ox, oy) with `radius`.
 *   - arc:    pie slice centred on (ox, oy) with `radius`,
 *             `arcStart` and `arcEnd` in radians (0 = +x axis,
 *             increases counter-clockwise; flipped with attacker facing).
 *
 * Renderer uses the same shape for the debug overlay so frame-data
 * authoring stays trustable.
 */
export type HitboxShape = 'rect' | 'circle' | 'arc';

export interface HitboxData {
  id: number;
  ox: number;
  oy: number;
  /** Default 'rect' — omit for backward compatibility with rect-only data. */
  shape?: HitboxShape;
  /** rect: width. circle/arc: ignored. */
  w: number;
  /** rect: height. circle/arc: ignored. */
  h: number;
  /** circle/arc only. */
  radius?: number;
  /** arc only — radians, 0 = +x. */
  arcStart?: number;
  /** arc only — radians, must be > arcStart. */
  arcEnd?: number;
  damage: number;
  baseKB: number;
  kbGrowth: number;
  angle: number;
  hitstunMul: number;
  priority: number;
  hitId: string;
  fixedKB?: number;
  effect?: 'normal' | 'spike' | 'launch';
  sfxKey?: string;
  /**
   * Transcendent priority — Smash convention: this hitbox passes through
   * other hitboxes (no clank). Used for sword tippers, spear shafts,
   * disjoints in general.
   */
  transcendent?: boolean;
  /** Electric flame attribute extends hitlag by 1.5×. */
  electric?: boolean;
}

export interface HurtboxOverride {
  fromFrame: number;
  toFrame: number;
  invincible?: boolean;
  intangible?: boolean;
}

export interface SelfMotionFrame {
  frame: number;
  vx?: number;
  vy?: number;
  ax?: number;
  ay?: number;
}

export interface MoveFrame {
  frame: number;
  hitboxes: HitboxData[];
  intangible?: boolean;
  invincible?: boolean;
}

export interface MoveData {
  id: string;
  category: MoveCategory;
  totalFrames: number;
  iasaFrame: number | null;
  lCancelable: boolean;
  landingLag: number;
  autoCancelBefore: number | null;
  autoCancelAfter: number | null;
  frames: MoveFrame[];
  selfMotion?: SelfMotionFrame[];
  hurtboxOverrides?: HurtboxOverride[];
}

export type MoveSet = Record<string, MoveData>;

export function findFrame(move: MoveData, frame: number): MoveFrame | undefined {
  for (const f of move.frames) if (f.frame === frame) return f;
  return undefined;
}
