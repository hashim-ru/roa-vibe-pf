import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

export class HelplessState extends State<Fighter> {
  readonly id = 'Helpless';

  onUpdate(f: Fighter): string | null {
    if (f.body.grounded) {
      f.pendingLandingLag = 14;
      return 'Land';
    }
    f.body.vx *= 0.97;
    return null;
  }
}
