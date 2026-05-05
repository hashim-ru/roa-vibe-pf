import type { AABB } from './PhysicsBody';

export interface Platform extends AABB {
  oneWay: boolean;
}

export interface BlastZone {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LedgePoint {
  x: number;
  y: number;
  facing: 1 | -1;
  occupiedBy: number | null;
}

export class World {
  constructor(
    public platforms: Platform[],
    public ledges: LedgePoint[],
    public blastZone: BlastZone,
    public spawns: Array<{ x: number; y: number }>,
    public gravity = 0.7,
    public friction = 0.85
  ) {}
}
