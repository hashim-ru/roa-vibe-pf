import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import type { CharacterVisual } from '../entities/characters/CharacterVisual';
import { ROSTER } from '../entities/characters/Roster';
import type { CharacterId } from '../config/GameMode';

const PLAYER_TINT_OVERLAY: Record<number, number> = {
  0: 0xffe8c8,
  1: 0xc8d6ff
};

const OUTLINE = 0x0a0a14;

/**
 * Code-only fighter renderer — designed to LOOK like polished pixel art:
 *  • dark outline pass on every silhouette part
 *  • 4-tone shading per zone (highlight / midtone / shadow / outline)
 *  • separate animated limbs (arms, thighs, shins, feet)
 *  • breathing chest, idle bob, run leg-pump, attack lunge
 *  • glowing visor eye (subtle "alive" cue)
 *  • cape ripple driven by velocity
 *
 * Hitbox = visual: drawn on the same AABB as physics. `topPad` is purely
 * cosmetic vertical extension for plumes/skull domes.
 */
interface TrailSample {
  x: number;
  y: number;
}

export class CodeFighterRenderer {
  private gfxs: Phaser.GameObjects.Graphics[] = [];
  private trailGfxs: Phaser.GameObjects.Graphics[] = [];
  // Ring buffer of weapon-tip world positions per fighter, sampled each
  // render frame. Drawn as a tapered triangle strip with alpha falloff during
  // attack states (Cyanilux "soulercoaster" trail).
  private trailBuffers: TrailSample[][] = [];
  private readonly TRAIL_LEN = 8;

  constructor(
    private scene: Phaser.Scene,
    private fighters: Fighter[],
    private characters: CharacterId[]
  ) {
    for (let i = 0; i < fighters.length; i++) {
      // Trail goes BEHIND the fighter sprite so the weapon shape stays sharp
      // on top of the fade tail. Using ADD blend so overlapping tail samples
      // brighten naturally toward the leading edge.
      const trail = scene.add.graphics().setDepth(48).setBlendMode(Phaser.BlendModes.ADD);
      this.trailGfxs.push(trail);
      this.gfxs.push(scene.add.graphics().setDepth(50));
      this.trailBuffers.push([]);
    }
  }

