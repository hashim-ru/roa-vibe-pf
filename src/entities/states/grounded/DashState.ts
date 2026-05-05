import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { tryStartAttack } from '../../AttackResolver';
import { bus } from '../../../core/EventBus';

const DASH_TURN_WINDOW = 4;
const DASH_TOTAL = 14;

export class DashState extends State<Fighter> {
  readonly id = 'Dash';

  onEnter(f: Fighter): void {
    // Dash starts with a 1.15x burst, decays to runSpeed during dash window.
    f.body.vx = f.stats.runSpeed * 1.15 * f.facing;
    bus.emit('dash', { fighterId: f.playerIndex });
  }

  onUpdate(f: Fighter, tick: number): string | null {
    if (!f.body.grounded) return 'Fall';
    const elapsed = this.elapsed(tick);
    const stickX = f.input.current().stickX;

    if (elapsed <= DASH_TURN_WINDOW && Math.abs(stickX) > 0.5 && Math.sign(stickX) === -f.facing) {
      f.facing = stickX > 0 ? 1 : -1;
      f.body.vx = f.stats.runSpeed * 0.7 * f.facing;
      this.startedAt = tick;
      return null;
    }

    if (f.input.justPressed('jump')) return 'JumpSquat';
    if (f.input.justPressed('parry')) return 'DodgeRoll';
    if (f.input.justPressed('attack')) {
      const move = tryStartAttack(f, tick);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }

    // Decay burst back toward runSpeed over the dash window
    const targetVx = f.stats.runSpeed * f.facing;
    f.body.vx = f.body.vx * 0.88 + targetVx * 0.12;

    if (elapsed >= DASH_TOTAL) {
      if (Math.abs(stickX) > 0.3 && Math.sign(stickX) === f.facing) {
        return 'Run';
      }
      return 'Idle';
    }
    return null;
  }
}
