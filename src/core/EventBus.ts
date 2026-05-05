import mitt, { Emitter } from 'mitt';

export type GameEvents = {
  hit: { attackerId: number; victimId: number; damage: number };
  ko: { victimId: number };
  parry: { defenderId: number; attackerId: number };
  /** Two non-transcendent hitboxes traded within the 9-dmg clank window. */
  clank: { aId: number; bId: number };
  ledgeGrabbed: { fighterId: number };
  jump: { fighterId: number };
  doubleJump: { fighterId: number };
  land: { fighterId: number; speed: number };
  dash: { fighterId: number };
};

export const bus: Emitter<GameEvents> = mitt<GameEvents>();
