import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import type { World } from '../physics/World';
import { hitboxBounds } from '../combat/Hitbox';

export class HitboxDebugRenderer {
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1000);
  }

  draw(world: World, fighters: Fighter[], tick: number): void {
    this.gfx.clear();

    for (const p of world.platforms) {
      if (p.oneWay) {
        this.gfx.lineStyle(1, 0xb6c14e, 0.9);
        this.gfx.fillStyle(0xb6c14e, 0.12);
      } else {
        this.gfx.lineStyle(1, 0x4a8a4a, 0.9);
        this.gfx.fillStyle(0x4a8a4a, 0.18);
      }
      this.gfx.fillRect(p.x, p.y, p.w, p.h);
      this.gfx.strokeRect(p.x, p.y, p.w, p.h);
    }

    for (const ledge of world.ledges) {
      this.gfx.lineStyle(2, 0xff9e3f, 0.8);
      this.gfx.strokeCircle(ledge.x, ledge.y, 6);
    }

    const bz = world.blastZone;
    this.gfx.lineStyle(1, 0xff3f5e, 0.4);
    this.gfx.strokeRect(bz.left, bz.top, bz.right - bz.left, bz.bottom - bz.top);

    for (const f of fighters) {
      const b = f.body.bounds();
      const isInvincible = f.isInvincible(tick);
      const baseColor = f.playerIndex === 0 ? 0xffe04d : 0x6cb8ff;
      const color = isInvincible ? 0xffffff : baseColor;
      this.gfx.lineStyle(2, color, 1);
      this.gfx.fillStyle(color, isInvincible ? 0.5 : 0.25);
      this.gfx.fillRect(b.x, b.y, b.w, b.h);
      this.gfx.strokeRect(b.x, b.y, b.w, b.h);

      const cx = f.body.x;
      const cy = f.body.y - f.body.h * 0.5;
      this.gfx.lineStyle(2, 0xffffff, 0.9);
      this.gfx.lineBetween(cx, cy, cx + 12 * f.facing, cy);

      for (const hb of f.getActiveHitboxes(tick)) {
        const r = hitboxBounds(hb);
        this.gfx.lineStyle(2, 0xff4a4a, 1);
        this.gfx.fillStyle(0xff4a4a, 0.25);
        this.gfx.fillRect(r.x, r.y, r.w, r.h);
        this.gfx.strokeRect(r.x, r.y, r.w, r.h);
      }

      if (f.parryActive(tick)) {
        this.gfx.lineStyle(2, 0x9ae0ff, 1);
        this.gfx.strokeCircle(f.body.x, f.body.y - f.body.h / 2, 26);
      }
    }
  }
}
