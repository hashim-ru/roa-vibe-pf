import Phaser from 'phaser';
import type { Fighter } from '../../entities/Fighter';
import { GAME_HEIGHT } from '../../config/game.config';

export class HUD {
  private texts: Phaser.GameObjects.Text[] = [];
  private bars: Phaser.GameObjects.Graphics;
  readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene) {
    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(2000);
    this.objects.push(this.bars);
    for (let i = 0; i < 2; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: 'Cinzel, ui-serif, serif',
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4
        })
        .setScrollFactor(0)
        .setDepth(2001);
      this.texts.push(t);
      this.objects.push(t);
    }
  }

  draw(fighters: Fighter[]): void {
    this.bars.clear();
    const cam = this.scene.cameras.main;
    const screenW = cam.width;
    const baseY = GAME_HEIGHT - 80;
    const colW = 360;
    const margin = 40;

    fighters.forEach((f, i) => {
      const x = i === 0 ? margin : screenW - margin - colW;
      const colorTop = i === 0 ? 0xffe04d : 0x6cb8ff;
      this.bars.fillStyle(0x111421, 0.85).fillRect(x, baseY, colW, 64);
      this.bars.lineStyle(2, colorTop, 1).strokeRect(x, baseY, colW, 64);

      for (let s = 0; s < 3; s++) {
        const cx = x + 14 + s * 18;
        const cy = baseY + 14;
        if (s < f.stocks) {
          this.bars.fillStyle(colorTop, 1).fillRect(cx, cy, 12, 14);
          this.bars.lineStyle(1, 0x000000, 0.7).strokeRect(cx, cy, 12, 14);
        } else {
          this.bars.lineStyle(1, 0x666666, 0.6).strokeRect(cx, cy, 12, 14);
        }
      }

      const t = this.texts[i];
      t.setPosition(x + 14, baseY + 24);
      const pct = Math.floor(f.percent);
      let color = '#ffffff';
      if (pct > 60) color = '#ffd966';
      if (pct > 100) color = '#ff8a55';
      if (pct > 150) color = '#ff4f6a';
      t.setColor(color);
      t.setText(`${pct}%`);
    });
  }
}
