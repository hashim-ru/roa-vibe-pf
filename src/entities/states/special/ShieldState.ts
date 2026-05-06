import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { bus } from '../../../core/EventBus';

const SHIELD_DRAIN_PER_TICK = 0.4; // ~6 sec to fully drain from 100
const SHIELD_REGEN_PER_TICK = 0.25; // out-of-shield regen
const SHIELD_BREAK_STUN = 90;
const GRAB_BUFFER_INPUT_FRAMES = 3;

/**
 * Hold-to-block shield state. Entered from `Parry` when the parry button
 * stays held past the parry-active window. The shield bubble (drawn by
 * the renderer) shrinks with HP; depletion → ShieldBreak.
 *
 * Out of shield options:
 *  - Release parry → Idle.
 *  - Tap attack within the buffer window → Grab attempt (close-range).
 *  - Tap jump → out-of-shield jump (break the shield drop with momentum).
 *  - Stick down → roll/dodge.
 *
 * Hurtbox is fully covered while shielding — incoming hits damage the
 * shield rather than the fighter, until the bubble breaks.
 */
export class ShieldState extends State<Fighter> {
  readonly id = 'Shield';

  onEnter(f: Fighter, _prev: string | null, _tick: number): void {
    f.body.vx = 0;
    // Shield absorbs damage into `shieldHP` rather than blocking outright;
    // HitDetection routes hits at this hurtbox state to drain HP + apply
    // pushback only.
    f.hurtbox.state = 'shield';
  }

  onUpdate(f: Fighter, tick: number): string | null {
    f.body.vx *= f.stats.groundFriction;
    f.shieldHP = Math.max(0, f.shieldHP - SHIELD_DRAIN_PER_TICK);

    if (f.shieldHP <= 0) {
      bus.emit('shieldBreak', { fighterId: f.playerIndex });
      return 'ShieldBreak';
    }
    if (!f.input.isHeld('parry')) return 'Idle';
    if (!f.body.grounded) return 'Fall';

    if (f.input.bufferedFrames('attack', GRAB_BUFFER_INPUT_FRAMES) >= 0) {
      f.grabUntilTick = tick + 18;
      return 'Grab';
    }
    if (f.input.bufferedFrames('jump', GRAB_BUFFER_INPUT_FRAMES) >= 0) {
      f.body.vy = f.stats.fullHopVy;
      return 'Jump';
    }
    return null;
  }

  onExit(f: Fighter): void {
    f.hurtbox.state = 'normal';
    if (f.shieldHP > 0) {
      // Lazy regen pass — actual continuous regen happens in Idle.
      f.shieldHP = Math.min(100, f.shieldHP + SHIELD_REGEN_PER_TICK * 10);
    }
  }
}

export class ShieldBreakState extends State<Fighter> {
  readonly id = 'ShieldBreak';

  onEnter(f: Fighter, _prev: string | null, _tick: number): void {
    f.body.vx = 0;
    f.body.vy = -3;
    f.shieldHP = 0;
    f.hurtbox.state = 'normal';
  }

  onUpdate(f: Fighter, tick: number): string | null {
    f.body.vx *= f.stats.groundFriction;
    if (this.elapsed(tick) >= SHIELD_BREAK_STUN) {
      f.shieldHP = 60; // partial regen on recovery so the next shield isn't free-broken
      return 'Idle';
    }
    return null;
  }
}
