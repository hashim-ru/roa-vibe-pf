import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { tryStartAttack, trySpecial } from '../../AttackResolver';

export class IdleState extends State<Fighter> {
  readonly id = 'Idle';

  onEnter(f: Fighter): void {
    f.resetAirOptions();
  }

  onUpdate(f: Fighter, tick: number): string | null {
    if (!f.body.grounded) return 'Fall';
    f.body.vx *= f.stats.groundFriction;

    // Universal 8-frame action buffer — re-checks recent rising edges so
    // inputs queued during prior states (Land, AttackRecovery) fire the moment
    // we're actionable again.
    const ACTION_BUF = 8;
    if (f.input.bufferedFrames('parry', ACTION_BUF) >= 0) {
      const stickX = f.input.current().stickX;
      if (Math.abs(stickX) > 0.3) {
        f.facing = stickX > 0 ? 1 : -1;
        return 'DodgeRoll';
      }
      return 'Parry';
    }
    if (f.input.bufferedFrames('jump', ACTION_BUF) >= 0) return 'JumpSquat';
    if (f.input.isHeld('down')) return 'Crouch';
    if (f.input.bufferedFrames('attack', ACTION_BUF) >= 0) {
      const move = tryStartAttack(f, tick);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }
    if (f.input.bufferedFrames('special', ACTION_BUF) >= 0) {
      const move = trySpecial(f);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }

    const stickX = f.input.current().stickX;
    if (Math.abs(stickX) > 0.7) {
      f.facing = stickX > 0 ? 1 : -1;
      return 'Dash';
    }
    if (Math.abs(stickX) > 0.3) {
      f.facing = stickX > 0 ? 1 : -1;
      return 'Walk';
    }
    return null;
  }
}
