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
  /** Tick the count last increased — used to drive the +1 punch tween. */
  punchedAtTick: number;
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
  /** Last move-name shown per slot, to detect change for the fade-in tween. */
  private lastMoveLabels: string[] = ['', ''];
  private moveLabelChangedAt: number[] = [-999, -999];
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
      existing.punchedAtTick = this.currentTick;
    } else {
      this.combos.set(attackerId, {
        count: 1,
        expiresAtTick: this.currentTick + COMBO_TIMEOUT_FRAMES,
        victimId,
        broken: false,
        punchedAtTick: this.currentTick
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

      // Stale-move indicator — 9 dots, color-graded by how stale the
      // freshest move at each slot is. Newest entries get the bright
      // attacker tint, older positions fade and shift toward red so a
      // glance tells you "stop spamming the same move".
      const dotY = baseY + 6;
      const dotX = x + 80;
      const queueCount = f.staleQueue.length;
      for (let k = 0; k < 9; k++) {
        const filled = k < queueCount;
        if (filled) {
          // 0 = newest (right side of indicator), 8 = oldest.
          const ageNorm = k / Math.max(1, queueCount - 1);
          const color = ageNorm < 0.33 ? 0x9aff9a : ageNorm < 0.66 ? 0xffd34d : 0xff7755;
          const alpha = 0.55 + 0.35 * (1 - ageNorm);
          this.bars.fillStyle(color, alpha).fillCircle(dotX + k * 8, dotY, 3);
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

      // Move name overlay — fade-in + small slide-up on change.
      const mn = this.moveNameTexts[i];
      const moveLabel =
        f.fsm.is('Attack') && f.pendingMove ? f.pendingMove.move.id : f.fsm.id ?? '';
      if (moveLabel !== this.lastMoveLabels[i]) {
        this.lastMoveLabels[i] = moveLabel;
        this.moveLabelChangedAt[i] = this.currentTick;
        mn.setText(moveLabel);
      }
      const sinceChange = this.currentTick - this.moveLabelChangedAt[i];
      const fadeIn = Math.min(1, sinceChange / 8);
      mn.setAlpha(fadeIn);
      const slideOffset = (1 - fadeIn) * 6;
      mn.setPosition(x + colW - 110, baseY + 36 + slideOffset);

      // Combo counter — anchor near attacker side
      const ct = this.comboTexts[i];
      const combo = this.combos.get(i);
      if (combo && this.currentTick < combo.expiresAtTick && combo.count >= 2) {
        const remaining = combo.expiresAtTick - this.currentTick;
        const fade = Math.min(1, remaining / 20);
        ct.setVisible(true);
        ct.setText(`${combo.count} HIT${combo.count > 1 ? 'S' : ''}`);
        // Tier color: 1-3 white-ish, 4-6 yellow, 7-9 orange, 10+ red.
        // Expiry fade darkens the tier color toward red on timeout.
        let baseColor: string;
        if (combo.count >= 10) baseColor = '#ff4f6a';
        else if (combo.count >= 7) baseColor = '#ff7755';
        else if (combo.count >= 4) baseColor = '#ffd34d';
        else baseColor = '#e6f5ff';
        ct.setColor(fade > 0.3 ? baseColor : '#ff7755');
        // Centered at top of attacker's screen half.
        const ax = i === 0 ? GAME_WIDTH * 0.25 : GAME_WIDTH * 0.75;
        const sizeBoost = combo.count >= 10 ? 56 : combo.count >= 7 ? 50 : combo.count >= 4 ? 44 : 38;
        ct.setFontSize(sizeBoost);
        ct.setPosition(ax, 110);
        // +1 punch — scale up briefly when the count just bumped.
        const sincePunch = this.currentTick - combo.punchedAtTick;
        const punch = sincePunch < 8 ? 1 + (1 - sincePunch / 8) * 0.35 : 1;
        ct.setScale(punch);
      } else {
        ct.setVisible(false);
        ct.setScale(1);
        if (combo && this.currentTick >= combo.expiresAtTick) this.combos.delete(i);
      }
    });
  }
}
