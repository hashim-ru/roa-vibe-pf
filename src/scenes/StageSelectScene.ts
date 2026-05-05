import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { gameMode, StageId } from '../config/GameMode';
import { Battlefield } from '../stages/Battlefield';
import { FinalDestination } from '../stages/FinalDestination';
import { StageRenderer } from '../render/StageRenderer';
import type { World } from '../physics/World';

interface StageEntry {
  id: StageId;
  name: string;
  description: string;
  build: () => World;
  theme: typeof Battlefield.theme;
}

const STAGES: StageEntry[] = [
  {
    id: 'battlefield',
    name: 'Battlefield',
    description: 'Three soft platforms above the main floor. Tournament classic — vertical mind-games + recovery routes.',
    build: Battlefield.build,
    theme: Battlefield.theme
  },
  {
    id: 'final-destination',
    name: 'Final Destination',
    description: 'Single flat platform. No aerial cover, no escape. Pure neutral — positioning + spacing are everything.',
    build: FinalDestination.build,
    theme: FinalDestination.theme
  }
];

/**
 * Stage select — sits between CharacterSelectScene and MatchScene. Each
 * stage entry shows a live mini-preview powered by StageRenderer in a
 * 480×270 sub-camera so players see the parallax + platform layout
 * before committing.
 */
export class StageSelectScene extends Phaser.Scene {
  private cursor = 0;
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private descText!: Phaser.GameObjects.Text;
  private previewBoxes: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: 'StageSelect' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0c0f1a');
    this.drawBackground();

