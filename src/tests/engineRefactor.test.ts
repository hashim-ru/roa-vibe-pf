import { describe, it, expect } from 'vitest';
import { Fighter } from '../entities/Fighter';
import { LANCER_STATS } from '../entities/FighterStats';
import { LANCER_MOVES } from '../entities/characters/lancer/Lancer';
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
import { canCancel } from '../entities/MoveCancel';

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

function makeFighter(world: World): Fighter {
  const buf = new InputBuffer();
  buf.push(emptyInput());
  const f = new Fighter(0, world, LANCER_STATS, buf, world.spawns[0], LANCER_MOVES);
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

describe('Phase 1.7 — stale move queue', () => {
  it('first hit returns 1.0× multiplier', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    const mul = f.pushStaleMove('jab');
    expect(mul).toBe(1.0);
  });

  it('repeated move loses 5% per occurrence', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.pushStaleMove('jab');
    f.pushStaleMove('jab');
    expect(f.staleMultiplier('jab')).toBeCloseTo(0.9, 5);
  });

  it('clamps at 0.55× minimum (9 stale repeats)', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    for (let i = 0; i < 9; i++) f.pushStaleMove('jab');
    expect(f.staleMultiplier('jab')).toBe(0.55);
  });

  it('queue length is bounded to 9', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    for (let i = 0; i < 20; i++) f.pushStaleMove(`m${i}`);
    expect(f.staleQueue.length).toBe(9);
  });
});

describe('Phase 1.5 — ledge regrab decay', () => {
  it('first regrab is full intangibility (1.0×)', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    expect(f.ledgeRegrabIntangibilityScale()).toBe(1.0);
  });

  it('second regrab scaled to 0.8×', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.ledgeRegrabsThisAir = 1;
    expect(f.ledgeRegrabIntangibilityScale()).toBe(0.8);
  });

  it('third regrab scaled to 0.5×', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.ledgeRegrabsThisAir = 2;
    expect(f.ledgeRegrabIntangibilityScale()).toBe(0.5);
  });

  it('fourth+ regrab gets zero intangibility', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.ledgeRegrabsThisAir = 3;
    expect(f.ledgeRegrabIntangibilityScale()).toBe(0);
    f.ledgeRegrabsThisAir = 9;
    expect(f.ledgeRegrabIntangibilityScale()).toBe(0);
  });
});

describe('Phase 1.6 — move cancel tables', () => {
  it('rejects cancel before IASA frame', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    const move = LANCER_MOVES['ftilt'];
    const decision = canCancel(f, move, 5); // ftilt iasa=22, phase=5 well before
    expect(decision.cancel).toBe(false);
  });

  it('accepts cancel on or past IASA when input buffered', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    const move = LANCER_MOVES['ftilt'];
    f.input.push({ ...emptyInput(), attack: true });
    const decision = canCancel(f, move, move.iasaFrame ?? 99);
    expect(decision.cancel).toBe(true);
    expect(decision.kind).toBe('attack');
  });

  it('rejects jump cancel when airborne', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.body.grounded = false;
    const move = LANCER_MOVES['ftilt'];
    f.input.push({ ...emptyInput(), jump: true });
    const decision = canCancel(f, move, move.iasaFrame ?? 99, ['jump']);
    expect(decision.cancel).toBe(false);
  });
});

describe('Phase 1.8 — tumble flag', () => {
  it('Fighter.tumbling is false by default', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    expect(f.tumbling).toBe(false);
  });
});
