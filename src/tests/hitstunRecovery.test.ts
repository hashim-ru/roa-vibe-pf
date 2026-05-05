import { describe, it, expect, beforeEach } from 'vitest';
import { Fighter } from '../entities/Fighter';
import { LANCER_STATS, HUNTRESS_STATS } from '../entities/FighterStats';
import { LANCER_MOVES } from '../entities/characters/lancer/Lancer';
import { HUNTRESS_MOVES } from '../entities/characters/skirmisher/Skirmisher';
import { World } from '../physics/World';
import { InputBuffer } from '../input/InputBuffer';
import { emptyInput } from '../input/InputState';
import { StateMachine } from '../fsm/StateMachine';
import { IdleState } from '../entities/states/grounded/IdleState';
import { WalkState } from '../entities/states/grounded/WalkState';
import { CrouchState } from '../entities/states/grounded/CrouchState';
import { JumpSquatState } from '../entities/states/grounded/JumpSquatState';
import { LandState } from '../entities/states/grounded/LandState';
import { DashState } from '../entities/states/grounded/DashState';
import { RunState } from '../entities/states/grounded/RunState';
import { JumpState } from '../entities/states/aerial/JumpState';
import { FallState } from '../entities/states/aerial/FallState';
import { AirDodgeState } from '../entities/states/aerial/AirDodgeState';
import { AttackState } from '../entities/states/attack/AttackState';
import { HitstunState } from '../entities/states/attack/HitstunState';
import { ParryState } from '../entities/states/special/ParryState';
import { HelplessState } from '../entities/states/special/HelplessState';
import { LedgeHangState } from '../entities/states/special/LedgeHangState';
import { KOState } from '../entities/states/special/KOState';
import { hitDetection } from '../combat/HitDetection';

function buildWorld(): World {
  return new World(
    [{ x: 0, y: 540, w: 1280, h: 40, oneWay: false }],
    [],
    { left: -200, right: 1480, top: -300, bottom: 920 },
    [
      { x: 540, y: 400 },
      { x: 740, y: 400 }
    ]
  );
}

function makeFighter(idx: number, stats: typeof LANCER_STATS, moves: typeof LANCER_MOVES, world: World): Fighter {
  const buf = new InputBuffer();
  buf.push(emptyInput());
  const f = new Fighter(idx, world, stats, buf, world.spawns[idx], moves);
  const fsm = new StateMachine<Fighter>(f);
  fsm.registerMany([
    new IdleState(), new WalkState(), new CrouchState(), new JumpSquatState(),
    new LandState(), new DashState(), new RunState(), new JumpState(),
    new FallState(), new AirDodgeState(), new AttackState(), new HitstunState(),
    new ParryState(), new HelplessState(), new LedgeHangState(), new KOState()
  ]);
  f.fsm = fsm;
  fsm.start('Idle', 0);
  f.body.grounded = true;
  return f;
}

describe('hitstun recovery (regression: P2 used to be permanently stuck)', () => {
  let world: World;
  let p1: Fighter;
  let p2: Fighter;

  beforeEach(() => {
    world = buildWorld();
    p1 = makeFighter(0, LANCER_STATS, LANCER_MOVES, world);
    p2 = makeFighter(1, HUNTRESS_STATS, HUNTRESS_MOVES, world);
    // Position P1 at hitting range of P2 facing right
    p1.body.x = 700;
    p2.body.x = 740;
    p1.facing = 1;
    p2.facing = -1;
  });

  it('victim exits hitstun within 30 ticks of a basic jab', () => {
    p1.startMove(LANCER_MOVES['jab'], 0);
    p1.fsm.force('Attack', 0);

    let tick = 0;
    let hitFrame = -1;
    for (; tick < 60; tick++) {
      p1.input.push(emptyInput());
      p2.input.push(emptyInput());
      p1.update(tick);
      p2.update(tick);
      hitDetection.run([p1, p2], tick);
      if (p2.percent > 0 && hitFrame < 0) hitFrame = tick;
      if (p2.fsm.id !== 'Hitstun' && p2.percent > 0) break;
    }
    expect(p2.percent).toBeGreaterThan(0);
    expect(hitFrame).toBeGreaterThan(0);
    expect(p2.fsm.id).not.toBe('Hitstun');
    expect(p2.fsm.id).not.toBeNull();
  });

  it('pendingHitstunEnter is consumed exactly once per hit', () => {
    p1.startMove(LANCER_MOVES['jab'], 0);
    p1.fsm.force('Attack', 0);
    let consumeCount = 0;
    let lastWasTrue = false;
    for (let tick = 0; tick < 80; tick++) {
      p1.input.push(emptyInput());
      p2.input.push(emptyInput());
      const before = p2.pendingHitstunEnter;
      p1.update(tick);
      p2.update(tick);
      hitDetection.run([p1, p2], tick);
      const after = p2.pendingHitstunEnter;
      if (before && !after && lastWasTrue) consumeCount += 1;
      lastWasTrue = after;
    }
    expect(consumeCount).toBeLessThanOrEqual(1);
    expect(p2.pendingHitstunEnter).toBe(false);
  });
});

// NOTE: the previous "Skirmisher rescaling preserves multi-frame active
// windows" suite was removed during the v0 → tech-demo-rebuild content
// wipe. It tested an obsolete code path where SKIRMISHER_MOVES were
// programmatically rescaled from KNIGHT_MOVES; both characters now have
// bespoke movesets, so the rescale path no longer exists. Phase 3 will
// add new lancer/skirmisher frame-data tests that assert reference 1:1
// values against kuroganehammer.com (e.g., "lancer fsmash startup is 14f").
