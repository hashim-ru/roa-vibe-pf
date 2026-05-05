/**
 * Melee-style knockback magnitude.
 * `kb = (((p/10 + p*d/20) * 200/(w+100) * 1.4) + 18) * (kbg/100) + bkb`
 * where p is the victim's percent AFTER the hit, d is move damage,
 * w is victim weight (Melee scale, default 100).
 */
export function computeKnockback(opts: {
  victimPercent: number;
  damage: number;
  weight: number;
  baseKB: number;
  kbGrowth: number;
  fixedKB?: number;
}): number {
  const { victimPercent: p, damage: d, weight: w, baseKB, kbGrowth, fixedKB } = opts;
  if (fixedKB !== undefined) return fixedKB;
  const newPercent = p + d;
  const term1 = newPercent / 10;
  const term2 = (newPercent * d) / 20;
  const weightFactor = 200 / (w + 100);
  return (((term1 + term2) * weightFactor * 1.4) + 18) * (kbGrowth / 100) + baseKB;
}

export function hitstunFrames(knockback: number, mul = 0.4): number {
  return Math.max(1, Math.floor(knockback * mul));
}

export function hitPauseFrames(damage: number, opts?: { electric?: boolean; mult?: number }): number {
  // Smash 4 hitlag formula: floor(d/2.6 + 5), clamp [3, 30].
  // Heavier moves automatically freeze longer, which reads as "weight".
  const electric = opts?.electric ? 1.5 : 1;
  const mult = opts?.mult ?? 1;
  const raw = Math.floor(damage / 2.6 + 5) * electric * mult;
  return Math.max(3, Math.min(30, Math.floor(raw)));
}

export interface LaunchVector {
  vx: number;
  vy: number;
  angle: number;
}

const KB_TO_VELOCITY = 0.085;

export function launchVector(
  knockback: number,
  angleDeg: number,
  facing: 1 | -1
): LaunchVector {
  let a = angleDeg;
  if (a === 361) {
    const transition = 32;
    a = knockback < transition ? 0 : 44;
  }
  const adjusted = a;
  const rad = (adjusted * Math.PI) / 180;
  const speed = knockback * KB_TO_VELOCITY;
  return {
    vx: Math.cos(rad) * speed * facing,
    vy: -Math.sin(rad) * speed,
    angle: adjusted
  };
}

/**
 * DI: rotate launch by up to ±18° toward perpendicular of launch direction.
 */
export function applyDI(angleDeg: number, stickX: number, stickY: number): number {
  const len = Math.hypot(stickX, stickY);
  if (len < 0.3) return angleDeg;
  const stickAngle = (Math.atan2(-stickY, stickX) * 180) / Math.PI;
  let diff = ((stickAngle - angleDeg + 540) % 360) - 180;
  const perpFactor = Math.sin((diff * Math.PI) / 180);
  return angleDeg + 18 * perpFactor;
}
