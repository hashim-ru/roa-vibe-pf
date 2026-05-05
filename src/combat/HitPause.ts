import type { Fighter } from '../entities/Fighter';

export class HitPauseManager {
  freeze(f: Fighter, frames: number, currentTick: number): void {
    f.hitPauseUntilTick = Math.max(f.hitPauseUntilTick, currentTick + frames);
  }
}

export const hitPause = new HitPauseManager();
