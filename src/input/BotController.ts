import type { Fighter } from '../entities/Fighter';
import { InputBuffer } from './InputBuffer';
import { emptyInput, InputState } from './InputState';
import type { Difficulty } from '../config/GameMode';
import { sharedRng } from '../core/Rng';

// Deterministic substitute for Math.random() so bot-driven matches stay
// reproducible (replays, future net-bot training). Cosmetic randomness
// elsewhere (VFX, audio jitter) still uses Math.random for variety.
const rand = (): number => sharedRng.next();

interface DifficultyProfile {
  reactionFrames: number; // input lag the bot adds to itself
  attackRange: number;     // distance under which it tries to attack
  attackChance: number;    // chance per "decision tick" to attempt an attack
  decisionInterval: number; // frames between AI decisions
  approachThreshold: number; // distance under which it stops approaching
  smashChance: number;      // chance to use smash modifier
  parryChance: number;      // chance to parry incoming attack (within window)
  airdodgeChance: number;   // chance to air-dodge while in hitstun-recovery
  edgeAvoid: boolean;       // avoid walking off the edge
  recoveryUseUpB: boolean;  // use up-B to recover from offstage
  diSkill: number;          // 0..1, how well it DIs hits
  jitter: number;           // random movement noise
}

const PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    reactionFrames: 16,
    attackRange: 70,
    attackChance: 0.15,
    decisionInterval: 18,
    approachThreshold: 60,
    smashChance: 0.05,
    parryChance: 0,
    airdodgeChance: 0,
    edgeAvoid: false,
    recoveryUseUpB: false,
    diSkill: 0,
    jitter: 0.4
  },
  medium: {
    reactionFrames: 8,
    attackRange: 90,
    attackChance: 0.4,
    decisionInterval: 9,
    approachThreshold: 75,
    smashChance: 0.2,
    parryChance: 0.15,
    airdodgeChance: 0.25,
    edgeAvoid: true,
    recoveryUseUpB: true,
    diSkill: 0.5,
    jitter: 0.15
  },
  hard: {
    reactionFrames: 3,
    attackRange: 110,
    attackChance: 0.85,
    decisionInterval: 4,
    approachThreshold: 90,
    smashChance: 0.55,
    parryChance: 0.6,
    airdodgeChance: 0.6,
    edgeAvoid: true,
    recoveryUseUpB: true,
    diSkill: 0.95,
    jitter: 0
  }
};

/**
 * Bot synthesizes an InputState each tick by reading the world. The output
 * is delayed by `reactionFrames` to simulate human latency at lower tiers.
 */
export class BotController {
  private profile: DifficultyProfile;
  private pendingInputs: InputState[] = [];
  private lastDecision = -999;
  private currentTarget: 'approach' | 'attack' | 'retreat' | 'recover' | 'idle' = 'idle';

  constructor(
    private readonly self: Fighter,
    private readonly target: Fighter,
    private readonly buffer: InputBuffer,
    difficulty: Difficulty
  ) {
    this.profile = PROFILES[difficulty];
    for (let i = 0; i < this.profile.reactionFrames; i++) {
      this.pendingInputs.push(emptyInput());
    }
  }

  /** Called once per fixed step. Pushes the chosen input into the buffer. */
  poll(tick: number): void {
    const decision = this.decide(tick);
    this.pendingInputs.push(decision);
    const out = this.pendingInputs.length > this.profile.reactionFrames
      ? this.pendingInputs.shift()!
      : emptyInput();
    this.buffer.push(out);
  }

