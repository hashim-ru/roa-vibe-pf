import { State } from '../../../fsm/State';
import type { Fighter } from '../../Fighter';
import { bus } from '../../../core/EventBus';

const GRAB_RANGE_X = 38;
const GRAB_RANGE_Y = 36;
const GRAB_HOLD_FRAMES_BASE = 30;
const THROW_DAMAGE = 8;

/**
 * Grab attempt — close-range catch fired from Shield. Has a short
 * window during which a hurtbox-overlap with an opponent puts them
 * into the Grabbed state. No damage on the catch itself; the throw
 * follow-up does the work.
 *
 * Grab-vs-grab clashes resolve as a clank: both attempts whiff. We
 * also short-circuit out the grab if either fighter is in hitstun
 * or KO so no late-frame catch fires after a stock has changed.
 */
export class GrabState extends State<Fighter> {
  readonly id = 'Grab';

  onEnter(f: Fighter, _prev: string | null, _tick: number): void {
    f.body.vx = 0;
  }

  onUpdate(f: Fighter, tick: number): string | null {
    f.body.vx *= f.stats.groundFriction;
    const elapsed = this.elapsed(tick);
    if (elapsed < 6) return null; // startup
    if (elapsed > 14) return 'Idle'; // recovery whiff

    // Active window — search for a catchable opponent. Must not already
    // be in hitstun / KO / a Grabbed loop.
    const opp = findOpponent(f);
    if (!opp) return null;
    if (['Hitstun', 'KO', 'Grabbed', 'ShieldBreak'].includes(opp.fsm.id ?? '')) return null;
    const dx = Math.abs(opp.body.x - f.body.x);
    const dy = Math.abs(opp.body.y - f.body.y);
    if (dx > GRAB_RANGE_X || dy > GRAB_RANGE_Y) return null;
    if (!opp.body.grounded) return null;

    // Connect — pin them.
    const holdLen = GRAB_HOLD_FRAMES_BASE + Math.floor(opp.percent / 3);
    opp.grabbedBy = f.playerIndex;
    opp.grabbedUntilTick = tick + holdLen;
    f.grabUntilTick = tick + holdLen;
    opp.fsm.force('Grabbed', tick);
    bus.emit('grab', { attackerId: f.playerIndex, victimId: opp.playerIndex });
    return 'Grabbing';
  }
}

/**
 * Grabber state once a grab connects — the grabber holds the victim
 * still, waits for a stick + button to pick a throw direction. If no
 * input lands before the timer runs out the victim is released.
 */
export class GrabbingState extends State<Fighter> {
  readonly id = 'Grabbing';

  onUpdate(f: Fighter, tick: number): string | null {
    f.body.vx = 0;
    f.body.vy = 0;
    if (tick >= f.grabUntilTick) return this.release(f, tick);

    const opp = findOpponent(f);
    if (!opp || opp.grabbedBy !== f.playerIndex) return this.release(f, tick);

    // Lock the victim against the grabber's facing.
    opp.body.x = f.body.x + 22 * f.facing;
    opp.body.y = f.body.y;
    opp.body.vx = 0;
    opp.body.vy = 0;

    const stick = f.input.current();
    const throwAttempt =
      f.input.bufferedFrames('attack', 3) >= 0 ||
      f.input.bufferedFrames('special', 3) >= 0;
    if (throwAttempt) {
      let dir: 'forward' | 'back' | 'up' | 'down';
      let angleDeg = 0;
      let kbBase = 50;
      let kbGrowth = 90;
      if (stick.stickY < -0.5) {
        dir = 'up';
        angleDeg = 90;
        kbBase = 70;
        kbGrowth = 100;
      } else if (stick.stickY > 0.5) {
        dir = 'down';
        angleDeg = -75;
        kbBase = 40;
        kbGrowth = 70;
      } else if (Math.sign(stick.stickX) === -f.facing) {
        dir = 'back';
        angleDeg = 35;
        kbBase = 80;
        kbGrowth = 110;
      } else {
        dir = 'forward';
        angleDeg = 45;
        kbBase = 60;
        kbGrowth = 100;
      }
      this.executeThrow(f, opp, tick, dir, angleDeg, kbBase, kbGrowth);
      return 'Idle';
    }
    return null;
  }

  private executeThrow(
    grabber: Fighter,
    victim: Fighter,
    tick: number,
    dir: 'forward' | 'back' | 'up' | 'down',
    angleDeg: number,
    kbBase: number,
    kbGrowth: number
  ): void {
    victim.percent += THROW_DAMAGE;
    const angleRad = (angleDeg * Math.PI) / 180;
    const launchSign = dir === 'back' ? -grabber.facing : grabber.facing;
    const kb = (victim.percent * kbGrowth) / 200 + kbBase;
    victim.body.vx = Math.cos(angleRad) * kb * 0.05 * launchSign;
    victim.body.vy = -Math.sin(angleRad) * kb * 0.05;
    victim.tumbling = kb >= 80;
    const hitstun = Math.floor(kb * 0.4) + 12;
    victim.enterHitstun(hitstun, tick, kb);
    victim.grabbedBy = -1;
    victim.grabbedUntilTick = -1;
    grabber.grabUntilTick = -1;
    bus.emit('throw', { attackerId: grabber.playerIndex, victimId: victim.playerIndex, direction: dir });
    bus.emit('hit', { attackerId: grabber.playerIndex, victimId: victim.playerIndex, damage: THROW_DAMAGE });
  }

  private release(f: Fighter, _tick: number): string {
    const opp = findOpponent(f);
    if (opp && opp.grabbedBy === f.playerIndex) {
      opp.grabbedBy = -1;
      opp.grabbedUntilTick = -1;
      if (opp.fsm.id === 'Grabbed') opp.fsm.force('Idle', _tick);
    }
    f.grabUntilTick = -1;
    return 'Idle';
  }
}

/**
 * Victim's perspective of the grab — body is locked, can mash to escape
 * (each rapid input shaves frames off the timer).
 */
export class GrabbedState extends State<Fighter> {
  readonly id = 'Grabbed';

  onUpdate(f: Fighter, tick: number): string | null {
    f.body.vx = 0;
    f.body.vy = 0;
    f.hurtbox.state = 'normal';
    // Mash escape: every fresh attack/jump/parry input shaves 2f.
    if (
      f.input.justPressed('attack') ||
      f.input.justPressed('jump') ||
      f.input.justPressed('parry')
    ) {
      f.grabbedUntilTick = Math.max(tick, f.grabbedUntilTick - 2);
    }
    if (tick >= f.grabbedUntilTick) {
      f.grabbedBy = -1;
      f.grabbedUntilTick = -1;
      return 'Idle';
    }
    return null;
  }
}

function findOpponent(f: Fighter): Fighter | null {
  // The FSM holds the fighter as `target`; we lean on a parallel
  // pattern by storing the opponent on the world. Fall back to scanning
  // the global registry exposed by the World object if needed.
  const world = f.world as unknown as { fighters?: Fighter[] };
  if (!world.fighters) return null;
  for (const other of world.fighters) {
    if (other.playerIndex !== f.playerIndex) return other;
  }
  return null;
}
