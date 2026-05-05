import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Title' });
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

    g.fillStyle(0x1a3144, 1);
    g.beginPath();
    g.moveTo(0, GAME_HEIGHT * 0.65);
    let x = 0;
    while (x < GAME_WIDTH) {
      const peak = 200 + Math.sin(x * 0.013) * 40 + Math.cos(x * 0.007) * 60;
      g.lineTo(x, GAME_HEIGHT - peak);
      x += 80;
    }
    g.lineTo(GAME_WIDTH, GAME_HEIGHT);
    g.lineTo(0, GAME_HEIGHT);
    g.closePath();
    g.fillPath();

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, 'Knights of the Vale', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffe0a0',
        stroke: '#000',
        strokeThickness: 8
      })
      .setOrigin(0.5);

    const subtitle = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'a halal platform fighter', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '20px',
        color: '#a0a8b8'
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.65, 'press SPACE to fight', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '18px',
        color: '#cfd0d6'
      })
      .setOrigin(0.5);

    const controls = [
      'P1   move WASD · jump SPACE · attack F · special G · parry H · smash LSHIFT+attack',
      'P2   move ←→↑↓ · jump RSHIFT · attack / · special . · parry RCTRL · smash NUM0+attack',
      'tech wavedash (parry mid-air with stick)  · L-cancel (attack just before landing)  · ledge auto-grab',
      'F1 toggles debug hitboxes · R restarts a finished match'
    ];
    controls.forEach((line, i) =>
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.78 + i * 22, line, {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '13px',
          color: '#7a8298'
        })
        .setOrigin(0.5)
    );

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      yoyo: true,
      duration: 700,
      repeat: -1
    });

    void title;
    void subtitle;

    const start = () => this.scene.start('ModeSelect');
    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.keyboard?.once('keydown-ENTER', start);
    this.input.once('pointerdown', start);
  }
}
