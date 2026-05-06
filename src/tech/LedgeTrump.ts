import type { Fighter } from '../entities/Fighter';
import { bus } from '../core/EventBus';

const TRUMP_RADIUS = 26;

/**
 * Ledge trump — when a fighter approaches a ledge that's already
 * occupied by an opponent, the new arrival kicks the previous occupant
 * off into a brief hitstun. Smash 4 / Ultimate canon: a fighter who
 * lingered on the ledge can be punished by a fresher recovery.
 *
 * The trump only fires if:
 *  - The new fighter is airborne, in Fall (not in attack / hitstun).
 *  - They're past the ledge intangibility lock-out window.
 *  - They're within `TRUMP_RADIUS` of the ledge AND facing into it.
 *  - The ledge is occupied by a *different* fighter.
 *
 * Resolution: previous occupant is forced into Fall + 18-frame hitstun
 * with a small outward shove (so they can't auto-regrab). New occupant
 * grabs as if normal — caller still does the FSM transition since this
 * function doesn't have FSM state knowledge.
 */
export function processLedgeTrump(fighters: Fighter[], tick: number): void {
  for (const a of fighters) {
    if (a.body.grounded) continue;
    if (tick < a.ledgeRegrabLockUntil) continue;
    if (['Hitstun', 'KO', 'AirDodge', 'LedgeHang'].includes(a.fsm.id ?? '')) continue;
    if (a.body.vy < -0.5 && a.body.vy > -8) continue;

    for (const ledge of a.world.ledges) {
      if (ledge.occupiedBy === null) continue;
      if (ledge.occupiedBy === a.playerIndex) continue;
      const dx = a.body.x - ledge.x;
      const dy = a.body.y - a.body.h * 0.5 - ledge.y;
      if (Math.abs(dx) > TRUMP_RADIUS) continue;
      if (Math.abs(dy) > TRUMP_RADIUS * 1.4) continue;
      const facingTowardLedge = (ledge.facing === 1 && dx > 0) || (ledge.facing === -1 && dx < 0);
      if (!facingTowardLedge) continue;

      // Find the previous occupant and trump them.
      const victim = fighters.find((f) => f.playerIndex === ledge.occupiedBy);
      if (!victim) continue;
      victim.body.vx = ledge.facing * 4;
      victim.body.vy = -2;
      victim.invincibleUntilTick = -1;
      victim.hurtbox.state = 'normal';
      victim.enterHitstun(18, tick, 0);
      victim.ledgeRegrabLockUntil = tick + 30;
      ledge.occupiedBy = null;
      bus.emit('ledgeTrump', { trumperId: a.playerIndex, victimId: victim.playerIndex });
      break;
    }
  }
}
