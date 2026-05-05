import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

export class JumpSquatState extends State<Fighter> {
  readonly id = 'JumpSquat';

  onUpdate(f: Fighter, tick: number): string | null {
    f.body.vx *= f.stats.groundFriction;
    const elapsed = this.elapsed(tick);
    if (elapsed >= f.stats.jumpSquatFrames) {
      const isShort = !f.input.isHeld('jump');
      f.body.vy = isShort ? f.stats.shortHopVy : f.stats.fullHopVy;
      f.body.grounded = false;
      return 'Jump';
    }
    return null;
  }
}
