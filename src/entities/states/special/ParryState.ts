import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

const PARRY_ACTIVE_FRAMES = 3;
const PARRY_TOTAL_FRAMES = 18;

export class ParryState extends State<Fighter> {
  readonly id = 'Parry';

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    f.parryActiveUntilTick = tick + PARRY_ACTIVE_FRAMES;
    f.body.vx *= 0.5;
  }

  onUpdate(f: Fighter, tick: number): string | null {
    f.body.vx *= f.stats.groundFriction;
    if (this.elapsed(tick) >= PARRY_TOTAL_FRAMES) return 'Idle';
    return null;
  }

  onExit(f: Fighter): void {
    f.parryActiveUntilTick = -1;
  }
}
