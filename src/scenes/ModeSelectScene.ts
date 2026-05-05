import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { gameMode, Difficulty, Mode } from '../config/GameMode';

interface Choice {
  label: string;
  mode: Mode;
  difficulty: Difficulty;
  hint: string;
}

const CHOICES: Choice[] = [
  { label: 'VS Bot — Easy', mode: 'vs-bot', difficulty: 'easy', hint: 'slow reflex, sparse attacks' },
  { label: 'VS Bot — Medium', mode: 'vs-bot', difficulty: 'medium', hint: 'tracks position, occasional combo' },
  { label: 'VS Bot — Hard', mode: 'vs-bot', difficulty: 'hard', hint: 'frame-perfect punish, parries, edge-guard' },
  { label: 'VS Human (P2 keyboard)', mode: 'vs-human', difficulty: 'medium', hint: 'local 2-player split keyboard' }
];

export class ModeSelectScene extends Phaser.Scene {
  private cursor = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ModeSelect' });
  }

  create() {
    this.cameras.main.setBackgroundColor('#0c0f1a');

    const g = this.add.graphics();
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const r = Math.round(0x0e * (1 - t) + 0x2c * t);
      const gr = Math.round(0x26 * (1 - t) + 0x4a * t);
      const b = Math.round(0x40 * (1 - t) + 0x55 * t);
      g.fillStyle((r << 16) | (gr << 8) | b, 1).fillRect(
        0,
        (GAME_HEIGHT * i) / 24,
        GAME_WIDTH,
        GAME_HEIGHT / 24 + 1
      );
    }

    this.add
      .text(GAME_WIDTH / 2, 110, 'CHOOSE YOUR FIGHT', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#ffe0a0',
        stroke: '#000',
        strokeThickness: 6
      })
      .setOrigin(0.5);

    CHOICES.forEach((c, i) => {
      const y = 240 + i * 64;
      const t = this.add
        .text(GAME_WIDTH / 2, y, c.label, {
          fontFamily: 'Cinzel, ui-serif, serif',
          fontSize: '30px',
          color: '#ffffff',
          stroke: '#000',
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => (this.cursor = i) && this.refresh());
      t.on('pointerdown', () => this.confirm());
      this.rows.push(t);
    });

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 110, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '15px',
        color: '#a0a8b8'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '↑↓/W,S to navigate · ENTER/SPACE to confirm · ESC back', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.refresh();

    this.input.keyboard?.on('keydown-DOWN', () => this.move(1));
    this.input.keyboard?.on('keydown-S', () => this.move(1));
    this.input.keyboard?.on('keydown-UP', () => this.move(-1));
    this.input.keyboard?.on('keydown-W', () => this.move(-1));
    this.input.keyboard?.on('keydown-ENTER', () => this.confirm());
    this.input.keyboard?.on('keydown-SPACE', () => this.confirm());
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Title'));
  }

  private move(d: number): void {
    this.cursor = (this.cursor + d + CHOICES.length) % CHOICES.length;
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((r, i) => {
      if (i === this.cursor) {
        r.setColor('#ffe04d');
        r.setScale(1.08);
      } else {
        r.setColor('#ffffff');
        r.setScale(1);
      }
    });
    this.hint.setText(CHOICES[this.cursor].hint);
  }

  private confirm(): void {
    const c = CHOICES[this.cursor];
    gameMode.set({ mode: c.mode, difficulty: c.difficulty });
    this.scene.start('CharacterSelect');
  }
}
