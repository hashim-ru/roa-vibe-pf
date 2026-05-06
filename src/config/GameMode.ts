export type Difficulty = 'easy' | 'medium' | 'hard';
export type Mode = 'vs-human' | 'vs-bot' | 'training' | 'vs-net';

/**
 * Tech-demo roster: just two characters built to Marth-class / Sheik-class
 * reference depth. Adding more later means widening this union and the
 * Roster table — no engine changes required.
 */
export type CharacterId = 'lancer' | 'huntress';

/**
 * Tournament-spec stages: Battlefield (3 platforms) + Final Destination
 * (one wide flat). Keep stage IDs short — they index per-stage assets
 * and parallax layers.
 */
export type StageId = 'battlefield' | 'final-destination';

export interface NetSessionInfo {
  /** 0 = host, 1 = guest. Determines which slot reads the local keyboard. */
  localPlayerIndex: 0 | 1;
  /** Frames of input delay both peers agree to apply. */
  inputDelay: number;
  /** Tick the simulation should treat as t0 (both peers schedule the same value). */
  startTick: number;
  /** Seed for any seeded PRNG that needs to stay in sync. */
  seed: number;
}

export interface GameModeConfig {
  mode: Mode;
  difficulty: Difficulty;
  characters: [CharacterId, CharacterId];
  stage: StageId;
  /** Present only when `mode === 'vs-net'`. */
  netSession?: NetSessionInfo;
}

class GameModeStore {
  private cfg: GameModeConfig = {
    mode: 'vs-human',
    difficulty: 'medium',
    characters: ['lancer', 'huntress'],
    stage: 'battlefield'
  };

  set(cfg: Partial<GameModeConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
  }

  get(): GameModeConfig {
    return this.cfg;
  }
}

export const gameMode = new GameModeStore();
