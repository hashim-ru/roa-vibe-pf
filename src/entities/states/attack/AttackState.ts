import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import {
  aerialAutocanceledOnLand,
  canCancel,
  lCanceled
} from '../../MoveCancel';

/**
 * Generic frame-data runner. The attack to play is decided BEFORE entering
 * this state by the prior state (e.g., IdleState picks `jab`/`ftilt`/`fsmash`
 * based on stick + smashMod). The chosen move is stashed on the fighter via
 * `startMove(...)` and AttackState walks the move's frames each tick.
 *
 * IASA cancels and aerial autocancels are now centralized in MoveCancel.ts
 * so the same rules apply uniformly across every state that runs frame
 * data — no more per-state cancel logic to keep in sync.
 */
export class AttackState extends State<Fighter> {
  readonly id = 'Attack';

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    if (!f.pendingMove) {
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

    // Aerial landing — auto-cancel windows take priority, then L-cancel,
    // then default landing lag from move data.
    if (move.category === 'aerial' && f.body.grounded) {
      let lag = move.landingLag;
      if (aerialAutocanceledOnLand(move, phase)) lag = 0;
      else if (lCanceled(f, move)) lag = Math.floor(move.landingLag / 2);
      f.pendingLandingLag = lag;
      f.endMove();
      return lag > 0 ? 'Land' : 'Idle';
    }

    // IASA cancel — centralized lookup. If a buffered next-action input is
    // present in the interruptible window, transition out.
    const cancel = canCancel(f, move, phase);
    if (cancel.cancel) {
      f.endMove();
      if (cancel.kind === 'jump' && f.body.grounded) return 'JumpSquat';
      return f.body.grounded ? 'Idle' : 'Fall';
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
