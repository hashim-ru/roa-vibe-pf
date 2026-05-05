import Phaser from 'phaser';
import type { Fighter } from '../../entities/Fighter';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game.config';
import { bus } from '../../core/EventBus';

interface ComboState {
  count: number;
  expiresAtTick: number;
  victimId: number;
  /** True if combo broke before reaching 3+ hits (no UI shown). */
  broken: boolean;
}

const COMBO_TIMEOUT_FRAMES = 45; // 0.75s at 60Hz; if no new hit lands, combo expires

export class HUD {
  private texts: Phaser.GameObjects.Text[] = [];
  private moveNameTexts: Phaser.GameObjects.Text[] = [];
  private comboTexts: Phaser.GameObjects.Text[] = [];
  private bars: Phaser.GameObjects.Graphics;
  /** Per-attacker rolling combo state. */
  private combos = new Map<number, ComboState>();
  /** Current frame tick — set externally each draw(). */
  private currentTick = 0;
  readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene) {
    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(2000);
    this.objects.push(this.bars);
    for (let i = 0; i < 2; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: 'Cinzel, ui-serif, serif',
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4
        })
        .setScrollFactor(0)
        .setDepth(2001);
      this.texts.push(t);
      this.objects.push(t);

      // Move name overlay — small text beside the percent showing what
      // attack is currently active. Reads as "fsmash", "nair", etc.
      const mn = scene.add
        .text(0, 0, '', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '13px',
          color: '#a0a8b8'
        })
        .setScrollFactor(0)
        .setDepth(2002);
      this.moveNameTexts.push(mn);
      this.objects.push(mn);

      // Combo counter — only visible when active combo > 1 hit. Tints
      // green for true-combo (no DI break possible yet) and goes orange
      // toward expiry.
      const ct = scene.add
        .text(0, 0, '', {
          fontFamily: 'Cinzel, ui-serif, serif',
          fontStyle: 'bold',
          fontSize: '38px',
          color: '#9aff9a',
          stroke: '#000000',
          strokeThickness: 5
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2003);
      this.comboTexts.push(ct);
      this.objects.push(ct);
    }

    bus.on('hit', (e) => this.onHit(e.attackerId, e.victimId));
  }

  /** Increment combo counter for the attacker on each successful hit. */
  private onHit(attackerId: number, victimId: number): void {
    const existing = this.combos.get(attackerId);
    if (existing && existing.victimId === victimId && this.currentTick < existing.expiresAtTick) {
      existing.count += 1;
      existing.expiresAtTick = this.currentTick + COMBO_TIMEOUT_FRAMES;
    } else {
      this.combos.set(attackerId, {
        count: 1,
        expiresAtTick: this.currentTick + COMBO_TIMEOUT_FRAMES,
        victimId,
        broken: false
      });
    }
  }

  draw(fighters: Fighter[], tick = this.currentTick): void {
    this.currentTick = tick;
    this.bars.clear();
    const cam = this.scene.cameras.main;
    const screenW = cam.width;
    const baseY = GAME_HEIGHT - 80;
    const colW = 360;
    const margin = 40;

    fighters.forEach((f, i) => {
      const x = i === 0 ? margin : screenW - margin - colW;
      const colorTop = i === 0 ? 0xffe04d : 0x6cb8ff;
      this.bars.fillStyle(0x111421, 0.85).fillRect(x, baseY, colW, 64);
      this.bars.lineStyle(2, colorTop, 1).strokeRect(x, baseY, colW, 64);

      // Stock pips
      for (let s = 0; s < 3; s++) {
        const cx = x + 14 + s * 18;
        const cy = baseY + 14;
        if (s < f.stocks) {
          this.bars.fillStyle(colorTop, 1).fillRect(cx, cy, 12, 14);
          this.bars.lineStyle(1, 0x000000, 0.7).strokeRect(cx, cy, 12, 14);
        } else {
          this.bars.lineStyle(1, 0x666666, 0.6).strokeRect(cx, cy, 12, 14);
        }
      }

      // Stale-move indicator — 9 dots showing recent hit IDs. Filled = move
      // appears in queue, hollow = empty slot. Reads as "use other moves
      // before re-spamming this one".
      const dotY = baseY + 6;
      const dotX = x + 80;
      for (let k = 0; k < 9; k++) {
        const filled = k < f.staleQueue.length;
        if (filled) {
          this.bars.fillStyle(colorTop, 0.55).fillCircle(dotX + k * 8, dotY, 2.5);
        } else {
          this.bars.lineStyle(1, 0x4a5566, 0.7).strokeCircle(dotX + k * 8, dotY, 2.5);
        }
      }

      // Percent text
      const t = this.texts[i];
      t.setPosition(x + 14, baseY + 24);
      const pct = Math.floor(f.percent);
      let color = '#ffffff';
      if (pct > 60) color = '#ffd966';
      if (pct > 100) color = '#ff8a55';
      if (pct > 150) color = '#ff4f6a';
      t.setColor(color);
      t.setText(`${pct}%`);

      // Move name overlay
      const mn = this.moveNameTexts[i];
      const moveLabel =
        f.fsm.is('Attack') && f.pendingMove ? f.pendingMove.move.id : f.fsm.id ?? '';
      mn.setPosition(x + colW - 110, baseY + 36);
      mn.setText(moveLabel);

      // Combo counter — anchor near attacker side
      const ct = this.comboTexts[i];
      const combo = this.combos.get(i);
      if (combo && this.currentTick < combo.expiresAtTick && combo.count >= 2) {
        const remaining = combo.expiresAtTick - this.currentTick;
        const fade = Math.min(1, remaining / 20);
        ct.setVisible(true);
        ct.setText(`${combo.count} HIT${combo.count > 1 ? 'S' : ''}`);
        // Tint shifts from green (fresh) → yellow → red as window closes.
        const c =
          fade > 0.6 ? '#9aff9a' : fade > 0.3 ? '#ffd34d' : '#ff7755';
        ct.setColor(c);
        // Centered at top of attacker's screen half.
        const ax = i === 0 ? GAME_WIDTH * 0.25 : GAME_WIDTH * 0.75;
        const sizeBoost = combo.count >= 10 ? 50 : combo.count >= 5 ? 44 : 38;
        ct.setFontSize(sizeBoost);
        ct.setPosition(ax, 110);
      } else {
        ct.setVisible(false);
        if (combo && this.currentTick >= combo.expiresAtTick) this.combos.delete(i);
      }
    });
  }
}
