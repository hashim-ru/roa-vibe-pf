import type { Fighter } from '../entities/Fighter';
import type { LedgePoint } from '../physics/World';

const SNAP_RADIUS = 26;

/**
 * Returns the ledge if `f` should grab it now, otherwise null. Caller is
 * responsible for transitioning the FSM to LedgeHang and `attach`-ing the
 * ledge to the state instance.
 *
 * Honors the 20-frame regrab lockout (`ledgeRegrabLockUntil`) so a fighter
 * who just released a ledge can't insta-regrab for fresh intangibility.
 */
export function findGrabbableLedge(f: Fighter, tick: number): LedgePoint | null {
  if (f.body.grounded) return null;
  if (tick < f.ledgeRegrabLockUntil) return null;
  // Skip the narrow "slow rising" band; only reject mid-rise on a normal jump.
  if (f.body.vy < -0.5 && f.body.vy > -8) return null;
  if (['Hitstun', 'KO', 'AirDodge', 'LedgeHang'].includes(f.fsm.id ?? '')) return null;

  for (const ledge of f.world.ledges) {
    if (ledge.occupiedBy !== null) continue;
    const dx = f.body.x - ledge.x;
    const dy = f.body.y - f.body.h * 0.5 - ledge.y;
    if (Math.abs(dx) > SNAP_RADIUS) continue;
    if (Math.abs(dy) > SNAP_RADIUS * 1.4) continue;

    const facingTowardLedge = (ledge.facing === 1 && dx > 0) || (ledge.facing === -1 && dx < 0);
    if (!facingTowardLedge) continue;
    return ledge;
  }
  return null;
}
