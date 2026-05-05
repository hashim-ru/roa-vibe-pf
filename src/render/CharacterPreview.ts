import Phaser from 'phaser';
import type { CharacterDef } from '../entities/characters/Roster';
import type { CharacterVisual } from '../entities/characters/CharacterVisual';

const PREVIEW_SCALE = 3.0;
const OUTLINE = 0x0a0a14;

/**
 * Standalone preview drawer for the character-select scene. Mirrors the
 * gameplay renderer but without per-state animation — uses an idle pose
 * with subtle bob. Centered on (cx, cy), the bottom of the body sits at cy.
 */
export function drawCharacterPreview(
  g: Phaser.GameObjects.Graphics,
  def: CharacterDef,
  cx: number,
  cy: number,
  slotIndex: number,
  bobTick: number
): void {
  const v = def.visual;
  const baseW = def.stats.bodyW * v.bodyWidthRatio;
  const baseH = def.stats.bodyH;
  const W = baseW * PREVIEW_SCALE;
  const H = baseH * PREVIEW_SCALE;
  const overlay = slotIndex === 0 ? 0xffe8c8 : 0xc8d6ff;
  const bob = Math.sin(bobTick * 0.06) * 1.5;

  g.save();
  g.translateCanvas(cx, cy + bob);

  // Pedestal shadow
  g.fillStyle(0x000000, 0.4);
  g.fillEllipse(0, 6, W * 1.1, 10);

  // Cape
  if (v.cape !== 'none') {
    const len = (v.cape === 'long' ? H * 0.75 : H * 0.45);
    g.fillStyle(v.capeColor, 0.95);
    g.beginPath();
    g.moveTo(-W * 0.4, -H + H * 0.35);
    g.lineTo(W * 0.4, -H + H * 0.35);
    g.lineTo(W * 0.3, -H + H * 0.35 + len);
    g.lineTo(-W * 0.3, -H + H * 0.35 + len);
    g.closePath();
    g.fillPath();
  }

  // Body w/ outline + multi-tone shading
  const bodyTint = blend(v.bodyColor, overlay, 0.18);
  const bodyHi = blend(bodyTint, 0xffffff, 0.35);
  const bodyShade = blend(bodyTint, 0x000000, 0.3);
  const accentTint = blend(v.accentColor, overlay, 0.15);
  const metalAccent = blend(v.helmetAccent, 0xffffff, 0.2);

  const bodyTop = -H + H * 0.3;
  const bodyBot = -H + H * 0.85;
  const bodyH = bodyBot - bodyTop;
  // Outline
  g.fillStyle(OUTLINE, 1).fillRect(-W / 2 - 1, bodyTop - 1, W + 2, bodyH + 2);
  g.fillStyle(bodyTint, 1).fillRect(-W / 2, bodyTop, W, bodyH);
  g.fillStyle(bodyHi, 1).fillRect(-W / 2 + 2, bodyTop + 2, W - 4, 3);
  g.fillStyle(bodyShade, 1).fillRect(-W / 2, bodyTop + bodyH * 0.55, W, bodyH * 0.30);
  g.fillStyle(bodyShade, 0.55).fillRect(-W / 2, bodyTop, 2, bodyH);
  g.fillStyle(bodyShade, 0.55).fillRect(W / 2 - 2, bodyTop, 2, bodyH);
  g.fillStyle(accentTint, 1).fillRect(-W / 2, bodyTop, W, 2);
  g.fillStyle(accentTint, 1).fillRect(-W / 2, bodyTop + bodyH * 0.55, W, 2);
  g.fillStyle(accentTint, 1).fillRect(-W / 2, bodyBot - 2, W, 2);
  g.fillStyle(metalAccent, 1).fillRect(-2, bodyTop + bodyH * 0.55, 4, 4);
  g.fillStyle(OUTLINE, 1).fillRect(-1, bodyTop + bodyH * 0.55 + 1, 2, 2);

  // Legs (with outline)
  const legW = W * 0.32;
  const legTop = -H + H * 0.85;
  const legH = H * 0.15;
  const dark = blend(0x2a2a32, overlay, 0.1);
  g.fillStyle(OUTLINE, 1).fillRect(-legW * 1.05 - 1, legTop - 1, legW + 2, legH + 2);
  g.fillStyle(OUTLINE, 1).fillRect(legW * 0.05 - 1, legTop - 1, legW + 2, legH + 2);
  g.fillStyle(dark, 1).fillRect(-legW * 1.05, legTop, legW, legH);
  g.fillStyle(dark, 1).fillRect(legW * 0.05, legTop, legW, legH);
  g.fillStyle(0x141622, 1).fillRect(-legW * 1.05, legTop + legH - 3, legW, 3);
  g.fillStyle(0x141622, 1).fillRect(legW * 0.05, legTop + legH - 3, legW, 3);

  // Helmet
  drawHelmet(g, v, W, H, overlay);

  // Shield
  if (v.shield !== 'none') drawShield(g, v, W, H, overlay);

  // Weapon (idle pose, slight angle)
  drawWeapon(g, v, W, H);

  g.restore();
}

