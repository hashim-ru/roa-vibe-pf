import Phaser from 'phaser';
import { ALL_CHARACTERS } from '../entities/characters/Roster';

/**
 * Preload portrait images, then post-process each one to chroma-key out the
 * near-white background (Pollinations outputs put characters on solid white).
 * The processed image is published as `portrait_<id>` for the select scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload() {
    for (const id of ALL_CHARACTERS) {
      this.load.image(`portrait_raw_${id}`, `assets/portraits/${id}.png`);
    }
  }

  create() {
    for (const id of ALL_CHARACTERS) {
      this.chromaKey(`portrait_raw_${id}`, `portrait_${id}`);
    }
    this.scene.start('Title');
  }

  /** Reads pixels from `srcKey`, sets near-white pixels to alpha 0, publishes
   *  result as `dstKey` so it can be used as a regular texture. */
  private chromaKey(srcKey: string, dstKey: string): void {
    const tex = this.textures.get(srcKey);
    if (!tex || !tex.source.length) return;
    const src = tex.getSourceImage(0) as HTMLImageElement | HTMLCanvasElement;
    const w = (src as HTMLImageElement).width;
    const h = (src as HTMLImageElement).height;
    const canvas = this.textures.createCanvas(dstKey, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();
    ctx.drawImage(src as CanvasImageSource, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      // Treat anything close to white as background
      if (r > 235 && g > 235 && b > 235) {
        d[i + 3] = 0;
      } else if (r > 215 && g > 215 && b > 215) {
        // Soften edge: scale alpha down for near-white pixels
        const brightness = (r + g + b) / 3;
        const t = (brightness - 215) / 20;
        d[i + 3] = Math.round(d[i + 3] * (1 - t * 0.85));
      }
    }
    ctx.putImageData(img, 0, 0);
    canvas.refresh();
  }
}
