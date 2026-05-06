import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
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
import { Pose, addOffset, easings, interpPose } from './skeleton/Pose';
import { makeChain, stepChain, VerletChainState } from './skeleton/Verlet';
import { getAttackPoses } from './skeleton/AttackPoses';

/**
 * Linearly blend pose `a` toward pose `b` by t ∈ [0, 1]. Bones in either
 * pose participate; missing bones in one side hold the value from the
 * other (so partial poses still produce a continuous target).
 */
function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  const keys = new Set<BoneId>([...(Object.keys(a) as BoneId[]), ...(Object.keys(b) as BoneId[])]);
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (av !== undefined && bv !== undefined) out[k] = av + (bv - av) * t;
    else if (av !== undefined) out[k] = av;
    else if (bv !== undefined) out[k] = bv;
  }
  return out;
}

interface PerFighterState {
  bones: Record<BoneId, Bone>;
  cape: VerletChainState;
  banner: VerletChainState | null;
  /** Last drawn anchor (world space) so the verlet rebases smoothly per frame. */
  lastAnchorX: number;
  lastAnchorY: number;
  /** Trail of weapon-tip positions for the swing arc effect. */
  trail: { x: number; y: number }[];
}

const PLAYER_ACCENT: Record<number, number> = {
  0: 0xffd860,
  1: 0x6cb8ff
};

const TRAIL_LEN = 8;

/**
 * Smooth flat-vector fighter renderer. Replaces the rect-stack
 * CodeFighterRenderer that was deleted in Phase 0. Each fighter is
 * drawn as a skeleton of capsules (bones) plus secondary verlet
 * decoration (cape, banner). Helmet, weapon, and shield are layered
 * shape primitives keyed off bone end-points.
 *
 * Aesthetic target: Hollow Knight / Death's Door — flat-vector polygons
 * with ink outlines and painterly shading, NOT pixel art.
 */
export type SignatureCallback = (
  moveId: string,
  worldX: number,
  worldY: number,
  facing: 1 | -1,
  playerIndex: number,
  charId: CharacterId
) => void;

export class FighterRenderer {
  private gfxs: Phaser.GameObjects.Graphics[] = [];
  private trailGfxs: Phaser.GameObjects.Graphics[] = [];
  private state: PerFighterState[] = [];
  /** Optional hook fired on the first active hit frame of every attack. */
  private signatureCallback: SignatureCallback | null = null;

  setSignatureCallback(cb: SignatureCallback): void {
    this.signatureCallback = cb;
  }

