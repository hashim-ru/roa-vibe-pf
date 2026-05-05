import Phaser from 'phaser';
import { ROSTER } from '../entities/characters/Roster';
import type { CharacterId } from '../config/GameMode';
import type { CharacterVisual } from '../entities/characters/CharacterVisual';
import {
  Bone,
  BoneId,
  defaultSkeleton,
  solveSkeleton,
  BoneTransform
} from './skeleton/Bone';
import type { Pose } from './skeleton/Pose';

/**
 * Character-select preview — renders a static idle pose using the same
 * skeleton primitives as FighterRenderer, but without any FSM / physics
 * dependency. Use this anywhere a "still portrait" of a character is
 * needed (CharacterSelectScene, training mode banner, post-match win
 * card).
 */
export class CharacterPreview {
  private gfx: Phaser.GameObjects.Graphics;
  private bones: Record<BoneId, Bone>;
  private bodyW: number;
  private bodyH: number;
  private bobTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private characterId: CharacterId,
    private centerX: number,
    private centerY: number,
    private scale = 2.4
  ) {
    const def = ROSTER[characterId];
    this.bodyW = def.stats.bodyW * def.visual.bodyWidthRatio;
    this.bodyH = def.stats.bodyH;
    this.bones = defaultSkeleton(this.bodyH, this.bodyW);
    this.gfx = scene.add.graphics().setDepth(50);
  }

  setCharacter(id: CharacterId): void {
    this.characterId = id;
    const def = ROSTER[id];
    this.bodyW = def.stats.bodyW * def.visual.bodyWidthRatio;
    this.bodyH = def.stats.bodyH;
    this.bones = defaultSkeleton(this.bodyH, this.bodyW);
  }

  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  destroy(): void {
    this.gfx.destroy();
  }

  /**
   * Draw the preview at the current center. Pose is the idle stance with
   * a subtle vertical bob driven by `tick` (so the preview feels alive).
   */
  draw(tick: number): void {
    this.bobTick = tick;
    const def = ROSTER[this.characterId];
    const v = def.visual;
    const pose = this.idlePose(v, tick);
    const transforms = solveSkeleton(this.bones, pose);
    const bob = Math.sin(tick * 0.04) * 1.5;

    const g = this.gfx;
    g.clear();
    g.save();
    g.translateCanvas(this.centerX, this.centerY + bob);
    g.scaleCanvas(this.scale, this.scale);

    // Ground shadow
    g.fillStyle(0x000000, 0.4).fillEllipse(0, 4, this.bodyW * 1.05, 7);

    // Cape (static) — drawn behind torso, just a triangle drape based on
    // visual config.
    if (v.cape !== 'none') {
      const len = v.cape === 'long' ? this.bodyH * 0.55 : this.bodyH * 0.36;
      g.fillStyle(0x0a0a14, 1);
      g.beginPath();
      g.lineTo(-this.bodyW * 0.42, -this.bodyH * 0.62);
      g.lineTo(this.bodyW * 0.42, -this.bodyH * 0.62);
      g.lineTo(this.bodyW * 0.32, -this.bodyH * 0.62 + len + 1);
      g.lineTo(-this.bodyW * 0.32, -this.bodyH * 0.62 + len + 1);
      g.closePath();
      g.fillPath();
      g.fillStyle(v.capeColor, 0.95);
      g.beginPath();
      g.lineTo(-this.bodyW * 0.4, -this.bodyH * 0.62);
      g.lineTo(this.bodyW * 0.4, -this.bodyH * 0.62);
      g.lineTo(this.bodyW * 0.30, -this.bodyH * 0.62 + len);
      g.lineTo(-this.bodyW * 0.30, -this.bodyH * 0.62 + len);
      g.closePath();
      g.fillPath();
    }

    // Skeleton in z-order
    this.drawSkeleton(g, transforms, v);
    this.drawHelmet(g, transforms.head, v, tick);
    this.drawWeapon(g, transforms, v);
    if (v.shield !== 'none') this.drawShield(g, transforms, v);

    g.restore();
  }

  private idlePose(v: CharacterVisual, tick: number): Pose {
    const breath = Math.sin(tick * 0.06) * 0.02;
    return {
      torso: -Math.PI / 2 + breath + (v.idleLean ?? 0) * 0.3,
      neck: -Math.PI / 2,
      head: -Math.PI / 2 + breath * 0.5,
      shoulderBack: 1.05,
      elbowBack: 0.6,
      shoulderFront: -0.55,
      elbowFront: 0.5,
      hipBack: Math.PI / 2 + 0.18,
      kneeBack: 0,
      hipFront: Math.PI / 2 - 0.18,
      kneeFront: 0
    };
  }

  // ============================================================
  //  Drawing primitives — kept lean. Mirrors FighterRenderer's static
  //  passes without the per-state pose system.
  // ============================================================
  private drawSkeleton(
    g: Phaser.GameObjects.Graphics,
    tr: Record<BoneId, BoneTransform>,
    v: CharacterVisual
  ): void {
    const palette = this.tones(v);
    const order: BoneId[] = [
      'shoulderBack',
      'elbowBack',
      'handBack',
      'hipBack',
      'kneeBack',
      'footBack',
      'torso',
      'neck',
      'hipFront',
      'kneeFront',
      'footFront',
      'shoulderFront',
      'elbowFront',
      'handFront'
    ];
    for (const id of order) {
      const t = tr[id];
      if (id === 'torso') {
        this.drawTorso(g, t, palette);
      } else if (id === 'neck') {
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, t.radius, palette.dark, palette.outline);
      } else if (id === 'hipBack' || id === 'hipFront') {
        const back = id === 'hipBack';
        const knee = back ? tr.kneeBack : tr.kneeFront;
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, t.radius, back ? palette.darkShade : palette.dark, palette.outline);
        g.fillStyle(palette.outline, 1).fillCircle(knee.startX, knee.startY, t.radius + 0.5);
        g.fillStyle(back ? palette.darkShade : palette.dark, 1).fillCircle(knee.startX, knee.startY, t.radius - 0.5);
      } else if (id === 'kneeBack' || id === 'kneeFront') {
        const back = id === 'kneeBack';
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, t.radius, back ? palette.darkShade : palette.dark, palette.outline);
      } else if (id === 'footBack' || id === 'footFront') {
        const back = id === 'footBack';
        g.fillStyle(palette.outline, 1).fillEllipse(t.startX, t.startY + 2, t.radius * 2.6, t.radius * 1.6);
        g.fillStyle(back ? palette.darkShade : palette.darkHi, 1).fillEllipse(t.startX, t.startY + 1, t.radius * 2.4, t.radius * 1.4);
      } else if (id === 'shoulderBack' || id === 'shoulderFront') {
        const back = id === 'shoulderBack';
        const upper = back ? tr.shoulderBack : tr.shoulderFront;
        const elb = back ? tr.elbowBack : tr.elbowFront;
        const armColor = back ? palette.bodyShade : palette.body;
        g.fillStyle(palette.outline, 1).fillCircle(upper.startX, upper.startY, upper.radius + 1.5);
        g.fillStyle(armColor, 1).fillCircle(upper.startX, upper.startY, upper.radius + 0.5);
        g.fillStyle(palette.bodyHi, 0.6).fillCircle(upper.startX - 2, upper.startY - 2, upper.radius * 0.55);
        this.drawCapsule(g, upper.startX, upper.startY, upper.endX, upper.endY, upper.radius, armColor, palette.outline);
        g.fillStyle(palette.outline, 1).fillCircle(elb.startX, elb.startY, elb.radius + 0.5);
        g.fillStyle(armColor, 1).fillCircle(elb.startX, elb.startY, elb.radius - 0.5);
      } else if (id === 'elbowBack' || id === 'elbowFront') {
        const back = id === 'elbowBack';
        const armColor = back ? palette.bodyShade : palette.body;
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, t.radius, armColor, palette.outline);
      } else if (id === 'handBack' || id === 'handFront') {
        const back = id === 'handBack';
        const handColor = back ? this.tintBlend(palette.dark, 0x000000, 0.3) : palette.dark;
        g.fillStyle(palette.outline, 1).fillCircle(t.startX, t.startY, t.radius);
        g.fillStyle(handColor, 1).fillCircle(t.startX, t.startY, t.radius - 1);
        g.fillStyle(palette.darkHi, 0.4).fillCircle(t.startX - 1, t.startY - 1, t.radius * 0.45);
        g.lineStyle(1.5, palette.accent, 0.85).strokeCircle(t.startX, t.startY, t.radius - 0.3);
        g.lineStyle(0, 0, 0);
      }
    }
  }

  private drawTorso(g: Phaser.GameObjects.Graphics, t: BoneTransform, palette: ToneSet): void {
    const sx = t.startX;
    const sy = t.startY;
    const ex = t.endX;
    const ey = t.endY;
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const shoulderW = t.radius * 1.30;
    const chestW = t.radius * 1.05;
    const waistW = t.radius * 0.85;
    const hipW = t.radius * 1.10;

    const w0 = { x: ex + px * shoulderW, y: ey + py * shoulderW };
    const w1 = { x: ex - px * shoulderW, y: ey - py * shoulderW };
    const m0 = { x: sx + dx * 0.65 + px * chestW, y: sy + dy * 0.65 + py * chestW };
    const m1 = { x: sx + dx * 0.65 - px * chestW, y: sy + dy * 0.65 - py * chestW };
    const w2 = { x: sx + dx * 0.30 + px * waistW, y: sy + dy * 0.30 + py * waistW };
    const w3 = { x: sx + dx * 0.30 - px * waistW, y: sy + dy * 0.30 - py * waistW };
    const h0 = { x: sx + px * hipW, y: sy + py * hipW };
    const h1 = { x: sx - px * hipW, y: sy - py * hipW };

    g.fillStyle(palette.outline, 1);
    g.beginPath();
    g.lineTo(w0.x + Math.sign(px), w0.y + Math.sign(py));
    g.lineTo(m0.x + Math.sign(px), m0.y + Math.sign(py));
    g.lineTo(w2.x + Math.sign(px), w2.y + Math.sign(py));
    g.lineTo(h0.x + Math.sign(px), h0.y + Math.sign(py));
    g.lineTo(h1.x - Math.sign(px), h1.y - Math.sign(py));
    g.lineTo(w3.x - Math.sign(px), w3.y - Math.sign(py));
    g.lineTo(m1.x - Math.sign(px), m1.y - Math.sign(py));
    g.lineTo(w1.x - Math.sign(px), w1.y - Math.sign(py));
    g.closePath();
    g.fillPath();

    g.fillStyle(palette.body, 1);
    g.beginPath();
    g.lineTo(w0.x, w0.y);
    g.lineTo(m0.x, m0.y);
    g.lineTo(w2.x, w2.y);
    g.lineTo(h0.x, h0.y);
    g.lineTo(h1.x, h1.y);
    g.lineTo(w3.x, w3.y);
    g.lineTo(m1.x, m1.y);
    g.lineTo(w1.x, w1.y);
    g.closePath();
    g.fillPath();

    g.fillStyle(palette.bodyShade, 0.55);
    g.beginPath();
    g.lineTo(ex, ey);
    g.lineTo(w0.x, w0.y);
    g.lineTo(m0.x, m0.y);
    g.lineTo(w2.x, w2.y);
    g.lineTo(h0.x, h0.y);
    g.lineTo(sx, sy);
    g.closePath();
    g.fillPath();

    const cmidX = sx + dx * 0.65;
    const cmidY = sy + dy * 0.65;
    const pecW = chestW * 0.5;
    const pecH = len * 0.30;
    g.fillStyle(palette.bodyHi, 0.55).fillEllipse(cmidX - px * pecW * 0.55, cmidY - py * pecW * 0.55, pecW, pecH);
    g.fillStyle(palette.bodyHi, 0.55).fillEllipse(cmidX + px * pecW * 0.55, cmidY + py * pecW * 0.55, pecW, pecH);

    const wcenterX = sx + dx * 0.30;
    const wcenterY = sy + dy * 0.30;
    g.fillStyle(palette.outline, 1).fillEllipse(wcenterX, wcenterY, waistW * 2 + 2, 6);
    g.fillStyle(palette.accent, 1).fillEllipse(wcenterX, wcenterY, waistW * 2, 5);
    g.fillStyle(palette.metalAccent, 1).fillCircle(wcenterX, wcenterY, 2);
    g.fillStyle(palette.outline, 1).fillCircle(wcenterX, wcenterY + 0.5, 1);
  }

  private drawHelmet(
    g: Phaser.GameObjects.Graphics,
    head: BoneTransform,
    v: CharacterVisual,
    tick: number
  ): void {
    const palette = this.tones(v);
    const cx = head.endX;
    const cy = head.endY - head.radius * 0.25;
    const r = head.radius;

    const drawVisor = (): void => {
      g.fillStyle(0x000000, 1).fillRect(cx - r * 0.55, cy - r * 0.05, r * 1.1, 4);
      const pulse = (Math.sin(tick * 0.12) + 1) * 0.5;
      g.fillStyle(0xffd84a, 0.55 + pulse * 0.4);
      g.fillRect(cx - r * 0.32, cy - r * 0.05 + 1, 2, 2);
      g.fillStyle(0xffd84a, 0.55 + pulse * 0.4);
      g.fillRect(cx + r * 0.30, cy - r * 0.05 + 1, 2, 2);
    };

    if (v.helmet === 'pointed') {
      const brimY = cy + r * 0.30;
      g.fillStyle(palette.outline, 1);
      g.fillTriangle(cx - r * 1.1, brimY, cx + r * 1.1, brimY, cx, cy - r * 1.4);
      g.fillStyle(palette.body, 1);
      g.fillTriangle(cx - r, brimY, cx + r, brimY, cx, cy - r * 1.3);
      g.fillStyle(palette.bodyHi, 0.85);
      g.fillTriangle(cx - r * 0.3, brimY, cx, cy - r * 1.3, cx - r * 0.05, brimY);
      g.fillStyle(palette.outline, 1).fillEllipse(cx, brimY, r * 2.2, 6);
      g.fillStyle(palette.accent, 1).fillEllipse(cx, brimY, r * 2.0, 5);
      drawVisor();
      if (v.plumeColor !== undefined) this.drawPlume(g, v.plumeColor, palette, cx, cy - r * 1.3, r);
    } else if (v.helmet === 'hooded') {
      const top = cy - r * 1.05;
      const points = [
        { x: cx - r * 1.3, y: cy + r * 0.5 },
        { x: cx - r * 1.0, y: cy - r * 0.4 },
        { x: cx, y: top },
        { x: cx + r * 1.0, y: cy - r * 0.4 },
        { x: cx + r * 1.3, y: cy + r * 0.5 }
      ];
      g.fillStyle(palette.outline, 1);
      g.beginPath();
      for (const p of points) g.lineTo(p.x + Math.sign(p.x - cx), p.y - 1);
      g.closePath();
      g.fillPath();
      g.fillStyle(palette.body, 1);
      g.beginPath();
      for (const p of points) g.lineTo(p.x, p.y);
      g.closePath();
      g.fillPath();
      g.fillStyle(palette.bodyShade, 0.7);
      g.fillRect(cx - r * 0.9, cy + r * 0.05, r * 1.8, 3);
      g.fillStyle(0x0a0a14, 1).fillRect(cx - r * 0.55, cy + r * 0.10, r * 1.1, r * 0.7);
      const pulse = (Math.sin(tick * 0.12) + 1) * 0.5;
      g.fillStyle(0xffd84a, 0.5 + pulse * 0.4);
      g.fillRect(cx - r * 0.30, cy + r * 0.30, 2, 2);
      g.fillStyle(0xffd84a, 0.5 + pulse * 0.4);
      g.fillRect(cx + r * 0.28, cy + r * 0.30, 2, 2);
    } else {
      g.fillStyle(palette.outline, 1).fillEllipse(cx, cy, r * 2.05, r * 1.95);
      g.fillStyle(palette.body, 1).fillEllipse(cx, cy, r * 2, r * 1.9);
      g.fillStyle(palette.bodyHi, 0.85).fillEllipse(cx - r * 0.3, cy - r * 0.4, r * 0.7, r * 0.85);
      g.fillStyle(palette.bodyShade, 0.5).fillEllipse(cx, cy + r * 0.4, r * 1.6, r * 0.85);
      drawVisor();
      if (v.plumeColor !== undefined) this.drawPlume(g, v.plumeColor, palette, cx, cy - r * 0.95, r);
    }
  }

  private drawPlume(
    g: Phaser.GameObjects.Graphics,
    color: number,
    palette: ToneSet,
    baseX: number,
    tipY: number,
    length: number
  ): void {
    g.fillStyle(palette.outline, 1);
    g.fillTriangle(baseX - 4, tipY + length, baseX + length * 0.7, tipY + length * 0.4, baseX - 6, tipY);
    g.fillStyle(color, 1);
    g.fillTriangle(baseX - 3, tipY + length, baseX + length * 0.6, tipY + length * 0.4, baseX - 5, tipY + 1);
    g.fillStyle(0xffffff, 0.35);
    g.fillTriangle(baseX - 2, tipY + length * 0.6, baseX + length * 0.3, tipY + length * 0.5, baseX - 3, tipY + length * 0.2);
  }

  private drawWeapon(
    g: Phaser.GameObjects.Graphics,
    tr: Record<BoneId, BoneTransform>,
    v: CharacterVisual
  ): void {
    if (v.weapon === 'none') return;
    const hand = tr.handFront;
    const elbow = tr.elbowFront;
    const angle = Math.atan2(elbow.endY - elbow.startY, elbow.endX - elbow.startX);
    g.save();
    g.translateCanvas(hand.startX, hand.startY);
    g.rotateCanvas(angle);
    const grip = v.weaponGrip;
    const metal = v.weaponMetal;
    const sheen = 0xffffff;
    if (v.weapon === 'spear') {
      g.fillStyle(0x0a0a14, 1).fillRect(-5, -2, 56, 4);
      g.fillStyle(grip, 1).fillRect(-4, -1.5, 54, 3);
      g.fillStyle(0x0a0a14, 1).fillTriangle(50, -7, 50, 7, 64, 0);
      g.fillStyle(metal, 1).fillTriangle(51, -6, 51, 6, 62, 0);
      g.fillStyle(sheen, 0.5).fillRect(53, -1, 6, 1);
    } else if (v.weapon === 'dagger') {
      g.fillStyle(0x0a0a14, 1).fillRect(-7, -2, 7, 4);
      g.fillStyle(grip, 1).fillRect(-6, -1.5, 6, 3);
      g.fillStyle(0x0a0a14, 1).fillRect(0, -3, 16, 6);
      g.fillStyle(0x0a0a14, 1).fillTriangle(16, -3, 16, 3, 22, 0);
      g.fillStyle(metal, 1).fillRect(1, -2, 14, 4);
      g.fillStyle(metal, 1).fillTriangle(15, -2, 15, 2, 21, 0);
      g.fillStyle(sheen, 0.5).fillRect(2, -2, 12, 1);
    } else if (v.weapon === 'sword') {
      g.fillStyle(0x0a0a14, 1).fillRect(-9, -3, 9, 6);
      g.fillStyle(grip, 1).fillRect(-8, -2, 8, 4);
      g.fillStyle(0x0a0a14, 1).fillRect(-3, -7, 5, 14);
      g.fillStyle(metal, 1).fillRect(-2, -6, 3, 12);
      g.fillStyle(0x0a0a14, 1).fillRect(0, -3, 32, 6);
      g.fillStyle(0x0a0a14, 1).fillTriangle(32, -3, 32, 3, 39, 0);
      g.fillStyle(metal, 1).fillRect(1, -2, 30, 4);
      g.fillStyle(metal, 1).fillTriangle(31, -2, 31, 2, 38, 0);
      g.fillStyle(sheen, 0.5).fillRect(2, -2, 28, 1);
    }
    g.restore();
  }

  private drawShield(g: Phaser.GameObjects.Graphics, tr: Record<BoneId, BoneTransform>, v: CharacterVisual): void {
    const hand = tr.handBack;
    const cx = hand.startX;
    const cy = hand.startY;
    if (v.shield === 'round') {
      g.fillStyle(0x0a0a14, 1).fillCircle(cx, cy, 12);
      g.fillStyle(v.shieldColor, 1).fillCircle(cx, cy, 11);
      g.fillStyle(this.tintBlend(v.shieldColor, 0xffffff, 0.4), 1).fillCircle(cx - 2, cy - 2, 3);
      g.lineStyle(1, 0x0a0a14, 0.4).strokeCircle(cx, cy, 7);
      g.lineStyle(0, 0, 0);
    } else if (v.shield === 'kite') {
      const points = [
        { x: cx - 7, y: cy - 4 },
        { x: cx + 7, y: cy - 4 },
        { x: cx + 9, y: cy + 8 },
        { x: cx, y: cy + 18 },
        { x: cx - 9, y: cy + 8 }
      ];
      g.fillStyle(0x0a0a14, 1);
      g.beginPath();
      for (const p of points) g.lineTo(p.x + Math.sign(p.x - cx), p.y + 1);
      g.closePath();
      g.fillPath();
      g.fillStyle(v.shieldColor, 1);
      g.beginPath();
      for (const p of points) g.lineTo(p.x, p.y);
      g.closePath();
      g.fillPath();
    }
  }

  private tones(v: CharacterVisual): ToneSet {
    const body = v.bodyColor;
    return {
      body,
      bodyHi: this.tintBlend(body, 0xffffff, 0.35),
      bodyShade: this.tintBlend(body, 0x000000, 0.35),
      accent: v.accentColor,
      metalAccent: this.tintBlend(v.helmetAccent, 0xffffff, 0.2),
      dark: this.tintBlend(0x2a2a32, body, 0.12),
      darkHi: 0xffffff,
      darkShade: 0x141622,
      outline: 0x0a0a14
    };
  }

  private tintBlend(base: number, overlay: number, amount: number): number {
    const br = (base >> 16) & 0xff;
    const bg = (base >> 8) & 0xff;
    const bb = base & 0xff;
    const or = (overlay >> 16) & 0xff;
    const og = (overlay >> 8) & 0xff;
    const ob = overlay & 0xff;
    const r = Math.round(br * (1 - amount) + or * amount);
    const gg = Math.round(bg * (1 - amount) + og * amount);
    const b = Math.round(bb * (1 - amount) + ob * amount);
    return (r << 16) | (gg << 8) | b;
  }

  private drawCapsule(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    color: number,
    outline: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      g.fillStyle(outline, 1).fillCircle(x1, y1, r + 1);
      g.fillStyle(color, 1).fillCircle(x1, y1, r);
      return;
    }
    const px = -dy / len;
    const py = dx / len;
    const oR = r + 1;
    g.fillStyle(outline, 1);
    g.fillTriangle(x1 + px * oR, y1 + py * oR, x1 - px * oR, y1 - py * oR, x2 + px * oR, y2 + py * oR);
    g.fillTriangle(x2 + px * oR, y2 + py * oR, x2 - px * oR, y2 - py * oR, x1 - px * oR, y1 - py * oR);
    g.fillCircle(x1, y1, oR);
    g.fillCircle(x2, y2, oR);
    g.fillStyle(color, 1);
    g.fillTriangle(x1 + px * r, y1 + py * r, x1 - px * r, y1 - py * r, x2 + px * r, y2 + py * r);
    g.fillTriangle(x2 + px * r, y2 + py * r, x2 - px * r, y2 - py * r, x1 - px * r, y1 - py * r);
    g.fillCircle(x1, y1, r);
    g.fillCircle(x2, y2, r);
  }
}

interface ToneSet {
  body: number;
  bodyHi: number;
  bodyShade: number;
  accent: number;
  metalAccent: number;
  dark: number;
  darkHi: number;
  darkShade: number;
  outline: number;
}
