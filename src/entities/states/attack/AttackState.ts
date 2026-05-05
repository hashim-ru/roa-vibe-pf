import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

/**
 * Generic frame-data runner. The attack to play is decided BEFORE entering
 * this state by the prior state (e.g., IdleState picks `jab`/`ftilt`/`fsmash`
 * based on stick + smashMod). The chosen move is stashed on the fighter via
 * `startMove(...)` and AttackState walks the move's frames each tick.
 */
export class AttackState extends State<Fighter> {
  readonly id = 'Attack';

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    if (!f.pendingMove) {
      // Default to jab if caller forgot to set a move (shouldn't happen).
      const fallback = f.moves['jab'];
      if (fallback) f.startMove(fallback, tick);
    }
    f.applyMoveMotion(0);
  }

  onUpdate(f: Fighter, tick: number): string | null {
    if (!f.pendingMove) return f.body.grounded ? 'Idle' : 'Fall';
    const phase = tick - f.pendingMove.startedAtTick;
    const move = f.pendingMove.move;

    f.applyMoveMotion(phase);

    if (move.category === 'aerial') {
      const stickX = f.input.current().stickX;
      f.body.vx += stickX * f.stats.airAccel * 0.5;
      if (f.body.vx > f.stats.airMaxSpeed) f.body.vx = f.stats.airMaxSpeed;
      if (f.body.vx < -f.stats.airMaxSpeed) f.body.vx = -f.stats.airMaxSpeed;
      f.body.vx *= 0.99;
    } else {
      f.body.vx *= f.stats.groundFriction;
    }

    if (move.category === 'aerial' && f.body.grounded) {
      // Autocancel: landing during the autocancel windows (frames 1..before or
      // ≥after) skips landing lag entirely, regardless of L-cancel input.
      const autoCancelled =
        (move.autoCancelBefore !== null && phase < move.autoCancelBefore) ||
        (move.autoCancelAfter !== null && phase >= move.autoCancelAfter);
      const lCanceled =
        !autoCancelled &&
        move.lCancelable &&
        (f.input.bufferedFrames('parry', 7) >= 0 || f.input.isHeld('parry'));
      let lag = move.landingLag;
      if (autoCancelled) lag = 0;
      else if (lCanceled) lag = Math.floor(move.landingLag / 2);
      f.pendingLandingLag = lag;
      f.endMove();
      return lag > 0 ? 'Land' : 'Idle';
    }

    // IASA: any "next-action" input during interruptible frames cancels the
    // remaining recovery (jump, attack, parry, special, dash). Smash Ultimate's
    // ~5-frame buffer is approximated via InputBuffer.bufferedFrames.
    if (move.iasaFrame !== null && phase >= move.iasaFrame) {
      const buf = 5;
      if (f.input.bufferedFrames('attack', buf) >= 0) {
        f.endMove();
        return f.body.grounded ? 'Idle' : 'Fall';
      }
      if (f.input.bufferedFrames('jump', buf) >= 0 && f.body.grounded) {
        f.endMove();
        return 'JumpSquat';
      }
      if (f.input.bufferedFrames('parry', buf) >= 0) {
        f.endMove();
        return f.body.grounded ? 'Idle' : 'Fall';
      }
      if (f.input.bufferedFrames('special', buf) >= 0) {
        f.endMove();
        return f.body.grounded ? 'Idle' : 'Fall';
      }
    }

    if (phase >= move.totalFrames) {
      f.endMove();
      return f.body.grounded ? 'Idle' : 'Fall';
    }
    return null;
  }

  onExit(f: Fighter): void {
    f.endMove();
  }
}
