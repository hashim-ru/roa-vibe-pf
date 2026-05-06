import type { InputState } from '../input/InputState';
import { emptyInput } from '../input/InputState';
import type { CharacterId, StageId } from '../config/GameMode';

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8080;
export const DEFAULT_INPUT_DELAY = 5;

export type Role = 'host' | 'guest';

export type Msg =
  | { t: 'hello'; v: number; role: Role }
  | { t: 'lobby'; host: { char: CharacterId }; guest?: { char: CharacterId; ready: boolean } }
  | { t: 'config'; chars: [CharacterId, CharacterId]; stage: StageId; seed: number; inputDelay: number }
  | { t: 'ready' }
  | { t: 'start'; startTick: number }
  | { t: 'input'; tick: number; mask: number; sx: number; sy: number }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'ping'; t0: number }
  | { t: 'pong'; t0: number; t1: number }
  | { t: 'bye'; reason: string };

export const ACTION_BITS: Record<keyof InputState, number> = {
  left: 1 << 0,
  right: 1 << 1,
  up: 1 << 2,
  down: 1 << 3,
  jump: 1 << 4,
  attack: 1 << 5,
  special: 1 << 6,
  parry: 1 << 7,
  grab: 1 << 8,
  smashMod: 1 << 9,
  // stickX/stickY are sent as separate fields
  stickX: 0,
  stickY: 0
};

export function packInput(s: InputState): { mask: number; sx: number; sy: number } {
  let m = 0;
  if (s.left) m |= ACTION_BITS.left;
  if (s.right) m |= ACTION_BITS.right;
  if (s.up) m |= ACTION_BITS.up;
  if (s.down) m |= ACTION_BITS.down;
  if (s.jump) m |= ACTION_BITS.jump;
  if (s.attack) m |= ACTION_BITS.attack;
  if (s.special) m |= ACTION_BITS.special;
  if (s.parry) m |= ACTION_BITS.parry;
  if (s.grab) m |= ACTION_BITS.grab;
  if (s.smashMod) m |= ACTION_BITS.smashMod;
  return { mask: m, sx: clampStick(s.stickX), sy: clampStick(s.stickY) };
}

export function unpackInput(mask: number, sx: number, sy: number): InputState {
  const s = emptyInput();
  s.left = (mask & ACTION_BITS.left) !== 0;
  s.right = (mask & ACTION_BITS.right) !== 0;
  s.up = (mask & ACTION_BITS.up) !== 0;
  s.down = (mask & ACTION_BITS.down) !== 0;
  s.jump = (mask & ACTION_BITS.jump) !== 0;
  s.attack = (mask & ACTION_BITS.attack) !== 0;
  s.special = (mask & ACTION_BITS.special) !== 0;
  s.parry = (mask & ACTION_BITS.parry) !== 0;
  s.grab = (mask & ACTION_BITS.grab) !== 0;
  s.smashMod = (mask & ACTION_BITS.smashMod) !== 0;
  s.stickX = sx;
  s.stickY = sy;
  return s;
}

function clampStick(v: number): number {
  if (v > 1) return 1;
  if (v < -1) return -1;
  return Math.round(v);
}

export function encode(msg: Msg): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): Msg | null {
  try {
    const m = JSON.parse(raw);
    if (typeof m?.t === 'string') return m as Msg;
  } catch {
    /* fallthrough */
  }
  return null;
}
