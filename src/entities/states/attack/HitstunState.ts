import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

/**
 * Hitstun: fighter cannot act for `hitstunRemaining` frames. DI was already
 * applied at hit time (in HitDetection); here we just decay velocity by air
 * friction and tick the timer. On landing during hitstun, transition to a
 * short pseudo-tech recovery (`Land` with fixed 4f).
 */
export class HitstunState extends State<Fighter> {
  readonly id = 'Hitstun';

  onEnter(f: Fighter): void {
    if (
      f.body.grounded &&
      Math.abs(f.body.vy) < 0.1 &&
      Math.abs(f.body.vx) < 0.1
    ) {
      f.body.vy = -2; // anti-trip: pop only when launch was effectively zero
    }
  }

  onUpdate(f: Fighter): string | null {
    if (f.hitstunRemaining > 0) f.hitstunRemaining -= 1;

    f.body.vx *= f.stats.airFriction;
    f.body.vy *= 0.99;

    if (f.hitstunRemaining <= 0) {
      if (f.body.grounded) {
        f.pendingLandingLag = 4;
        return 'Land';
      }
      return 'Fall';
    }
    return null;
  }
}
