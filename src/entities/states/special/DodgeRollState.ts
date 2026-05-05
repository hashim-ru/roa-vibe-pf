import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

const ROLL_TOTAL = 24;
const ROLL_INVINCIBLE = 14;
const ROLL_SPEED_MULT = 1.4;

/**
 * Ground dash-roll: i-frame roll in the facing direction. Triggered when
 * `parry` is pressed while the fighter is on the ground AND already moving.
 * If standing still, the IdleState routes to Parry instead.
 */
export class DodgeRollState extends State<Fighter> {
  readonly id = 'DodgeRoll';

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    f.body.vx = f.stats.runSpeed * ROLL_SPEED_MULT * f.facing;
    f.invincibleUntilTick = tick + ROLL_INVINCIBLE;
    f.hurtbox.state = 'intangible';
  }

  onUpdate(f: Fighter, tick: number): string | null {
    const elapsed = this.elapsed(tick);
    if (!f.body.grounded) {
      f.hurtbox.state = 'normal';
      return 'Fall';
    }
    if (elapsed >= ROLL_INVINCIBLE) f.hurtbox.state = 'normal';

    // Slow down toward end of roll
    const t = Math.min(1, elapsed / ROLL_TOTAL);
    const speed = f.stats.runSpeed * ROLL_SPEED_MULT * (1 - t * 0.7);
    f.body.vx = speed * f.facing;

    if (elapsed >= ROLL_TOTAL) {
      f.hurtbox.state = 'normal';
      return 'Idle';
    }
    return null;
  }

  onExit(f: Fighter): void {
    f.hurtbox.state = 'normal';
  }
}