function drawHelmet(
  g: Phaser.GameObjects.Graphics,
  v: CharacterVisual,
  W: number,
  H: number,
  overlay: number
): void {
  const helmW = W * 0.95;
  const helmH = H * 0.30;
  const topPad = v.topPad * (W / Math.max(1, W * 0.5));
  const helmY = -H + (-topPad * 0.2);
  const bodyTint = blend(v.bodyColor, overlay, 0.25);
  const helmAccent = blend(v.helmetAccent, overlay, 0.18);

  switch (v.helmet) {
    case 'bucket':
      g.fillStyle(bodyTint, 1).fillRect(-helmW / 2, helmY, helmW, helmH);
      g.fillStyle(helmAccent, 1).fillRect(-helmW / 2, helmY, helmW, 4);
      g.fillStyle(0x141622, 1).fillRect(-helmW * 0.3, helmY + helmH * 0.45, helmW * 0.6, 3);
      if (v.plumeColor) {
        g.fillStyle(v.plumeColor, 1);
        g.fillTriangle(2, helmY - topPad, helmW * 0.45, helmY - 2, helmW * 0.2, helmY + 4);
      }
      break;
    case 'pointed':
      g.fillStyle(bodyTint, 1);
      g.beginPath();
      g.moveTo(-helmW / 2, helmY + helmH);
      g.lineTo(-helmW / 2, helmY + helmH * 0.4);
      g.lineTo(0, helmY - topPad * 0.6);
      g.lineTo(helmW / 2, helmY + helmH * 0.4);
      g.lineTo(helmW / 2, helmY + helmH);
      g.closePath();
      g.fillPath();
      g.fillStyle(helmAccent, 1).fillRect(-helmW / 2, helmY + helmH - 3, helmW, 3);
      g.fillStyle(0x141622, 1).fillRect(-helmW * 0.3, helmY + helmH * 0.55, helmW * 0.6, 3);
      if (v.plumeColor) {
        g.fillStyle(v.plumeColor, 1);
        g.fillTriangle(0, helmY - topPad - 2, 8, helmY - topPad * 0.4, -8, helmY - topPad * 0.4);
      }
      break;
    case 'horned':
      g.fillStyle(bodyTint, 1).fillRect(-helmW / 2, helmY, helmW, helmH);
      g.fillStyle(helmAccent, 1).fillRect(-helmW / 2, helmY, helmW, 4);
      g.fillStyle(0x141622, 1).fillRect(-helmW * 0.3, helmY + helmH * 0.45, helmW * 0.6, 3);
      g.fillStyle(helmAccent, 1);
      g.fillTriangle(-helmW * 0.55, helmY + 4, -helmW * 0.85, helmY - topPad * 0.7, -helmW * 0.4, helmY - topPad * 0.2);
      g.fillTriangle(helmW * 0.55, helmY + 4, helmW * 0.85, helmY - topPad * 0.7, helmW * 0.4, helmY - topPad * 0.2);
      break;
    case 'hooded':
      g.fillStyle(bodyTint, 1);
      g.beginPath();
      g.moveTo(-helmW * 0.55, helmY + helmH);
      g.lineTo(-helmW * 0.45, helmY - topPad * 0.2);
      g.lineTo(0, helmY - topPad * 0.5);
      g.lineTo(helmW * 0.55, helmY - topPad * 0.1);
      g.lineTo(helmW * 0.55, helmY + helmH);
      g.closePath();
      g.fillPath();
      g.fillStyle(0x0a0a14, 1).fillRect(-helmW * 0.32, helmY + helmH * 0.45, helmW * 0.64, helmH * 0.4);
      break;
    case 'crowned':
      g.fillStyle(bodyTint, 1).fillRect(-helmW / 2, helmY, helmW, helmH);
      g.fillStyle(helmAccent, 1).fillRect(-helmW / 2, helmY, helmW, 4);
      g.fillStyle(0x141622, 1).fillRect(-helmW * 0.3, helmY + helmH * 0.5, helmW * 0.6, 3);
      g.fillStyle(v.helmetAccent, 1);
      for (let k = -2; k <= 2; k++) {
        const cx = (k * helmW) / 5;
        const ch = topPad * (k === 0 ? 1 : 0.65);
        g.fillTriangle(cx - 3, helmY, cx + 3, helmY, cx, helmY - ch);
      }
      if (v.plumeColor) {
        g.fillStyle(v.plumeColor, 1);
        g.fillTriangle(8, helmY - topPad, helmW * 0.5, helmY - topPad * 0.2, helmW * 0.25, helmY + 6);
      }
      break;
    case 'skull': {
      const skullW = helmW * 0.78;
      const skullH = helmH * 1.05;
      const skullY = helmY - skullH * 0.15;
      g.fillStyle(0x0a0a14, 1);
      g.beginPath();
      g.moveTo(-helmW * 0.6, helmY + helmH);
      g.lineTo(-helmW * 0.5, helmY - topPad * 0.5);
      g.lineTo(0, helmY - topPad);
      g.lineTo(helmW * 0.5, helmY - topPad * 0.5);
      g.lineTo(helmW * 0.6, helmY + helmH);
      g.closePath();
      g.fillPath();
      g.fillStyle(v.helmetAccent, 1).fillEllipse(0, skullY + skullH * 0.4, skullW, skullH);
      g.fillStyle(0x000000, 1).fillCircle(-skullW * 0.22, skullY + skullH * 0.4, skullW * 0.13);
      g.fillStyle(0x000000, 1).fillCircle(skullW * 0.22, skullY + skullH * 0.4, skullW * 0.13);
      g.fillStyle(0x141622, 1).fillRect(-skullW * 0.22, skullY + skullH * 0.7, skullW * 0.44, 3);
      for (let k = 0; k < 5; k++) {
        g.fillRect(-skullW * 0.22 + k * (skullW * 0.11), skullY + skullH * 0.7, 2, 5);
      }
      break;
    }
    case 'feathered':
      g.fillStyle(bodyTint, 1).fillRect(-helmW / 2, helmY, helmW, helmH);
      g.fillStyle(helmAccent, 1).fillRect(-helmW / 2, helmY, helmW, 4);
      g.fillStyle(0x141622, 1).fillRect(-helmW * 0.3, helmY + helmH * 0.45, helmW * 0.6, 3);
      if (v.plumeColor) {
        g.fillStyle(v.plumeColor, 1);
        for (let k = 0; k < 3; k++) {
          const px = -6 + k * 6;
          const ph = topPad - k * 2;
          g.fillTriangle(px, helmY + 2, px + 4, helmY - ph, px - 4, helmY - ph * 0.3);
        }
      }
      break;
    default: {
      const _exhaustive: never = v.helmet as never;
      void _exhaustive;
    }
  }
}

