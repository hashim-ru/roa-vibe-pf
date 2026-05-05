import Phaser from 'phaser';

export class ScreenShake {
  private trauma = 0;

  constructor(private scene: Phaser.Scene) {}

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Returns the offset to add to the camera target this frame. */
  offset(): { x: number; y: number } {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    const t2 = this.trauma * this.trauma;
    const max = 22 * t2;
    const ang = (Math.random() - 0.5) * Math.PI * 2;
    const r = Math.random() * max;
    this.trauma *= 0.85;
    if (this.trauma < 0.01) this.trauma = 0;
    return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
  }

  apply(baseX: number, baseY: number): { x: number; y: number } {
    const o = this.offset();
    return { x: baseX + o.x, y: baseY + o.y };
  }
}
