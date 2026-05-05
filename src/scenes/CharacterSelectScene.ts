import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { gameMode, CharacterId } from '../config/GameMode';
import { ROSTER, ALL_CHARACTERS } from '../entities/characters/Roster';

interface SlotState {
  selecting: boolean;
  cursor: number;
  ready: boolean;
}

/**
 * Character select. The previous build rendered Pollinations AI portrait
 * PNGs (chroma-keyed in BootScene). The tech-demo rebuild swaps that
 * for a code-rendered preview using FighterRenderer (lands in Phase 2.6),
 * so all visuals share the flat-vector aesthetic.
 *
 * Phase 0 placeholder: each slot shows the character body color as a
 * solid rectangle plus an emblem indicating helmet/weapon type. Reads
 * as "card" not "portrait" but communicates archetype clearly until
 * the real preview lands.
 */
export class CharacterSelectScene extends Phaser.Scene {
  private slots: SlotState[] = [];
  private slotPanels: Phaser.GameObjects.Graphics[] = [];
  private slotPreviews: Phaser.GameObjects.Graphics[] = [];
  private slotTints: Phaser.GameObjects.Ellipse[] = [];
  private slotNames: Phaser.GameObjects.Text[] = [];
  private slotArch: Phaser.GameObjects.Text[] = [];
  private slotDesc: Phaser.GameObjects.Text[] = [];
  private slotStatus: Phaser.GameObjects.Text[] = [];
  private banner!: Phaser.GameObjects.Text;
  private vsHuman = false;
  private bobTick = 0;

  constructor() {
    super({ key: 'CharacterSelect' });
  }

