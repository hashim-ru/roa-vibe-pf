import Phaser from 'phaser';

/**
 * Damage-tier driven VFX for the tech-demo rebuild. The hit chain is a
 * single orchestrator (Vlambeer "Juice Multiplier") so designers tune
 * one place — TIER_PROFILE — and every attack pulls correct shake,
 * spark color, dust count, hitpause, and impact-flash from that table.
 *
 * Tier mapping (research/feel-vfx.md §16/§20):
 *   1-4   light  : pale-yellow spark, 2px shake, 4f pause, no flash
 *   5-8   medL   : yellow spark, 4px shake, 6f pause, no flash
 *   9-12  medH   : orange spark, 7px shake, 8f pause, dust
 *   13-18 heavy  : red+white spark, 10px shake, 11f pause, impactFlash
 *   19+   sweet  : red core spark, 14px shake, 14f pause, full flash
 */
export type DamageTier = 'light' | 'medL' | 'medH' | 'heavy' | 'sweet';

export function tierOf(damage: number): DamageTier {
  if (damage <= 4) return 'light';
  if (damage <= 8) return 'medL';
  if (damage <= 12) return 'medH';
  if (damage <= 18) return 'heavy';
  return 'sweet';
}

interface TierProfile {
  sparkOuter: number;
  sparkCore: number;
  sparkLines: number;
  coreRadius: number;
  shakeTrauma: number;
  dustCount: number;
}

const TIER_PROFILE: Record<DamageTier, TierProfile> = {
  light: { sparkOuter: 0xfff3a8, sparkCore: 0xffffff, sparkLines: 6, coreRadius: 4, shakeTrauma: 0.18, dustCount: 0 },
  medL: { sparkOuter: 0xffd34d, sparkCore: 0xffffff, sparkLines: 8, coreRadius: 6, shakeTrauma: 0.30, dustCount: 2 },
  medH: { sparkOuter: 0xff9933, sparkCore: 0xffffff, sparkLines: 10, coreRadius: 9, shakeTrauma: 0.45, dustCount: 4 },
  heavy: { sparkOuter: 0xff4444, sparkCore: 0xffffff, sparkLines: 12, coreRadius: 12, shakeTrauma: 0.65, dustCount: 5 },
  sweet: { sparkOuter: 0xff2222, sparkCore: 0xffffff, sparkLines: 14, coreRadius: 16, shakeTrauma: 0.85, dustCount: 7 }
};

export class VFX {
  constructor(private scene: Phaser.Scene) {}

  /**
   * The hit chain orchestrator — fires the per-tier VFX bundle on every
   * connect. Returns suggested camera trauma so the caller can route it
   * to the screen-shake system (which lives at scene level).
   */
  hitBundle(opts: {
    impactX: number;
    impactY: number;
    victimX: number;
    victimY: number;
    victimW: number;
    victimH: number;
    damage: number;
    launchAngleDeg: number;
    attackerColor: number;
  }): { trauma: number; tier: DamageTier } {
    const tier = tierOf(opts.damage);
    const p = TIER_PROFILE[tier];
    this.tieredHitSpark(opts.impactX, opts.impactY, tier, opts.launchAngleDeg);
    this.hurtFlash(opts.victimX, opts.victimY, opts.victimW, opts.victimH);
    this.damagePopup(opts.impactX, opts.impactY - 12, opts.damage);
    if (p.dustCount > 0) this.dust(opts.impactX, opts.impactY, p.dustCount);
    if (tier === 'heavy' || tier === 'sweet') this.impactFlash(opts.impactX, opts.impactY, opts.attackerColor);
    return { trauma: p.shakeTrauma, tier };
  }

