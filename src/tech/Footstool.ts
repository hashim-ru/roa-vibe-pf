import type { Fighter } from '../entities/Fighter';
import { bus } from '../core/EventBus';

const FOOTSTOOL_BOUNCE = -10;
const VICTIM_DOWNWARD = 6;
const HORIZ_OVERLAP_FRAC = 0.45;
const VERT_TOLERANCE = 14;

/**
 * Footstool jump — Smash 4 / Ultimate mechanic. If a fighter taps jump
 * while their feet are landing on top of an opponent's head (and they're
 * actually descending), they bounce upward and stomp the opponent down.
 *
 * Rules:
 *  - Stomper must be airborne and falling (vy ≥ 0).
 *  - Stomper's feet within VERT_TOLERANCE of victim's head.
 *  - Horizontal AABB overlap ≥ 45% of stomper width.
 *  - Stomper's `jump` was just pressed this tick.
 *  - Either fighter being in KO / Hitstun aborts.
 *
 * Effect: stomper gets a fresh upward velocity (and one refunded jump
 * the way Smash gives it back), victim is shoved downward and briefly
 * stunned. No damage.
 */
export function processFootstool(fighters: Fighter[]): void {
  for (const a of fighters) {
    if (a.body.grounded) continue;
    if (a.body.vy < 0) continue;
    if (['KO', 'Hitstun', 'LedgeHang'].includes(a.fsm.id ?? '')) continue;
    if (!a.input.justPressed('jump')) continue;
    for (const b of fighters) {
      if (a === b) continue;
      if (['KO'].includes(b.fsm.id ?? '')) continue;
      const aFeet = a.body.y;
      const bHead = b.body.y - b.body.h;
      const dy = aFeet - bHead;
      if (dy < -2 || dy > VERT_TOLERANCE) continue;
      const overlap = Math.min(a.body.x + a.body.w * 0.5, b.body.x + b.body.w * 0.5)
        - Math.max(a.body.x - a.body.w * 0.5, b.body.x - b.body.w * 0.5);
      if (overlap < a.body.w * HORIZ_OVERLAP_FRAC) continue;

      // Stomp!
      a.body.vy = FOOTSTOOL_BOUNCE;
      a.jumpsRemaining = Math.min(1, a.jumpsRemaining + 1);
      b.body.vy = VICTIM_DOWNWARD;
      // Brief stun for the victim — 12f hitstun-equivalent so they can't
      // immediately reset out of the disadvantage.
      b.enterHitstun(12, 0, 0);
      bus.emit('footstool', { stomperId: a.playerIndex, victimId: b.playerIndex });
      break;
    }
  }
}
