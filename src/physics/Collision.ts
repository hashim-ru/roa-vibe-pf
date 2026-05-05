import type { PhysicsBody } from './PhysicsBody';
import type { Platform, World } from './World';

export function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Resolves vertical and horizontal collisions of a body against the world's
 * platforms. One-way platforms are crossable from below and the sides; the
 * body lands on them only when the previous bottom was at or above the
 * platform top.
 */
export function resolveCollisions(
  body: PhysicsBody,
  world: World,
  options: { dropThrough?: boolean } = {}
): void {
  const { dropThrough = false } = options;

  body.y += body.vy;
  body.grounded = false;

  for (const p of world.platforms) {
    const bx = body.x - body.w / 2;
    const bw = body.w;
    if (bx + bw <= p.x || bx >= p.x + p.w) continue;

    const bodyBottom = body.y;
    const bodyTop = body.y - body.h;
    const platTop = p.y;
    const platBottom = p.y + p.h;

    if (p.oneWay) {
      if (dropThrough) continue;
      const prevBottom = body.prevY;
      if (body.vy >= 0 && bodyBottom > platTop && prevBottom <= platTop + 1) {
        body.y = platTop;
        body.vy = 0;
        body.grounded = true;
      }
    } else {
      if (body.vy >= 0 && bodyBottom > platTop && bodyTop < platTop) {
        const prevBottom = body.prevY;
        if (prevBottom <= platTop + 1) {
          body.y = platTop;
          body.vy = 0;
          body.grounded = true;
        }
      } else if (body.vy < 0 && bodyTop < platBottom && bodyBottom > platBottom) {
        body.y = platBottom + body.h;
        body.vy = 0;
      }
    }
  }

  body.x += body.vx;
  for (const p of world.platforms) {
    if (p.oneWay) continue;
    const bx = body.x - body.w / 2;
    const bw = body.w;
    const bodyBottom = body.y;
    const bodyTop = body.y - body.h;
    if (bodyTop >= p.y + p.h || bodyBottom <= p.y) continue;
    if (bx + bw > p.x && bx < p.x + p.w) {
      if (body.vx > 0) body.x = p.x - body.w / 2;
      else if (body.vx < 0) body.x = p.x + p.w + body.w / 2;
      body.vx = 0;
    }
  }
}

export function isOutsideBlastZone(body: PhysicsBody, world: World): boolean {
  const bz = world.blastZone;
  return body.x < bz.left || body.x > bz.right || body.y < bz.top || body.y > bz.bottom;
}

export type { Platform };
