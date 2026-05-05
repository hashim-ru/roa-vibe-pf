import Phaser from 'phaser';
import type { World } from '../physics/World';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

/**
 * Code-only stage visuals. We layer:
 *   - Sky gradient
 *   - Distant mountains (silhouettes, parallax)
 *   - Mid trees
 *   - Foreground platform fills with stone texture (procedural)
 * No external assets required.
 */
export class StageRenderer {
  private skyTop: Phaser.GameObjects.Graphics;
  private mountains: Phaser.GameObjects.Graphics;
  private trees: Phaser.GameObjects.Graphics;
  private platforms: Phaser.GameObjects.Graphics;
  private decor: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, world: World) {
    this.skyTop = scene.add.graphics().setDepth(-100).setScrollFactor(0);
    this.mountains = scene.add.graphics().setDepth(-90).setScrollFactor(0.2);
    this.trees = scene.add.graphics().setDepth(-80).setScrollFactor(0.5);
    this.platforms = scene.add.graphics().setDepth(0);
    this.decor = scene.add.graphics().setDepth(-10);

    this.drawSky();
    this.drawMountains();
    this.drawTrees();
    this.drawPlatforms(world);
    this.drawDecor(world);
  }

  private drawSky(): void {
    const g = this.skyTop;
    const steps = 24;
    const top = 0x0e2640;
    const bottom = 0x2c4a55;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(((top >> 16) & 0xff) * (1 - t) + ((bottom >> 16) & 0xff) * t);
      const gr = Math.round(((top >> 8) & 0xff) * (1 - t) + ((bottom >> 8) & 0xff) * t);
      const b = Math.round((top & 0xff) * (1 - t) + (bottom & 0xff) * t);
      const color = (r << 16) | (gr << 8) | b;
      const y = (GAME_HEIGHT * i) / steps;
      const h = GAME_HEIGHT / steps + 1;
      g.fillStyle(color, 1).fillRect(-200, y, GAME_WIDTH + 400, h);
    }
    const moonX = GAME_WIDTH * 0.78;
    const moonY = GAME_HEIGHT * 0.18;
    g.fillStyle(0xfff3c8, 0.92).fillCircle(moonX, moonY, 28);
    g.fillStyle(0x0e2640, 1).fillCircle(moonX + 9, moonY - 4, 26);
  }

  private drawMountains(): void {
    const g = this.mountains;
    g.fillStyle(0x1a3144, 1);
    g.beginPath();
    g.moveTo(-200, GAME_HEIGHT * 0.6);
    let x = -200;
    while (x < GAME_WIDTH + 200) {
      const peak = 200 + Math.sin(x * 0.013) * 40 + Math.cos(x * 0.007) * 60;
      g.lineTo(x, GAME_HEIGHT - peak);
      x += 80;
    }
    g.lineTo(GAME_WIDTH + 200, GAME_HEIGHT);
    g.lineTo(-200, GAME_HEIGHT);
    g.closePath();
    g.fillPath();

    g.fillStyle(0x122438, 1);
    g.beginPath();
    g.moveTo(-200, GAME_HEIGHT * 0.7);
    x = -200;
    while (x < GAME_WIDTH + 200) {
      const peak = 130 + Math.sin(x * 0.022 + 1.6) * 50;
      g.lineTo(x, GAME_HEIGHT - peak);
      x += 60;
    }
    g.lineTo(GAME_WIDTH + 200, GAME_HEIGHT);
    g.lineTo(-200, GAME_HEIGHT);
    g.closePath();
    g.fillPath();
  }

  private drawTrees(): void {
    const g = this.trees;
    g.fillStyle(0x081823, 1);
    let rng = 1;
    const rand = () => {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };
    for (let i = 0; i < 26; i++) {
      const x = -100 + i * 60 + rand() * 30;
      const h = 60 + rand() * 90;
      const baseY = GAME_HEIGHT - 30;
      g.fillRect(x - 6, baseY - h, 12, h);
      g.fillTriangle(x - 30, baseY - h * 0.45, x + 30, baseY - h * 0.45, x, baseY - h - 30);
      g.fillTriangle(x - 24, baseY - h * 0.7, x + 24, baseY - h * 0.7, x, baseY - h - 4);
    }
  }

  private drawPlatforms(world: World): void {
    const g = this.platforms;
    for (const p of world.platforms) {
      if (p.oneWay) {
        g.fillStyle(0x6e5634, 1).fillRect(p.x, p.y, p.w, p.h);
        g.fillStyle(0x4a3a22, 1).fillRect(p.x, p.y + p.h - 4, p.w, 4);
        g.lineStyle(1, 0x2c2114, 1).strokeRect(p.x, p.y, p.w, p.h);
      } else {
        g.fillStyle(0x4a4a52, 1).fillRect(p.x, p.y, p.w, p.h);
        g.fillStyle(0x5a5a64, 1).fillRect(p.x + 2, p.y + 2, p.w - 4, 6);
        g.lineStyle(1, 0x1f1f25, 1).strokeRect(p.x, p.y, p.w, p.h);
        g.lineStyle(1, 0x2a2a32, 0.8);
        for (let bx = p.x + 24; bx < p.x + p.w; bx += 40) {
          g.lineBetween(bx, p.y + 6, bx, p.y + p.h - 4);
        }
      }
    }
  }

  private drawDecor(world: World): void {
    const g = this.decor;
    const main = world.platforms.find((p) => !p.oneWay);
    if (!main) return;

    for (let i = 0; i < 4; i++) {
      const x = main.x + 80 + i * (main.w / 4);
      const y = main.y;
      g.lineStyle(2, 0x6c4a26, 1).lineBetween(x, y, x, y - 60);
      g.fillStyle(0xffaa55, 0.9).fillCircle(x, y - 64, 5);
      g.fillStyle(0xffd97a, 0.7).fillCircle(x, y - 64, 9);
    }

    for (let i = 0; i < 6; i++) {
      const ox = main.x + 30 + Math.random() * (main.w - 60);
      const oy = main.y - 80;
      g.fillStyle(0x223a44, 0.6);
      g.fillCircle(ox, oy, 3);
    }
  }
}
