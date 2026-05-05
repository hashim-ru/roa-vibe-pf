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
  /** Engine refactor 1.2 — clank stagger: skip attack actions until tick. */
  clankUntilTick = -1;
  /** Engine refactor 1.7 — last 9 move IDs landed by this fighter. FIFO. */
  staleQueue: string[] = [];
  /** Engine refactor 1.5 — ledge regrabs since last grounded reset. */
  ledgeRegrabsThisAir = 0;
  /** Engine refactor 1.5 — block ledge re-grab until this tick. */
  ledgeRegrabLockUntil = -1;
  /** Engine refactor 1.3 — last stick direction sample for SDI rising-edge detect. */
  lastSDIDirX = 0;
  lastSDIDirY = 0;
  /** Engine refactor 1.3 — accumulated SDI offset, applied at end of hitlag. */
  sdiAccumX = 0;
  sdiAccumY = 0;
  /** Engine refactor 1.8 — true tumble flight (knockback ≥ 80). */
  tumbling = false;

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

  /** True if currently in clank stagger (can't attack). */
  isClanking(tick: number): boolean {
    return tick < this.clankUntilTick;
  }

  /**
   * Stale move queue — pushes hitId into the FIFO and trims to 9. Returns
   * the staleness multiplier in [0.55, 1.0] given how often this move ID
   * appears in the recent queue (Smash 4 staling: -5% damage per occurrence).
   */
  pushStaleMove(hitId: string): number {
    const occurrences = this.staleQueue.filter((id) => id === hitId).length;
    this.staleQueue.push(hitId);
    while (this.staleQueue.length > 9) this.staleQueue.shift();
    return Math.max(0.55, 1 - 0.05 * occurrences);
  }

  staleMultiplier(hitId: string): number {
    const occurrences = this.staleQueue.filter((id) => id === hitId).length;
    return Math.max(0.55, 1 - 0.05 * occurrences);
  }

  /**
   * Ledge regrab decay — Melee canon. Returns intangibility scale based on
   * how many times this air session has grabbed the ledge already.
   *   regrab 0: 1.0×
   *   regrab 1: 0.8×
   *   regrab 2: 0.5×
   *   regrab 3+: 0.0× (no intangibility)
   */
  ledgeRegrabIntangibilityScale(): number {
    const n = this.ledgeRegrabsThisAir;
    if (n >= 3) return 0;
    if (n === 2) return 0.5;
    if (n === 1) return 0.8;
    return 1.0;
  }

  /**
   * SDI accumulator — call from HitDetection at the start of hitlag every
   * frame. Detects rising-edge stick direction changes and shifts the victim
   * by 2 px per pulse (Smash 4 SDI). End-of-hitlag also applies a 1px ASDI
   * offset based on currently-held stick.
   */
  accumulateSDI(): void {
    const cur = this.input.current();
    const dx = Math.abs(cur.stickX) > 0.6 ? Math.sign(cur.stickX) : 0;
    const dy = Math.abs(cur.stickY) > 0.6 ? Math.sign(cur.stickY) : 0;
    if ((dx !== this.lastSDIDirX && dx !== 0) || (dy !== this.lastSDIDirY && dy !== 0)) {
      this.sdiAccumX += dx * 2;
      this.sdiAccumY += dy * 2;
    }
    this.lastSDIDirX = dx;
    this.lastSDIDirY = dy;
  }

  /** Apply ASDI shift + accumulated SDI offset right before launch resolves. */
  consumeSDIShift(): { dx: number; dy: number } {
    const cur = this.input.current();
    const asdiX = Math.abs(cur.stickX) > 0.6 ? Math.sign(cur.stickX) : 0;
    const asdiY = Math.abs(cur.stickY) > 0.6 ? Math.sign(cur.stickY) : 0;
    const dx = this.sdiAccumX + asdiX;
    const dy = this.sdiAccumY + asdiY;
    this.sdiAccumX = 0;
    this.sdiAccumY = 0;
    this.lastSDIDirX = 0;
    this.lastSDIDirY = 0;
    return { dx, dy };
  }

  update(tick: number): void {
    // During hit pause we still let the player accumulate SDI (Smash canon)
    // before the launch is applied at the end of the freeze.
    if (this.isHitPaused(tick)) {
      if (this.fsm.is('Hitstun') || this.pendingHitstunEnter) this.accumulateSDI();
      return;
    }
    this.body.snapshotPrev();

    const wasGrounded = this.body.grounded;
    if (wasGrounded) this.lastGroundedTick = tick;
    const entry = this.consumeHitstunEntry();
    if (entry) {
      // SDI was accumulated through hitlag — apply the positional shift
      // now, before the launch velocity propels the victim.
      const sdi = this.consumeSDIShift();
      this.body.x += sdi.dx;
      this.body.y += sdi.dy;
      // Tumble vs hitstun split — heavy KB enters tumble flight, light KB
      // is regular hitstun. Tumble allows tech-roll on land via parry input.
      this.tumbling = entry.kb >= 80;
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
      // Reset air-only counters on landing.
      this.ledgeRegrabsThisAir = 0;
      this.tumbling = false;
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
