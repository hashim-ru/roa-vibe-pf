export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Position is the bottom-center pivot (between feet); width/height extend up
 * and out symmetrically. This matches sprite pivot convention used by the
 * frame-data system, so hitbox offsets don't drift across animations.
 */
export class PhysicsBody {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  w: number;
  h: number;
  facing: 1 | -1 = 1;
  grounded = false;
  maxFallSpeed: number;

  constructor(opts: { x: number; y: number; w: number; h: number; maxFallSpeed?: number }) {
    this.x = opts.x;
    this.y = opts.y;
    this.prevX = opts.x;
    this.prevY = opts.y;
    this.w = opts.w;
    this.h = opts.h;
    this.maxFallSpeed = opts.maxFallSpeed ?? 18;
  }

  bounds(): AABB {
    return {
      x: this.x - this.w / 2,
      y: this.y - this.h,
      w: this.w,
      h: this.h
    };
  }

  snapshotPrev(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }
}
