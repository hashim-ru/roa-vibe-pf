import type { Fighter } from './Fighter';
import type { MoveData } from '../data/schema/moves.schema';

/**
 * Maps the player's stick + buttons to a specific attack from the moveset.
 * Called by the prior state (Idle/Walk/Crouch/Fall) when `attack` is pressed.
 * Returns true if a move was started and the caller should transition.
 */
export function tryStartAttack(f: Fighter, _tick: number): MoveData | null {
  const cur = f.input.current();
  const stickX = cur.stickX;
  const stickY = cur.stickY;
  const smash = cur.smashMod;

  if (!f.body.grounded) {
    if (Math.abs(stickX) > 0.3) {
      const forward = Math.sign(stickX) === f.facing;
      return (forward ? f.moves['fair'] : f.moves['bair']) ?? f.moves['nair'] ?? f.moves['jab'] ?? null;
    }
    if (stickY < -0.3) return f.moves['uair'] ?? f.moves['nair'] ?? null;
    if (stickY > 0.3) return f.moves['dair'] ?? f.moves['nair'] ?? null;
    return f.moves['nair'] ?? f.moves['jab'] ?? null;
  }

  if (smash) {
    if (Math.abs(stickX) > 0.3) {
      f.facing = stickX > 0 ? 1 : -1;
      return f.moves['fsmash'] ?? f.moves['ftilt'] ?? f.moves['jab'] ?? null;
    }
    if (stickY < -0.3) return f.moves['usmash'] ?? f.moves['utilt'] ?? null;
    if (stickY > 0.3) return f.moves['dsmash'] ?? f.moves['dtilt'] ?? null;
  }
  if (Math.abs(stickX) > 0.3) {
    f.facing = stickX > 0 ? 1 : -1;
    return f.moves['ftilt'] ?? f.moves['jab'] ?? null;
  }
  if (stickY < -0.3) return f.moves['utilt'] ?? f.moves['jab'] ?? null;
  if (stickY > 0.3) return f.moves['dtilt'] ?? f.moves['jab'] ?? null;
  return f.moves['jab'] ?? null;
}

export function trySpecial(f: Fighter): MoveData | null {
  const cur = f.input.current();
  const stickX = cur.stickX;
  const stickY = cur.stickY;
  if (Math.abs(stickX) > 0.3) {
    f.facing = stickX > 0 ? 1 : -1;
    return f.moves['sideB'] ?? f.moves['neutralB'] ?? null;
  }
  if (stickY < -0.3) return f.moves['upB'] ?? f.moves['neutralB'] ?? null;
  if (stickY > 0.3) return f.moves['downB'] ?? f.moves['neutralB'] ?? null;
  return f.moves['neutralB'] ?? null;
}

export function startAttack(f: Fighter, move: MoveData, tick: number): void {
  f.startMove(move, tick);
}
