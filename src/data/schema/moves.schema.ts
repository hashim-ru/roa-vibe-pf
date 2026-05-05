export type MoveCategory = 'ground' | 'aerial' | 'special';

export interface HitboxData {
  id: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
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
