import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';

const MIN_ZOOM = 0.78;
const MAX_ZOOM = 1.12;
const ZOOM_LERP = 0.06;
const PAN_LERP = 0.12;

/**
 * Camera target = midpoint between fighters, slightly raised; zoom scales
 * with the distance between them. The MatchScene applies screen shake on
 * top of `target.x/y` so that shake doesn't compound between frames.
 */
export class DynamicCamera {
  private targetZoom = 1;
  cx = GAME_WIDTH / 2;
  cy = GAME_HEIGHT / 2;
  private kickX = 0;
  private kickY = 0;
  private focusX: number | null = null;
  private focusY: number | null = null;
  private focusUntil = 0;
  private focusZoom = 1;

  constructor(private scene: Phaser.Scene) {
    this.scene.cameras.main.setZoom(1);
  }

  update(fighters: Fighter[], tick: number): void {
    if (fighters.length < 2) return;
    const a = fighters[0].body;
    const b = fighters[1].body;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2 - 60;
    const span = Math.hypot(a.x - b.x, a.y - b.y);

    let baseTargetZoom = Phaser.Math.Clamp(
      950 / Math.max(380, span + 200),
      MIN_ZOOM,
      MAX_ZOOM
    );

    // KO focus: lock onto a specific point and zoom in for `focusUntil` frames.
    let targetX = midX;
    let targetY = midY;
    if (this.focusX !== null && tick < this.focusUntil) {
      targetX = this.focusX;
      targetY = this.focusY ?? midY;
      baseTargetZoom = this.focusZoom;
    } else if (tick >= this.focusUntil && this.focusX !== null) {
      this.focusX = null;
      this.focusY = null;
    }

    // Critically-damped style: stronger lerp when far from target, softer when close.
    const distX = Math.abs(targetX - this.cx);
    const distY = Math.abs(targetY - this.cy);
    const lerpX = Math.min(0.18, PAN_LERP + distX / 1000);
    const lerpY = Math.min(0.18, PAN_LERP + distY / 1000);

    this.targetZoom = Phaser.Math.Linear(this.targetZoom, baseTargetZoom, ZOOM_LERP);
    this.cx = Phaser.Math.Linear(this.cx, targetX, lerpX);
    this.cy = Phaser.Math.Linear(this.cy, targetY, lerpY);

    this.kickX *= 0.7;
    this.kickY *= 0.7;
    if (Math.abs(this.kickX) < 0.2) this.kickX = 0;
    if (Math.abs(this.kickY) < 0.2) this.kickY = 0;

    this.scene.cameras.main.setZoom(this.targetZoom);
  }

  /** Punchy directional shove (e.g., big hit pushes camera toward victim). */
  kick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
  }

  /** Briefly pin camera onto a point (e.g., KO target). */
  focus(x: number, y: number, frames: number, zoom = 1.05): void {
    this.focusX = x;
    this.focusY = y;
    this.focusZoom = zoom;
    this.focusUntil = frames;
  }

  applyTo(scene: Phaser.Scene, shakeX: number, shakeY: number): void {
    scene.cameras.main.centerOn(this.cx + this.kickX + shakeX, this.cy + this.kickY + shakeY);
  }
}
