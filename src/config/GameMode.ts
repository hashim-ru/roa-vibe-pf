export type Difficulty = 'easy' | 'medium' | 'hard';
export type Mode = 'vs-human' | 'vs-bot' | 'training';

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

export interface GameModeConfig {
  mode: Mode;
  difficulty: Difficulty;
  characters: [CharacterId, CharacterId];
  stage: StageId;
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
