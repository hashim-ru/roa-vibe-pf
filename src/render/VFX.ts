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

  /**
   * Dent direction line — a short stroke from victim center pointing
   * toward the launch direction. Reads as "you got hit going THAT way"
   * (Smash 4 angle indicator generalized).
   */
  dentLine(x: number, y: number, launchAngleDeg: number, length = 22): void {
    const rad = (-launchAngleDeg * Math.PI) / 180;
    const g = this.scene.add.graphics({ x, y }).setDepth(945);
    g.lineStyle(3, 0xffffff, 0.9);
    g.lineBetween(0, 0, Math.cos(rad) * length, Math.sin(rad) * length);
    g.lineStyle(2, 0xff5566, 1);
    g.lineBetween(0, 0, Math.cos(rad) * (length - 4), Math.sin(rad) * (length - 4));
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
  }

  /**
   * Voice pop — random short text burst near victim head ("OOF!", "GAH!",
   * "TCH!"). Cuphead / Smash convention. Provides a narrative hit-feedback
   * channel without requiring voice clips (halal: safe with text only).
   */
  voicePop(x: number, y: number, damage: number): void {
    const heavy = damage >= 13;
    const candidates = heavy ? ['GAH!', 'BLARGH!', 'KKKK!'] : damage >= 7 ? ['OOF!', 'AGH!', 'NGH!'] : ['TCH!', 'UGH!', 'HMP!'];
    const word = candidates[Math.floor(Math.random() * candidates.length)];
    const dx = (Math.random() - 0.5) * 30;
    const text = this.scene.add
      .text(x + dx, y - 30, word, {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontStyle: 'bold',
        fontSize: heavy ? '24px' : '16px',
        color: heavy ? '#ff5566' : '#ffd966',
        stroke: '#000',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(945)
      .setRotation((Math.random() - 0.5) * 0.4);
    this.scene.tweens.add({
      targets: text,
      y: y - 70,
      alpha: 0,
      scale: heavy ? 1.4 : 1.1,
      duration: 480,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy()
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
    // Two-stage flash: a hard 70ms white snap (sells the moment of impact),
    // then a longer-fade tinted overlay in the attacker's hue.
    const snap = this.scene.add
      .rectangle(cam.scrollX + sw / 2, cam.scrollY + sh / 2, sw * 1.4, sh * 1.4, 0xffffff, 0.9)
      .setDepth(2502);
    this.scene.tweens.add({
      targets: snap,
      alpha: 0,
      duration: 110,
      ease: 'Cubic.easeOut',
      onComplete: () => snap.destroy()
    });
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

  /** Floating "+12" damage tick that rises from the victim and fades. */
  damageTick(x: number, y: number, dmg: number): void {
    const intensity = Math.min(1, dmg / 14);
    const tint = dmg >= 13 ? '#ff5050' : dmg >= 8 ? '#ffc24d' : '#e6e8ed';
    const tx = this.scene.add
      .text(x, y - 30, `+${dmg.toFixed(0)}`, {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: `${20 + intensity * 12}px`,
        fontStyle: 'bold',
        color: tint,
        stroke: '#000',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(2300);
    this.scene.tweens.add({
      targets: tx,
      y: y - 70 - intensity * 25,
      alpha: 0,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => tx.destroy()
    });
  }

  landPoof(x: number, y: number): void {
    this.dust(x, y, 5);
  }

  /**
   * Per-skill signature VFX — fired on the first active hit frame of a
   * named move. Each character's distinctive specials gets a unique
   * read-at-a-glance effect that no other move uses, so 100ms of footage
   * tells a viewer "that was Lancer's dolphin slash" or "Skirmisher just
   * vanished".
   *
   * `charId` is optional and lets per-character variants of the same
   * generic move ID (upB / sideB / downB) layer their distinct elemental
   * theme: Lancer = thunder + flame (heated steel knight); Skirmisher =
   * frost + smoke + spark (twin-dagger trickster).
   */
  signatureVFX(moveId: string, x: number, y: number, facing: 1 | -1, accent: number, charId?: string): void {
    switch (moveId) {
      case 'upB':
        if (charId === 'lancer') {
          this.dolphinSlashFX(x, y, facing, accent);
          this.lightningBolt(x, y, x, y - 90, 0xeaf2ff);
        } else {
          this.vanishFX(x, y, facing);
        }
        return;
      case 'fsmash':
        this.heavyChargeBurst(x, y, facing, accent);
        if (charId === 'lancer') this.flameTrail(x, y, facing, 56);
        else if (charId === 'huntress') this.frostShards(x, y, facing);
        return;
      case 'neutralB':
        this.chargeRelease(x, y, facing);
        if (charId === 'huntress') this.iceNeedleGlint(x, y, facing);
        return;
      case 'sideB':
        this.signatureWhip(x, y, facing, accent);
        if (charId === 'huntress') this.sparkTrail(x, y, facing, 80);
        else if (charId === 'lancer') this.flameTrail(x, y, facing, 50);
        return;
      case 'downB':
        this.counterAura(x, y, accent);
        if (charId === 'lancer') this.frostBurst(x, y);
        return;
      case 'dair':
      case 'lancer_dair_spike':
      case 'skirmisher_dair_finisher':
        this.spikeShockwave(x, y);
        if (charId === 'lancer') this.fireCrash(x, y);
        else if (charId === 'huntress') this.fireSpiral(x, y);
        return;
      case 'usmash':
        this.verticalKOFlash(x, y, accent);
        if (charId === 'lancer') this.lightningBolt(x, y, x, y - 110, 0xfff3a8);
        return;
      case 'utilt':
        if (charId === 'lancer') this.flameTrail(x, y - 30, facing, 36, true);
        return;
      case 'fair':
      case 'bair':
        // Light wind-cut for aerials
        this.windCut(x, y, facing, moveId === 'bair' ? -1 : 1);
        return;
    }
  }

  // ============================================================
  //  ELEMENTAL VFX HELPERS
  //  These read as "magic" but stay grounded in physical/mythic
  //  imagery (heated steel, lightning storm, mountain frost, sparks
  //  from clashing metal). Halal-relaxed compatible.
  // ============================================================

  /**
   * Flame trail — orange/yellow flickering particles rising from along
   * a horizontal path (for spear thrusts / chain whips). Particles use
   * negative gravity (rise) and color-shift from yellow → orange → red
   * over their lifetime so it reads as fire physics, not a static trail.
   */
  private flameTrail(x: number, y: number, facing: 1 | -1, length: number, vertical = false): void {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const px = vertical ? x + (Math.random() - 0.5) * 8 : x + facing * t * length;
      const py = vertical ? y - t * length : y + (Math.random() - 0.5) * 6;
      const g = this.scene.add.graphics({ x: px, y: py }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      const r = 4 + Math.random() * 3;
      const c = i < N * 0.4 ? 0xffe04d : i < N * 0.7 ? 0xff7733 : 0xff3322;
      g.fillStyle(c, 0.75).fillCircle(0, 0, r);
      g.fillStyle(0xffffff, 0.5).fillCircle(0, 0, r * 0.4);
      this.scene.tweens.add({
        targets: g,
        y: py - 18 - Math.random() * 14,
        x: px + (Math.random() - 0.5) * 8,
        alpha: 0,
        scale: 0.3,
        duration: 320 + Math.random() * 180,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /**
   * Lightning bolt — recursive midpoint-displacement zigzag from
   * (x1,y1) to (x2,y2). Two-pass render: outer halo (alpha 0.4, 4px) +
   * inner core (alpha 1, 1px). Lives ~80ms — lightning is FAST.
   */
  private lightningBolt(x1: number, y1: number, x2: number, y2: number, color = 0xffffff): void {
    const points = this.midpointDisplace(x1, y1, x2, y2, 4, 24);
    const halo = this.scene.add.graphics().setDepth(47).setBlendMode(Phaser.BlendModes.ADD);
    halo.lineStyle(5, color, 0.45);
    halo.beginPath();
    halo.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) halo.lineTo(points[i].x, points[i].y);
    halo.strokePath();

    const core = this.scene.add.graphics().setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
    core.lineStyle(1.5, 0xffffff, 1);
    core.beginPath();
    core.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) core.lineTo(points[i].x, points[i].y);
    core.strokePath();

    this.scene.tweens.add({
      targets: [halo, core],
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        halo.destroy();
        core.destroy();
      }
    });
  }

  /**
   * Recursive midpoint displacement for lightning paths. Each iteration
   * splits every segment in half and pushes the midpoint perpendicular
   * by a randomized amount (halved each level). Tutsplus 2D-Lightning
   * algorithm in 12 lines.
   */
  private midpointDisplace(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    depth: number,
    sway: number
  ): { x: number; y: number }[] {
    let pts = [
      { x: x1, y: y1 },
      { x: x2, y: y2 }
    ];
    for (let d = 0; d < depth; d++) {
      const next: { x: number; y: number }[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const off = (Math.random() - 0.5) * sway;
        next.push(a, { x: mx + px * off, y: my + py * off });
      }
      next.push(pts[pts.length - 1]);
      pts = next;
      sway *= 0.5;
    }
    return pts;
  }

  /**
   * Frost burst — radial cyan crystal shards flying outward + soft
   * mist ring. For Lancer counter (frozen blade impact) and other
   * "ice-magic" beats.
   */
  private frostBurst(x: number, y: number): void {
    const ring = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    ring.fillStyle(0xcfeefa, 0.5).fillCircle(0, 0, 16);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.3,
      alpha: 0,
      duration: 320,
      onComplete: () => ring.destroy()
    });
    // 8 crystalline diamond shards
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dist = 50;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const g = this.scene.add.graphics({ x, y }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(0xeaf6ff, 0.95);
      g.fillTriangle(-3, -6, 3, -6, 0, 6);
      g.lineStyle(1, 0xffffff, 0.9);
      g.lineBetween(0, -6, 0, 6);
      g.setRotation(ang);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y + dy,
        alpha: 0,
        scale: 0.4,
        duration: 320,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /**
   * Frost shards — narrow cone of ice slivers + chill mist. Used for
   * Skirmisher's spinning dagger fsmash — emphasizes "cold steel".
   */
  private frostShards(x: number, y: number, facing: 1 | -1): void {
    for (let i = 0; i < 6; i++) {
      const ang = (-Math.PI / 2 + (i - 3) * 0.18) * facing;
      const dist = 50 + Math.random() * 30;
      const dx = Math.cos(ang) * dist * facing;
      const dy = Math.sin(ang) * dist - 8;
      const g = this.scene.add.graphics({ x, y }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(0xddf3ff, 0.95);
      g.fillTriangle(-2, -7, 2, -7, 0, 7);
      g.setRotation(ang);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y + dy,
        alpha: 0,
        scale: 0.5,
        duration: 280,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
    // Chill mist drift
    for (let i = 0; i < 4; i++) {
      const g = this.scene.add.graphics({ x: x + (i - 2) * 8, y }).setDepth(44).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(0xa8d8f0, 0.4).fillCircle(0, 0, 6 + Math.random() * 4);
      this.scene.tweens.add({
        targets: g,
        x: x + (Math.random() - 0.5) * 50,
        y: y - 10 - Math.random() * 14,
        alpha: 0,
        scale: 1.6,
        duration: 380,
        onComplete: () => g.destroy()
      });
    }
  }

  /**
   * Smoke + ember — vanish/teleport effect. Dark gray puff with a few
   * orange ember dots, all ascending. Reads as "magical smoke" without
   * crossing into elemental fire.
   */
  private vanishFX(x: number, y: number, _facing: 1 | -1): void {
    // Dark smoke ring
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dist = 18 + Math.random() * 14;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const g = this.scene.add.graphics({ x, y }).setDepth(44);
      g.fillStyle(0x2a2a32, 0.7).fillCircle(0, 0, 8 + Math.random() * 3);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y + dy - 16,
        alpha: 0,
        scale: 1.8,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
    // Orange ember sparks rising
    for (let i = 0; i < 10; i++) {
      const dx = (Math.random() - 0.5) * 30;
      const g = this.scene.add.graphics({ x, y }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(0xffa54a, 0.9).fillCircle(0, 0, 1.5);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y - 30 - Math.random() * 22,
        alpha: 0,
        scale: 0.5,
        duration: 380 + Math.random() * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
    // Bright flash core
    const flash = this.scene.add.graphics({ x, y }).setDepth(47).setBlendMode(Phaser.BlendModes.ADD);
    flash.fillStyle(0xc9ffe0, 0.85).fillCircle(0, 0, 18);
    this.scene.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 220,
      onComplete: () => flash.destroy()
    });
  }

  /** Lancer dolphin slash without lightning (stripped from old fn). */
  private dolphinSlashFX(x: number, y: number, facing: 1 | -1, _accent: number): void {
    const ring = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    ring.lineStyle(4, 0x9affe0, 0.85).strokeCircle(0, 0, 14);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.5,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + ((i - 3) / 3) * 0.6;
      const dist = 50 + Math.random() * 30;
      const dx = Math.cos(ang) * dist * facing;
      const dy = Math.sin(ang) * dist;
      const g = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(0x9affe0, 0.85).fillCircle(0, 0, 3);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y + dy,
        alpha: 0,
        scale: 0.4,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /**
   * Spark trail — bright yellow tiny dots streaking along a path. For
   * sideB chain whip (steel-on-steel sparks).
   */
  private sparkTrail(x: number, y: number, facing: 1 | -1, length: number): void {
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const px = x + facing * t * length;
      const py = y + (Math.random() - 0.5) * 6;
      const g = this.scene.add.graphics({ x: px, y: py }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(0xfff3a8, 0.95).fillCircle(0, 0, 2);
      this.scene.tweens.add({
        targets: g,
        x: px + (Math.random() - 0.5) * 16,
        y: py + 6 + Math.random() * 8,
        alpha: 0,
        scale: 0.4,
        duration: 240 + Math.random() * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /** Ice needle glint — a flash on each thrown needle. */
  private iceNeedleGlint(x: number, y: number, facing: 1 | -1): void {
    for (let i = 0; i < 4; i++) {
      const dx = facing * (10 + i * 14);
      const g = this.scene.add.graphics({ x: x + dx, y }).setDepth(47).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(0xddf3ff, 0.95).fillCircle(0, 0, 3);
      g.fillStyle(0xffffff, 1).fillCircle(0, 0, 1);
      this.scene.tweens.add({
        targets: g,
        scale: 1.4,
        alpha: 0,
        duration: 220 + i * 30,
        delay: i * 30,
        onComplete: () => g.destroy()
      });
    }
  }

  /** Fire crash — orange flame fan when dair connects with ground. */
  private fireCrash(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI + ((i - 5) / 5) * Math.PI * 0.5;
      const dist = 30 + Math.random() * 20;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const g = this.scene.add.graphics({ x, y: y + 18 }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      const r = 3 + Math.random() * 3;
      const c = i < 4 ? 0xffe04d : 0xff5522;
      g.fillStyle(c, 0.85).fillCircle(0, 0, r);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y + 18 + dy * 0.6,
        alpha: 0,
        scale: 0.4,
        duration: 340,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /** Fire spiral — Skirmisher dair drill spike. Tight downward spiral. */
  private fireSpiral(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = 18 + (i % 4) * 4;
      const px = x + Math.cos(ang) * r * 0.5;
      const py = y + 4 + i * 3;
      const g = this.scene.add.graphics({ x: px, y: py }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
      const c = i % 2 === 0 ? 0xffd34d : 0xff5522;
      g.fillStyle(c, 0.85).fillCircle(0, 0, 3);
      this.scene.tweens.add({
        targets: g,
        x: px + Math.cos(ang + Math.PI / 4) * 10,
        y: py + 18,
        alpha: 0,
        scale: 0.3,
        duration: 380,
        delay: i * 8,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /** Wind-cut arc for fast aerials. */
  private windCut(x: number, y: number, facing: 1 | -1, dir: 1 | -1): void {
    const g = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(2, 0xeef6ff, 0.65);
    g.beginPath();
    const arcDir = facing * dir;
    g.arc(0, 0, 44, -Math.PI / 4, Math.PI / 4, arcDir < 0);
    g.strokePath();
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.4,
      duration: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
  }

  /** Mint-blue trail + intangible glow — Lancer dolphin / Sheik vanish. */
  private dolphinSlashOrVanish(x: number, y: number, facing: 1 | -1, accent: number): void {
    const ring = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    ring.lineStyle(4, 0x9affe0, 0.85).strokeCircle(0, 0, 14);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.5,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    // 8 spiraling particles arcing upward
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI / 2 + ((i - 4) / 4) * 0.7;
      const dist = 60 + Math.random() * 30;
      const dx = Math.cos(ang) * dist * facing;
      const dy = Math.sin(ang) * dist;
      const g = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
      g.fillStyle(accent === 0xffd860 ? 0x9affe0 : 0xc9ffe0, 0.85).fillCircle(0, 0, 3);
      this.scene.tweens.add({
        targets: g,
        x: x + dx,
        y: y + dy,
        alpha: 0,
        scale: 0.4,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /** Heavy fsmash charge release — 3 expanding rings. */
  private heavyChargeBurst(x: number, y: number, facing: 1 | -1, color: number): void {
    for (let i = 0; i < 3; i++) {
      const r = this.scene.add.graphics({ x: x + i * 8 * facing, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
      r.lineStyle(3 - i, color, 0.8 - i * 0.2).strokeCircle(0, 0, 10 + i * 6);
      this.scene.tweens.add({
        targets: r,
        scale: 2.5,
        alpha: 0,
        duration: 280 + i * 60,
        ease: 'Cubic.easeOut',
        onComplete: () => r.destroy()
      });
    }
  }

  /** Charge-up energy release — beam-like radial pulses. */
  private chargeRelease(x: number, y: number, facing: 1 | -1): void {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI - Math.PI / 4;
      const g = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
      g.lineStyle(3, 0xfff3a8, 0.85);
      g.lineBetween(0, 0, Math.cos(ang) * 36 * facing, Math.sin(ang) * 36);
      this.scene.tweens.add({
        targets: g,
        alpha: 0,
        scale: 1.6,
        duration: 240,
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  /** SideB whip / chain — long stretched line streak. */
  private signatureWhip(x: number, y: number, facing: 1 | -1, color: number): void {
    const g = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(4, color, 0.85);
    g.lineBetween(0, 0, 80 * facing, -4);
    g.lineStyle(2, 0xffffff, 0.95);
    g.lineBetween(0, 0, 75 * facing, -2);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.3,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
    // Tip glint
    const tip = this.scene.add.graphics({ x: x + 80 * facing, y }).setDepth(46).setBlendMode(Phaser.BlendModes.ADD);
    tip.fillStyle(0xffffff, 1).fillCircle(0, 0, 5);
    tip.fillStyle(color, 0.7).fillCircle(0, 0, 8);
    this.scene.tweens.add({
      targets: tip,
      scale: 2,
      alpha: 0,
      duration: 220,
      onComplete: () => tip.destroy()
    });
  }

  /** Counter active window — colored aura around the parrying fighter. */
  private counterAura(x: number, y: number, color: number): void {
    const aura = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    aura.lineStyle(3, color, 0.7).strokeCircle(0, 0, 28);
    this.scene.tweens.add({
      targets: aura,
      scale: 1.4,
      alpha: 0,
      duration: 320,
      ease: 'Sine.easeOut',
      onComplete: () => aura.destroy()
    });
  }

  /** Dair spike — downward shockwave + dust kick. */
  private spikeShockwave(x: number, y: number): void {
    const wave = this.scene.add.graphics({ x, y: y + 16 }).setDepth(45);
    wave.lineStyle(3, 0xffe04d, 0.85).strokeEllipse(0, 0, 20, 8);
    this.scene.tweens.add({
      targets: wave,
      scaleX: 4,
      scaleY: 1.4,
      alpha: 0,
      duration: 260,
      onComplete: () => wave.destroy()
    });
    this.dust(x, y + 16, 6);
  }

  /** Vertical KO move — upward beam streak. */
  private verticalKOFlash(x: number, y: number, color: number): void {
    const beam = this.scene.add.graphics({ x, y }).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    beam.fillStyle(color, 0.5).fillRect(-8, -100, 16, 100);
    beam.fillStyle(0xffffff, 0.85).fillRect(-3, -100, 6, 100);
    this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      scaleY: 1.4,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => beam.destroy()
    });
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
