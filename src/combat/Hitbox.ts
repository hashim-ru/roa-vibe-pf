import type { HitboxData } from '../data/schema/moves.schema';
import type { Fighter } from '../entities/Fighter';

export interface ActiveHitbox {
  data: HitboxData;
  worldX: number;
  worldY: number;
  attacker: Fighter;
}

export function buildWorldHitbox(attacker: Fighter, hb: HitboxData): ActiveHitbox {
  const worldX = attacker.body.x + hb.ox * attacker.facing;
  const worldY = attacker.body.y - attacker.body.h * 0.5 + hb.oy;
  return { data: hb, worldX, worldY, attacker };
}

export function hitboxBounds(active: ActiveHitbox) {
  return {
    x: active.worldX - active.data.w / 2,
    y: active.worldY - active.data.h / 2,
    w: active.data.w,
    h: active.data.h
  };
}