function drawShield(
  g: Phaser.GameObjects.Graphics,
  v: CharacterVisual,
  W: number,
  H: number,
  overlay: number
): void {
  const sx = -W * 0.6;
  const sy = -H + H * 0.45;
  const color = blend(v.shieldColor, overlay, 0.2);
  g.fillStyle(color, 1);
  switch (v.shield) {
    case 'kite':
      g.beginPath();
      g.moveTo(sx - 6, sy);
      g.lineTo(sx + 6, sy);
      g.lineTo(sx + 8, sy + H * 0.18);
      g.lineTo(sx, sy + H * 0.32);
      g.lineTo(sx - 8, sy + H * 0.18);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, 0x141622, 0.7).strokePath();
      break;
    case 'round':
      g.fillCircle(sx, sy + H * 0.12, 12);
      g.lineStyle(1, 0x141622, 0.7).strokeCircle(sx, sy + H * 0.12, 12);
      break;
    case 'tower':
      g.fillRect(sx - 8, sy - 4, 18, H * 0.36);
      g.lineStyle(1, 0x141622, 0.7).strokeRect(sx - 8, sy - 4, 18, H * 0.36);
      break;
    case 'buckler':
      g.fillCircle(sx, sy + H * 0.12, 7);
      g.lineStyle(1, 0x141622, 0.7).strokeCircle(sx, sy + H * 0.12, 7);
      break;
    case 'none':
      break;
  }
}

