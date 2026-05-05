import { describe, it, expect } from 'vitest';
import { Fighter } from '../entities/Fighter';
import { LANCER_STATS } from '../entities/FighterStats';
import { LANCER_MOVES } from '../entities/characters/lancer/Lancer';
import { World } from '../physics/World';
import { InputBuffer } from '../input/InputBuffer';
import { emptyInput, InputState } from '../input/InputState';
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

const press = (action: keyof InputState): InputState => ({ ...emptyInput(), [action]: true } as InputState);

describe('coyote time', () => {
  it('reports inCoyoteWindow=true within N frames after walking off ground', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.body.grounded = false;
    f.lastGroundedTick = 100;
    expect(f.inCoyoteWindow(101, 5)).toBe(true);
    expect(f.inCoyoteWindow(105, 5)).toBe(true);
    expect(f.inCoyoteWindow(107, 5)).toBe(false);
  });

  it('grounded body is always in coyote window regardless of frames', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.body.grounded = true;
    expect(f.inCoyoteWindow(99999, 5)).toBe(true);
  });
});

describe('input buffer', () => {
  it('captures rising edges within an 8-frame window', () => {
    const buf = new InputBuffer();
    for (let i = 0; i < 4; i++) buf.push(emptyInput());
    buf.push(press('jump'));
    for (let i = 0; i < 5; i++) buf.push(emptyInput()); // 5 frames idle
    expect(buf.bufferedFrames('jump', 8)).toBeGreaterThanOrEqual(0);
    expect(buf.bufferedFrames('jump', 3)).toBe(-1);
  });
});

describe('apex float', () => {
  it('triggerApexFloat sets the counter; zero held jump consumes it', () => {
    const world = buildWorld();
    const f = makeFighter(world);
    f.triggerApexFloat(6);
    expect(f.apexFramesRemaining).toBe(6);
  });
});
