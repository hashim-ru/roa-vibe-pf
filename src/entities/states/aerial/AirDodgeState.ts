import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

const AIR_DODGE_DURATION = 28;
const AIR_DODGE_INTANGIBLE = 20;
const AIR_DODGE_SPEED = 9;

/**
 * Melee-style directional air dodge: hard-burst in stick direction, intangible
 * for the early frames, ends in Helpless if it doesn't touch ground. If it
 * lands during the dodge, the carried velocity becomes a wavedash slide and
 * landing-lag is halved.
 */
export class AirDodgeState extends State<Fighter> {
  readonly id = 'AirDodge';
  private wavedashed = false;

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    const stick = f.input.current();
    const len = Math.hypot(stick.stickX, stick.stickY);
    let dx = 0;
    let dy = -1;
    if (len > 0.3) {
      dx = stick.stickX / len;
      dy = stick.stickY / len;
    }
    f.body.vx = dx * AIR_DODGE_SPEED;
    f.body.vy = dy * AIR_DODGE_SPEED;
    f.usedAirDodge = true;
    f.invincibleUntilTick = tick + AIR_DODGE_INTANGIBLE;
    f.hurtbox.state = 'intangible';
    this.wavedashed = false;
  }

  onUpdate(f: Fighter, tick: number): string | null {
    const elapsed = this.elapsed(tick);

    if (f.body.grounded) {
      f.hurtbox.state = 'normal';
      f.pendingLandingLag = 8;
      this.wavedashed = true;
      return 'Land';
    }

    if (elapsed >= AIR_DODGE_INTANGIBLE) f.hurtbox.state = 'normal';
    if (elapsed >= AIR_DODGE_DURATION) return 'Helpless';
    return null;
  }

  onExit(f: Fighter): void {
    if (!this.wavedashed) f.hurtbox.state = 'normal';
  }
}