function drawWeapon(g: Phaser.GameObjects.Graphics, v: CharacterVisual, W: number, H: number): void {
  if (v.weapon === 'none') return;
  g.save();
  g.translateCanvas(W * 0.15, -H + H * 0.5);
  g.rotateCanvas(-0.25);

  const grip = v.weaponGrip;
  const metal = v.weaponMetal;
  switch (v.weapon) {
    case 'sword':
      g.fillStyle(metal, 1).fillRect(0, -3, 32, 6);
      g.fillTriangle(32, -3, 32, 3, 38, 0);
      g.fillStyle(grip, 1).fillRect(-8, -2, 8, 4);
      g.fillStyle(metal, 1).fillRect(-2, -6, 3, 12);
      break;
    case 'twohand':
      g.fillStyle(metal, 1).fillRect(0, -4, 44, 8);
      g.fillTriangle(44, -4, 44, 4, 52, 0);
      g.fillStyle(grip, 1).fillRect(-12, -3, 12, 6);
      g.fillStyle(metal, 1).fillRect(-3, -8, 4, 16);
      break;
    case 'spear':
      g.fillStyle(grip, 1).fillRect(-4, -1.5, 38, 3);
      g.fillStyle(metal, 1).fillTriangle(34, -5, 34, 5, 46, 0);
      break;
    case 'axe':
      g.fillStyle(grip, 1).fillRect(-2, -1.5, 28, 3);
      g.fillStyle(metal, 1);
      g.beginPath();
      g.moveTo(20, -3);
      g.lineTo(28, -10);
      g.lineTo(36, -10);
      g.lineTo(34, 0);
      g.lineTo(36, 10);
      g.lineTo(28, 10);
      g.lineTo(20, 3);
      g.closePath();
      g.fillPath();
      break;
    case 'dagger':
      g.fillStyle(metal, 1).fillRect(0, -2, 16, 4);
      g.fillTriangle(16, -2, 16, 2, 22, 0);
      g.fillStyle(grip, 1).fillRect(-6, -1.5, 6, 3);
      break;
    case 'mace':
      g.fillStyle(grip, 1).fillRect(-2, -1.5, 22, 3);
      g.fillStyle(metal, 1).fillCircle(26, 0, 7);
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3;
        const x1 = 26 + Math.cos(ang) * 7;
        const y1 = Math.sin(ang) * 7;
        const x2 = 26 + Math.cos(ang) * 11;
        const y2 = Math.sin(ang) * 11;
        g.lineStyle(2, metal, 1).lineBetween(x1, y1, x2, y2);
      }
      break;
    case 'bow':
      g.lineStyle(3, grip, 1);
      g.beginPath();
      g.arc(0, 0, 16, -Math.PI * 0.45, Math.PI * 0.45, false);
      g.strokePath();
      g.fillStyle(grip, 1).fillRect(14, -3, 4, 6);
      break;
  }
  g.restore();
}

function blend(base: number, overlay: number, amount: number): number {
  const br = (base >> 16) & 0xff,
    bg = (base >> 8) & 0xff,
    bb = base & 0xff;
  const or = (overlay >> 16) & 0xff,
    og = (overlay >> 8) & 0xff,
    ob = overlay & 0xff;
  const r = Math.round(br * (1 - amount) + or * amount);
  const gg = Math.round(bg * (1 - amount) + og * amount);
  const b = Math.round(bb * (1 - amount) + ob * amount);
  return (r << 16) | (gg << 8) | b;
}

void Phaser;
