import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';

const RUN_DUST_INTERVAL = 7;
const SLASH_INTERVAL = 2;

/**
 * Per-frame visual flair: dust puffs while running/dashing on the ground,
 * and a curved slash arc that follows the sword arc on offensive moves with
 * "Attack" categories. Code-only — no asset files. Frame-paced via tick so
 * the cadence holds even on 144Hz monitors.
 */
export class MotionTrails {
  private lastDust: number[] = [];
  private lastSlash: number[] = [];

  constructor(private scene: Phaser.Scene) {}

  update(tick: number, fighters: Fighter[]): void {
    while (this.lastDust.length < fighters.length) this.lastDust.push(-99);
    while (this.lastSlash.length < fighters.length) this.lastSlash.push(-99);

    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      if (f.isHitPaused(tick)) continue;

      const id = f.fsm.id;
      const fastGround = f.body.grounded && Math.abs(f.body.vx) > 3.5;
      if (fastGround && tick - this.lastDust[i] >= RUN_DUST_INTERVAL) {
        this.lastDust[i] = tick;
        this.spawnDust(f.body.x - f.facing * (f.body.w * 0.5), f.body.y - 1, -f.facing);
      }

      const isAttack = id === 'Attack';
      if (isAttack && f.pendingMove) {
        const phase = tick - f.pendingMove.startedAtTick;
        const hasHb = f.pendingMove.move.frames.some(
          (fd) => fd.frame === phase && fd.hitboxes.length > 0
        );
        if (hasHb && tick - this.lastSlash[i] >= SLASH_INTERVAL) {
          this.lastSlash[i] = tick;
          const fd = f.pendingMove.move.frames.find((fr) => fr.frame === phase);
          if (!fd) continue;
          const hb = fd.hitboxes[0];
          const sx = f.body.x + hb.ox * f.facing;
          const sy = f.body.y - f.body.h * 0.5 + hb.oy;
          this.spawnSlash(sx, sy, f.facing, hb.w, hb.h);
        }
      }

    }
  }

  spawnDust(x: number, y: number, dir: number): void {
    const n = 2;
    for (let k = 0; k < n; k++) {
      const dust = this.scene.add.graphics({ x, y }).setDepth(40);
      const r = 2 + Math.random() * 2;
      dust.fillStyle(0xa3a08e, 0.55).fillCircle(0, 0, r);
      this.scene.tweens.add({
        targets: dust,
        x: x + dir * (8 + Math.random() * 14),
        y: y - 6 - Math.random() * 4,
        alpha: 0,
        scale: 1.7,
        duration: 280,
        ease: 'Cubic.easeOut',
        onComplete: () => dust.destroy()
      });
    }
  }

  spawnSlash(x: number, y: number, facing: number, w: number, h: number): void {
    const arc = this.scene.add.graphics({ x, y }).setDepth(910);
    const len = Math.max(28, w * 0.8);
    const thick = Math.max(6, h * 0.4);
    arc.fillStyle(0xffffff, 0.85);
    arc.beginPath();
    arc.moveTo(-len * 0.5 * facing, -thick * 0.6);
    arc.lineTo(len * 0.5 * facing, -thick * 0.2);
    arc.lineTo(len * 0.5 * facing, thick * 0.2);
    arc.lineTo(-len * 0.5 * facing, thick * 0.6);
    arc.closePath();
    arc.fillPath();
    arc.setRotation(((Math.random() - 0.5) * Math.PI) / 8);
    this.scene.tweens.add({
      targets: arc,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 0.6,
      duration: 140,
      ease: 'Cubic.easeOut',
      onComplete: () => arc.destroy()
    });
  }

  spawnLandPoof(x: number, y: number): void {
    for (let k = 0; k < 5; k++) {
      const dust = this.scene.add.graphics({ x, y }).setDepth(40);
      const r = 3 + Math.random() * 2;
      dust.fillStyle(0xb0aa92, 0.65).fillCircle(0, 0, r);
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.scene.tweens.add({
        targets: dust,
        x: x + dir * (12 + Math.random() * 22),
        y: y - 4 - Math.random() * 6,
        alpha: 0,
        scale: 1.8,
        duration: 360,
        ease: 'Cubic.easeOut',
        onComplete: () => dust.destroy()
      });
    }
  }
}