  private decide(tick: number): InputState {
    const s = emptyInput();
    const me = this.self;
    const opp = this.target;
    if (me.fsm.is('KO') || opp.fsm.is('KO')) return s;
    if (me.isHitPaused(tick)) return s;

    const dx = opp.body.x - me.body.x;
    const dy = opp.body.y - me.body.y;
    const dist = Math.abs(dx);
    const facing: 1 | -1 = dx >= 0 ? 1 : -1;

    // === DI / SDI when in hitstun ===
    if (me.fsm.is('Hitstun')) {
      // Push perpendicular to launch (approximated as opposite of vy direction)
      const vy = me.body.vy;
      const skill = this.profile.diSkill;
      if (vy < -2) {
        s.stickX = facing * skill;
      } else {
        s.stickX = facing * skill;
        s.stickY = -skill;
      }
      return s;
    }

    // === Recovery: if offstage, head back ===
    const onMain = me.body.grounded;
    const offstage =
      !onMain &&
      (me.body.x < me.world.blastZone.left + 250 || me.body.x > me.world.blastZone.right - 250);

    if (offstage) {
      const dirHome = me.body.x < 640 ? 1 : -1;
      s.stickX = dirHome;
      if (this.profile.recoveryUseUpB && me.body.vy > 1 && me.body.y > 480) {
        s.up = true;
        s.stickY = -1;
        s.special = true; // up-B recovery
      } else if (me.jumpsRemaining > 0 && me.body.vy > 4) {
        s.jump = this.justInputEdge(tick, 'jump');
      }
      return s;
    }

    // === Defensive: parry chance when opponent is in active hitbox frame ===
    const oppActiveHb =
      opp.pendingMove &&
      this.profile.parryChance > 0 &&
      tick - opp.pendingMove.startedAtTick >= 1 &&
      opp.pendingMove.move.frames.some(
        (fr) =>
          fr.frame === tick - opp.pendingMove!.startedAtTick &&
          fr.hitboxes.length > 0
      );
    if (oppActiveHb && dist < 90 && rand() < this.profile.parryChance) {
      s.parry = this.justInputEdge(tick, 'parry');
      return s;
    }

    // === Air-dodge during free-fall toward stage if hard mode ===
    if (
      !me.body.grounded &&
      me.body.vy > 2 &&
      !me.usedAirDodge &&
      rand() < this.profile.airdodgeChance / 30
    ) {
      s.parry = this.justInputEdge(tick, 'parry');
      s.stickY = 1;
      return s;
    }

    // === Decide once per interval ===
    if (tick - this.lastDecision >= this.profile.decisionInterval) {
      this.lastDecision = tick;
      this.pickGoal(dist, dy);
    }

    // === Edge avoid: don't walk off the platform ===
    if (this.profile.edgeAvoid && me.body.grounded) {
      const wantDir = this.currentTarget === 'approach' ? Math.sign(dx) : 0;
      if (wantDir !== 0 && this.wouldFallOff(wantDir)) {
        // Stop instead
        s.stickX = 0;
        return s;
      }
    }

    switch (this.currentTarget) {
      case 'approach': {
        s.stickX = Math.sign(dx) * (rand() < this.profile.jitter ? 0 : 1);
        // Jump if opponent is above
        if (dy < -100 && me.body.grounded && rand() < 0.4) {
          s.jump = this.justInputEdge(tick, 'jump');
        }
        // Dash dance teaser at hard
        if (this.profile.diSkill > 0.8 && rand() < 0.05) {
          s.stickX = -Math.sign(dx);
        }
        break;
      }
      case 'attack': {
        s.stickX = Math.sign(dx) * 0.6;
        if (rand() < this.profile.smashChance) s.smashMod = true;
        s.attack = this.justInputEdge(tick, 'attack');
        // Up-attack if target above
        if (dy < -40) s.stickY = -0.8;
        else if (dy > 40) s.stickY = 0.7;
        me.facing = facing;
        break;
      }
      case 'retreat': {
        s.stickX = -Math.sign(dx);
        break;
      }
      default:
        break;
    }

    return s;
  }

  private pickGoal(dist: number, dy: number): void {
    void dy;
    const p = this.profile;
    if (dist < p.attackRange) {
      this.currentTarget = rand() < p.attackChance ? 'attack' : 'idle';
    } else if (dist < p.approachThreshold * 4) {
      this.currentTarget = 'approach';
    } else {
      this.currentTarget = 'approach';
    }
    if (rand() < p.jitter) this.currentTarget = 'idle';
  }

  private wouldFallOff(dir: number): boolean {
    const checkX = this.self.body.x + dir * (this.self.body.w * 0.5 + 12);
    for (const p of this.self.world.platforms) {
      if (p.oneWay) continue;
      if (
        checkX >= p.x &&
        checkX <= p.x + p.w &&
        Math.abs(p.y - this.self.body.y) < 8
      ) {
        return false;
      }
    }
    return true;
  }

  /** Output a rising edge for an action only on the first frame the bot
   *  decides to press it; otherwise hold-state is dictated by current input. */
  private justInputEdge(_tick: number, _action: keyof InputState): boolean {
    return rand() < 0.7; // bot doesn't perfectly press once; close enough
  }
}
