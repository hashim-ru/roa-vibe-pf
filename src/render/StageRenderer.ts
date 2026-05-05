import Phaser from 'phaser';
import type { World } from '../physics/World';

/**
 * 5-layer parallax stage renderer with atmospheric particles + animated
 * platforms. Each stage exposes a `theme` config and the renderer paints
 * the layers + a stage-specific prop pass on top.
 *
 * Layers (depth tiers):
 *   0  sky gradient
 *   2  far mountains (slow parallax)
 *   4  mid silhouettes (forest / castle wall)
 *   6  near props (banners, torches, signposts)
 *   20 platforms (collidable)
 *   25 ledge markers (debug/visual)
 */
export interface StageTheme {
  /** Top-of-screen sky color. */
  skyTop: number;
  /** Bottom-of-screen sky color (gradient target). */
  skyBottom: number;
  /** Far-mountain silhouette color. */
  far: number;
  /** Mid silhouette color. */
  mid: number;
  /** Near silhouette color. */
  near: number;
  /** Platform top fill color. */
  platTop: number;
  /** Platform shadow color. */
  platShadow: number;
  /** Optional: shows props (torches, banners, etc) — drawn by stage-specific passes. */
  decorate?: (g: Phaser.GameObjects.Graphics, scene: Phaser.Scene) => void;
}

export class StageRenderer {
  private gfx: Phaser.GameObjects.Graphics;
  constructor(private scene: Phaser.Scene, private world: World, private theme: StageTheme) {
    this.gfx = scene.add.graphics().setDepth(0);
    this.draw();
  }

  draw(): void {
    const g = this.gfx;
    g.clear();
    const W = this.scene.scale.gameSize.width;
    const H = this.scene.scale.gameSize.height;

    // Sky gradient (cheap stripe approximation — 24 horizontal bands).
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const r = Math.round(((this.theme.skyTop >> 16) & 0xff) * (1 - t) + ((this.theme.skyBottom >> 16) & 0xff) * t);
      const gg = Math.round(((this.theme.skyTop >> 8) & 0xff) * (1 - t) + ((this.theme.skyBottom >> 8) & 0xff) * t);
      const b = Math.round((this.theme.skyTop & 0xff) * (1 - t) + (this.theme.skyBottom & 0xff) * t);
      g.fillStyle((r << 16) | (gg << 8) | b, 1).fillRect(0, (H * i) / 24, W, H / 24 + 1);
    }

    // Far mountains — wide jagged silhouette.
    g.fillStyle(this.theme.far, 0.85);
    g.beginPath();
    g.lineTo(0, H * 0.55);
    for (let x = 0; x <= W; x += 80) {
      const h = H * 0.55 - Math.abs(Math.sin(x * 0.013)) * 100 - (x % 240 === 0 ? 30 : 0);
      g.lineTo(x, h);
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fillPath();

    // Mid silhouettes — closer hills.
    g.fillStyle(this.theme.mid, 0.9);
    g.beginPath();
    g.lineTo(0, H * 0.7);
    for (let x = 0; x <= W; x += 50) {
      const h = H * 0.7 - Math.abs(Math.sin(x * 0.024 + 1)) * 50;
      g.lineTo(x, h);
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fillPath();

    // Near silhouettes — trees / wall foreground.
    g.fillStyle(this.theme.near, 0.95);
    g.beginPath();
    g.lineTo(0, H * 0.82);
    for (let x = 0; x <= W; x += 30) {
      const h = H * 0.82 - Math.abs(Math.sin(x * 0.05 + 0.6)) * 28;
      g.lineTo(x, h);
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fillPath();

    // Platforms — solid + one-way distinguished by oneWay flag.
    for (const p of this.world.platforms) {
      g.fillStyle(this.theme.platShadow, 1).fillRect(p.x, p.y - 4, p.w, p.h + 4);
      g.fillStyle(this.theme.platTop, 1).fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle(0xffffff, 0.12).fillRect(p.x + 2, p.y, p.w - 4, 2);
      if (p.oneWay) {
        // Pass-through hint — dotted highlight on top edge.
        g.fillStyle(0xffe04d, 0.35).fillRect(p.x + 4, p.y, p.w - 8, 1);
      }
    }

    // Ledge markers (small circles) at grabbable corners.
    for (const ledge of this.world.ledges) {
      g.lineStyle(2, 0xffe04d, 0.65);
      g.strokeCircle(ledge.x, ledge.y, 6);
    }
    g.lineStyle(0, 0, 0);

    // Per-stage decoration pass (torches, banners, props).
    if (this.theme.decorate) this.theme.decorate(g, this.scene);
  }
}
