import type { HitboxData } from '../data/schema/moves.schema';
import type { Fighter } from '../entities/Fighter';

export interface ActiveHitbox {
  data: HitboxData;
  worldX: number;
  worldY: number;
  attacker: Fighter;
}

/**
 * Build an active hitbox at world coordinates, accounting for attacker
 * facing. The hitbox shape (rect/circle/arc) is preserved on `data`; the
 * detection code in HitDetection.ts dispatches per-shape overlap.
 */
export function buildWorldHitbox(attacker: Fighter, hb: HitboxData): ActiveHitbox {
  const worldX = attacker.body.x + hb.ox * attacker.facing;
  const worldY = attacker.body.y - attacker.body.h * 0.5 + hb.oy;
  return { data: hb, worldX, worldY, attacker };
}

/**
 * Returns the AABB bounding box of the hitbox in world space, regardless
 * of underlying shape. Used for debug rendering and broadphase pruning
 * before a precise per-shape overlap test.
 */
export function hitboxBounds(active: ActiveHitbox) {
  const { data, worldX, worldY } = active;
  const shape = data.shape ?? 'rect';
  if (shape === 'circle') {
    const r = data.radius ?? 0;
    return { x: worldX - r, y: worldY - r, w: r * 2, h: r * 2 };
  }
  if (shape === 'arc') {
    const r = data.radius ?? 0;
    return { x: worldX - r, y: worldY - r, w: r * 2, h: r * 2 };
  }
  return {
    x: worldX - data.w / 2,
    y: worldY - data.h / 2,
    w: data.w,
    h: data.h
  };
}

interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Per-shape precise overlap test against a hurtbox AABB. The hurtbox is
 * always a rect today (player body), so we only need three dispatches:
 * rect-vs-rect, circle-vs-rect, and arc-vs-rect.
 */
export function hitboxOverlapsAABB(active: ActiveHitbox, target: AABB): boolean {
  const shape = active.data.shape ?? 'rect';
  if (shape === 'circle') return circleVsAABB(active.worldX, active.worldY, active.data.radius ?? 0, target);
  if (shape === 'arc')
    return arcVsAABB(
      active.worldX,
      active.worldY,
      active.data.radius ?? 0,
      active.data.arcStart ?? 0,
      active.data.arcEnd ?? Math.PI * 2,
      active.attacker.facing,
      target
    );
  // rect (default)
  const hb = hitboxBounds(active);
  return rectVsRect(hb, target);
}

function rectVsRect(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleVsAABB(cx: number, cy: number, r: number, rect: AABB): boolean {
  if (r <= 0) return false;
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Arc-vs-AABB: broadphase by circle, then refine via point-in-arc tests
 * on the rect's corners and the rect's closest point. Arcs are flipped
 * around the y-axis when the attacker faces left.
 */
function arcVsAABB(
  cx: number,
  cy: number,
  r: number,
  arcStart: number,
  arcEnd: number,
  facing: 1 | -1,
  rect: AABB
): boolean {
  if (r <= 0) return false;
  // Bail out cheaply if the bounding circle misses the rect entirely.
  if (!circleVsAABB(cx, cy, r, rect)) return false;
  // Sample the rect's nearest point + corners; if any falls inside the
  // arc sector, we have an overlap. (For our purposes this is ample
  // precision — characters are 60-70 px tall and arcs are tens of px.)
  const candidates: Array<[number, number]> = [
    [Math.max(rect.x, Math.min(cx, rect.x + rect.w)), Math.max(rect.y, Math.min(cy, rect.y + rect.h))],
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h]
  ];
  for (const [px, py] of candidates) {
    if (pointInArc(px - cx, py - cy, r, arcStart, arcEnd, facing)) return true;
  }
  return false;
}

function pointInArc(
  dx: number,
  dy: number,
  r: number,
  arcStart: number,
  arcEnd: number,
  facing: 1 | -1
): boolean {
  const dist2 = dx * dx + dy * dy;
  if (dist2 > r * r) return false;
  // Screen y grows downward; we use atan2 with -dy so 0 = +x and angles
  // grow CCW as drawn on screen. Flip x with facing.
  let angle = Math.atan2(-dy, dx * facing);
  // Normalize to [0, 2π)
  if (angle < 0) angle += Math.PI * 2;
  let s = arcStart;
  let e = arcEnd;
  while (s < 0) {
    s += Math.PI * 2;
    e += Math.PI * 2;
  }
  s = s % (Math.PI * 2);
  e = e % (Math.PI * 2);
  if (e < s) e += Math.PI * 2;
  // Try angle and angle + 2π to handle wrap-around arcs.
  return (angle >= s && angle <= e) || (angle + Math.PI * 2 >= s && angle + Math.PI * 2 <= e);
}