  draw(tick: number, alpha = 1): void {
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      const g = this.gfxs[i];
      const tg = this.trailGfxs[i];
      const visual = ROSTER[this.characters[i]].visual;
      const overlay = PLAYER_TINT_OVERLAY[i] ?? 0xffffff;
      const x = f.body.prevX + (f.body.x - f.body.prevX) * alpha;
      const y = f.body.prevY + (f.body.y - f.body.prevY) * alpha;
      g.clear();
      tg.clear();
      this.updateAndDrawTrail(tg, f, visual, x, y);
      if (f.isInvincible(tick) && Math.floor(tick / 3) % 2 === 1) continue;
      this.drawFighter(g, f, visual, overlay, x, y, tick);
    }
  }

  /**
   * Sample the weapon-tip world position each frame during the attack's
   * active window (anticipation excluded — feels weird otherwise). Render the
   * ring buffer as a tapered triangle strip from oldest (alpha 0) to newest
   * (alpha 0.85), pinching width head-to-tail. Sampled while the attack is
   * still resolving; cleared the moment we leave Attack.
   */
  private updateAndDrawTrail(
    tg: Phaser.GameObjects.Graphics,
    f: Fighter,
    v: CharacterVisual,
    x: number,
    y: number
  ): void {
    const buf = this.trailBuffers[f.playerIndex];
    const isSwinging =
      f.fsm.is('Attack') &&
      f.pendingMove !== null &&
      f.pendingMove.move.category !== 'special';
    if (isSwinging) {
      // Estimate tip world position: arm shoulder + extended arm + weapon
      // length, in fighter local space, then transform by facing.
      const facing = f.facing;
      const shoulderY = -f.body.h * 0.55;
      const armLen = f.body.h * 0.55;
      const tipLocalX = (armLen + this.weaponReach(v)) * facing;
      const tipLocalY = shoulderY - 4;
      const tipX = x + tipLocalX;
      const tipY = y + tipLocalY;
      buf.push({ x: tipX, y: tipY });
      if (buf.length > this.TRAIL_LEN) buf.shift();
    } else if (buf.length > 0) {
      // Fade the tail by dropping the oldest sample each frame.
      buf.shift();
    }
    if (buf.length < 2) return;

    const color = this.trailColor(v);
    // Render as stacked thin polylines with linear alpha falloff. Faster and
    // simpler than building a true triangle-strip — and looks identical at
    // small width because the ADD blend already smooths the tail.
    for (let k = 1; k < buf.length; k++) {
      const t = k / buf.length; // 0..1, oldest..newest
      const alpha = 0.05 + t * 0.6;
      const width = 1.5 + t * 3;
      tg.lineStyle(width, color, alpha);
      tg.lineBetween(buf[k - 1].x, buf[k - 1].y, buf[k].x, buf[k].y);
    }
  }

  private weaponReach(v: CharacterVisual): number {
    switch (v.weapon) {
      case 'spear': return 50;
      case 'twohand': return 44;
      case 'sword': return 32;
      case 'axe': return 36;
      case 'mace': return 24;
      case 'dagger': return 16;
      case 'bow': return 14;
      default: return 12;
    }
  }

  private trailColor(v: CharacterVisual): number {
    // Use weapon metal as the trail tone — reads as a steel-on-air arc rather
    // than a magic effect (halal-friendly).
    return v.weaponMetal ?? 0xeeeeee;
  }

  private drawFighter(
    g: Phaser.GameObjects.Graphics,
    f: Fighter,
    v: CharacterVisual,
    overlay: number,
    x: number,
    y: number,
    tick: number
  ): void {
    const w = f.body.w * v.bodyWidthRatio;
    const h = f.body.h;
    const facing = f.facing;

    // Velocity-driven stretch (continuous): rising = stretched up, falling
    // hard = compressed; bounded so it never breaks the silhouette.
    const stretch = Phaser.Math.Clamp(-f.body.vy / 30, -0.05, 0.08);
    let sx = 1 - stretch * 0.4;
    let sy = 1 + stretch;

    // Discrete state pulses (volume-conserved: sx*sy ≈ 1) for jumpsquat /
    // land / dash. Reads as anticipatory wind-up + landing impact, the
    // single biggest "free juice" win for code-only renderers.
    if (f.fsm.is('JumpSquat')) {
      const jp = (tick - f.fsm.enterTick) / Math.max(1, f.stats.jumpSquatFrames);
      const k = Phaser.Math.Clamp(jp, 0, 1);
      const squash = 0.32 * (1 - k); // 0.32 → 0 over the squat
      sx = 1 + squash;
      sy = 1 - squash * 0.85;
    } else if (f.fsm.is('Land')) {
      const lp = tick - f.fsm.enterTick;
      const k = Phaser.Math.Clamp(lp / 6, 0, 1);
      const squash = 0.40 * (1 - k);
      sx = 1 + squash;
      sy = 1 - squash * 0.85;
    } else if (f.fsm.is('Dash')) {
      sx = 0.92;
      sy = 1.05;
    } else if (f.fsm.is('DodgeRoll')) {
      sx = 1.10;
      sy = 0.92;
    }

    const W = w * sx;
    const H = h * sy;

    // Lean during run + a per-character constant lean while idle/grounded.
    // Reaver leans back, Skirmisher leans forward, etc — adds personality
    // without animation cost.
    const speedRatio = Math.abs(f.body.vx) / f.stats.runSpeed;
    const idleLean = (v.idleLean ?? 0) * (facing === -1 ? -1 : 1);
    const lean =
      (f.fsm.is('Run') || f.fsm.is('Dash')) && f.body.grounded
        ? Math.min(0.18, speedRatio * 0.18) * (facing === -1 ? -1 : 1)
        : (f.fsm.is('Idle') || f.fsm.is('Walk')) && f.body.grounded
          ? idleLean
          : 0;

    // Stepped animation phase — pixel-art reads as 8-12 fps stepped, NOT
    // smooth-interpolated 60 Hz. Quantizing the sine input to a 6-tick step
    // (~10 fps) keeps the math identical but makes limb motion feel hand-
    // animated instead of "code-rendered". Game-feel timers (lunge, shake)
    // stay at 60 Hz on purpose. (Slynyrd Pixelblog 8.)
    const STEP_RATE = 6;
    const stepTick = Math.floor(tick / STEP_RATE);

    // Idle breathing — discrete 1-px LUT instead of continuous sin. Body and
    // arms breathe in OPPOSITE directions (sub-pixel anim trick from
    // 2dwillneverdie) which is what reads as "alive" rather than "wiggling".
    // Period scales with archetype: heavy chars breathe slow + deep, light
    // chars fast + shallow. Both are visible at the silhouette level but
    // signal weight class instantly.
    const idlePeriod = f.stats.weight >= 110 ? 96 : f.stats.weight <= 82 ? 36 : 60;
    const IDLE_BODY_LUT = [0, -1, -1, 0]; // 4-step cycle
    const IDLE_ARM_LUT = [0, 1, 1, 0];
    const idlePhase = Math.floor((tick % idlePeriod) / Math.max(1, Math.floor(idlePeriod / 4)));
    const breathing = IDLE_BODY_LUT[idlePhase] ?? 0;
    const armBreathing = IDLE_ARM_LUT[idlePhase] ?? 0;
    const bob = f.fsm.is('Idle') && f.body.grounded ? breathing : 0;

    // Run leg-pump — sample sin at the stepped phase so it "snaps" between
    // poses instead of sliding continuously.
    const runPhase = (f.fsm.is('Run') || f.fsm.is('Dash') || f.fsm.is('Walk'))
      ? Math.sin(stepTick * 0.45 * STEP_RATE) * Math.min(1, speedRatio)
      : 0;

    // Attack lunge + per-phase arm pose:
    //   anticipation: arm pulls BACK 1-3 px / -0.4 rad before active hitbox
    //   active:       lunge forward, arm snaps to commit
    //   follow-through: arm overshoots ~10% then settles back
    let lungeX = 0;
    let armAngle = 0;
    if (f.fsm.is('Attack') && f.pendingMove) {
      const phase = tick - f.pendingMove.startedAtTick;
      const move = f.pendingMove.move;
      const firstHitFrame =
        move.frames.find((fr) => fr.hitboxes.length > 0)?.frame ?? Math.floor(move.totalFrames * 0.4);
      const lastHitFrame =
        [...move.frames].reverse().find((fr) => fr.hitboxes.length > 0)?.frame ?? firstHitFrame;
      const recoveryEnd = move.iasaFrame ?? move.totalFrames;

      if (phase < firstHitFrame) {
        // Anticipation: ease arm to the character's signature windup pose
        // (Sakurai "tell" principle — Reaver overhead, Wraith arms-up,
        // Skirmisher coil-low). Defaults to the universal -0.78 if no
        // override is set.
        const baseRest = -0.78;
        const targetWindup = v.windupArmAngle ?? -1.23;
        const t = phase / Math.max(1, firstHitFrame);
        const k = 1 - Math.pow(1 - t, 2); // ease-out
        armAngle = baseRest + (targetWindup - baseRest) * k;
        lungeX = -Math.sin(t * Math.PI * 0.5) * 2 * facing;
      } else if (phase <= lastHitFrame) {
        // Active: hard forward commit, full lunge.
        armAngle = 1.05;
        lungeX = 5 * facing;
      } else {
        // Follow-through: overshoot and settle. easeOutBack(t) over the rest.
        const t = Phaser.Math.Clamp((phase - lastHitFrame) / Math.max(1, recoveryEnd - lastHitFrame), 0, 1);
        const overshoot = 1.7;
        const o = 1 + overshoot * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
        armAngle = 1.05 + (-0.78 - 1.05) * o;
        lungeX = (1 - t) * 5 * facing;
      }
    } else if (f.fsm.is('Run') || f.fsm.is('Dash')) {
      armAngle = -0.15 + runPhase * 0.25;
    } else if (f.fsm.is('Idle') && f.body.grounded) {
      // Arms drift opposite the body each breath beat; reads as "alive".
      armAngle = armBreathing * 0.04;
    }

    // Snap entity origin to integer screen-px each frame; otherwise individual
    // limbs jitter relative to each other and lose the "pixel art" feel. Sub-
    // physics interpolation already happens in float in `x`/`y`; we floor at
    // the last possible moment, just before draw. (Vlambeer / Nuclear Throne
    // approach.)
    // Knockback tumble — Smash-style continuous rotation when launched at
    // high horizontal speed; reset when grounded. Reads as "your character
    // got rocked" without per-state animation cost.
    let tumbleAngle = 0;
    if (!f.body.grounded && f.fsm.is('Hitstun')) {
      const speed = Math.hypot(f.body.vx, f.body.vy);
      if (speed > 8) tumbleAngle = (tick * f.body.vx * 0.04) * 0.5;
    }
    // Hitstop pose-jitter — Sakurai's hold-the-pose-but-vibrate-1px convention
    // during hit pause. Grounded = horizontal jitter; aerial = vertical.
    let jitterX = 0;
    let jitterY = 0;
    if (f.isHitPaused(tick)) {
      const grounded = f.body.grounded;
      const phase = (tick % 2 === 0) ? 1 : -1;
      if (grounded) jitterX = phase;
      else jitterY = phase;
    }
    const ox = Math.floor(x + lungeX + jitterX);
    const oy = Math.floor(y + bob + jitterY);
    g.save();
    g.translateCanvas(ox, oy);
    if (tumbleAngle !== 0) g.rotateCanvas(tumbleAngle);
    if (lean !== 0) g.rotateCanvas(lean);
    if (facing === -1) g.scaleCanvas(-1, 1);

    // === Ground shadow ===
    if (f.body.grounded) {
      g.fillStyle(0x000000, 0.5);
      g.fillEllipse(0, 4, w * 1.05, 7);
    }

    // === Cape (behind everything) ===
    if (v.cape !== 'none') {
      this.drawCape(g, v, W, H, f, tick);
    }

    // === Back leg + back arm (drawn behind body for proper layering) ===
    this.drawLegPair(g, v, W, H, overlay, runPhase, breathing, /*back=*/ true, f);
    this.drawArmBack(g, v, W, H, overlay, armBreathing, runPhase);

    // === Torso (curved flat-vector silhouette, NOT a rect) ===
    this.drawTorso(g, v, W, H, overlay, breathing);

    // === Helmet ===
    this.drawHelmet(g, v, W, H, overlay, tick);

    // === Shield (off-hand) ===
    if (v.shield !== 'none') {
      this.drawShield(g, v, W, H, overlay);
    }

    // === Front leg ===
    this.drawLegPair(g, v, W, H, overlay, runPhase, breathing, /*back=*/ false, f);

    // === Front arm + weapon ===
    this.drawArm(g, v, W, H, overlay, armAngle);

    // === Hit flash ===
    // First few frames after a hit: bright white silhouette (Hyper Light /
    // Streets of Rage convention — palette-friendly and reads INSTANTLY at
    // any size). After that, switch to a subtle red rim that pulses while in
    // hitstun so high-percent victims still look "in pain".
    if (f.isHitPaused(tick) && f.fsm.is('Hitstun')) {
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(-W / 2 - 2, -H - 4, W + 4, H + 4);
    } else if (f.fsm.is('Hitstun') && Math.floor(tick / 3) % 2 === 0) {
      g.lineStyle(2, 0xff4040, 0.7);
      g.strokeRect(-W / 2 - 2, -H - 4, W + 4, H + 4);
    }
    if (f.fsm.is('Parry')) {
      g.lineStyle(2, 0x9ae0ff, 0.9);
      g.strokeRect(-W / 2 - 3, -H - 3, W + 6, H + 6);
    }

    g.restore();
  }

  // ----------------------------------------------------------- TORSO
  /**
   * Draws a curved flat-vector torso polygon — wider at the shoulders,
   * pinching at the waist. Replaces the old rect-stack which made every
   * fighter look like a stack of bricks. Light comes from upper-left at 45°
   * (Slynyrd convention); shading is two layered polygons offset by the
   * light vector.
   */
  private drawTorso(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    W: number,
    H: number,
    overlay: number,
    breathing: number
  ): void {
    const T = this.tones(v, overlay);
    // Proportions: helmet ≈ 25%, torso 35%, legs 40%. Tuned for fighting-
    // game readability; legs were 15% in the v1 rect-stack and read stubby.
    const top = -H + H * 0.28;
    const waist = -H + H * 0.45;
    const bot = -H + H * 0.62;
    // Armored breastplate proportions: WIDE square shoulders, slight chest
    // taper, sharp waist break, then hip plate flares out for the skirt.
    const shoulderW = W * 0.62;
    const chestW = W * 0.58;
    const waistW = W * 0.42;
    const hipW = W * 0.50;
    const breath = Math.round(breathing * 0.5);

    // 8-vertex breastplate silhouette — almost rectangular shoulders with a
    // slight inward curve at the chest, then a sharper inward break at the
    // waist, then flaring out for hip plates. Reads as armor plate, not as
    // a curved torso balloon.
    const torso = [
      { x: -shoulderW, y: top },
      { x: -shoulderW, y: top + (waist - top) * 0.20 + breath },
      { x: -chestW, y: top + (waist - top) * 0.55 + breath },
      { x: -waistW, y: waist },
      { x: -hipW, y: bot },
      { x: hipW, y: bot },
      { x: waistW, y: waist },
      { x: chestW, y: top + (waist - top) * 0.55 + breath },
      { x: shoulderW, y: top + (waist - top) * 0.20 + breath },
      { x: shoulderW, y: top }
    ];

    // Outline pass
    g.fillStyle(OUTLINE, 1);
    g.beginPath();
    for (const p of torso) g.lineTo(p.x + Math.sign(p.x), p.y + (p.y > waist ? 1 : -1));
    g.closePath();
    g.fillPath();

    // Body fill
    g.fillStyle(T.body, 1);
    g.beginPath();
    for (const p of torso) g.lineTo(p.x, p.y);
    g.closePath();
    g.fillPath();

    // Right-half shadow band — single gradient band along the right edge,
    // not a full polygon. Reads as form-shading without seaming the torso.
    g.fillStyle(T.bodyShade, 0.55);
    g.beginPath();
    g.lineTo(chestW * 0.55, top + 2);
    g.lineTo(shoulderW, top + 2);
    g.lineTo(shoulderW, top + (waist - top) * 0.20 + breath);
    g.lineTo(chestW, top + (waist - top) * 0.55 + breath);
    g.lineTo(waistW, waist);
    g.lineTo(hipW, bot);
    g.lineTo(hipW * 0.5, bot);
    g.lineTo(waistW * 0.55, waist);
    g.closePath();
    g.fillPath();

    // Pectoral chest plates — two raised "boobs" of armor, classic medieval
    // breastplate detail. Outlined ovals with highlight on upper-left.
    const pecY = top + (waist - top) * 0.35 + breath;
    const pecW = chestW * 0.45;
    const pecH = (waist - top) * 0.30;
    g.fillStyle(T.bodyHi, 0.55).fillEllipse(-pecW * 0.55, pecY, pecW, pecH);
    g.fillStyle(T.bodyHi, 0.55).fillEllipse(pecW * 0.55, pecY, pecW, pecH);
    g.lineStyle(1, OUTLINE, 0.4);
    g.strokeEllipse(-pecW * 0.55, pecY, pecW, pecH);
    g.strokeEllipse(pecW * 0.55, pecY, pecW, pecH);
    g.lineStyle(0, 0, 0);

    // Top edge highlight band (lit by upper light source)
    g.fillStyle(T.bodyHi, 0.9);
    g.beginPath();
    g.lineTo(-shoulderW + 2, top + 1);
    g.lineTo(shoulderW - 2, top + 1);
    g.lineTo(shoulderW - 2, top + 3);
    g.lineTo(-shoulderW + 2, top + 3);
    g.closePath();
    g.fillPath();

    // Chest emblem / armor seam — a vertical accent line down the center of
    // the chest plate. Reads as armored division and adds visual depth.
    g.lineStyle(1, T.bodyShade, 0.7);
    g.lineBetween(0, top + 4, 0, waist - 2);
    g.lineStyle(0, 0, 0);

    // Belt — narrow ellipse at waist, gives the figure a "cinched" middle.
    g.fillStyle(OUTLINE, 1).fillEllipse(0, waist, waistW * 2 + 2, 6);
    g.fillStyle(T.accent, 1).fillEllipse(0, waist, waistW * 2, 5);
    g.fillStyle(T.metalAccent, 1).fillCircle(0, waist, 2);
    g.fillStyle(OUTLINE, 1).fillCircle(0, waist + 0.5, 1);

    // Shoulder pauldrons — a half-disc on each shoulder, gives the silhouette
    // its iconic "armored" V-shape.
    this.drawPauldron(g, T, -shoulderW, top, -1);
    this.drawPauldron(g, T, shoulderW, top, 1);

    // Neck — a short vertical capsule connecting torso to helmet
    g.fillStyle(OUTLINE, 1).fillRect(-W * 0.10, top - 4, W * 0.20, 5);
    g.fillStyle(T.dark, 1).fillRect(-W * 0.09, top - 3, W * 0.18, 4);
  }

  /**
   * Half-disc pauldron at the shoulder. `dir` = 1 for right, -1 for left.
   * Adds the visual "weight" that lets heavy chars read as armored.
   */
  private drawPauldron(g: Phaser.GameObjects.Graphics, T: ToneSet, x: number, y: number, dir: number): void {
    const r = 7;
    g.fillStyle(OUTLINE, 1).fillCircle(x, y + 2, r + 1);
    g.fillStyle(T.body, 1).fillCircle(x, y + 2, r);
    // Highlight tilted toward upper-left
    g.fillStyle(T.bodyHi, 0.7).fillCircle(x - dir * 2, y, r * 0.55);
    // Trim band at the rim
    g.lineStyle(1.5, T.accent, 0.9).strokeCircle(x, y + 2, r - 0.5);
    g.lineStyle(0, 0, 0);
  }

  // ----------------------------------------------------------- LEGS
  /**
   * Draws ONE leg (front or back) using a 2-bone capsule skeleton with a
   * proper knee bend during run / jump cycles. Hip pivot follows the run
   * phase so the leg actually swings; knee bend follows lift amount so a
   * raised leg curls naturally.
   */
  private drawLegPair(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    W: number,
    H: number,
    overlay: number,
    runPhase: number,
    _breathing: number,
    back: boolean,
    f: Fighter
  ): void {
    const T = this.tones(v, overlay);
    // Hip pivot at 62% from bottom (where torso ends). Legs extend 40% of
    // body height for proper humanoid proportions.
    const hipY = -H + H * 0.62;
    const hipX = (back ? -1 : 1) * W * 0.18;

    // Run cycle — back leg in opposite phase to front. lift > 0 means the
    // leg is in the AIR right now; bend the knee so foot trails behind hip.
    const phaseSign = back ? -runPhase : runPhase;
    const lift = Math.max(0, phaseSign) * H * 0.14;
    const swing = phaseSign * H * 0.10;

    // Aerial = legs hang slightly bent. Crouch = legs deeply bent.
    const aerial = !f.body.grounded && !f.fsm.is('Hitstun');
    const crouching = f.fsm.is('Crouch') || f.fsm.is('JumpSquat');

    const totalLen = H * 0.40; // legs are 40% of body height now
    const thighLen = totalLen * 0.55;
    const shinLen = totalLen * 0.55;

    // Knee position: forward of hip + raised when lifting
    let kneeBend = 0.18; // baseline natural bend
    if (aerial) kneeBend = 0.30;
    if (crouching) kneeBend = 0.65;
    if (lift > 0) kneeBend += lift / (H * 0.06) * 0.25;

    const kneeFwd = totalLen * Math.sin(kneeBend);
    const kneeDown = totalLen * Math.cos(kneeBend) * 0.55;

    const kneeX = hipX + (back ? 1 : 1) * kneeFwd * 0.4 + swing * 0.5;
    const kneeY = hipY + kneeDown - lift * 0.4;

    // Foot: knee + shin extending downward, with a forward kick when lifting
    const footX = kneeX + swing * 0.5 - kneeFwd * 0.2;
    const footY = hipY + totalLen - lift * 0.7;

    const legColor = back ? this.tintBlend(T.dark, 0x000000, 0.25) : T.dark;
    const legR = back ? W * 0.085 : W * 0.10;

    // Thigh capsule
    this.drawCapsule(g, hipX, hipY, kneeX, kneeY, legR, legColor, OUTLINE);
    // Knee joint — small circle that hides the seam
    g.fillStyle(OUTLINE, 1).fillCircle(kneeX, kneeY, legR + 0.5);
    g.fillStyle(legColor, 1).fillCircle(kneeX, kneeY, legR - 0.5);
    // Shin capsule (slightly thinner toward foot)
    this.drawCapsule(g, kneeX, kneeY, footX, footY, legR * 0.92, legColor, OUTLINE);
    // Boot — wedge at the foot pointing forward
    const bootColor = this.tintBlend(legColor, 0x000000, 0.4);
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(footX + (back ? -2 : 2), footY + 2, legR * 2.6, legR * 1.5);
    g.fillStyle(bootColor, 1);
    g.fillEllipse(footX + (back ? -2 : 2), footY + 1, legR * 2.4, legR * 1.3);
    // Toe highlight
    if (!back) {
      g.fillStyle(T.darkHi, 0.4).fillEllipse(footX + 3, footY, legR * 1.2, legR * 0.6);
    }

    // Knee armor plate (front leg only) — small kite on the knee
    if (!back && !aerial) {
      g.fillStyle(OUTLINE, 1).fillTriangle(kneeX - 4, kneeY - 1, kneeX + 4, kneeY - 1, kneeX, kneeY + 5);
      g.fillStyle(T.accent, 1).fillTriangle(kneeX - 3, kneeY - 1, kneeX + 3, kneeY - 1, kneeX, kneeY + 4);
    }
  }

  /**
   * Draws a capsule (rounded rect) from (x1,y1) to (x2,y2) with rounded caps
   * at radius `r`. Uses two triangles for the body + two circles for caps.
   * This is the workhorse of the new renderer — all limbs are capsules.
   */
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
    const px = (-dy / len);
    const py = (dx / len);
    // Outline (perpendicular = r+1)
    const oR = r + 1;
    g.fillStyle(outline, 1);
    g.fillTriangle(x1 + px * oR, y1 + py * oR, x1 - px * oR, y1 - py * oR, x2 + px * oR, y2 + py * oR);
    g.fillTriangle(x2 + px * oR, y2 + py * oR, x2 - px * oR, y2 - py * oR, x1 - px * oR, y1 - py * oR);
    g.fillCircle(x1, y1, oR);
    g.fillCircle(x2, y2, oR);
    // Body
    g.fillStyle(color, 1);
    g.fillTriangle(x1 + px * r, y1 + py * r, x1 - px * r, y1 - py * r, x2 + px * r, y2 + py * r);
    g.fillTriangle(x2 + px * r, y2 + py * r, x2 - px * r, y2 - py * r, x1 - px * r, y1 - py * r);
    g.fillCircle(x1, y1, r);
    g.fillCircle(x2, y2, r);
  }

  // ----------------------------------------------------------- BACK ARM
  /** Off-hand arm drawn behind the torso (the shield-bearing side). */
  private drawArmBack(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    W: number,
    H: number,
    overlay: number,
    armBreathing: number,
    runPhase: number
  ): void {
    const T = this.tones(v, overlay);
    const shoulderX = -W * 0.34;
    const shoulderY = -H + H * 0.32;
    const baseAngle = 0.65 + armBreathing * 0.04 + runPhase * 0.18;
    const armR = W * 0.09;
    const upperLen = H * 0.18;
    const foreLen = H * 0.16;
    const elbowX = shoulderX - Math.cos(baseAngle) * upperLen;
    const elbowY = shoulderY + Math.sin(baseAngle) * upperLen;
    // Forearm angle bent further inward (resting against torso)
    const forearmAngle = baseAngle + 0.6;
    const handX = elbowX - Math.cos(forearmAngle) * foreLen;
    const handY = elbowY + Math.sin(forearmAngle) * foreLen;

    const armColor = this.tintBlend(T.body, 0x000000, 0.15);
    this.drawCapsule(g, shoulderX, shoulderY, elbowX, elbowY, armR, armColor, OUTLINE);
    g.fillStyle(OUTLINE, 1).fillCircle(elbowX, elbowY, armR + 0.5);
    g.fillStyle(armColor, 1).fillCircle(elbowX, elbowY, armR - 0.5);
    this.drawCapsule(g, elbowX, elbowY, handX, handY, armR * 0.9, armColor, OUTLINE);
    // Gauntlet — slightly smaller than front hand (perspective)
    const grR = armR * 1.05;
    g.fillStyle(OUTLINE, 1).fillCircle(handX, handY, grR + 0.5);
    g.fillStyle(this.tintBlend(armColor, 0x000000, 0.4), 1).fillCircle(handX, handY, grR);
    g.lineStyle(1.5, T.accent, 0.85).strokeCircle(handX, handY, grR + 0.3);
    g.lineStyle(0, 0, 0);
  }

  // ----------------------------------------------------------- HELMET
  private drawHelmet(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    W: number,
    H: number,
    overlay: number,
    tick: number
  ): void {
    const T = this.tones(v, overlay);
    const helmW = W * 0.95;
    const helmH = H * 0.30;
    const helmY = -H + (-v.topPad * 0.2);
    const helmAccent = this.tintBlend(v.helmetAccent, overlay, 0.18);
    const eyeGlow = 0xffd84a;

    const drawVisor = (slitY: number, slitH: number) => {
      g.fillStyle(0x000000, 1).fillRect(-helmW * 0.32, slitY, helmW * 0.64, slitH);
      // Glowing eye in visor (subtle "alive")
      const eyePulse = (Math.sin(tick * 0.12) + 1) * 0.5; // 0..1
      g.fillStyle(eyeGlow, 0.55 + eyePulse * 0.4);
      g.fillRect(-helmW * 0.18, slitY + slitH * 0.3, 2, slitH * 0.4);
      g.fillRect(helmW * 0.16, slitY + slitH * 0.3, 2, slitH * 0.4);
    };

    switch (v.helmet) {
      case 'bucket': {
        // Rounded great-helm: domed top + flat-faced front. Outline is a
        // taller ellipse + the rect for the chin guard. Reads as iconic
        // medieval knight at any size.
        const cy = helmY + helmH * 0.55;
        const dr = helmW * 0.52;
        const dh = helmH * 0.95;
        // Outline pass (ellipse +1)
        g.fillStyle(OUTLINE, 1).fillEllipse(0, cy, dr * 2 + 2, dh + 2);
        g.fillStyle(T.body, 1).fillEllipse(0, cy, dr * 2, dh);
        // Top dome highlight
        g.fillStyle(T.bodyHi, 0.85).fillEllipse(-dr * 0.35, cy - dh * 0.25, dr * 0.7, dh * 0.45);
        // Bottom shadow
        g.fillStyle(T.bodyShade, 0.5).fillEllipse(0, cy + dh * 0.25, dr * 1.6, dh * 0.45);
        // Brim band — accent ring around the helmet
        g.lineStyle(2, helmAccent, 1).strokeEllipse(0, cy, dr * 2, dh);
        g.lineStyle(0, 0, 0);
        // Rivets at 4 cardinal positions
        g.fillStyle(T.metalAccent, 1);
        g.fillCircle(-dr * 0.85, cy - dh * 0.05, 1.5);
        g.fillCircle(dr * 0.85, cy - dh * 0.05, 1.5);
        g.fillCircle(0, cy - dh * 0.45, 1.5);
        // Visor — horizontal slot in the dome
        drawVisor(cy - dh * 0.05, 4);
        if (v.plumeColor) this.drawPlume(g, v.plumeColor, 4, helmY - v.topPad * 0.9, v.topPad);
        break;
      }

      case 'pointed': {
        // Conical helm — outline polygon then fill
        const points = [
          { x: -helmW / 2, y: helmY + helmH },
          { x: -helmW / 2, y: helmY + helmH * 0.4 },
          { x: 0, y: helmY - v.topPad * 0.6 },
          { x: helmW / 2, y: helmY + helmH * 0.4 },
          { x: helmW / 2, y: helmY + helmH }
        ];
        g.fillStyle(OUTLINE, 1);
        g.beginPath();
        g.moveTo(points[0].x - 1, points[0].y + 1);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x + (i === 1 ? -1 : i === 2 ? 0 : 1), points[i].y - (i === 2 ? 1 : 0));
        g.closePath();
        g.fillPath();
        g.fillStyle(T.body, 1);
        g.beginPath();
        for (const p of points) g.lineTo(p.x, p.y);
        g.closePath();
        g.fillPath();
        // Highlight ridge
        g.fillStyle(T.bodyHi, 1);
        g.fillRect(-1, helmY + 2, 2, helmH * 0.6);
        // Brim trim
        g.fillStyle(helmAccent, 1).fillRect(-helmW / 2, helmY + helmH - 3, helmW, 3);
        drawVisor(helmY + helmH * 0.55, 4);
        if (v.plumeColor) this.drawPlume(g, v.plumeColor, 0, helmY - v.topPad - 2, v.topPad);
        break;
      }

      case 'horned': {
        const cy = helmY + helmH * 0.55;
        const dr = helmW * 0.50;
        const dh = helmH * 0.95;
        g.fillStyle(OUTLINE, 1).fillEllipse(0, cy, dr * 2 + 2, dh + 2);
        g.fillStyle(T.body, 1).fillEllipse(0, cy, dr * 2, dh);
        g.fillStyle(T.bodyHi, 0.85).fillEllipse(-dr * 0.35, cy - dh * 0.25, dr * 0.7, dh * 0.45);
        g.fillStyle(T.bodyShade, 0.5).fillEllipse(0, cy + dh * 0.25, dr * 1.6, dh * 0.45);
        // Brim
        g.lineStyle(2, helmAccent, 1).strokeEllipse(0, cy, dr * 2, dh);
        g.lineStyle(0, 0, 0);
        drawVisor(cy - dh * 0.05, 4);
        // Horns curve up-and-out from the dome shoulders
        this.drawHornOutlined(g, -dr * 0.85, cy - dh * 0.25, -1, v.topPad * 0.9, helmAccent, T.metalAccent);
        this.drawHornOutlined(g, dr * 0.85, cy - dh * 0.25, 1, v.topPad * 0.9, helmAccent, T.metalAccent);
        break;
      }

      case 'hooded': {
        const points = [
          { x: -helmW * 0.55, y: helmY + helmH },
          { x: -helmW * 0.45, y: helmY - v.topPad * 0.2 },
          { x: 0, y: helmY - v.topPad * 0.5 },
          { x: helmW * 0.55, y: helmY - v.topPad * 0.1 },
          { x: helmW * 0.55, y: helmY + helmH }
        ];
        // Outline pass
        g.fillStyle(OUTLINE, 1);
        g.beginPath();
        for (const p of points) g.lineTo(p.x + Math.sign(p.x), p.y - 1);
        g.closePath();
        g.fillPath();
        g.fillStyle(T.body, 1);
        g.beginPath();
        for (const p of points) g.lineTo(p.x, p.y);
        g.closePath();
        g.fillPath();
        // Inner shadow under the hood lip
        g.fillStyle(T.bodyShade, 0.7);
        g.fillRect(-helmW * 0.5, helmY + helmH * 0.4, helmW, 3);
        // Dark void where face would be
        g.fillStyle(0x0a0a14, 1).fillRect(-helmW * 0.32, helmY + helmH * 0.45, helmW * 0.64, helmH * 0.4);
        // Glowing eye dots inside the void
        const pulse = (Math.sin(tick * 0.12) + 1) * 0.5;
        g.fillStyle(eyeGlow, 0.5 + pulse * 0.4);
        g.fillRect(-helmW * 0.16, helmY + helmH * 0.55, 2, 2);
        g.fillRect(helmW * 0.14, helmY + helmH * 0.55, 2, 2);
        break;
      }

      case 'crowned': {
        const cy = helmY + helmH * 0.55;
        const dr = helmW * 0.50;
        const dh = helmH * 0.95;
        g.fillStyle(OUTLINE, 1).fillEllipse(0, cy, dr * 2 + 2, dh + 2);
        g.fillStyle(T.body, 1).fillEllipse(0, cy, dr * 2, dh);
        g.fillStyle(T.bodyHi, 0.85).fillEllipse(-dr * 0.35, cy - dh * 0.25, dr * 0.7, dh * 0.45);
        g.fillStyle(T.bodyShade, 0.5).fillEllipse(0, cy + dh * 0.25, dr * 1.6, dh * 0.45);
        g.lineStyle(2, helmAccent, 1).strokeEllipse(0, cy, dr * 2, dh);
        g.lineStyle(0, 0, 0);
        drawVisor(cy - dh * 0.05, 4);
        // Crown spikes radiate from the top of the dome
        for (let k = -2; k <= 2; k++) {
          const t = k / 2; // -1..1
          const cx = t * dr * 0.85;
          const baseY = cy + Math.sqrt(Math.max(0, 1 - t * t)) * -dh * 0.5;
          const ch = v.topPad * (k === 0 ? 1 : 0.65);
          g.fillStyle(OUTLINE, 1);
          g.fillTriangle(cx - 4, baseY, cx + 4, baseY, cx, baseY - ch - 1);
          g.fillStyle(v.helmetAccent, 1);
          g.fillTriangle(cx - 3, baseY, cx + 3, baseY, cx, baseY - ch);
          g.fillStyle(0xffffff, 0.7);
          g.fillRect(cx - 1, baseY - ch + 1, 2, 1);
        }
        if (v.plumeColor) this.drawPlume(g, v.plumeColor, 8, helmY - v.topPad * 0.8, v.topPad * 0.8);
        break;
      }

      case 'skull': {
        const skullW = helmW * 0.78;
        const skullH = helmH * 1.05;
        const skullY = helmY - skullH * 0.15;
        // Cowl
        const cowl = [
          { x: -helmW * 0.6, y: helmY + helmH },
          { x: -helmW * 0.5, y: helmY - v.topPad * 0.5 },
          { x: 0, y: helmY - v.topPad },
          { x: helmW * 0.5, y: helmY - v.topPad * 0.5 },
          { x: helmW * 0.6, y: helmY + helmH }
        ];
        g.fillStyle(OUTLINE, 1);
        g.beginPath();
        for (const p of cowl) g.lineTo(p.x + Math.sign(p.x), p.y - 1);
        g.closePath();
        g.fillPath();
        g.fillStyle(0x0a0a14, 1);
        g.beginPath();
        for (const p of cowl) g.lineTo(p.x, p.y);
        g.closePath();
        g.fillPath();
        // Skull (outline + bone)
        g.fillStyle(OUTLINE, 1);
        g.fillEllipse(0, skullY + skullH * 0.4, skullW + 2, skullH + 2);
        g.fillStyle(v.helmetAccent, 1);
        g.fillEllipse(0, skullY + skullH * 0.4, skullW, skullH);
        // Brow shadow
        g.fillStyle(T.bodyShade, 0.6);
        g.fillEllipse(0, skullY + skullH * 0.32, skullW * 0.85, skullH * 0.3);
        // Eye sockets
        g.fillStyle(0x000000, 1);
        g.fillCircle(-skullW * 0.22, skullY + skullH * 0.4, skullW * 0.15);
        g.fillCircle(skullW * 0.22, skullY + skullH * 0.4, skullW * 0.15);
        // Glowing eyes
        const pulse = (Math.sin(tick * 0.18) + 1) * 0.5;
        g.fillStyle(0xff4060, 0.7 + pulse * 0.3);
        g.fillCircle(-skullW * 0.22, skullY + skullH * 0.4, skullW * 0.07);
        g.fillCircle(skullW * 0.22, skullY + skullH * 0.4, skullW * 0.07);
        // Teeth
        g.fillStyle(0x141622, 1).fillRect(-skullW * 0.22, skullY + skullH * 0.7, skullW * 0.44, 3);
        for (let k = 0; k < 5; k++) {
          g.fillStyle(v.helmetAccent, 1);
          g.fillRect(-skullW * 0.22 + k * (skullW * 0.11), skullY + skullH * 0.7, 2, 5);
        }
        break;
      }

      case 'feathered': {
        const cy = helmY + helmH * 0.55;
        const dr = helmW * 0.50;
        const dh = helmH * 0.95;
        g.fillStyle(OUTLINE, 1).fillEllipse(0, cy, dr * 2 + 2, dh + 2);
        g.fillStyle(T.body, 1).fillEllipse(0, cy, dr * 2, dh);
        g.fillStyle(T.bodyHi, 0.85).fillEllipse(-dr * 0.35, cy - dh * 0.25, dr * 0.7, dh * 0.45);
        g.fillStyle(T.bodyShade, 0.5).fillEllipse(0, cy + dh * 0.25, dr * 1.6, dh * 0.45);
        g.lineStyle(2, helmAccent, 1).strokeEllipse(0, cy, dr * 2, dh);
        g.lineStyle(0, 0, 0);
        drawVisor(cy - dh * 0.05, 4);
        if (v.plumeColor) {
          for (let k = 0; k < 3; k++) {
            const px = -8 + k * 8;
            const ph = v.topPad - k * 2;
            this.drawPlume(g, v.plumeColor, px, helmY - ph, ph);
          }
        }
        break;
      }

      default: {
        const _exhaustive: never = v.helmet as never;
        void _exhaustive;
      }
    }
  }

  private drawPlume(g: Phaser.GameObjects.Graphics, color: number, baseX: number, tipY: number, length: number): void {
    // Outline
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(baseX - 4, tipY + length, baseX + length * 0.7, tipY + length * 0.4, baseX - 6, tipY);
    // Plume
    g.fillStyle(color, 1);
    g.fillTriangle(baseX - 3, tipY + length, baseX + length * 0.6, tipY + length * 0.4, baseX - 5, tipY + 1);
    // Highlight stripe
    g.fillStyle(0xffffff, 0.35);
    g.fillTriangle(baseX - 2, tipY + length * 0.6, baseX + length * 0.3, tipY + length * 0.5, baseX - 3, tipY + length * 0.2);
  }

  private drawHornOutlined(
    g: Phaser.GameObjects.Graphics,
    baseX: number,
    baseY: number,
    dir: number,
    length: number,
    color: number,
    hi: number
  ): void {
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(baseX, baseY + 4, baseX + dir * 14, baseY - length, baseX + dir * 6, baseY - length * 0.3);
    g.fillStyle(color, 1);
    g.fillTriangle(baseX, baseY + 3, baseX + dir * 13, baseY - length + 1, baseX + dir * 5, baseY - length * 0.3 + 1);
    // Highlight on inner edge
    g.fillStyle(hi, 0.6);
    g.fillRect(baseX + dir * 1, baseY - length * 0.3, 1, length * 0.5);
  }

  // ----------------------------------------------------------- FRONT ARM + WEAPON
  /**
   * Front (weapon-holding) arm — 2-bone capsule skeleton with elbow bend.
   * `armAngle` is the OVERALL shoulder rotation (rest≈-0.78, anticipation
   * eases backward, active commits to ≈+1.05). The elbow lags slightly
   * behind the shoulder for a natural follow-through. The weapon attaches
   * at the hand pivot.
   */
  private drawArm(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    W: number,
    H: number,
    overlay: number,
    armAngle: number
  ): void {
    const T = this.tones(v, overlay);
    // Shoulder pivot pushed slightly outside the torso silhouette so the arm
    // has visible separation rather than vanishing into the body.
    const shoulderX = W * 0.34;
    const shoulderY = -H + H * 0.32;

    // 2-bone IK with prescribed elbow bend. Upper arm rotates with armAngle;
    // forearm is tucked at a relative bend that loosens as the arm extends
    // (so during the active commit the arm is nearly straight, and during
    // anticipation/idle it's bent at ~120°).
    const upperLen = H * 0.20;
    const foreLen = H * 0.18;
    const armR = W * 0.10;

    // Forearm bend relative to upper arm — straighter when arm is forward,
    // more bent when at rest behind body.
    const t = Phaser.Math.Clamp((armAngle + 1.0) / 2.0, 0, 1);
    const elbowBend = 0.95 - t * 0.85; // 0.95 (bent) → 0.10 (nearly straight)

    const elbowX = shoulderX + Math.cos(armAngle) * upperLen;
    const elbowY = shoulderY + Math.sin(armAngle) * upperLen;
    const handX = elbowX + Math.cos(armAngle - elbowBend) * foreLen;
    const handY = elbowY + Math.sin(armAngle - elbowBend) * foreLen;

    // Capsule limbs
    this.drawCapsule(g, shoulderX, shoulderY, elbowX, elbowY, armR, T.body, OUTLINE);

    // Elbow joint disc (covers the seam)
    g.fillStyle(OUTLINE, 1).fillCircle(elbowX, elbowY, armR + 0.5);
    g.fillStyle(T.body, 1).fillCircle(elbowX, elbowY, armR - 0.5);
    // Elbow highlight (specular dot top-left)
    g.fillStyle(T.bodyHi, 0.7).fillCircle(elbowX - 1, elbowY - 1, armR * 0.4);

    this.drawCapsule(g, elbowX, elbowY, handX, handY, armR * 0.9, T.body, OUTLINE);

    // Highlight stripe along the upper arm (lit edge facing upper-left)
    const upPx = -(elbowY - shoulderY) / upperLen;
    const upPy = (elbowX - shoulderX) / upperLen;
    g.lineStyle(1.5, T.bodyHi, 0.55);
    g.lineBetween(
      shoulderX + upPx * (armR - 1),
      shoulderY + upPy * (armR - 1),
      elbowX + upPx * (armR - 1),
      elbowY + upPy * (armR - 1)
    );
    g.lineStyle(0, 0, 0);

    // Gauntlet — visible armored mitten/glove at the hand. Outlined disc
    // with a knuckle ridge bevel on the upper-left and a darker grip pad
    // along the inside (where the weapon haft sits).
    const gx = handX;
    const gy = handY;
    const grR = armR * 1.15;
    g.fillStyle(OUTLINE, 1).fillCircle(gx, gy, grR + 0.5);
    g.fillStyle(T.dark, 1).fillCircle(gx, gy, grR);
    // Knuckle bevel (upper-left highlight)
    g.fillStyle(T.darkHi, 0.45).fillCircle(gx - grR * 0.25, gy - grR * 0.3, grR * 0.5);
    // Wrist cuff - accent band
    g.lineStyle(2, T.accent, 0.95).strokeCircle(gx, gy, grR + 0.5);
    g.lineStyle(0, 0, 0);

    // Weapon attaches at the hand pivot, oriented along the forearm.
    g.save();
    g.translateCanvas(gx, gy);
    g.rotateCanvas(armAngle - elbowBend);
    this.drawWeapon(g, v);
    g.restore();
  }

  private drawWeapon(g: Phaser.GameObjects.Graphics, v: CharacterVisual): void {
    if (v.weapon === 'none') return;
    const grip = v.weaponGrip;
    const metal = v.weaponMetal;
    const sheen = 0xffffff;

    const drawBlade = (len: number, w: number) => {
      // Outline
      g.fillStyle(OUTLINE, 1).fillRect(-1, -w / 2 - 1, len + 2, w + 2);
      g.fillTriangle(len, -w / 2 - 1, len, w / 2 + 1, len + 7, 0);
      // Blade
      g.fillStyle(metal, 1).fillRect(0, -w / 2, len, w);
      g.fillTriangle(len, -w / 2, len, w / 2, len + 6, 0);
      // Sheen
      g.fillStyle(sheen, 0.5).fillRect(2, -w / 2 + 1, len - 4, 1);
    };

    switch (v.weapon) {
      case 'sword':
        // Hilt
        g.fillStyle(OUTLINE, 1).fillRect(-9, -3, 9, 6);
        g.fillStyle(grip, 1).fillRect(-8, -2, 8, 4);
        g.fillStyle(OUTLINE, 1).fillRect(-3, -7, 5, 14);
        g.fillStyle(metal, 1).fillRect(-2, -6, 3, 12);
        drawBlade(32, 6);
        break;
      case 'twohand':
        g.fillStyle(OUTLINE, 1).fillRect(-13, -4, 13, 8);
        g.fillStyle(grip, 1).fillRect(-12, -3, 12, 6);
        g.fillStyle(OUTLINE, 1).fillRect(-4, -9, 5, 18);
        g.fillStyle(metal, 1).fillRect(-3, -8, 4, 16);
        drawBlade(44, 8);
        break;
      case 'spear':
        g.fillStyle(OUTLINE, 1).fillRect(-5, -2, 40, 4);
        g.fillStyle(grip, 1).fillRect(-4, -1.5, 38, 3);
        // Tip outline
        g.fillStyle(OUTLINE, 1);
        g.fillTriangle(33, -6, 33, 6, 47, 0);
        g.fillStyle(metal, 1);
        g.fillTriangle(34, -5, 34, 5, 46, 0);
        g.fillStyle(sheen, 0.5).fillRect(36, -1, 6, 1);
        break;
      case 'axe':
        g.fillStyle(OUTLINE, 1).fillRect(-3, -2, 30, 4);
        g.fillStyle(grip, 1).fillRect(-2, -1.5, 28, 3);
        // Axe head (outline + fill)
        g.fillStyle(OUTLINE, 1);
        g.beginPath();
        g.moveTo(19, -4);
        g.lineTo(28, -11);
        g.lineTo(37, -11);
        g.lineTo(35, 0);
        g.lineTo(37, 11);
        g.lineTo(28, 11);
        g.lineTo(19, 4);
        g.closePath();
        g.fillPath();
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
        // Edge highlight
        g.fillStyle(sheen, 0.4).fillRect(28, -9, 6, 1);
        break;
      case 'dagger':
        g.fillStyle(OUTLINE, 1).fillRect(-7, -2, 7, 4);
        g.fillStyle(grip, 1).fillRect(-6, -1.5, 6, 3);
        drawBlade(16, 4);
        break;
      case 'mace':
        g.fillStyle(OUTLINE, 1).fillRect(-3, -2, 23, 4);
        g.fillStyle(grip, 1).fillRect(-2, -1.5, 22, 3);
        g.fillStyle(OUTLINE, 1).fillCircle(26, 0, 8);
        g.fillStyle(metal, 1).fillCircle(26, 0, 7);
        g.fillStyle(sheen, 0.4).fillCircle(24, -2, 2);
        for (let a = 0; a < 6; a++) {
          const ang = (a * Math.PI) / 3;
          const x1 = 26 + Math.cos(ang) * 7;
          const y1 = Math.sin(ang) * 7;
          const x2 = 26 + Math.cos(ang) * 11;
          const y2 = Math.sin(ang) * 11;
          g.lineStyle(2, OUTLINE, 1).lineBetween(x1, y1, x2, y2);
          g.lineStyle(1, metal, 1).lineBetween(x1 + 0.4, y1 + 0.4, x2 - 0.4, y2 - 0.4);
        }
        break;
      case 'bow':
        g.lineStyle(4, OUTLINE, 1);
        g.beginPath();
        g.arc(0, 0, 16, -Math.PI * 0.45, Math.PI * 0.45, false);
        g.strokePath();
        g.lineStyle(2, grip, 1);
        g.beginPath();
        g.arc(0, 0, 16, -Math.PI * 0.45, Math.PI * 0.45, false);
        g.strokePath();
        g.fillStyle(grip, 1).fillRect(14, -3, 4, 6);
        break;
    }
  }

  // ----------------------------------------------------------- SHIELD
  private drawShield(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    W: number,
    H: number,
    overlay: number
  ): void {
    const sx = -W * 0.6;
    const sy = -H + H * 0.45;
    const color = this.tintBlend(v.shieldColor, overlay, 0.2);
    const hi = this.tintBlend(v.highlightColor, overlay, 0.15);

    switch (v.shield) {
      case 'kite': {
        const points = [
          { x: sx - 6, y: sy },
          { x: sx + 6, y: sy },
          { x: sx + 8, y: sy + H * 0.18 },
          { x: sx, y: sy + H * 0.32 },
          { x: sx - 8, y: sy + H * 0.18 }
        ];
        g.fillStyle(OUTLINE, 1);
        g.beginPath();
        for (const p of points) g.lineTo(p.x + Math.sign(p.x - sx), p.y + 1);
        g.closePath();
        g.fillPath();
        g.fillStyle(color, 1);
        g.beginPath();
        for (const p of points) g.lineTo(p.x, p.y);
        g.closePath();
        g.fillPath();
        // Boss in center + chevron
        g.fillStyle(hi, 1).fillCircle(sx, sy + H * 0.16, 2);
        g.lineStyle(1, hi, 0.5);
        g.lineBetween(sx - 4, sy + 4, sx, sy + H * 0.13);
        g.lineBetween(sx + 4, sy + 4, sx, sy + H * 0.13);
        break;
      }
      case 'round':
        g.fillStyle(OUTLINE, 1).fillCircle(sx, sy + H * 0.12, 11);
        g.fillStyle(color, 1).fillCircle(sx, sy + H * 0.12, 10);
        g.fillStyle(hi, 1).fillCircle(sx, sy + H * 0.12, 2);
        // ring detail
        g.lineStyle(1, OUTLINE, 0.5).strokeCircle(sx, sy + H * 0.12, 6);
        break;
      case 'tower':
        g.fillStyle(OUTLINE, 1).fillRect(sx - 9, sy - 5, 18, H * 0.36);
        g.fillStyle(color, 1).fillRect(sx - 8, sy - 4, 16, H * 0.34);
        g.fillStyle(hi, 0.5).fillRect(sx - 7, sy - 3, 2, H * 0.32);
        g.lineStyle(1, OUTLINE, 0.5).strokeRect(sx - 7, sy + H * 0.05, 14, 4);
        break;
      case 'buckler':
        g.fillStyle(OUTLINE, 1).fillCircle(sx, sy + H * 0.12, 7);
        g.fillStyle(color, 1).fillCircle(sx, sy + H * 0.12, 6);
        g.fillStyle(hi, 1).fillCircle(sx, sy + H * 0.12, 1.5);
        break;
    }
  }

  // ----------------------------------------------------------- CAPE
  private drawCape(
    g: Phaser.GameObjects.Graphics,
    v: CharacterVisual,
    W: number,
    H: number,
    f: Fighter,
    tick: number
  ): void {
    const flap = Math.sign(f.body.vx) * Math.min(8, Math.abs(f.body.vx) * 1.4);
    const ripple = Math.sin(tick * 0.15) * 1.5;
    const len = v.cape === 'long' ? H * 0.78 : H * 0.5;
    const top = -H + H * 0.32;

    // Outline cape (one px bigger)
    g.fillStyle(OUTLINE, 1);
    g.beginPath();
    g.moveTo(-W * 0.42, top);
    g.lineTo(W * 0.42, top);
    g.lineTo(W * 0.32 - flap + ripple, top + len + 1);
    g.lineTo(-W * 0.32 - flap - ripple, top + len + 1);
    g.closePath();
    g.fillPath();

    // Cape body
    g.fillStyle(v.capeColor, 0.95);
    g.beginPath();
    g.moveTo(-W * 0.4, top);
    g.lineTo(W * 0.4, top);
    g.lineTo(W * 0.3 - flap + ripple, top + len);
    g.lineTo(-W * 0.3 - flap - ripple, top + len);
    g.closePath();
    g.fillPath();

    // Inner shadow band
    g.fillStyle(0x000000, 0.25);
    g.fillRect(-W * 0.4 + 4, top + len * 0.4, W * 0.8 - 8, 3);

    // Cape highlight
    const hi = this.tintBlend(v.capeColor, 0xffffff, 0.3);
    g.fillStyle(hi, 0.5);
    g.fillRect(-W * 0.38, top + 2, 2, len * 0.7);
  }

  // ----------------------------------------------------------- TONES
  private tones(v: CharacterVisual, overlay: number): ToneSet {
    const body = this.tintBlend(v.bodyColor, overlay, 0.18);
    return {
      body,
      bodyHi: this.tintBlend(body, 0xffffff, 0.35),
      bodyShade: this.tintBlend(body, 0x000000, 0.3),
      accent: this.tintBlend(v.accentColor, overlay, 0.15),
      metalAccent: this.tintBlend(v.helmetAccent, 0xffffff, 0.2),
      dark: this.tintBlend(0x2a2a32, overlay, 0.12),
      darkHi: 0xffffff,
      darkShade: 0x141622
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
}


