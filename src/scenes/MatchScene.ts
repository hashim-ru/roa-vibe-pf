import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

/**
 * MatchScene STUB — content wiped during the v0 → tech-demo-rebuild
 * transition (Phase 0). The fully rebuilt match loop with the new
 * FighterRenderer, VFX system, stage parallax, and 2-character flow
 * arrives in Phase 2 (renderer) and Phase 4 (stages).
 *
 * For now this scene only renders a placeholder card so the title →
 * mode-select → match navigation chain stays intact and the typecheck +
 * unit-test suites stay green.
 */
export class MatchScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Match' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0c0f1a');

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'MATCH SCENE', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '48px',
        color: '#ffe04d',
        stroke: '#000',
        strokeThickness: 6
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 + 20,
        'rebuild in progress — Phase 2 lands the new renderer',
        {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '16px',
          color: '#a0a8b8'
        }
      )
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 70, 'press ESC for title', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start('Title');
    });
  }
}