  constructor(
    private scene: Phaser.Scene,
    private fighters: Fighter[],
    private characters: CharacterId[]
  ) {
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      const v = ROSTER[characters[i]].visual;
      const bones = defaultSkeleton(f.body.h, f.body.w * v.bodyWidthRatio);
      const cape = makeChain(
        v.cape === 'long' ? 6 : v.cape === 'short' ? 4 : 0,
        { x: f.body.x, y: f.body.y - f.body.h * 0.65 },
        f.body.h * 0.10,
        { gravity: 0.4, friction: 0.96, iterations: 3 }
      );
      const banner = v.weapon === 'spear'
        ? makeChain(4, { x: f.body.x + 50, y: f.body.y - f.body.h * 0.7 }, 6, { gravity: 0.25, friction: 0.97, iterations: 2 })
        : null;
      this.state.push({
        bones,
        cape,
        banner,
        lastAnchorX: f.body.x,
        lastAnchorY: f.body.y,
        trail: []
      });
      const trailGfx = scene.add.graphics().setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
      this.trailGfxs.push(trailGfx);
      this.gfxs.push(scene.add.graphics().setDepth(50));
    }
  }

  draw(tick: number, alpha = 1): void {
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      const v = ROSTER[this.characters[i]].visual;
      const g = this.gfxs[i];
      const tg = this.trailGfxs[i];
      g.clear();
      tg.clear();

      // Render-side interpolation: smooth between the last two physics ticks.
      const x = f.body.prevX + (f.body.x - f.body.prevX) * alpha;
      const y = f.body.prevY + (f.body.y - f.body.prevY) * alpha;

      // Step verlet chains using the actual anchor delta this frame so
      // capes/banners react to motion realistically.
      const stState = this.state[i];
      const capeAnchor = { x, y: y - f.body.h * 0.65 };
      stepChain(stState.cape, capeAnchor);
      if (stState.banner) {
        const ba = { x: x + 50 * f.facing, y: y - f.body.h * 0.7 };
        stepChain(stState.banner, ba);
      }
      stState.lastAnchorX = x;
      stState.lastAnchorY = y;

      // Skip render during invincibility flicker for a brief visual pulse.
      if (f.isInvincible(tick) && Math.floor(tick / 3) % 2 === 1) continue;

      this.drawFighter(g, tg, f, v, x, y, tick, stState, i);
    }
  }

  // ============================================================
  //  CORE DRAW PIPELINE
  // ============================================================
  private drawFighter(
    g: Phaser.GameObjects.Graphics,
    tg: Phaser.GameObjects.Graphics,
    f: Fighter,
    v: CharacterVisual,
    x: number,
    y: number,
    tick: number,
    st: PerFighterState,
    playerIndex: number
  ): void {
    const facing = f.facing;
    // Build the pose for the current state. State-driven pose authoring
    // happens in computePose() — here we just consume it.
    const charId = this.characters[playerIndex];
    const pose = this.computePose(f, v, tick, charId);
    const transforms = solveSkeleton(st.bones, pose);

    // Hitstun jitter — Sakurai's "hold the pose but vibrate 1 px" rule.
    let jx = 0;
    let jy = 0;
    if (f.isHitPaused(tick)) {
      const phase = tick % 2 === 0 ? 1 : -1;
      if (f.body.grounded) jx = phase;
      else jy = phase;
    }
    // Knockback tumble rotation — spin while launched at high speed.
    let tumble = 0;
    if (f.tumbling && !f.body.grounded) {
      const speed = Math.hypot(f.body.vx, f.body.vy);
      if (speed > 8) tumble = (tick * f.body.vx * 0.04) * 0.5;
    }
    // Discrete state squash — jumpsquat / land / dash compress vertically.
    const base = this.deformScale(f, tick);
    let sx = base.sx;
    let sy = base.sy;
    // Hitlag squash — every hit briefly squashes the victim horizontally to
    // sell weight. Lasts only while hitpause is active so the silhouette
    // pops in the freeze frame and recovers as motion resumes.
    if (f.isHitPaused(tick) && f.fsm.is('Hitstun')) {
      sx *= 0.88;
      sy *= 1.06;
    }

    g.save();
    g.translateCanvas(Math.floor(x + jx), Math.floor(y + jy));
    if (tumble !== 0) g.rotateCanvas(tumble);
    if (facing === -1) g.scaleCanvas(-1, 1);
    g.scaleCanvas(sx, sy);

    // Ground shadow
    if (f.body.grounded) {
      g.fillStyle(0x000000, 0.45).fillEllipse(0, 4, f.body.w * 1.05, 7);
    }

    // === Cape (back) ===
    if (st.cape.points.length > 0) this.drawCape(g, v, st.cape, x, y, facing);

    // === Skeleton (back limbs first, then torso, then front limbs) ===
    this.drawSkeleton(g, transforms, v, playerIndex, tick, f);

    // === Weapon at front-hand pivot (drawn after front arm) ===
    this.drawWeapon(g, transforms, v, f, tick);

    // === Smear frame + signature VFX on first active hit ===
    // Pedro Medeiros / Saint11 trick: on the single frame the hitbox first
    // becomes active, draw an elongated weapon ghost in the highlight tone
    // along the swing direction. Plus per-skill signature VFX (vanish puff,
    // counter aura, etc) that read as character identity at a glance.
    if (f.fsm.is('Attack') && f.pendingMove) {
      const phase = tick - f.pendingMove.startedAtTick;
      const move = f.pendingMove.move;
      const firstHit = move.frames.find((fr) => fr.hitboxes.length > 0)?.frame ?? -1;
      if (phase === firstHit && firstHit >= 0) {
        this.drawSmearFrame(g, transforms, v);
        // Hand-off to scene-level VFX system if registered. Caller wires
        // a `signatureFx` callback at construction; we invoke it now in
        // world-space so VFX can spawn on the main camera.
        if (this.signatureCallback) {
          this.signatureCallback(move.id, x, y - f.body.h * 0.45, f.facing, playerIndex, charId);
        }
      }
    }

    // === Shield (off-hand back) ===
    if (v.shield !== 'none') this.drawShield(g, transforms, v);

    // === Hit feedback overlays ===
    if (f.isHitPaused(tick) && f.fsm.is('Hitstun')) {
      const dims = this.silhouetteRect(transforms);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(dims.x, dims.y, dims.w, dims.h);
    } else if (f.fsm.is('Hitstun') && Math.floor(tick / 3) % 2 === 0) {
      const dims = this.silhouetteRect(transforms);
      g.lineStyle(2, 0xff4040, 0.7);
      g.strokeRect(dims.x, dims.y, dims.w, dims.h);
    }
    if (f.fsm.is('Parry')) {
      const dims = this.silhouetteRect(transforms);
      g.lineStyle(2, 0x9ae0ff, 0.9);
      g.strokeRect(dims.x - 3, dims.y - 3, dims.w + 6, dims.h + 6);
    }
    if (f.fsm.is('Shield')) {
      // Shield bubble — radius scales with remaining shieldHP so a low
      // shield reads as small + dim before it breaks.
      const hpFrac = Math.max(0, Math.min(1, f.shieldHP / 100));
      const radius = 22 + hpFrac * 18;
      const tint = hpFrac > 0.55 ? 0x9ae0ff : hpFrac > 0.25 ? 0xffd34d : 0xff7755;
      g.fillStyle(tint, 0.20);
      g.fillCircle(0, -f.body.h * 0.5, radius);
      g.lineStyle(2, tint, 0.85);
      g.strokeCircle(0, -f.body.h * 0.5, radius);
    }
    if (f.fsm.is('ShieldBreak')) {
      const dims = this.silhouetteRect(transforms);
      g.lineStyle(3, 0xff5050, 0.9);
      g.strokeRect(dims.x - 4, dims.y - 4, dims.w + 8, dims.h + 8);
    }

    g.restore();

    // === Weapon tip trail (drawn into separate ADD-blend layer) ===
    this.updateAndDrawTrail(tg, f, v, transforms, x, y, st);
  }

  /** Compute pose rotations for the current FSM state + animation phase. */
  private computePose(f: Fighter, v: CharacterVisual, tick: number, charId: CharacterId): Pose {
    // Stepped animation phase — limbs animate at ~10 fps for a hand-drawn
    // feel, while game-feel timers run at full 60 Hz.
    const STEP = 6;
    const stepTick = Math.floor(tick / STEP);

    // Base pose (idle stance) modulated by archetype-driven breathing.
    const idlePeriod = f.stats.weight >= 100 ? 96 : f.stats.weight <= 82 ? 36 : 60;
    const idleSlot = Math.floor((tick % idlePeriod) / Math.max(1, idlePeriod / 4));
    const breath = [0, -0.025, -0.025, 0][idleSlot] ?? 0;

    const base: Pose = {
      torso: -Math.PI / 2 + breath,
      neck: -Math.PI / 2,
      head: -Math.PI / 2 + breath * 0.5,
      shoulderBack: 1.05,
      elbowBack: 0.5,
      shoulderFront: -0.78 + (v.idleLean ?? 0) * 0.4,
      elbowFront: 0.4,
      hipBack: Math.PI / 2 + 0.18,
      kneeBack: 0,
      hipFront: Math.PI / 2 - 0.18,
      kneeFront: 0
    };

    if (f.fsm.is('Run') || f.fsm.is('Dash') || f.fsm.is('Walk')) {
      const speedRatio = Math.min(1, Math.abs(f.body.vx) / f.stats.runSpeed);
      const phase = Math.sin(stepTick * 0.45 * STEP) * speedRatio;
      base.hipFront = Math.PI / 2 - 0.18 - phase * 0.35;
      base.hipBack = Math.PI / 2 + 0.18 + phase * 0.35;
      base.kneeFront = -Math.max(0, phase) * 0.6;
      base.kneeBack = -Math.max(0, -phase) * 0.6;
      base.shoulderFront = -0.78 + phase * 0.25;
      base.shoulderBack = 1.05 - phase * 0.25;
      base.torso = -Math.PI / 2 + 0.05;
      // Head bob — body bobs UP twice per leg cycle (when both legs are
      // mid-step). Out of phase with leg-pump (sin → cos) so head dips
      // when foot strikes. Real walk-cycle physics in 2 lines.
      const bobAmt = Math.abs(Math.cos(stepTick * 0.45 * STEP)) * speedRatio * 0.04;
      base.head = -Math.PI / 2 + bobAmt;
      base.neck = -Math.PI / 2 + bobAmt * 0.5;
    } else if (f.fsm.is('Crouch') || f.fsm.is('JumpSquat')) {
      base.hipBack = Math.PI / 2 + 0.55;
      base.hipFront = Math.PI / 2 - 0.55;
      base.kneeBack = -1.0;
      base.kneeFront = -1.0;
      base.torso = -Math.PI / 2 - 0.15;
      base.shoulderFront = -0.4;
      base.shoulderBack = 0.6;
    } else if (!f.body.grounded && (f.fsm.is('Jump') || f.fsm.is('Fall') || f.fsm.is('Helpless'))) {
      // Aerial — tuck legs slightly, arms drift.
      base.hipBack = Math.PI / 2 + 0.10;
      base.hipFront = Math.PI / 2 - 0.10;
      base.kneeBack = -0.45;
      base.kneeFront = -0.45;
      base.shoulderFront = -0.55;
      base.shoulderBack = 0.85;
    } else if (f.fsm.is('Hitstun')) {
      // Body folds backward, arms flail.
      base.torso = -Math.PI / 2 + 0.3;
      base.shoulderFront = 1.5;
      base.shoulderBack = 1.7;
      base.kneeFront = -0.35;
      base.kneeBack = -0.35;
    } else if (f.fsm.is('Attack') && f.pendingMove) {
      const phase = tick - f.pendingMove.startedAtTick;
      const move = f.pendingMove.move;
      const firstHit = move.frames.find((fr) => fr.hitboxes.length > 0)?.frame ?? Math.floor(move.totalFrames * 0.4);
      const lastHit = [...move.frames].reverse().find((fr) => fr.hitboxes.length > 0)?.frame ?? firstHit;
      const recoveryEnd = move.iasaFrame ?? move.totalFrames;

      // Look up the per-character per-attack pose table. If absent, fall
      // back to a single generic anticipation→active→follow-through curve
      // that mirrors the previous behavior (so any new move that ships
      // before its pose is authored still animates reasonably).
      const keyPoses = getAttackPoses(charId, move.id);
      const restPose: Pose = {
        shoulderFront: -0.78 + (v.idleLean ?? 0) * 0.4,
        elbowFront: 0.4,
        shoulderBack: 1.05,
        elbowBack: 0.5,
        torso: -Math.PI / 2,
        hipBack: Math.PI / 2 + 0.18,
        hipFront: Math.PI / 2 - 0.18,
        kneeBack: 0,
        kneeFront: 0
      };
      const anticipation: Pose = keyPoses?.anticipation ?? {
        shoulderFront: v.windupArmAngle ?? -1.4,
        elbowFront: 0.6,
        torso: -Math.PI / 2 - 0.08
      };
      const active: Pose = keyPoses?.active ?? {
        shoulderFront: 0.15,
        elbowFront: 0.05,
        torso: -Math.PI / 2 + 0.10
      };
      const followThrough: Pose = keyPoses?.followThrough ?? restPose;

      if (phase < firstHit) {
        const t = easings.easeOutCubic(phase / Math.max(1, firstHit));
        Object.assign(base, blendPoses(restPose, anticipation, t));
      } else if (phase <= lastHit) {
        // Snap-to-active for crisp commit (no easing — Sakurai canon).
        Object.assign(base, active);
      } else {
        const t = easings.easeOutBack(
          Math.min(1, (phase - lastHit) / Math.max(1, recoveryEnd - lastHit)),
          1.4
        );
        Object.assign(base, blendPoses(active, followThrough, t));
      }
    }

    return base;
  }

  private deformScale(f: Fighter, tick: number): { sx: number; sy: number } {
    if (f.fsm.is('JumpSquat')) {
      const t = (tick - f.fsm.enterTick) / Math.max(1, f.stats.jumpSquatFrames);
      const k = Phaser.Math.Clamp(t, 0, 1);
      return { sx: 1 + 0.2 * (1 - k), sy: 1 - 0.18 * (1 - k) };
    }
    if (f.fsm.is('Land')) {
      const t = (tick - f.fsm.enterTick) / 6;
      const k = Phaser.Math.Clamp(t, 0, 1);
      return { sx: 1 + 0.25 * (1 - k), sy: 1 - 0.22 * (1 - k) };
    }
    if (f.fsm.is('Dash')) return { sx: 0.95, sy: 1.04 };
    if (f.fsm.is('DodgeRoll')) return { sx: 1.08, sy: 0.93 };
    // Velocity-driven stretch (mild)
    const stretch = Phaser.Math.Clamp(-f.body.vy / 30, -0.04, 0.06);
    return { sx: 1 - stretch * 0.4, sy: 1 + stretch };
  }

  // ============================================================
  //  SKELETON / CAPSULE DRAWING
  // ============================================================
  private drawSkeleton(
    g: Phaser.GameObjects.Graphics,
    tr: Record<BoneId, BoneTransform>,
    v: CharacterVisual,
    playerIndex: number,
    tick: number,
    f: Fighter
  ): void {
    const accent = PLAYER_ACCENT[playerIndex] ?? 0xffffff;
    const palette = this.tones(v, accent);

    // Sort bones by z-order so back limbs are drawn first.
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
        this.drawTorso(g, t, palette, v);
      } else if (id === 'neck') {
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, t.radius, palette.dark, palette.outline);
      } else if (id === 'hipBack' || id === 'hipFront') {
        const back = id === 'hipBack';
        const knee = back ? tr.kneeBack : tr.kneeFront;
        const baseR = t.radius;
        const kneeR = baseR * 0.78; // narrower at knee — thigh tapers
        const c = back ? palette.darkShade : palette.dark;
        const hi = back ? undefined : palette.darkHi;
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, baseR, c, palette.outline, kneeR, hi);
        // joint disc at knee
        g.fillStyle(palette.outline, 1).fillCircle(knee.startX, knee.startY, kneeR + 0.5);
        g.fillStyle(c, 1).fillCircle(knee.startX, knee.startY, kneeR - 0.5);
        if (!back) {
          g.fillStyle(palette.accent, 0.7);
          g.fillTriangle(knee.startX - 3, knee.startY + 1, knee.startX + 3, knee.startY + 1, knee.startX, knee.startY + 5);
        }
      } else if (id === 'kneeBack' || id === 'kneeFront') {
        const back = id === 'kneeBack';
        const c = back ? palette.darkShade : palette.dark;
        const hi = back ? undefined : palette.darkHi;
        const startR = t.radius * 0.92;
        const endR = t.radius * 0.98; // ankle slightly thicker for boot taper
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, startR, c, palette.outline, endR, hi);
      } else if (id === 'footBack' || id === 'footFront') {
        // Boot — fancier wedge: heel + toe taper, lit top edge, dark sole.
        const back = id === 'footBack';
        const baseColor = back ? palette.darkShade : palette.darkHi;
        // outline
        g.fillStyle(palette.outline, 1).fillEllipse(t.startX, t.startY + 2, t.radius * 2.8, t.radius * 1.8);
        // sole shadow
        g.fillStyle(0x0a0a14, 0.7).fillEllipse(t.startX, t.startY + 4, t.radius * 2.6, 5);
        // boot body
        g.fillStyle(baseColor, 1).fillEllipse(t.startX, t.startY + 1, t.radius * 2.4, t.radius * 1.4);
        // lit top
        if (!back) {
          g.fillStyle(palette.bodyHi, 0.55).fillEllipse(t.startX - 1, t.startY - 1, t.radius * 1.8, t.radius * 0.7);
        }
        // toe-cap
        g.fillStyle(palette.accent, 0.85).fillRect(t.startX + (back ? -t.radius * 1.0 : t.radius * 0.4), t.startY - 1, t.radius * 0.6, 3);
      } else if (id === 'shoulderBack' || id === 'shoulderFront') {
        const back = id === 'shoulderBack';
        const upper = back ? tr.shoulderBack : tr.shoulderFront;
        const elb = back ? tr.elbowBack : tr.elbowFront;
        const armColor = back ? palette.bodyShade : palette.body;
        // pauldron disc at shoulder — tiered: outline → mid → highlight
        g.fillStyle(palette.outline, 1).fillCircle(upper.startX, upper.startY, upper.radius + 1.5);
        g.fillStyle(armColor, 1).fillCircle(upper.startX, upper.startY, upper.radius + 0.5);
        g.fillStyle(palette.bodyHi, 0.7).fillCircle(upper.startX - 2, upper.startY - 2, upper.radius * 0.55);
        // shoulder rivets
        if (!back) {
          g.fillStyle(palette.metalAccent, 0.9).fillCircle(upper.startX - 3, upper.startY + 2, 1);
          g.fillStyle(palette.metalAccent, 0.9).fillCircle(upper.startX + 3, upper.startY + 2, 1);
        }
        // upper arm tapers narrower at elbow
        const upR = upper.radius;
        const elbR = upper.radius * 0.85;
        this.drawCapsule(g, upper.startX, upper.startY, upper.endX, upper.endY, upR, armColor, palette.outline, elbR, back ? undefined : palette.bodyHi);
        // elbow disc
        g.fillStyle(palette.outline, 1).fillCircle(elb.startX, elb.startY, elbR + 0.5);
        g.fillStyle(armColor, 1).fillCircle(elb.startX, elb.startY, elbR - 0.5);
      } else if (id === 'elbowBack' || id === 'elbowFront') {
        const back = id === 'elbowBack';
        const armColor = back ? palette.bodyShade : palette.body;
        // Forearm — slightly narrower at wrist (taper)
        const startR = t.radius;
        const endR = t.radius * 0.88;
        this.drawCapsule(g, t.startX, t.startY, t.endX, t.endY, startR, armColor, palette.outline, endR, back ? undefined : palette.bodyHi);
      } else if (id === 'handBack' || id === 'handFront') {
        const back = id === 'handBack';
        const handColor = back ? this.tintBlend(palette.dark, 0x000000, 0.3) : palette.dark;
        // gauntlet — outline + dark fill + highlight knuckle pad
        g.fillStyle(palette.outline, 1).fillCircle(t.startX, t.startY, t.radius);
        g.fillStyle(handColor, 1).fillCircle(t.startX, t.startY, t.radius - 1);
        g.fillStyle(palette.darkHi, 0.5).fillCircle(t.startX - 1, t.startY - 1, t.radius * 0.45);
        // 3 knuckle dots
        if (!back) {
          for (let k = 0; k < 3; k++) {
            g.fillStyle(palette.metalAccent, 0.6).fillCircle(t.startX - 3 + k * 2, t.startY - 3, 0.7);
          }
        }
        // wrist accent ring
        g.lineStyle(1.5, palette.accent, 0.85).strokeCircle(t.startX, t.startY, t.radius - 0.3);
        g.lineStyle(0, 0, 0);
      }
    }

    // Draw helmet at the head bone end-point.
    this.drawHelmet(g, tr.head, v, palette, tick, f);
  }

  private drawTorso(
    g: Phaser.GameObjects.Graphics,
    t: BoneTransform,
    palette: ToneSet,
    v: CharacterVisual
  ): void {
    // Build a 6-vertex breastplate polygon along the torso bone vector.
    // Wider at shoulders, narrowing to waist with hip flare. Hand-tuned
    // to read as "armored" rather than "egg".
    const sx = t.startX;
    const sy = t.startY; // pelvis end (top of hips)
    const ex = t.endX;
    const ey = t.endY; // chest end (top of shoulders)
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Unit perpendicular vector (90° CCW)
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

    // Outline pass — slightly enlarged.
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

    // Body fill
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

    // Right-half shadow band — single gradient band along the right edge.
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

    // Pectoral plate ovals — classic medieval breastplate.
    const cmidX = sx + dx * 0.65;
    const cmidY = sy + dy * 0.65;
    const pecW = chestW * 0.5;
    const pecH = len * 0.30;
    g.fillStyle(palette.bodyHi, 0.55).fillEllipse(cmidX - px * pecW * 0.55, cmidY - py * pecW * 0.55, pecW, pecH);
    g.fillStyle(palette.bodyHi, 0.55).fillEllipse(cmidX + px * pecW * 0.55, cmidY + py * pecW * 0.55, pecW, pecH);
    // Pec plate outlines — fine line trace gives the edge between plates
    g.lineStyle(0.8, palette.outline, 0.55).strokeEllipse(cmidX - px * pecW * 0.55, cmidY - py * pecW * 0.55, pecW, pecH);
    g.strokeEllipse(cmidX + px * pecW * 0.55, cmidY + py * pecW * 0.55, pecW, pecH);
    g.lineStyle(0, 0, 0);

    // Vertical chest seam — single line down the middle of the breastplate
    // (where two halves of plate armor join). Reads as armor detail at any
    // size and gives the silhouette an obvious centerline.
    g.lineStyle(1, palette.bodyShade, 0.85);
    g.lineBetween(sx + dx * 0.95, sy + dy * 0.95, sx + dx * 0.30, sy + dy * 0.30);
    g.lineStyle(0, 0, 0);

    // Rivet pattern — 4 small dots arranged around the chest periphery.
    // Real medieval breastplate had rivets at corners; we simulate with
    // metalAccent dots placed along the armor seam edges.
    const rivets: Array<[number, number]> = [
      [sx + dx * 0.85 + px * shoulderW * 0.7, sy + dy * 0.85 + py * shoulderW * 0.7],
      [sx + dx * 0.85 - px * shoulderW * 0.7, sy + dy * 0.85 - py * shoulderW * 0.7],
      [sx + dx * 0.55 + px * chestW * 0.85, sy + dy * 0.55 + py * chestW * 0.85],
      [sx + dx * 0.55 - px * chestW * 0.85, sy + dy * 0.55 - py * chestW * 0.85]
    ];
    for (const [rx, ry] of rivets) {
      g.fillStyle(palette.outline, 1).fillCircle(rx, ry, 1.4);
      g.fillStyle(palette.metalAccent, 1).fillCircle(rx, ry, 0.8);
    }

    // Belt — ellipse at waist.
    const wcenterX = sx + dx * 0.30;
    const wcenterY = sy + dy * 0.30;
    g.fillStyle(palette.outline, 1).fillEllipse(wcenterX, wcenterY, waistW * 2 + 2, 6);
    g.fillStyle(palette.accent, 1).fillEllipse(wcenterX, wcenterY, waistW * 2, 5);
    g.fillStyle(palette.metalAccent, 1).fillCircle(wcenterX, wcenterY, 2);
    g.fillStyle(palette.outline, 1).fillCircle(wcenterX, wcenterY + 0.5, 1);

    // Shoulder accent cuff at the shoulders (lit edge band)
    g.fillStyle(palette.bodyHi, 0.9);
    g.beginPath();
    g.lineTo(w0.x + px * 0.3, w0.y + py * 0.3);
    g.lineTo(w1.x - px * 0.3, w1.y - py * 0.3);
    g.lineTo(w1.x - px * 0.3 + dx * 0.05, w1.y - py * 0.3 + dy * 0.05);
    g.lineTo(w0.x + px * 0.3 + dx * 0.05, w0.y + py * 0.3 + dy * 0.05);
    g.closePath();
    g.fillPath();

    void v; // visual reserved for future ornamentation hooks
  }

  // ============================================================
  //  HELMET
  // ============================================================
  private drawHelmet(
    g: Phaser.GameObjects.Graphics,
    head: BoneTransform,
    v: CharacterVisual,
    palette: ToneSet,
    tick: number,
    _f: Fighter
  ): void {
    const cx = head.endX;
    const cy = head.endY - head.radius * 0.25;
    const r = head.radius;

    // Visor — common to all helmet types except hooded/skull.
    const drawVisor = (): void => {
      g.fillStyle(0x000000, 1).fillRect(cx - r * 0.55, cy - r * 0.05, r * 1.1, 4);
      const pulse = (Math.sin(tick * 0.12) + 1) * 0.5;
      g.fillStyle(0xffd84a, 0.55 + pulse * 0.4);
      g.fillRect(cx - r * 0.32, cy - r * 0.05 + 1, 2, 2);
      g.fillStyle(0xffd84a, 0.55 + pulse * 0.4);
      g.fillRect(cx + r * 0.30, cy - r * 0.05 + 1, 2, 2);
    };

    switch (v.helmet) {
      case 'pointed': {
        // Conical helm — flat brim disc + cone tip + trim ring.
        const brimY = cy + r * 0.30;
        // Outline cone
        g.fillStyle(palette.outline, 1);
        g.fillTriangle(cx - r * 1.1, brimY, cx + r * 1.1, brimY, cx, cy - r * 1.4);
        // Cone fill
        g.fillStyle(palette.body, 1);
        g.fillTriangle(cx - r, brimY, cx + r, brimY, cx, cy - r * 1.3);
        // Highlight ridge
        g.fillStyle(palette.bodyHi, 0.85);
        g.fillTriangle(cx - r * 0.3, brimY, cx, cy - r * 1.3, cx - r * 0.05, brimY);
        // Brim
        g.fillStyle(palette.outline, 1).fillEllipse(cx, brimY, r * 2.2, 6);
        g.fillStyle(palette.accent, 1).fillEllipse(cx, brimY, r * 2.0, 5);
        drawVisor();
        if (v.plumeColor !== undefined) this.drawPlume(g, v.plumeColor, palette, cx, cy - r * 1.3, r);
        break;
      }
      case 'hooded': {
        // Hood polygon — drapes outward and downward.
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
        // Inner shadow under the hood lip
        g.fillStyle(palette.bodyShade, 0.7);
        g.fillRect(cx - r * 0.9, cy + r * 0.05, r * 1.8, 3);
        // Dark void where face would be
        g.fillStyle(0x0a0a14, 1).fillRect(cx - r * 0.55, cy + r * 0.10, r * 1.1, r * 0.7);
        // Glowing eye dots
        const pulse = (Math.sin(tick * 0.12) + 1) * 0.5;
        g.fillStyle(0xffd84a, 0.5 + pulse * 0.4);
        g.fillRect(cx - r * 0.30, cy + r * 0.30, 2, 2);
        g.fillStyle(0xffd84a, 0.5 + pulse * 0.4);
        g.fillRect(cx + r * 0.28, cy + r * 0.30, 2, 2);
        break;
      }
      default: {
        // Generic dome — bucket / horned / crowned / feathered fall here
        // for now. The character roster currently only references pointed
        // and hooded; extra helmet variants come back online when more
        // characters are added.
        g.fillStyle(palette.outline, 1).fillEllipse(cx, cy, r * 2.05, r * 1.95);
        g.fillStyle(palette.body, 1).fillEllipse(cx, cy, r * 2, r * 1.9);
        g.fillStyle(palette.bodyHi, 0.85).fillEllipse(cx - r * 0.3, cy - r * 0.4, r * 0.7, r * 0.85);
        g.fillStyle(palette.bodyShade, 0.5).fillEllipse(cx, cy + r * 0.4, r * 1.6, r * 0.85);
        drawVisor();
        if (v.plumeColor !== undefined) this.drawPlume(g, v.plumeColor, palette, cx, cy - r * 0.95, r);
      }
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

  // ============================================================
  //  WEAPON & SHIELD
  // ============================================================
  private drawWeapon(
    g: Phaser.GameObjects.Graphics,
    tr: Record<BoneId, BoneTransform>,
    v: CharacterVisual,
    f: Fighter,
    tick: number
  ): void {
    if (v.weapon === 'none') return;
    const hand = tr.handFront;
    const elbow = tr.elbowFront;
    const dx = hand.startX - elbow.endX;
    const dy = hand.startY - elbow.endY;
    // Weapon grip orientation = continuation of the forearm vector.
    const angle = Math.atan2(elbow.endY - elbow.startY, elbow.endX - elbow.startX);
    g.save();
    g.translateCanvas(hand.startX, hand.startY);
    g.rotateCanvas(angle);

    const grip = v.weaponGrip;
    const metal = v.weaponMetal;
    const sheen = 0xffffff;
    const dark = 0x0a0a14;
    switch (v.weapon) {
      case 'spear': {
        // Pole — outline + grip + leather wraps for grip texture
        g.fillStyle(dark, 1).fillRect(-5, -2, 56, 4);
        g.fillStyle(grip, 1).fillRect(-4, -1.5, 54, 3);
        // Grip wraps — 3 darker bands (leather wrapping detail)
        g.fillStyle(dark, 0.6);
        g.fillRect(2, -1.5, 2, 3);
        g.fillRect(10, -1.5, 2, 3);
        g.fillRect(18, -1.5, 2, 3);
        // Banner wrap below tip — accent color flag tied to spear
        g.fillStyle(dark, 1).fillRect(40, -3, 4, 6);
        const bannerColor = v.plumeColor ?? 0xc94a4a;
        g.fillStyle(bannerColor, 0.95);
        g.fillTriangle(40, 3, 40, 12, 32, 8);
        g.fillStyle(0xffffff, 0.3).fillTriangle(40, 4, 40, 8, 36, 7);
        // Spear head — leaf-shaped tip with cross piece
        g.fillStyle(dark, 1).fillRect(48, -2, 4, 4);
        g.fillStyle(metal, 1).fillRect(49, -1.5, 3, 3);
        // Tip with mid ridge
        g.fillStyle(dark, 1).fillTriangle(50, -7, 50, 7, 64, 0);
        g.fillStyle(metal, 1).fillTriangle(51, -6, 51, 6, 62, 0);
        // Mid ridge highlight
        g.fillStyle(0xffffff, 0.7).fillRect(53, -0.5, 7, 1);
        g.fillStyle(sheen, 0.4).fillRect(53, -2, 5, 1);
        break;
      }
      case 'dagger': {
        // Pommel — round cap with jewel
        g.fillStyle(dark, 1).fillCircle(-9, 0, 3);
        g.fillStyle(grip, 1).fillCircle(-9, 0, 2.5);
        g.fillStyle(0xffd34d, 0.9).fillCircle(-9, 0, 1.2);
        // Grip with leather wrap bands
        g.fillStyle(dark, 1).fillRect(-7, -2, 7, 4);
        g.fillStyle(grip, 1).fillRect(-6, -1.5, 6, 3);
        g.fillStyle(dark, 0.6).fillRect(-4, -1.5, 1, 3);
        g.fillStyle(dark, 0.6).fillRect(-1, -1.5, 1, 3);
        // Crossguard — protruding tab below grip
        g.fillStyle(dark, 1).fillRect(-1, -4, 3, 8);
        g.fillStyle(metal, 1).fillRect(0, -3, 2, 6);
        // Blade
        g.fillStyle(dark, 1).fillRect(0, -3, 16, 6);
        g.fillStyle(dark, 1).fillTriangle(16, -3, 16, 3, 22, 0);
        g.fillStyle(metal, 1).fillRect(1, -2, 14, 4);
        g.fillStyle(metal, 1).fillTriangle(15, -2, 15, 2, 21, 0);
        // Fuller (groove down center) + sheen
        g.fillStyle(dark, 0.4).fillRect(2, -0.5, 12, 1);
        g.fillStyle(sheen, 0.5).fillRect(2, -2, 12, 1);
        break;
      }
      case 'sword': {
        // Pommel
        g.fillStyle(dark, 1).fillCircle(-11, 0, 3);
        g.fillStyle(metal, 1).fillCircle(-11, 0, 2.5);
        // Grip
        g.fillStyle(dark, 1).fillRect(-9, -3, 9, 6);
        g.fillStyle(grip, 1).fillRect(-8, -2, 8, 4);
        g.fillStyle(dark, 0.6).fillRect(-6, -2, 1, 4);
        g.fillStyle(dark, 0.6).fillRect(-3, -2, 1, 4);
        // Crossguard — wider with end caps
        g.fillStyle(dark, 1).fillRect(-3, -8, 5, 16);
        g.fillStyle(metal, 1).fillRect(-2, -7, 3, 14);
        g.fillStyle(0xffd34d, 0.9).fillCircle(-1, -7, 1.2);
        g.fillStyle(0xffd34d, 0.9).fillCircle(-1, 7, 1.2);
        // Blade with fuller
        g.fillStyle(dark, 1).fillRect(0, -3, 32, 6);
        g.fillStyle(dark, 1).fillTriangle(32, -3, 32, 3, 39, 0);
        g.fillStyle(metal, 1).fillRect(1, -2, 30, 4);
        g.fillStyle(metal, 1).fillTriangle(31, -2, 31, 2, 38, 0);
        g.fillStyle(dark, 0.45).fillRect(2, -0.5, 28, 1);
        g.fillStyle(sheen, 0.55).fillRect(2, -2, 28, 1);
        break;
      }
      default:
        g.fillStyle(grip, 1).fillRect(-2, -1, 24, 2);
    }
    void f;
    void tick;
    g.restore();
  }

  /**
   * Smear frame — drawn on the single tick the active hitbox first appears.
   * Stretches the weapon along the swing arc (elbow→hand→tip) to read as
   * motion blur. Two ghost passes (mid-tone + bright highlight) layered to
   * give a directional "whoosh".
   *
   * Hand-rotated like drawWeapon so the smear inherits the active pose.
   */
  private drawSmearFrame(
    g: Phaser.GameObjects.Graphics,
    tr: Record<BoneId, BoneTransform>,
    v: CharacterVisual
  ): void {
    if (v.weapon === 'none') return;
    const hand = tr.handFront;
    const elbow = tr.elbowFront;
    const angle = Math.atan2(elbow.endY - elbow.startY, elbow.endX - elbow.startX);
    const reach = (() => {
      switch (v.weapon) {
        case 'spear': return 56;
        case 'twohand': return 44;
        case 'sword': return 32;
        case 'axe': return 36;
        case 'mace': return 24;
        case 'dagger': return 16;
        case 'bow': return 14;
        default: return 12;
      }
    })();
    g.save();
    g.translateCanvas(hand.startX, hand.startY);
    g.rotateCanvas(angle);
    // Two stretched ghost wedges along the swing direction. Outer wedge =
    // weapon metal tone at low alpha, inner core = white highlight.
    const len = reach * 1.6;
    const wid = 7;
    g.fillStyle(v.weaponMetal, 0.55);
    g.fillTriangle(0, -wid, 0, wid, len, 0);
    g.fillStyle(0xffffff, 0.75);
    g.fillTriangle(2, -wid * 0.55, 2, wid * 0.55, len * 0.85, 0);
    // Trailing arc behind the weapon hand (negative direction) for a
    // ghost-tail read on heavy/sweeping moves.
    g.fillStyle(v.weaponMetal, 0.30);
    g.fillTriangle(0, -wid * 0.65, 0, wid * 0.65, -len * 0.45, 0);
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

  // ============================================================
  //  CAPE (verlet chain)
  // ============================================================
  private drawCape(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    cape: VerletChainState,
    fighterX: number,
    fighterY: number,
    facing: 1 | -1
  ): void {
    if (cape.points.length < 2) return;
    // Render a tapered ribbon along the chain. Cape origin is at the
    // fighter's neck-back. Width tapers from ~24 to ~8 along the length.
    const halfBase = 14;
    const halfTip = 6;
    g.fillStyle(0x0a0a14, 1);
    g.beginPath();
    for (let i = 0; i < cape.points.length; i++) {
      const p = cape.points[i];
      const t = i / (cape.points.length - 1);
      const halfW = halfBase * (1 - t) + halfTip * t;
      // Convert world space → fighter local space + facing flip.
      const lx = (p.x - fighterX) * facing;
      const ly = p.y - fighterY;
      g.lineTo(lx - halfW - 1, ly);
    }
    for (let i = cape.points.length - 1; i >= 0; i--) {
      const p = cape.points[i];
      const t = i / (cape.points.length - 1);
      const halfW = halfBase * (1 - t) + halfTip * t;
      const lx = (p.x - fighterX) * facing;
      const ly = p.y - fighterY;
      g.lineTo(lx + halfW + 1, ly);
    }
    g.closePath();
    g.fillPath();
    // Cape body
    g.fillStyle(v.capeColor, 0.95);
    g.beginPath();
    for (let i = 0; i < cape.points.length; i++) {
      const p = cape.points[i];
      const t = i / (cape.points.length - 1);
      const halfW = halfBase * (1 - t) + halfTip * t;
      const lx = (p.x - fighterX) * facing;
      const ly = p.y - fighterY;
      g.lineTo(lx - halfW, ly);
    }
    for (let i = cape.points.length - 1; i >= 0; i--) {
      const p = cape.points[i];
      const t = i / (cape.points.length - 1);
      const halfW = halfBase * (1 - t) + halfTip * t;
      const lx = (p.x - fighterX) * facing;
      const ly = p.y - fighterY;
      g.lineTo(lx + halfW, ly);
    }
    g.closePath();
    g.fillPath();
  }

  // ============================================================
  //  WEAPON TIP TRAIL
  // ============================================================
  private updateAndDrawTrail(
    tg: Phaser.GameObjects.Graphics,
    f: Fighter,
    v: CharacterVisual,
    tr: Record<BoneId, BoneTransform>,
    fighterX: number,
    fighterY: number,
    st: PerFighterState
  ): void {
    const isSwinging = f.fsm.is('Attack') && f.pendingMove !== null && f.pendingMove.move.category !== 'special';
    if (isSwinging) {
      // Estimate weapon tip world position from front-arm transforms.
      const facing = f.facing;
      const reach = this.weaponReach(v);
      const elbow = tr.elbowFront;
      const angle = Math.atan2(elbow.endY - elbow.startY, elbow.endX - elbow.startX);
      const tipLocalX = tr.handFront.startX + Math.cos(angle) * reach;
      const tipLocalY = tr.handFront.startY + Math.sin(angle) * reach;
      const tipX = fighterX + tipLocalX * facing;
      const tipY = fighterY + tipLocalY;
      st.trail.push({ x: tipX, y: tipY });
      if (st.trail.length > TRAIL_LEN) st.trail.shift();
    } else if (st.trail.length > 0) {
      st.trail.shift();
    }
    if (st.trail.length < 2) return;
    const color = v.weaponMetal ?? 0xeeeeee;
    for (let k = 1; k < st.trail.length; k++) {
      const t = k / st.trail.length;
      tg.lineStyle(1.5 + t * 3, color, 0.05 + t * 0.6);
      tg.lineBetween(st.trail[k - 1].x, st.trail[k - 1].y, st.trail[k].x, st.trail[k].y);
    }
  }

  private weaponReach(v: CharacterVisual): number {
    switch (v.weapon) {
      case 'spear': return 56;
      case 'twohand': return 44;
      case 'sword': return 32;
      case 'axe': return 36;
      case 'mace': return 24;
      case 'dagger': return 16;
      case 'bow': return 14;
      default: return 12;
    }
  }

  // ============================================================
  //  PALETTE / TONES
  // ============================================================
  private tones(v: CharacterVisual, accent: number): ToneSet {
    const body = this.tintBlend(v.bodyColor, accent, 0.18);
    return {
      body,
      bodyHi: this.tintBlend(body, 0xffffff, 0.35),
      bodyShade: this.tintBlend(body, 0x000000, 0.35),
      accent: this.tintBlend(v.accentColor, accent, 0.15),
      metalAccent: this.tintBlend(v.helmetAccent, 0xffffff, 0.2),
      dark: this.tintBlend(0x2a2a32, accent, 0.12),
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

  // ============================================================
  //  CAPSULE PRIMITIVE (workhorse for limbs)
  // ============================================================
  private drawCapsule(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    color: number,
    outline: number,
    r2 = r,
    highlight?: number
  ): void {
    // Tapered capsule — radius interpolates from r at (x1,y1) to r2 at
    // (x2,y2). When r === r2 this collapses to a uniform capsule.
    // The optional `highlight` argument adds a 2-tone lit band along the
    // upper-left side of the bone, giving a subtle 3D read instead of
    // flat fill.
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
    // Outline (slightly enlarged) — also tapered.
    const o1 = r + 1;
    const o2 = r2 + 1;
    g.fillStyle(outline, 1);
    g.fillTriangle(x1 + px * o1, y1 + py * o1, x1 - px * o1, y1 - py * o1, x2 + px * o2, y2 + py * o2);
    g.fillTriangle(x2 + px * o2, y2 + py * o2, x2 - px * o2, y2 - py * o2, x1 - px * o1, y1 - py * o1);
    g.fillCircle(x1, y1, o1);
    g.fillCircle(x2, y2, o2);
    // Body fill
    g.fillStyle(color, 1);
    g.fillTriangle(x1 + px * r, y1 + py * r, x1 - px * r, y1 - py * r, x2 + px * r2, y2 + py * r2);
    g.fillTriangle(x2 + px * r2, y2 + py * r2, x2 - px * r2, y2 - py * r2, x1 - px * r, y1 - py * r);
    g.fillCircle(x1, y1, r);
    g.fillCircle(x2, y2, r2);
    // Lit-edge highlight (upper-left side of bone). Skip if no highlight
    // color requested. We cheat the "upper-left" with px,py since +y is
    // down: if the bone runs roughly horizontal the highlight sits above
    // the centerline, otherwise it sits on the +px side.
    if (highlight !== undefined) {
      const sign = py < 0 ? 1 : -1;
      const hr1 = Math.max(0, r - 1.4);
      const hr2 = Math.max(0, r2 - 1.4);
      g.fillStyle(highlight, 0.55);
      g.fillTriangle(
        x1 + px * sign * hr1,
        y1 + py * sign * hr1,
        x1,
        y1,
        x2 + px * sign * hr2,
        y2 + py * sign * hr2
      );
      g.fillTriangle(x2 + px * sign * hr2, y2 + py * sign * hr2, x2, y2, x1, y1);
    }
  }

  /** Approximate fighter silhouette AABB in fighter-local space. */
  private silhouetteRect(tr: Record<BoneId, BoneTransform>): { x: number; y: number; w: number; h: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const id of Object.keys(tr) as BoneId[]) {
      const t = tr[id];
      const r = Math.max(t.radius, 4);
      minX = Math.min(minX, t.startX - r, t.endX - r);
      maxX = Math.max(maxX, t.startX + r, t.endX + r);
      minY = Math.min(minY, t.startY - r, t.endY - r);
      maxY = Math.max(maxY, t.startY + r, t.endY + r);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
}

// Suppress unused-import lints when interpPose / addOffset get used in
// future subclasses. These primitives are exported from skeleton/Pose.ts
// and re-exported here for callers that build pose tables.
void interpPose;
void addOffset;

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

// Allow Pose import alongside renderer for downstream consumers building
// custom pose tables (Phase 3 movesets will register per-attack poses).
export type { Pose };
