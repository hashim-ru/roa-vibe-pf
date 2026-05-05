import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

export class LandState extends State<Fighter> {
  readonly id = 'Land';

  onUpdate(f: Fighter, tick: number): string | null {
    if (!f.body.grounded) return 'Fall';
    f.body.vx *= f.stats.groundFriction;
    if (this.elapsed(tick) >= f.pendingLandingLag) {
      f.pendingLandingLag = 0;
      // Idle picks up any 8f-buffered jump/attack/parry on its next tick, so
      // the player gets the "tight" feel without fighting landing lag.
      return 'Idle';
    }
    return null;
  }
}
