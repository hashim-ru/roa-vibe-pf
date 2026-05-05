import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { tryStartAttack, trySpecial } from '../../AttackResolver';

export class WalkState extends State<Fighter> {
  readonly id = 'Walk';

  onUpdate(f: Fighter, tick: number): string | null {
    if (!f.body.grounded) return 'Fall';
    if (f.input.justPressed('parry')) return 'DodgeRoll';
    if (f.input.justPressed('jump')) return 'JumpSquat';
    if (f.input.isHeld('down')) return 'Crouch';
    if (f.input.justPressed('attack')) {
      const move = tryStartAttack(f, tick);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }
    if (f.input.justPressed('special')) {
      const move = trySpecial(f);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }

    const stick = f.input.current().stickX;
    if (Math.abs(stick) < 0.3) {
      f.body.vx *= f.stats.groundFriction;
      return 'Idle';
    }
    f.facing = stick > 0 ? 1 : -1;
    f.body.vx = stick * f.stats.walkSpeed;

    return null;
  }
}
