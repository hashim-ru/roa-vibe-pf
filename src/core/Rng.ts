/**
 * mulberry32 — small, fast, deterministic PRNG.
 *
 * Used for any roll that must agree across machines (currently the bot
 * controller; future: replay playback, deterministic VFX seeds). The
 * gameplay engine itself is `Math.random`-free, so the only consumer
 * today is BotController. We still expose a singleton seeded from the
 * GameMode so replays can reproduce the same bot behaviour.
 */
export class Rng {
  private state: number;
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }
  reseed(seed: number): void {
    this.state = (seed >>> 0) || 1;
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** Game-wide deterministic RNG. Seed it from GameMode at match start. */
export const sharedRng = new Rng(1);
