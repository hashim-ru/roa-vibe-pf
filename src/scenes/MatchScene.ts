import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, DEBUG } from '../config/game.config';
import { FixedTimestepLoop } from '../core/FixedTimestepLoop';
import { frameClock } from '../core/FrameClock';
import { bus } from '../core/EventBus';
import { InputBuffer } from '../input/InputBuffer';
import { InputReader } from '../input/InputReader';
import { KeyboardDevice, P1_KEYS, P2_KEYS } from '../input/InputDevice';
import { StateMachine } from '../fsm/StateMachine';
import { Fighter } from '../entities/Fighter';
import { ROSTER } from '../entities/characters/Roster';
import { IdleState } from '../entities/states/grounded/IdleState';
import { WalkState } from '../entities/states/grounded/WalkState';
import { CrouchState } from '../entities/states/grounded/CrouchState';
import { JumpSquatState } from '../entities/states/grounded/JumpSquatState';
import { LandState } from '../entities/states/grounded/LandState';
import { DashState } from '../entities/states/grounded/DashState';
import { RunState } from '../entities/states/grounded/RunState';
import { JumpState } from '../entities/states/aerial/JumpState';
import { FallState } from '../entities/states/aerial/FallState';
import { AirDodgeState } from '../entities/states/aerial/AirDodgeState';
import { AttackState } from '../entities/states/attack/AttackState';
import { HitstunState } from '../entities/states/attack/HitstunState';
import { ParryState } from '../entities/states/special/ParryState';
import { HelplessState } from '../entities/states/special/HelplessState';
import { LedgeHangState } from '../entities/states/special/LedgeHangState';
import { KOState } from '../entities/states/special/KOState';
import { DodgeRollState } from '../entities/states/special/DodgeRollState';
import { ForestStage } from '../stages/ForestStage';
import { HitboxDebugRenderer } from '../render/HitboxDebugRenderer';
import { StageRenderer } from '../render/StageRenderer';
import { CodeFighterRenderer } from '../render/CodeFighterRenderer';
import type { CharacterId } from '../config/GameMode';
import { MotionTrails } from '../render/MotionTrails';
import { BotController } from '../input/BotController';
import { gameMode } from '../config/GameMode';
import { isOutsideBlastZone } from '../physics/Collision';
import { hitDetection } from '../combat/HitDetection';
import { DynamicCamera } from '../camera/DynamicCamera';
import { ScreenShake } from '../camera/ScreenShake';
import { VFX } from '../render/VFX';
import { HUD } from '../render/UI/HUD';
import { audio, bindAudioEvents } from '../audio/AudioManager';

export class MatchScene extends Phaser.Scene {
  private loop!: FixedTimestepLoop;
  private inputReader!: InputReader;
  private fighters: Fighter[] = [];
  private debugRenderer!: HitboxDebugRenderer;
  private fighterRenderer!: CodeFighterRenderer;
  private trails!: MotionTrails;
  private camera!: DynamicCamera;
  private shake!: ScreenShake;
  private vfx!: VFX;
  private hud!: HUD;
  private debugText!: Phaser.GameObjects.Text;
  private fpsLabel: HTMLElement | null = null;
  private gameOverText?: Phaser.GameObjects.Text;
  private restartHint?: Phaser.GameObjects.Text;
  private debugVisible = DEBUG.showHitboxes;
  private matchOver = false;
  private slowMoUntilTick = -1;
  private skipNextSimulate = false;
  private koFreezeUntilTick = -1;
  private bot: BotController | null = null;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;

  constructor() {
    super({ key: 'Match' });
  }

