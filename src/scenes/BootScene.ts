import Phaser from 'phaser';

/**
 * BootScene — entry point. The previous build preloaded Pollinations
 * AI portrait PNGs and chroma-keyed their white backgrounds for use on
 * the character-select screen. The tech-demo rebuild swaps that for
 * code-rendered FighterRenderer previews (Phase 2.6) so all visuals
 * share the same flat-vector aesthetic, which means there are no
 * portrait assets to preload anymore.
 *
 * Future asset preloads (audio in Phase 5, stage backgrounds in Phase
 * 4) will hook into this preload() method.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // Audio + stage assets land here in Phase 4/5.
  }

  create(): void {
    this.scene.start('Title');
  }
}
