import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';

const RESPAWN_INVINCIBILITY = 90;

export class KOState extends State<Fighter> {
  readonly id = 'KO';

  onEnter(f: Fighter, _prev: string | null, tick: number): void {
    f.body.vx = 0;
    f.body.vy = 0;
    f.percent = 0;
    f.endMove();
    f.hitstunRemaining = 0;
    const spawn = f.world.spawns[f.playerIndex] ?? { x: 640, y: 200 };
    f.body.x = spawn.x;
    f.body.y = spawn.y;
    f.body.snapshotPrev();
    f.invincibleUntilTick = tick + RESPAWN_INVINCIBILITY;
    f.hurtbox.state = 'invincible';
    f.pendingHitstunEnter = false;
    f.pendingHitstunKB = 0;
    f.resetAirOptions();
  }

  onUpdate(f: Fighter, tick: number): string | null {
    if (this.elapsed(tick) >= 30) {
      // hand off invincibility to the timer-based check; HitDetection now also
      // consults isInvincible(tick), so the remaining ~60 frames stay safe.
      f.hurtbox.state = 'normal';
      return f.body.grounded ? 'Idle' : 'Fall';
    }
    return null;
  }
}