  create() {
    this.cameras.main.setBackgroundColor('#0c0f1a');
    this.matchOver = false;
    this.gameOverText?.destroy();
    this.restartHint?.destroy();
    this.gameOverText = undefined;
    this.restartHint = undefined;
    this.debugVisible = DEBUG.showHitboxes;

    const world = ForestStage.build();
    new StageRenderer(this, world);

    const cfg = gameMode.get();
    const buf1 = new InputBuffer();
    const buf2 = new InputBuffer();
    const dev1 = new KeyboardDevice(0, P1_KEYS);
    const devices: { playerIndex: number; snapshot: () => ReturnType<KeyboardDevice['snapshot']> }[] = [dev1];
    if (cfg.mode === 'vs-human') {
      devices.push(new KeyboardDevice(1, P2_KEYS));
    }
    this.inputReader = new InputReader(
      devices as KeyboardDevice[],
      new Map([
        [0, buf1],
        [1, buf2]
      ])
    );

    const c1 = ROSTER[cfg.characters[0]];
    const c2 = ROSTER[cfg.characters[1]];
    const f1 = new Fighter(0, world, c1.stats, buf1, world.spawns[0], c1.moves);
    const f2 = new Fighter(1, world, c2.stats, buf2, world.spawns[1], c2.moves);
    this.fighters = [f1, f2];

    this.bot = cfg.mode === 'vs-bot' ? new BotController(f2, f1, buf2, cfg.difficulty) : null;

    for (const f of this.fighters) {
      const fsm = new StateMachine<Fighter>(f);
      fsm.registerMany([
        new IdleState(),
        new WalkState(),
        new CrouchState(),
        new JumpSquatState(),
        new LandState(),
        new DashState(),
        new RunState(),
        new JumpState(),
        new FallState(),
        new AirDodgeState(),
        new AttackState(),
        new HitstunState(),
        new ParryState(),
        new HelplessState(),
        new LedgeHangState(),
        new KOState(),
        new DodgeRollState()
      ]);
      f.fsm = fsm;
      fsm.start('Fall', 0);
    }

    const charIds: CharacterId[] = [cfg.characters[0], cfg.characters[1]];
    this.fighterRenderer = new CodeFighterRenderer(this, this.fighters, charIds);
    this.trails = new MotionTrails(this);
    this.debugRenderer = new HitboxDebugRenderer(this);
    this.camera = new DynamicCamera(this);
    this.shake = new ScreenShake(this);
    this.vfx = new VFX(this);
    this.hud = new HUD(this);

    // UI overlay camera that doesn't zoom — keeps HUD at fixed screen size.
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    // Hide HUD from main camera; hide everything-not-HUD from UI camera.
    this.cameras.main.ignore(this.hud.objects);
    const initialNonHud = this.children.list.filter((c) => !this.hud.objects.includes(c));
    this.uiCamera.ignore(initialNonHud);
    // Auto-ignore any newly-spawned gameobjects on the UI camera (so VFX,
    // sprites, etc. only render on main camera).
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (obj: Phaser.GameObjects.GameObject) => {
      if (!this.hud.objects.includes(obj)) this.uiCamera.ignore(obj);
    });

