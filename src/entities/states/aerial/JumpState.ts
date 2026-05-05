import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { tryStartAttack, trySpecial } from '../../AttackResolver';
import { bus } from '../../../core/EventBus';

export class JumpState extends State<Fighter> {
  readonly id = 'Jump';

  onUpdate(f: Fighter, tick: number): string | null {
    const stickX = f.input.current().stickX;
    if (Math.abs(stickX) > 0.3) {
      // Active air drift — accelerate toward stick direction
      f.body.vx += stickX * f.stats.airAccel * 1.2;
      f.body.vx = Math.max(-f.stats.airMaxSpeed, Math.min(f.stats.airMaxSpeed, f.body.vx));
    } else {
      f.body.vx *= f.stats.airFriction;
    }

    // Apex float: when approaching the peak (|vy| small) and jump still held,
    // halve gravity for 6 frames so the apex feels floaty/controllable.
    if (Math.abs(f.body.vy) < 1.2 && f.input.isHeld('jump') && f.apexFramesRemaining === 0) {
      f.triggerApexFloat(6);
    }

    if (f.body.vy >= 0) return 'Fall';
    if (f.input.justPressed('parry') && !f.usedAirDodge) return 'AirDodge';
    if (f.input.justPressed('jump') && f.jumpsRemaining > 0) {
      f.jumpsRemaining -= 1;
      f.body.vy = f.stats.doubleJumpVy;
      bus.emit('doubleJump', { fighterId: f.playerIndex });
      return 'Jump';
    }
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
    return null;
  }
}
