import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import type { LedgePoint } from '../../../physics/World';

const LEDGE_INTANGIBLE = 30;
const LEDGE_GRACE_BEFORE_REGRAB = 30;

export class LedgeHangState extends State<Fighter> {
  readonly id = 'LedgeHang';
  private ledge: LedgePoint | null = null;

  attach(ledge: LedgePoint): void {
    this.ledge = ledge;
  }

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    if (!this.ledge) return;
    f.body.x = this.ledge.x;
    f.body.y = this.ledge.y;
    f.body.vx = 0;
    f.body.vy = 0;
    f.facing = this.ledge.facing;
    f.invincibleUntilTick = tick + LEDGE_INTANGIBLE;
    f.hurtbox.state = 'intangible';
    f.resetAirOptions();
    this.ledge.occupiedBy = f.playerIndex;
  }

  onUpdate(f: Fighter, tick: number): string | null {
    const elapsed = this.elapsed(tick);
    if (elapsed >= LEDGE_INTANGIBLE) f.hurtbox.state = 'normal';

    f.body.vx = 0;
    f.body.vy = 0;

    const cur = f.input.current();
    if (f.input.justPressed('jump')) {
      this.release(f, tick);
      f.body.vy = f.stats.fullHopVy;
      f.body.vx = f.stats.airMaxSpeed * 0.5 * f.facing;
      return 'Jump';
    }
    if (f.input.justPressed('attack')) {
      this.release(f, tick);
      f.body.x += 28 * f.facing;
      f.body.y -= 8;
      f.body.grounded = true;
      f.pendingLandingLag = 6;
      return 'Land';
    }
    if (cur.stickY < -0.5 || (cur.stickX !== 0 && Math.sign(cur.stickX) === f.facing)) {
      this.release(f, tick);
      f.body.x += 22 * f.facing;
      f.body.y -= 6;
      f.body.grounded = true;
      return 'Idle';
    }
    if (cur.stickY > 0.5 || (cur.stickX !== 0 && Math.sign(cur.stickX) !== f.facing)) {
      this.release(f, tick);
      return 'Fall';
    }
    return null;
  }

  onExit(_f: Fighter): void {
    if (this.ledge) this.ledge.occupiedBy = null;
    this.ledge = null;
  }

  private release(f: Fighter, _tick: number): void {
    if (this.ledge) {
      this.ledge.occupiedBy = null;
      this.ledge = null;
    }
    f.invincibleUntilTick = -1;
    f.hurtbox.state = 'normal';
    void LEDGE_GRACE_BEFORE_REGRAB;
  }
}
