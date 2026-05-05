import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

const DOUBLE_TAP_WINDOW = 14;

/** Returns true if this fighter is currently standing on a one-way platform. */
function onOneWay(f: Fighter): boolean {
  for (const p of f.world.platforms) {
    if (!p.oneWay) continue;
    const top = p.y;
    if (
      Math.abs(f.body.y - top) < 2 &&
      f.body.x > p.x - f.body.w / 2 &&
      f.body.x < p.x + p.w + f.body.w / 2
    ) {
      return true;
    }
  }
  return false;
}

export class CrouchState extends State<Fighter> {
  readonly id = 'Crouch';

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    // Check for double-tap-down: previous down press within the window?
    if (f.lastDownPressTick >= 0 && tick - f.lastDownPressTick <= DOUBLE_TAP_WINDOW) {
      if (onOneWay(f)) {
        f.dropThroughThisTick = true;
        f.body.grounded = false;
        f.body.vy = 1.5;
      }
    }
    f.lastDownPressTick = tick;
  }

  onUpdate(f: Fighter, tick: number): string | null {
    if (!f.body.grounded) return 'Fall';
    f.body.vx *= f.stats.groundFriction;

    // Hold-down for ~10 frames while on one-way → drop through too.
    if (f.input.isHeld('down') && this.elapsed(tick) >= 10 && onOneWay(f)) {
      f.dropThroughThisTick = true;
      f.body.grounded = false;
      f.body.vy = 1.5;
      return 'Fall';
    }

    if (!f.input.isHeld('down')) return 'Idle';
    if (f.input.justPressed('jump')) return 'JumpSquat';
    return null;
  }
}
