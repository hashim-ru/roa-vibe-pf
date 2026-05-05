import { describe, it, expect } from 'vitest';
import { hitboxOverlapsAABB, ActiveHitbox } from '../combat/Hitbox';
import type { HitboxData } from '../data/schema/moves.schema';
import type { Fighter } from '../entities/Fighter';

/**
 * Shape-aware overlap dispatch. Hurtbox is always a rect (player AABB),
 * so we only need to validate the three attacker-shape variants land
 * sensibly against rects.
 */

function fakeFighter(facing: 1 | -1 = 1): Fighter {
  return { facing } as unknown as Fighter;
}

function active(data: HitboxData, x: number, y: number, facing: 1 | -1 = 1): ActiveHitbox {
  return { data, worldX: x, worldY: y, attacker: fakeFighter(facing) };
}

const baseRect: HitboxData = {
  id: 0,
  ox: 0,
  oy: 0,
  w: 30,
  h: 30,
  damage: 5,
  baseKB: 10,
  kbGrowth: 50,
  angle: 90,
  hitstunMul: 0.4,
  priority: 1,
  hitId: 'test_rect'
};

describe('hitbox shape — rect', () => {
  it('reports overlap when AABBs intersect', () => {
    const hb = active(baseRect, 100, 100);
    const ok = hitboxOverlapsAABB(hb, { x: 95, y: 95, w: 30, h: 30 });
    expect(ok).toBe(true);
  });
  it('reports no overlap when AABBs are clear apart', () => {
    const hb = active(baseRect, 100, 100);
    const ok = hitboxOverlapsAABB(hb, { x: 200, y: 200, w: 20, h: 20 });
    expect(ok).toBe(false);
  });
});

describe('hitbox shape — circle', () => {
  const circle: HitboxData = { ...baseRect, shape: 'circle', radius: 20, hitId: 'test_circle' };
  it('hits when target overlaps the disc', () => {
    const hb = active(circle, 100, 100);
    expect(hitboxOverlapsAABB(hb, { x: 110, y: 110, w: 20, h: 20 })).toBe(true);
  });
  it('misses when target is outside the disc but inside the bounding box', () => {
    // Circle (100,100) r=20. Corner at (115, 115) is at distance ~21.2 > 20.
    const hb = active(circle, 100, 100);
    expect(hitboxOverlapsAABB(hb, { x: 115, y: 115, w: 4, h: 4 })).toBe(false);
  });
  it('misses when zero-radius', () => {
    const hb = active({ ...circle, radius: 0 }, 100, 100);
    expect(hitboxOverlapsAABB(hb, { x: 95, y: 95, w: 30, h: 30 })).toBe(false);
  });
});

describe('hitbox shape — arc', () => {
  // Arc from 0..π/2 means a quarter circle in the upper-right quadrant
  // (screen-space: +x right, -y up — atan2 in our pointInArc flips dy).
  const arc: HitboxData = {
    ...baseRect,
    shape: 'arc',
    radius: 30,
    arcStart: 0,
    arcEnd: Math.PI / 2,
    hitId: 'test_arc'
  };
  it('hits when target sits in the upper-right quadrant', () => {
    const hb = active(arc, 100, 100);
    // Target above-right of center: (110, 80), inside radius 30.
    expect(hitboxOverlapsAABB(hb, { x: 108, y: 78, w: 8, h: 8 })).toBe(true);
  });
  it('misses when target sits in the lower-left quadrant (outside arc)', () => {
    const hb = active(arc, 100, 100);
    expect(hitboxOverlapsAABB(hb, { x: 78, y: 118, w: 8, h: 8 })).toBe(false);
  });
  it('mirrors the arc when attacker faces left', () => {
    // Same arc but attacker faces -1 → arc is mirrored, hits upper-LEFT.
    const hb = active(arc, 100, 100, -1);
    expect(hitboxOverlapsAABB(hb, { x: 78, y: 78, w: 8, h: 8 })).toBe(true);
    expect(hitboxOverlapsAABB(hb, { x: 108, y: 78, w: 8, h: 8 })).toBe(false);
  });
});