    this.add
      .text(GAME_WIDTH / 2, 60, 'CHOOSE STAGE', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffe0a0',
        stroke: '#000',
        strokeThickness: 6
      })
      .setOrigin(0.5);

    // Mini preview render per stage. Each stage renders once at scene
    // creation — these are static thumbnails. We compose by drawing a
    // thumbnail-sized stage backdrop into a Phaser RenderTexture, then
    // blitting at 50% scale.
    const previewW = 360;
    const previewH = 200;
    const totalSpan = STAGES.length * (previewW + 60);
    const startX = (GAME_WIDTH - totalSpan + 60) / 2;

    STAGES.forEach((entry, i) => {
      const cx = startX + i * (previewW + 60);
      const cy = GAME_HEIGHT / 2 - 40;

      // Mini-stage preview drawing
      const box = this.add.graphics().setDepth(10);
      this.previewBoxes.push(box);
      this.drawPreview(box, entry, cx, cy, previewW, previewH);

      // Name label below
      const t = this.add
        .text(cx + previewW / 2, cy + previewH + 30, entry.name, {
          fontFamily: 'Cinzel, ui-serif, serif',
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000',
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(11);
      this.nameTexts.push(t);
    });

    this.descText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 130, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#a0a8b8',
        align: 'center',
        wordWrap: { width: GAME_WIDTH * 0.6 }
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 56, 'A/D ◀▶  ·  ENTER/SPACE confirm  ·  ESC back', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-A', () => this.move(-1));
    this.input.keyboard?.on('keydown-D', () => this.move(1));
    this.input.keyboard?.on('keydown-LEFT', () => this.move(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.move(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.confirm());
    this.input.keyboard?.on('keydown-SPACE', () => this.confirm());
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('CharacterSelect'));

    this.refresh();
  }

  private drawBackground(): void {
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
  }

  /**
   * Draws a mini-stage preview into `g`. Inline rendering scaled into
   * the box: sky gradient, parallax silhouettes, platforms. Avoids
   * spinning up a real StageRenderer (which would need its own camera +
   * world rebuild) for the sake of the static thumbnail.
   */
  private drawPreview(
    g: Phaser.GameObjects.Graphics,
    entry: StageEntry,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    g.clear();
    // Border
    g.fillStyle(0x111421, 1).fillRect(x, y, w, h);
    g.lineStyle(2, 0x4a5566, 0.85).strokeRect(x, y, w, h);

    // Sky gradient
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const top = entry.theme.skyTop;
      const bot = entry.theme.skyBottom;
      const r = Math.round(((top >> 16) & 0xff) * (1 - t) + ((bot >> 16) & 0xff) * t);
      const gg = Math.round(((top >> 8) & 0xff) * (1 - t) + ((bot >> 8) & 0xff) * t);
      const b = Math.round((top & 0xff) * (1 - t) + (bot & 0xff) * t);
      g.fillStyle((r << 16) | (gg << 8) | b, 1).fillRect(x, y + (h * i) / 12, w, h / 12 + 1);
    }

    // Far mountains
    g.fillStyle(entry.theme.far, 0.85);
    g.beginPath();
    g.lineTo(x, y + h * 0.55);
    for (let mx = 0; mx <= w; mx += 24) {
      const mh = h * 0.55 - Math.abs(Math.sin(mx * 0.04)) * 30;
      g.lineTo(x + mx, y + mh);
    }
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
    g.fillPath();

    // Mid silhouette
    g.fillStyle(entry.theme.mid, 0.9);
    g.beginPath();
    g.lineTo(x, y + h * 0.7);
    for (let mx = 0; mx <= w; mx += 18) {
      const mh = h * 0.7 - Math.abs(Math.sin(mx * 0.07 + 1)) * 20;
      g.lineTo(x + mx, y + mh);
    }
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
    g.fillPath();

    // Platforms — rendered at ~28% scale so the entire 1280-wide stage
    // fits in the preview box.
    const stage = entry.build();
    const sx = w / 1280;
    const sy = h / 720;
    for (const p of stage.platforms) {
      const pxA = x + p.x * sx;
      const pyA = y + p.y * sy;
      const pwA = p.w * sx;
      const phA = Math.max(2, p.h * sy);
      g.fillStyle(entry.theme.platShadow, 1).fillRect(pxA, pyA - 2, pwA, phA + 2);
      g.fillStyle(entry.theme.platTop, 1).fillRect(pxA, pyA, pwA, phA);
    }
    for (const ledge of stage.ledges) {
      g.fillStyle(0xffe04d, 0.7).fillCircle(x + ledge.x * sx, y + ledge.y * sy, 2);
    }
  }

  private move(dir: number): void {
    this.cursor = (this.cursor + dir + STAGES.length) % STAGES.length;
    this.refresh();
  }

  private refresh(): void {
    STAGES.forEach((_, i) => {
      const t = this.nameTexts[i];
      if (i === this.cursor) {
        t.setColor('#ffe04d');
        t.setScale(1.15);
        // Highlight border
        const cx = this.previewBoxes[i].defaultStrokeColor;
        void cx;
      } else {
        t.setColor('#ffffff');
        t.setScale(1);
      }
    });
    // Re-stroke selected box more prominently (redraw border layer)
    STAGES.forEach((entry, i) => {
      // Adjust box border highlight by re-drawing per refresh
      const box = this.previewBoxes[i];
      const previewW = 360;
      const previewH = 200;
      const totalSpan = STAGES.length * (previewW + 60);
      const startX = (GAME_WIDTH - totalSpan + 60) / 2;
      const x = startX + i * (previewW + 60);
      const y = GAME_HEIGHT / 2 - 40;
      // Re-draw preview content (cheap, runs on cursor move only)
      this.drawPreview(box, entry, x, y, previewW, previewH);
      // Selected gets a thicker gold border
      if (i === this.cursor) {
        box.lineStyle(3, 0xffe04d, 1).strokeRect(x - 2, y - 2, previewW + 4, previewH + 4);
      }
    });
    this.descText.setText(STAGES[this.cursor].description);
  }

  private confirm(): void {
    const stageId = STAGES[this.cursor].id;
    gameMode.set({ stage: stageId });
    this.scene.start('Match');
  }
}
