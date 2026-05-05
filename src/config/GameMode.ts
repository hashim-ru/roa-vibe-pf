export type Difficulty = 'easy' | 'medium' | 'hard';
export type Mode = 'vs-human' | 'vs-bot';
export type CharacterId =
  | 'knight'
  | 'huntress'
  | 'wetlands'
  | 'lancer'
  | 'reaver'
  | 'guardian'
  | 'ranger'
  | 'vanguard';

export interface GameModeConfig {
  mode: Mode;
  difficulty: Difficulty;
  characters: [CharacterId, CharacterId];
}

class GameModeStore {
  private cfg: GameModeConfig = {
    mode: 'vs-human',
    difficulty: 'medium',
    characters: ['knight', 'huntress']
  };

  set(cfg: Partial<GameModeConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
  }

  get(): GameModeConfig {
    return this.cfg;
  }
}

export const gameMode = new GameModeStore();
