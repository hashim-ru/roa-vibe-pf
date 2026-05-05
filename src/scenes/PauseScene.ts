import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { audio } from '../audio/AudioManager';

interface MenuRow {
  label: string;
  action: () => void;
  /** Optional value to display on the right side (e.g. volume bar). */
  getValue?: () => string;
  /** Optional left/right adjusters for sliders. */
  adjust?: (dir: -1 | 1) => void;
}

/**
 * Pause overlay — launched on top of the live MatchScene with
 * scene.launch('Pause'). The match scene pauses itself when this
 * scene starts and resumes when this scene closes.
 *
 * Menu options: Resume, Restart, Master/SFX/Ambient volume sliders,
 * Mute toggle, Quit to title.
 */
export class PauseScene extends Phaser.Scene {
  private cursor = 0;
  private rows: MenuRow[] = [];
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private valueTexts: Phaser.GameObjects.Text[] = [];
  private overlayBg!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'Pause' });
  }

  create(): void {
    // Dark dimming overlay so the live match underneath is muted but
    // still visible (helps players remember context).
    this.overlayBg = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0e1a, 0.78)
      .setDepth(2999);

    this.add
      .text(GAME_WIDTH / 2, 140, 'PAUSED', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffe04d',
        stroke: '#000',
        strokeThickness: 6
      })
      .setOrigin(0.5)
      .setDepth(3000);

    this.rows = [
      { label: 'Resume', action: () => this.resume() },
      { label: 'Restart Match', action: () => this.restart() },
      {
        label: 'Master Volume',
        action: () => undefined,
        getValue: () => this.bar(audio.getMix().master),
        adjust: (dir) => audio.setMasterVolume(audio.getMix().master + dir * 0.1)
      },
      {
        label: 'SFX Volume',
        action: () => undefined,
        getValue: () => this.bar(audio.getMix().sfx),
        adjust: (dir) => audio.setChannelVolume('sfx', audio.getMix().sfx + dir * 0.1)
      },
      {
        label: 'Ambient Volume',
        action: () => undefined,
        getValue: () => this.bar(audio.getMix().ambient),
        adjust: (dir) => audio.setChannelVolume('ambient', audio.getMix().ambient + dir * 0.1)
      },
      {
        label: 'Mute',
        action: () => audio.setMuted(!audio.getMix().muted),
        getValue: () => (audio.getMix().muted ? '[MUTED]' : '[OFF]')
      },
      { label: 'Quit to Title', action: () => this.quit() }
    ];

    const baseY = 240;
    const rowH = 50;
    this.rows.forEach((row, i) => {
      const t = this.add
        .text(GAME_WIDTH / 2 - 200, baseY + i * rowH, row.label, {
          fontFamily: 'Cinzel, ui-serif, serif',
          fontSize: '24px',
          color: '#ffffff',
          stroke: '#000',
          strokeThickness: 4
        })
        .setOrigin(0, 0.5)
        .setDepth(3000);
      this.rowTexts.push(t);
      const v = this.add
        .text(GAME_WIDTH / 2 + 200, baseY + i * rowH, '', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '18px',
          color: '#a0a8b8'
        })
        .setOrigin(1, 0.5)
        .setDepth(3000);
      this.valueTexts.push(v);
    });

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '↑↓/W,S navigate · ←→/A,D adjust · ENTER/SPACE confirm · ESC resume', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5)
      .setDepth(3000);

    this.input.keyboard?.on('keydown-DOWN', () => this.move(1));
    this.input.keyboard?.on('keydown-S', () => this.move(1));
    this.input.keyboard?.on('keydown-UP', () => this.move(-1));
    this.input.keyboard?.on('keydown-W', () => this.move(-1));
    this.input.keyboard?.on('keydown-LEFT', () => this.adjust(-1));
    this.input.keyboard?.on('keydown-A', () => this.adjust(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.adjust(1));
    this.input.keyboard?.on('keydown-D', () => this.adjust(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.confirm());
    this.input.keyboard?.on('keydown-SPACE', () => this.confirm());
    this.input.keyboard?.on('keydown-ESC', () => this.resume());

    this.refresh();
  }

  private bar(value: number): string {
    const filled = Math.round(Math.max(0, Math.min(1, value)) * 10);
    return `[${'█'.repeat(filled)}${'·'.repeat(10 - filled)}] ${Math.round(value * 100)}%`;
  }

  private move(d: number): void {
    this.cursor = (this.cursor + d + this.rows.length) % this.rows.length;
    this.refresh();
  }

  private adjust(dir: -1 | 1): void {
    const row = this.rows[this.cursor];
    if (row.adjust) row.adjust(dir);
    this.refresh();
  }

  private confirm(): void {
    const row = this.rows[this.cursor];
    row.action();
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      const t = this.rowTexts[i];
      if (i === this.cursor) {
        t.setColor('#ffe04d');
        t.setScale(1.08);
      } else {
        t.setColor('#ffffff');
        t.setScale(1);
      }
      this.valueTexts[i].setText(row.getValue ? row.getValue() : '');
    });
  }

  private resume(): void {
    this.scene.resume('Match');
    this.scene.stop();
  }

  private restart(): void {
    this.scene.stop('Match');
    this.scene.start('Match');
    this.scene.stop();
  }

  private quit(): void {
    this.scene.stop('Match');
    this.scene.start('Title');
    this.scene.stop();
  }
}
