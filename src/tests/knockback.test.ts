import { describe, it, expect } from 'vitest';
import { computeKnockback, hitstunFrames, launchVector, applyDI, hitPauseFrames } from '../combat/Knockback';

describe('knockback', () => {
  it('returns positive knockback for nonzero damage', () => {
    const kb = computeKnockback({
      victimPercent: 0,
      damage: 10,
      weight: 100,
      baseKB: 20,
      kbGrowth: 60
    });
    expect(kb).toBeGreaterThan(20);
  });

  it('grows with victim percent', () => {
    const low = computeKnockback({
      victimPercent: 0,
      damage: 10,
      weight: 100,
      baseKB: 20,
      kbGrowth: 60
    });
    const high = computeKnockback({
      victimPercent: 120,
      damage: 10,
      weight: 100,
      baseKB: 20,
      kbGrowth: 60
    });
    expect(high).toBeGreaterThan(low * 1.5);
  });

  it('lighter fighters fly further with same hit', () => {
    const heavy = computeKnockback({
      victimPercent: 80,
      damage: 12,
      weight: 120,
      baseKB: 20,
      kbGrowth: 80
    });
    const light = computeKnockback({
      victimPercent: 80,
      damage: 12,
      weight: 70,
      baseKB: 20,
      kbGrowth: 80
    });
    expect(light).toBeGreaterThan(heavy);
  });

  it('fixedKB ignores damage scaling', () => {
    const a = computeKnockback({
      victimPercent: 0,
      damage: 5,
      weight: 100,
      baseKB: 30,
      kbGrowth: 99,
      fixedKB: 25
    });
    const b = computeKnockback({
      victimPercent: 250,
      damage: 5,
      weight: 100,
      baseKB: 30,
      kbGrowth: 99,
      fixedKB: 25
    });
    expect(a).toBe(b);
    expect(a).toBe(25);
  });

  it('hitstun grows with knockback', () => {
    expect(hitstunFrames(50)).toBeGreaterThan(hitstunFrames(20));
  });

  it('launch vector points in facing-relative direction', () => {
    const right = launchVector(40, 45, 1);
    const left = launchVector(40, 45, -1);
    expect(Math.sign(right.vx)).toBe(1);
    expect(Math.sign(left.vx)).toBe(-1);
    expect(right.vy).toBeLessThan(0);
  });

  it('Sakurai angle (361) flattens at low KB and steepens at high KB', () => {
    const low = launchVector(10, 361, 1);
    const high = launchVector(80, 361, 1);
    expect(Math.abs(low.vy)).toBeLessThan(Math.abs(high.vy));
  });

  it('DI rotates angle within bounds', () => {
    const base = 90;
    const result = applyDI(base, 1, 0);
    const delta = Math.abs(result - base);
    expect(delta).toBeLessThanOrEqual(18.0001);
  });

  it('hitlag formula (Smash 4) scales with damage and clamps to [3,30]', () => {
    // floor(d/2.6 + 5)
    expect(hitPauseFrames(0)).toBe(5);
    expect(hitPauseFrames(10)).toBe(8);
    expect(hitPauseFrames(20)).toBe(12);
    expect(hitPauseFrames(40)).toBe(20);
    expect(hitPauseFrames(200)).toBe(30); // clamps at 30
    expect(hitPauseFrames(0)).toBeGreaterThanOrEqual(3); // clamps at 3
  });

  it('electric hits get 1.5x hitlag', () => {
    const normal = hitPauseFrames(10);
    const electric = hitPauseFrames(10, { electric: true });
    expect(electric).toBeGreaterThan(normal);
  });

  it('heavier hits feel longer than lighter ones', () => {
    expect(hitPauseFrames(20)).toBeGreaterThan(hitPauseFrames(5));
  });
});
