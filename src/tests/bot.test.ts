import { describe, it, expect, beforeEach } from 'vitest';
import { Fighter } from '../entities/Fighter';
import { KNIGHT_STATS, SKIRMISHER_STATS } from '../entities/FighterStats';
import { KNIGHT_MOVES } from '../entities/characters/knight/Knight';
import { SKIRMISHER_MOVES } from '../entities/characters/skirmisher/Skirmisher';
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
import { BotController } from '../input/BotController';

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

function makeFighter(idx: number, stats: typeof KNIGHT_STATS, moves: typeof KNIGHT_MOVES, world: World, buf: InputBuffer): Fighter {
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

describe('Bot AI', () => {
  let world: World;
  let p1: Fighter;
  let p2: Fighter;
  let buf2: InputBuffer;

  beforeEach(() => {
    world = buildWorld();
    const buf1 = new InputBuffer();
    buf1.push(emptyInput());
    buf2 = new InputBuffer();
    buf2.push(emptyInput());
    p1 = makeFighter(0, KNIGHT_STATS, KNIGHT_MOVES, world, buf1);
    p2 = makeFighter(1, SKIRMISHER_STATS, SKIRMISHER_MOVES, world, buf2);
  });

  it('hard bot eventually approaches the player when far apart', () => {
    p1.body.x = 200;
    p2.body.x = 1000;
    const bot = new BotController(p2, p1, buf2, 'hard');

    const initialDist = Math.abs(p2.body.x - p1.body.x);
    for (let tick = 0; tick < 400; tick++) {
      bot.poll(tick);
      p1.input.push(emptyInput());
      p1.update(tick);
      p2.update(tick);
    }
    const finalDist = Math.abs(p2.body.x - p1.body.x);
    expect(finalDist).toBeLessThan(initialDist);
  });

  it('hard bot attacks more aggressively than easy bot at close range', () => {
    const easyBuf = new InputBuffer();
    easyBuf.push(emptyInput());
    const easyP2 = makeFighter(1, SKIRMISHER_STATS, SKIRMISHER_MOVES, world, easyBuf);
    p1.body.x = 600;
    easyP2.body.x = 660; // within both bots' attack ranges
    const easyBot = new BotController(easyP2, p1, easyBuf, 'easy');

    p2.body.x = 660;
    const hardBot = new BotController(p2, p1, buf2, 'hard');

    let easyAttacks = 0;
    let hardAttacks = 0;
    // Run past reaction frames (16 for easy, 3 for hard)
    for (let tick = 0; tick < 400; tick++) {
      easyBot.poll(tick);
      hardBot.poll(tick);
      if (easyBuf.current().attack) easyAttacks++;
      if (buf2.current().attack) hardAttacks++;
    }
    expect(hardAttacks).toBeGreaterThan(easyAttacks);
  });

  it('bot does not act in KO state', () => {
    p2.fsm.force('KO', 0);
    const bot = new BotController(p2, p1, buf2, 'hard');
    bot.poll(1);
    const cur = buf2.current();
    expect(cur.attack).toBe(false);
    expect(cur.jump).toBe(false);
  });
});
