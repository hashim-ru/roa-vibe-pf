import { PhysicsBody } from '../physics/PhysicsBody';
import type { World } from '../physics/World';
import { resolveCollisions } from '../physics/Collision';
import { InputBuffer } from '../input/InputBuffer';
import { StateMachine } from '../fsm/StateMachine';
import type { FighterStats } from './FighterStats';
import type { MoveData, MoveSet } from '../data/schema/moves.schema';
import { ActiveHitbox, buildWorldHitbox } from '../combat/Hitbox';
import { bus } from '../core/EventBus';

export type Hurtbox = {
  state: 'normal' | 'invincible' | 'intangible';
};

export interface PendingMove {
  move: MoveData;
  startedAtTick: number;
  ignoreList: Map<number, Set<string>>;
}

export class Fighter {
  body: PhysicsBody;
  stats: FighterStats;
  fsm!: StateMachine<Fighter>;
  input: InputBuffer;
  hurtbox: Hurtbox = { state: 'normal' };

  percent = 0;
  stocks = 3;
  jumpsRemaining = 1;
  usedAirDodge = false;
  facing: 1 | -1 = 1;

  invincibleUntilTick = -1;
  hitPauseUntilTick = -1;
  parryActiveUntilTick = -1;

  pendingMove: PendingMove | null = null;
  hitstunRemaining = 0;
  pendingHitstunEnter = false;
  pendingHitstunKB = 0;
  pendingLandingLag = 0;
  /** When true, the next collision pass treats one-way platforms as ignored. */
  dropThroughThisTick = false;
  /** Tick of the last `down` rising edge (used to detect double-tap). */
  lastDownPressTick = -999;
  /** Tick when the body was last on a platform (for coyote time). */
  lastGroundedTick = -999;
  /** When >0, gravity is halved this tick (jump-apex floatiness). */
  apexFramesRemaining = 0;

  constructor(
    public readonly playerIndex: number,
    public readonly world: World,
    stats: FighterStats,
    input: InputBuffer,
    spawn: { x: number; y: number },
    public readonly moves: MoveSet
  ) {
    this.stats = stats;
    this.input = input;
    this.body = new PhysicsBody({
      x: spawn.x,
      y: spawn.y,
      w: stats.bodyW,
      h: stats.bodyH,
      maxFallSpeed: stats.maxFallSpeed
    });
  }

  isHitPaused(tick: number): boolean {
    return tick < this.hitPauseUntilTick;
  }

  parryActive(tick: number): boolean {
    return tick < this.parryActiveUntilTick;
  }

  isInvincible(tick: number): boolean {
    return tick < this.invincibleUntilTick;
  }

  startMove(move: MoveData, tick: number): void {
    this.pendingMove = {
      move,
      startedAtTick: tick,
      ignoreList: new Map()
    };
  }

  endMove(): void {
    this.pendingMove = null;
  }

  movePhase(tick: number): number {
    if (!this.pendingMove) return -1;
    return tick - this.pendingMove.startedAtTick;
  }

  hasAlreadyHit(victimIndex: number, hitId: string): boolean {
    return this.pendingMove?.ignoreList.get(victimIndex)?.has(hitId) ?? false;
  }

  markHit(victimIndex: number, hitId: string): void {
    if (!this.pendingMove) return;
    let list = this.pendingMove.ignoreList.get(victimIndex);
    if (!list) {
      list = new Set();
      this.pendingMove.ignoreList.set(victimIndex, list);
    }
    list.add(hitId);
  }

  getActiveHitboxes(currentTick: number): ActiveHitbox[] {
    if (!this.pendingMove) return [];
    const phase = currentTick - this.pendingMove.startedAtTick;
    const frameDef = this.pendingMove.move.frames.find((f) => f.frame === phase);
    if (!frameDef || frameDef.hitboxes.length === 0) return [];
    return frameDef.hitboxes.map((hb) => buildWorldHitbox(this, hb));
  }

  applyMoveMotion(localFrame: number): void {
    const move = this.pendingMove?.move;
    if (!move?.selfMotion) return;
    for (const sm of move.selfMotion) {
      if (sm.frame !== localFrame) continue;
      if (sm.vx !== undefined) this.body.vx = sm.vx * this.facing;
      if (sm.vy !== undefined) this.body.vy = sm.vy;
      if (sm.ax !== undefined) this.body.vx += sm.ax * this.facing;
      if (sm.ay !== undefined) this.body.vy += sm.ay;
    }
  }

  enterHitstun(frames: number, _tick: number, kb: number): void {
    this.hitstunRemaining = frames;
    this.pendingHitstunKB = kb;
    this.pendingHitstunEnter = true;
    this.endMove();
  }

  consumeHitstunEntry(): { frames: number; kb: number } | null {
    if (!this.pendingHitstunEnter) return null;
    this.pendingHitstunEnter = false;
    return { frames: this.hitstunRemaining, kb: this.pendingHitstunKB };
  }

  onParrySuccess(tick: number): void {
    this.parryActiveUntilTick = -1;
    this.invincibleUntilTick = tick + 6;
  }

  /** Frames since last grounded — wraps coyote-time logic for callers. */
  framesSinceGrounded(tick: number): number {
    if (this.body.grounded) return 0;
    return tick - this.lastGroundedTick;
  }

  /** True if either grounded or within coyote-time window. */
  inCoyoteWindow(tick: number, frames = 5): boolean {
    return this.body.grounded || this.framesSinceGrounded(tick) <= frames;
  }

  /** Engage apex-float: halved gravity for `frames` ticks while jump is held. */
  triggerApexFloat(frames: number): void {
    this.apexFramesRemaining = frames;
  }

  update(tick: number): void {
    if (this.isHitPaused(tick)) return;
    this.body.snapshotPrev();

    const wasGrounded = this.body.grounded;
    if (wasGrounded) this.lastGroundedTick = tick;
    const entry = this.consumeHitstunEntry();
    if (entry) {
      this.fsm.force('Hitstun', tick);
    }

    const wasJumping = this.fsm.is('Jump') || this.fsm.is('JumpSquat');
    this.fsm.update(tick);
    this.applyGravity();
    resolveCollisions(this.body, this.world, { dropThrough: this.dropThroughThisTick });
    this.dropThroughThisTick = false;
    this.body.facing = this.facing;

    if (!wasGrounded && this.body.grounded) {
      const landSpeed = Math.abs(this.body.vy);
      this.resetAirOptions();
      this.lastGroundedTick = tick;
      bus.emit('land', { fighterId: this.playerIndex, speed: landSpeed });
    }
    if (wasGrounded && !this.body.grounded && wasJumping) {
      bus.emit('jump', { fighterId: this.playerIndex });
    }
  }

  private applyGravity(): void {
    let g = this.world.gravity;
    // Apex float: halve gravity for a few frames after the apex while the
    // player still holds jump. Triggered from JumpState when |vy|<threshold.
    if (this.apexFramesRemaining > 0 && this.input.isHeld('jump')) {
      g *= 0.5;
      this.apexFramesRemaining -= 1;
    } else {
      this.apexFramesRemaining = 0;
    }
    this.body.vy += g;
    if (this.body.vy > this.body.maxFallSpeed) this.body.vy = this.body.maxFallSpeed;
  }

  resetAirOptions(): void {
    this.jumpsRemaining = 1;
    this.usedAirDodge = false;
  }
}
