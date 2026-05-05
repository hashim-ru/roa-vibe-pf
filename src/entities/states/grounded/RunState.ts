import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { tryStartAttack } from '../../AttackResolver';

export class RunState extends State<Fighter> {
  readonly id = 'Run';

  onUpdate(f: Fighter, tick: number): string | null {
    if (!f.body.grounded) return 'Fall';
    if (f.input.justPressed('jump')) return 'JumpSquat';
    if (f.input.justPressed('parry')) return 'DodgeRoll';
    if (f.input.justPressed('attack')) {
      const move = tryStartAttack(f, tick);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }
    if (f.input.isHeld('down')) return 'Crouch';

    const stickX = f.input.current().stickX;
    if (Math.abs(stickX) < 0.3 || Math.sign(stickX) !== f.facing) {
      f.body.vx *= f.stats.groundFriction;
      return 'Idle';
    }
    f.body.vx = f.stats.runSpeed * f.facing;
    return null;
  }
}
