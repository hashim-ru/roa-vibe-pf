import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from '../config/game.config';

/**
 * Deterministic 60Hz simulation pump.
 * Caller invokes `tick(now)` once per requestAnimationFrame; the loop runs
 * 0..MAX_STEPS_PER_FRAME fixed simulation steps and returns the alpha
 * (0..1) for render-side interpolation.
 */
export class FixedTimestepLoop {
  private accumulator = 0;
  private lastTime = 0;
  private started = false;

  constructor(private readonly step: (tickIndex: number) => boolean | void) {}

  tick(now: number, currentTickIndex: () => number, advance: () => number): number {
    if (!this.started) {
      this.lastTime = now;
      this.started = true;
      return 0;
    }
    const frameDelta = Math.min(now - this.lastTime, 250);
    this.lastTime = now;
    this.accumulator += frameDelta;

    let steps = 0;
    while (this.accumulator >= FIXED_DT_MS && steps < MAX_STEPS_PER_FRAME) {
      // Step may return `false` to signal a stall (e.g. waiting on a
      // remote input for this tick). In that case we keep the time in
      // the accumulator and try again next frame — the tick does not
      // advance, so peers stay aligned.
      const result = this.step(currentTickIndex());
      if (result === false) break;
      advance();
      this.accumulator -= FIXED_DT_MS;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      this.accumulator = 0;
    }
    return this.accumulator / FIXED_DT_MS;
  }
}
