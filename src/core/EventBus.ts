import mitt, { Emitter } from 'mitt';

export type GameEvents = {
  hit: { attackerId: number; victimId: number; damage: number };
  ko: { victimId: number };
  parry: { defenderId: number; attackerId: number };
  ledgeGrabbed: { fighterId: number };
  jump: { fighterId: number };
  doubleJump: { fighterId: number };
  land: { fighterId: number; speed: number };
  dash: { fighterId: number };
};

export const bus: Emitter<GameEvents> = mitt<GameEvents>();
