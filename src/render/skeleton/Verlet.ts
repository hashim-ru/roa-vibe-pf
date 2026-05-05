/**
 * Tiny verlet chain — used for capes, banners, plumes, scarves. Each
 * point integrates position via velocity (last - prev) + gravity, then
 * constraint passes pin the chain to its anchor and enforce segment
 * length.
 *
 * Math reference: Pikuma Verlet cloth tutorial, Toqoz "Verlet Rope in
 * Games", Wolfire's Rain World limb physics. We deliberately keep this
 * minimal (no torsional springs) — capes and banners are just chains.
 */
export interface VerletPoint {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

export interface VerletChainState {
  points: VerletPoint[];
  /** Segment length in pixels — a constraint enforces this between adjacent points. */
  segmentLen: number;
  /** Constant gravity (px/tick²). Capes ≈ 0.4, banners ≈ 0.25 (lighter). */
  gravity: number;
  /** Velocity damping per tick. 0.99 = slight drag, 0.94 = heavy drag. */
  friction: number;
  /** How many iterations of constraint resolution per step (more = stiffer). */
  iterations: number;
}

export function makeChain(
  count: number,
  anchor: { x: number; y: number },
  segmentLen: number,
  opts: { gravity?: number; friction?: number; iterations?: number } = {}
): VerletChainState {
  const points: VerletPoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = anchor.x;
    const y = anchor.y + i * segmentLen;
    points.push({ x, y, prevX: x, prevY: y });
  }
  return {
    points,
    segmentLen,
    gravity: opts.gravity ?? 0.4,
    friction: opts.friction ?? 0.99,
    iterations: opts.iterations ?? 2
  };
}

/**
 * Step the chain forward one tick. `anchor` is the world-space pin point
 * (chain[0] is locked here every step).
 */
export function stepChain(chain: VerletChainState, anchor: { x: number; y: number }): void {
  const pts = chain.points;
  if (pts.length === 0) return;
  // Integrate (skip pinned root).
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vx = (p.x - p.prevX) * chain.friction;
    const vy = (p.y - p.prevY) * chain.friction;
    p.prevX = p.x;
    p.prevY = p.y;
    p.x += vx;
    p.y += vy + chain.gravity;
    // Soft cap on velocity so the chain doesn't snap on crazy spikes.
    const dx = p.x - p.prevX;
    const dy = p.y - p.prevY;
    const speed2 = dx * dx + dy * dy;
    const max = 12;
    if (speed2 > max * max) {
      const s = max / Math.sqrt(speed2);
      p.x = p.prevX + dx * s;
      p.y = p.prevY + dy * s;
    }
  }
  // Constraint passes — pin root + enforce segment length.
  for (let iter = 0; iter < chain.iterations; iter++) {
    pts[0].x = anchor.x;
    pts[0].y = anchor.y;
    pts[0].prevX = anchor.x;
    pts[0].prevY = anchor.y;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || chain.segmentLen;
      const diff = (dist - chain.segmentLen) / dist;
      // First point is "infinite mass" (anchor) — only b moves.
      if (i === 1) {
        b.x -= dx * diff;
        b.y -= dy * diff;
      } else {
        a.x += dx * diff * 0.5;
        a.y += dy * diff * 0.5;
        b.x -= dx * diff * 0.5;
        b.y -= dy * diff * 0.5;
      }
    }
  }
}

/** Apply an external impulse (e.g., flap from sudden movement) to all non-root points. */
export function nudgeChain(chain: VerletChainState, dx: number, dy: number): void {
  for (let i = 1; i < chain.points.length; i++) {
    chain.points[i].prevX -= dx;
    chain.points[i].prevY -= dy;
  }
}