    this.debugText = this.add
      .text(0, 0, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#cfd0d6'
      })
      .setScrollFactor(0)
      .setDepth(2100)
      .setVisible(DEBUG.showStateText);

    this.fpsLabel = document.getElementById('fps');

    this.loop = new FixedTimestepLoop((tick) => this.simulate(tick));

    bus.off('hit');
    bus.off('parry');
    bus.off('ko');

    audio.register('hit_light', ['assets/audio/hit_light.ogg'], { volume: 0.7 });
    audio.register('hit_med', ['assets/audio/hit_med.ogg'], { volume: 0.85 });
    audio.register('hit_heavy', ['assets/audio/hit_heavy.ogg'], { volume: 1 });
    audio.register('parry', ['assets/audio/parry.ogg'], { volume: 0.9 });
    audio.register('ko', ['assets/audio/ko.ogg'], { volume: 1 });
    audio.register('jump', ['assets/audio/jump.ogg'], { volume: 0.4 });
    audio.register('land', ['assets/audio/land.ogg'], { volume: 0.5 });
    bindAudioEvents(bus as unknown as { on: (event: string, fn: (e: unknown) => void) => void });

    bus.on('hit', (e) => {
      const v = this.fighters[e.victimId];
      const a = this.fighters[e.attackerId];
      if (!v || !a) return;
      const cx = v.body.x;
      const cy = v.body.y - v.body.h * 0.5;
      const launchDeg = (Math.atan2(-v.body.vy, v.body.vx) * 180) / Math.PI;
      const tint = a.playerIndex === 0 ? 0xffd860 : 0x6cb8ff;
      // Single source of truth for the per-hit VFX bundle (Vlambeer juice
      // multiplier). Tier maps damage → spark color + dust + shake amplitude
      // + flash; designers tune one table in VFX.ts instead of grep-finding
      // hit reactions.
      const result = this.vfx.hitBundle({
        impactX: cx, impactY: cy,
        victimX: v.body.x, victimY: v.body.y, victimW: v.body.w, victimH: v.body.h,
        damage: e.damage,
        launchAngleDeg: launchDeg,
        attackerColor: tint
      });
      this.shake.add(result.trauma);
      // Camera kick toward the impact, scaled by tier intensity.
      const intensity = Math.min(1, e.damage / 14);
      const dx = Math.sign(v.body.x - a.body.x) * (3 + intensity * 9);
      const dy = -1 - intensity * 3;
      this.camera.kick(dx, dy);
    });

    bus.on('parry', (e) => {
      const d = this.fighters[e.defenderId];
      if (!d) return;
      this.vfx.parryFlash(d.body.x, d.body.y - d.body.h * 0.5);
      this.shake.add(0.25);
    });

    bus.on('ko', (e) => {
      const v = this.fighters[e.victimId];
      if (!v) return;
      this.vfx.koStar(v.body.x, v.body.y - v.body.h * 0.5);
      // Special-zoom moment: full-screen flash + zoom-in + simulation freeze
      // for ~28 frames, then 0.4× slow-mo for ~30 frames after — research J3.
      this.vfx.koFlash(0xffe04d);
      this.shake.add(1);
      this.camera.focus(v.body.x, v.body.y - 40, frameClock.tick + 64, 1.55);
      this.koFreezeUntilTick = frameClock.tick + 28;
      this.slowMoUntilTick = frameClock.tick + 64;
    });

    bus.on('land', (e) => {
      const f = this.fighters[e.fighterId];
      if (!f || e.speed < 1) return;
      this.trails.spawnLandPoof(f.body.x, f.body.y);
    });

    bus.on('doubleJump', (e) => {
      const f = this.fighters[e.fighterId];
      if (!f) return;
      this.vfx.doubleJumpRing(f.body.x, f.body.y);
    });

    // Safari/iOS unlock — Howler's audio context starts suspended until first
    // user gesture. Hook the canvas pointerdown / first key to resume.
    const unlock = () => {
      audio.unlock();
      this.input.keyboard?.off('keydown', unlock);
      this.input.off('pointerdown', unlock);
    };
    this.input.keyboard?.on('keydown', unlock);
    this.input.on('pointerdown', unlock);

    this.input.keyboard?.on('keydown-F1', () => {
      this.debugVisible = !this.debugVisible;
      this.debugText.setVisible(this.debugVisible);
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.matchOver) this.scene.restart();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start('Title');
    });

    frameClock.reset();
  }

  private simulate(tick: number): void {
    if (this.matchOver) return;
    // KO freeze: full simulation halt during the special-zoom phase.
    if (tick < this.koFreezeUntilTick) return;
    // Slow-mo: skip every-other simulate so visuals still move at full FPS
    // but logical time runs at ~0.5×.
    if (tick < this.slowMoUntilTick) {
      this.skipNextSimulate = !this.skipNextSimulate;
      if (this.skipNextSimulate) return;
    }
    this.inputReader.poll();
    if (this.bot) this.bot.poll(tick);
    for (const f of this.fighters) {
      f.update(tick);
      if (isOutsideBlastZone(f.body, f.world)) {
        bus.emit('ko', { victimId: f.playerIndex });
        f.stocks = Math.max(0, f.stocks - 1);
        f.fsm.force('KO', tick);
      }
    }
    hitDetection.run(this.fighters, tick);
  }

  update(time: number) {
    const alpha = this.loop.tick(
      time,
      () => frameClock.tick,
      () => frameClock.advance()
    );

    this.fighterRenderer.draw(frameClock.tick, alpha);
    this.trails.update(frameClock.tick, this.fighters);
    this.camera.update(this.fighters, frameClock.tick);
    const off = this.shake.offset();
    this.camera.applyTo(this, off.x, off.y);

    if (this.debugVisible) {
      this.debugRenderer.draw(this.fighters[0].world, this.fighters, frameClock.tick);
    } else {
      // Clear debug overlay when hidden
      this.debugRenderer.draw(this.fighters[0].world, [], frameClock.tick);
    }
    this.hud.draw(this.fighters);

    if (this.debugVisible) {
      const sw = this.scale.gameSize.width;
      this.debugText.setVisible(true);
      this.debugText.setPosition(sw - 360, 12);
      const lines = this.fighters.map(
        (f) =>
          `P${f.playerIndex + 1} ${f.fsm.id?.padEnd(8) ?? '-'} pct=${f.percent
            .toFixed(0)
            .padStart(3)} stk=${f.stocks} g=${f.body.grounded ? 'Y' : 'N'} hs=${f.hitstunRemaining}`
      );
      this.debugText.setText([`tick ${frameClock.tick}`, ...lines].join('\n'));
    } else {
      this.debugText.setVisible(false);
    }

    if (this.fpsLabel) {
      this.fpsLabel.textContent = `${this.game.loop.actualFps.toFixed(1)} fps · ${GAME_WIDTH}×${GAME_HEIGHT}`;
    }

    const alive = this.fighters.filter((f) => f.stocks > 0);
    if (!this.matchOver && alive.length === 1) {
      this.matchOver = true;
      this.gameOverText = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, `P${alive[0].playerIndex + 1} WINS`, {
          fontFamily: 'Cinzel, ui-serif, serif',
          fontSize: '72px',
          color: '#ffe04d',
          stroke: '#000',
          strokeThickness: 6
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(3000);
      this.restartHint = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'press R to rematch · ESC for title', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '16px',
          color: '#a0a8b8'
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(3000);
    }
  }
}