  /** Tier-driven hitspark — line-burst + bright core. Direction biased by launch angle. */
  tieredHitSpark(x: number, y: number, tier: DamageTier, launchAngleDeg: number): void {
    const p = TIER_PROFILE[tier];
    const biasRad = (-launchAngleDeg * Math.PI) / 180;
    for (let i = 0; i < p.sparkLines; i++) {
      const ang = i < p.sparkLines * 0.6
        ? biasRad + (Math.random() - 0.5) * 0.9
        : Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 220 * (0.5 + p.coreRadius / 32);
      const dx = Math.cos(ang) * speed;
      const dy = Math.sin(ang) * speed;
      const g = this.scene.add.graphics({ x, y }).setDepth(900);
      const len = 6 + Math.random() * 5 + p.coreRadius * 0.4;
      g.lineStyle(2, p.sparkOuter, 1);
      g.lineBetween(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
      this.scene.tweens.add({
        targets: g,
        x: x + dx * 0.6,
        y: y + dy * 0.6,
        alpha: 0,
        scale: 0.4,
        duration: 180 + Math.random() * 80,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
    const core = this.scene.add.graphics({ x, y }).setDepth(905);
    core.fillStyle(p.sparkCore, 1).fillCircle(0, 0, p.coreRadius);
    core.fillStyle(p.sparkOuter, 0.8).fillCircle(0, 0, p.coreRadius * 0.7);
    this.scene.tweens.add({
      targets: core,
      scale: 1.8 + p.coreRadius * 0.05,
      alpha: 0,
      duration: 140,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy()
    });
  }

  hurtFlash(x: number, y: number, w: number, h: number): void {
    const flash = this.scene.add.rectangle(x, y - h / 2, w + 6, h + 6, 0xff5050, 0.55);
    flash.setDepth(870);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 90,
      onComplete: () => flash.destroy()
    });
  }

  damagePopup(x: number, y: number, damage: number): void {
    const color = damage >= 13 ? '#ff5566' : damage >= 7 ? '#ffc04a' : '#ffe78a';
    const text = this.scene.add
      .text(x, y - 12, `${damage}`, {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontStyle: 'bold',
        fontSize: damage >= 13 ? '28px' : '20px',
        color,
        stroke: '#000',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(940);
    this.scene.tweens.add({
      targets: text,
      y: y - 56,
      alpha: 0,
      scale: 1.2,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy()
    });
  }

  dust(x: number, y: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      const dx = (Math.random() - 0.5) * 40;
      const g = this.scene.add.graphics({ x, y }).setDepth(880);
      g.fillStyle(0x8c8a7e, 0.55).fillCircle(0, 0, 3 + Math.random() * 2);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y - 14 - Math.random() * 8,
        alpha: 0,
        scale: 1.5,
        duration: 320,
        onComplete: () => g.destroy()
      });
    }
  }

  parryFlash(x: number, y: number): void {
    const ring = this.scene.add.graphics({ x, y }).setDepth(950);
    ring.lineStyle(4, 0x9ae0ff, 1).strokeCircle(0, 0, 12);
    this.scene.tweens.add({
      targets: ring,
      scale: 4,
      alpha: 0,
      duration: 300,
      onComplete: () => ring.destroy()
    });
  }

  doubleJumpRing(x: number, y: number): void {
    const ring = this.scene.add.graphics({ x, y }).setDepth(45);
    ring.lineStyle(3, 0xfff3a8, 0.85).strokeCircle(0, 0, 10);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 3.2,
      scaleY: 0.7,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
  }

  koStar(x: number, y: number): void {
    const star = this.scene.add.graphics({ x, y }).setDepth(960);
    star.fillStyle(0xffe04d, 1);
    const r1 = 18;
    const r2 = 7;
    const path: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      path.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.beginPath();
    star.moveTo(path[0], path[1]);
    for (let i = 2; i < path.length; i += 2) star.lineTo(path[i], path[i + 1]);
    star.closePath();
    star.fillPath();
    this.scene.tweens.add({
      targets: star,
      scale: 2.5,
      alpha: 0,
      angle: 360,
      duration: 600,
      onComplete: () => star.destroy()
    });
  }

  impactFlash(worldX: number, worldY: number, color: number): void {
    const cam = this.scene.cameras.main;
    const sw = cam.width / cam.zoom;
    const sh = cam.height / cam.zoom;
    const overlay = this.scene.add
      .rectangle(cam.scrollX + sw / 2, cam.scrollY + sh / 2, sw * 1.2, sh * 1.2, color, 0.4)
      .setDepth(890);
    this.scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 100,
      onComplete: () => overlay.destroy()
    });
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const len = 60 + Math.random() * 40;
      const g = this.scene.add.graphics({ x: worldX, y: worldY }).setDepth(895);
      g.lineStyle(3, 0xffffff, 0.85);
      g.lineBetween(Math.cos(ang) * 12, Math.sin(ang) * 12, Math.cos(ang) * len, Math.sin(ang) * len);
      this.scene.tweens.add({
        targets: g,
        alpha: 0,
        duration: 220,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  koFlash(color = 0xffe04d): void {
    const cam = this.scene.cameras.main;
    const sw = cam.width / cam.zoom;
    const sh = cam.height / cam.zoom;
    const overlay = this.scene.add
      .rectangle(cam.scrollX + sw / 2, cam.scrollY + sh / 2, sw * 1.4, sh * 1.4, color, 0.55)
      .setDepth(2500);
    this.scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeIn',
      onComplete: () => overlay.destroy()
    });
  }

  landPoof(x: number, y: number): void {
    this.dust(x, y, 5);
  }

  clankBurst(x: number, y: number): void {
    // Two-color X spark for clank — both attackers staggered, no damage.
    const g = this.scene.add.graphics({ x, y }).setDepth(900);
    g.lineStyle(3, 0xffffff, 1);
    g.lineBetween(-12, -12, 12, 12);
    g.lineBetween(-12, 12, 12, -12);
    this.scene.tweens.add({
      targets: g,
      scale: 2.2,
      alpha: 0,
      duration: 220,
      onComplete: () => g.destroy()
    });
    const ring = this.scene.add.graphics({ x, y }).setDepth(900);
    ring.lineStyle(2, 0xffd34d, 0.85).strokeCircle(0, 0, 8);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.5,
      alpha: 0,
      duration: 260,
      onComplete: () => ring.destroy()
    });
  }
}