  create() {
    const cfg = gameMode.get();
    this.vsHuman = cfg.mode === 'vs-human';
    this.slots = [
      { selecting: true, cursor: ALL_CHARACTERS.indexOf(cfg.characters[0]), ready: false },
      { selecting: this.vsHuman, cursor: ALL_CHARACTERS.indexOf(cfg.characters[1]), ready: !this.vsHuman }
    ];
    if (this.slots[0].cursor < 0) this.slots[0].cursor = 0;
    if (this.slots[1].cursor < 0) this.slots[1].cursor = 1 % ALL_CHARACTERS.length;

    this.cameras.main.setBackgroundColor('#0c0f1a');
    this.drawBackground();

    this.add
      .text(GAME_WIDTH / 2, 60, 'CHOOSE YOUR FIGHTER', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffe0a0',
        stroke: '#000',
        strokeThickness: 6
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 100, `${ALL_CHARACTERS.length} fighters`, {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    for (let i = 0; i < 2; i++) this.buildSlot(i);

    this.banner = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 76, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '15px',
        color: '#a0a8b8'
      })
      .setOrigin(0.5);

    const hint = this.vsHuman
      ? 'P1: A/D ◀▶  ·  F lock-in  ·  P2: ←/→  ·  / or ENTER lock-in  ·  ESC back'
      : 'A/D ◀▶  ·  F or SPACE lock-in  ·  ESC back';
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 36, hint, {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-A', () => this.move(0, -1));
    this.input.keyboard?.on('keydown-D', () => this.move(0, 1));
    this.input.keyboard?.on('keydown-F', () => this.lockIn(0));
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.vsHuman) this.lockIn(0);
    });
    if (this.vsHuman) {
      this.input.keyboard?.on('keydown-LEFT', () => this.move(1, -1));
      this.input.keyboard?.on('keydown-RIGHT', () => this.move(1, 1));
      this.input.keyboard?.on('keydown-FORWARD_SLASH', () => this.lockIn(1));
      this.input.keyboard?.on('keydown-ENTER', () => this.lockIn(1));
    }
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('ModeSelect'));

    this.refresh();
  }

  update() {
    this.bobTick += 1;
    for (let i = 0; i < 2; i++) this.updatePreviewBob(i);
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

  private buildSlot(slotIndex: number): void {
    const slotW = 460;
    const slotH = 460;
    const cx = slotIndex === 0 ? GAME_WIDTH * 0.27 : GAME_WIDTH * 0.73;
    const cy = GAME_HEIGHT / 2 + 10;

    const panel = this.add.graphics().setDepth(10);
    this.slotPanels.push(panel);
    this.drawPanel(panel, cx - slotW / 2, cy - slotH / 2, slotW, slotH, slotIndex);

    this.add
      .text(cx, cy - slotH / 2 - 24, slotIndex === 0 ? 'P1' : this.vsHuman ? 'P2' : 'BOT', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: slotIndex === 0 ? '#ffe04d' : '#6cb8ff',
        stroke: '#000',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    // Placeholder preview — solid color card with weapon emblem text. Phase
    // 2.6 replaces this with a FighterRenderer-driven idle pose preview.
    const preview = this.add.graphics().setDepth(15);
    this.slotPreviews.push(preview);

    const tintColor = slotIndex === 0 ? 0xffd860 : 0x6cb8ff;
    const halo = this.add
      .ellipse(cx, cy + 100, 200, 28, tintColor, 0.22)
      .setDepth(12);
    this.slotTints.push(halo);

    const name = this.add
      .text(cx, cy + 130, '', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000',
        strokeThickness: 4
      })
      .setOrigin(0.5);
    this.slotNames.push(name);

    const arch = this.add
      .text(cx, cy + 162, '', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '17px',
        color: '#9ad0ff'
      })
      .setOrigin(0.5);
    this.slotArch.push(arch);

    const desc = this.add
      .text(cx, cy + 196, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '12px',
        color: '#a0a8b8',
        align: 'center',
        wordWrap: { width: slotW - 60 }
      })
      .setOrigin(0.5);
    this.slotDesc.push(desc);

    const status = this.add
      .text(cx, cy + slotH / 2 + 14, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#aaaaaa'
      })
      .setOrigin(0.5);
    this.slotStatus.push(status);
  }

  private drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, slotIndex: number): void {
    const tint = slotIndex === 0 ? 0xffe04d : 0x6cb8ff;
    g.clear();
    g.fillStyle(0x111421, 0.7).fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(3, tint, 0.95).strokeRoundedRect(x, y, w, h, 12);
  }

  /**
   * Phase 0 placeholder preview: a stylized "card" using the character's
   * body color as the dominant fill plus weapon + helmet glyph badges.
   * Phase 2.6 replaces this drawing with a real FighterRenderer pose.
   */
  private drawPreviewCard(g: Phaser.GameObjects.Graphics, slotIndex: number, bobOffset: number): void {
    const s = this.slots[slotIndex];
    const def = ROSTER[ALL_CHARACTERS[s.cursor]];
    const v = def.visual;
    const cx = slotIndex === 0 ? GAME_WIDTH * 0.27 : GAME_WIDTH * 0.73;
    const cy = GAME_HEIGHT / 2 + 10 + bobOffset;
    const cardW = 200;
    const cardH = 200;
    const x = cx - cardW / 2;
    const y = cy - cardH / 2 - 40;

    g.clear();
    // Outline halo
    g.fillStyle(0x000000, 0.5).fillRect(x - 3, y - 3, cardW + 6, cardH + 6);
    // Body color fill
    g.fillStyle(v.bodyColor, 1).fillRect(x, y, cardW, cardH);
    // Top highlight (lit edge)
    g.fillStyle(v.highlightColor, 0.6).fillRect(x + 6, y + 6, cardW - 12, 8);
    // Bottom shadow (form shading)
    g.fillStyle(v.accentColor, 0.6).fillRect(x + 6, y + cardH - 14, cardW - 12, 8);
    // Center medallion suggesting weapon/helmet identity
    const mx = cx;
    const my = cy - 40;
    g.fillStyle(v.accentColor, 1).fillCircle(mx, my, 36);
    g.fillStyle(v.helmetAccent, 1).fillCircle(mx, my, 32);
    g.fillStyle(v.bodyColor, 1).fillCircle(mx, my, 24);
    if (v.plumeColor !== undefined) {
      g.fillStyle(v.plumeColor, 1).fillTriangle(mx - 10, my, mx + 10, my, mx, my - 28);
    }
  }

  private move(slotIndex: number, dir: number): void {
    const s = this.slots[slotIndex];
    if (!s.selecting) return;
    s.cursor = (s.cursor + dir + ALL_CHARACTERS.length) % ALL_CHARACTERS.length;
    this.refresh();
  }

  private lockIn(slotIndex: number): void {
    const s = this.slots[slotIndex];
    if (!s.selecting) return;
    s.selecting = false;
    s.ready = true;
    this.refresh();
    if (this.allReady()) this.time.delayedCall(280, () => this.confirm());
  }

  private allReady(): boolean {
    return this.slots.every((s) => s.ready);
  }

  private updatePreviewBob(slotIndex: number): void {
    const bob = Math.sin(this.bobTick * 0.06) * 2;
    this.drawPreviewCard(this.slotPreviews[slotIndex], slotIndex, bob);
  }

  private refresh(): void {
    for (let i = 0; i < 2; i++) {
      const s = this.slots[i];
      const def = ROSTER[ALL_CHARACTERS[s.cursor]];
      this.drawPreviewCard(this.slotPreviews[i], i, 0);
      this.slotNames[i].setText(def.displayName).setColor(s.ready ? '#ffe04d' : '#ffffff');
      this.slotArch[i].setText(def.archetype);
      this.slotDesc[i].setText(def.description);
      this.slotStatus[i].setText(
        s.ready ? '✓ READY' : !s.selecting ? '— BOT —' : '◀ choose ▶'
      );
      this.slotStatus[i].setColor(s.ready ? '#9aff9a' : '#aaaaaa');
    }
    if (this.allReady()) this.banner.setText('VS!').setColor('#ffe04d').setFontSize(20);
    else this.banner.setText('pick a fighter').setColor('#a0a8b8');
  }

  private confirm(): void {
    const c0 = ALL_CHARACTERS[this.slots[0].cursor];
    let c1 = ALL_CHARACTERS[this.slots[1].cursor];
    if (!this.vsHuman) {
      c1 = ALL_CHARACTERS.find((c) => c !== c0) ?? c0;
    }
    gameMode.set({ characters: [c0, c1] as [CharacterId, CharacterId] });
    this.scene.start('Match');
  }
}
