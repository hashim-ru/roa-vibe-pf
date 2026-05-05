import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { tryStartAttack, trySpecial } from '../../AttackResolver';
import { findGrabbableLedge } from '../../../tech/LedgeGrab';
import { LedgeHangState } from '../special/LedgeHangState';
import { bus } from '../../../core/EventBus';

export class FallState extends State<Fighter> {
  readonly id = 'Fall';

  onUpdate(f: Fighter, tick: number): string | null {
    if (f.body.grounded) return 'Idle';

    const ledge = findGrabbableLedge(f);
    if (ledge) {
      const hangState = f.fsm.getState<LedgeHangState>('LedgeHang');
      if (hangState) hangState.attach(ledge);
      return 'LedgeHang';
    }

    const stickX = f.input.current().stickX;
    if (Math.abs(stickX) > 0.3) {
      f.body.vx += stickX * f.stats.airAccel * 1.2;
      f.body.vx = Math.max(-f.stats.airMaxSpeed, Math.min(f.stats.airMaxSpeed, f.body.vx));
    } else {
      f.body.vx *= f.stats.airFriction;
    }

    // Coyote time: if a jump is buffered within 5f of leaving the ground and
    // we still have a "ground" jump pending, treat it as a normal jump squat.
    const COYOTE = 5;
    const BUF = 5;
    const jumpBuf = f.input.bufferedFrames('jump', BUF);
    if (jumpBuf >= 0) {
      if (f.framesSinceGrounded(tick) <= COYOTE && f.jumpsRemaining >= 1) {
        // Drop one "ground" jump since we used coyote — but rethink: we want a
        // FullHop, not double-jump. Force JumpSquat.
        return 'JumpSquat';
      }
      if (f.jumpsRemaining > 0) {
        f.jumpsRemaining -= 1;
        f.body.vy = f.stats.doubleJumpVy;
        bus.emit('doubleJump', { fighterId: f.playerIndex });
        return 'Jump';
      }
    }

    if (f.input.bufferedFrames('parry', BUF) >= 0 && !f.usedAirDodge) return 'AirDodge';
    if (f.body.vy >= 0 && f.input.justPressed('down')) {
      f.body.vy = f.stats.fastFallVy;
    }
    if (f.input.bufferedFrames('attack', BUF) >= 0) {
      const move = tryStartAttack(f, tick);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }
    if (f.input.bufferedFrames('special', BUF) >= 0) {
      const move = trySpecial(f);
      if (move) {
        f.startMove(move, tick);
        return 'Attack';
      }
    }
    return null;
  }
}
