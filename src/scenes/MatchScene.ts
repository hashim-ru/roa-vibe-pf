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
import { Battlefield } from '../stages/Battlefield';
import { FinalDestination } from '../stages/FinalDestination';
import { HitboxDebugRenderer } from '../render/HitboxDebugRenderer';
import { StageRenderer } from '../render/StageRenderer';
import { FighterRenderer } from '../render/FighterRenderer';
import type { CharacterId } from '../config/GameMode';
import { BotController } from '../input/BotController';
import { gameMode } from '../config/GameMode';
import { isOutsideBlastZone } from '../physics/Collision';
import { hitDetection } from '../combat/HitDetection';
import { DynamicCamera } from '../camera/DynamicCamera';
import { ScreenShake } from '../camera/ScreenShake';
import { VFX } from '../render/VFX';
import { HUD } from '../render/UI/HUD';
import { audio, bindAudioEvents } from '../audio/AudioManager';
import { netClient } from '../net/NetClient';
import { NetSync } from '../net/NetSync';
import { sharedRng } from '../core/Rng';

function mix(h: number, v: number): number {
  h = (h ^ v) >>> 0;
  return Math.imul(h, 0x01000193) >>> 0;
}
function hashString(s: string): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 0x01000193) | 0);
  return h >>> 0;
}

/**
 * MatchScene — tech-demo rebuild edition. Wires Lancer + Hooded
 * Skirmisher onto the Battlefield stage with the new FighterRenderer
 * (skeleton + capsule limbs) and tier-based VFX system.
 */
export class MatchScene extends Phaser.Scene {
  private loop!: FixedTimestepLoop;
  private inputReader!: InputReader;
  private fighters: Fighter[] = [];
  private debugRenderer!: HitboxDebugRenderer;
  private fighterRenderer!: FighterRenderer;
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
  private netSync: NetSync | null = null;
  private localKeyboard: KeyboardDevice | null = null;
  private remoteBuf: InputBuffer | null = null;
  private localBuf: InputBuffer | null = null;
  private netStatusText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Match' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0c0f1a');
    this.matchOver = false;
    this.gameOverText?.destroy();
    this.restartHint?.destroy();
    this.gameOverText = undefined;
    this.restartHint = undefined;
    this.debugVisible = DEBUG.showHitboxes;

    const cfg = gameMode.get();
    sharedRng.reseed(cfg.netSession?.seed ?? 1);
    const stageDef = cfg.stage === 'final-destination' ? FinalDestination : Battlefield;
    const world = stageDef.build();
    new StageRenderer(this, world, stageDef.theme);

    // Per-stage ambient pad — Battlefield = warm forest hum (low A2,
    // 110Hz), Final Destination = cold mountain whistle (mid E3,
    // 165Hz). Procedural sine drone, no melody — halal-relaxed.
    audio.startAmbient('stage', cfg.stage === 'final-destination' ? 165 : 110, 0.18);

    const buf1 = new InputBuffer();
    const buf2 = new InputBuffer();
    const dev1 = new KeyboardDevice(0, P1_KEYS);
    const devices: { playerIndex: number; snapshot: () => ReturnType<KeyboardDevice['snapshot']> }[] = [dev1];
    if (cfg.mode === 'vs-human') {
      devices.push(new KeyboardDevice(1, P2_KEYS));
    }
    this.inputReader = new InputReader(devices as KeyboardDevice[], new Map([[0, buf1], [1, buf2]]));

    // Net mode: bypass the normal InputReader and drive the buffers
    // ourselves inside `simulate()` from the NetSync delay queues. The
    // local player always uses P1 keybinds (regardless of host/guest);
    // the remote half is fed by tick-aligned input frames off the wire.
    if (cfg.mode === 'vs-net' && cfg.netSession) {
      const session = cfg.netSession;
      this.localBuf = session.localPlayerIndex === 0 ? buf1 : buf2;
      this.remoteBuf = session.localPlayerIndex === 0 ? buf2 : buf1;
      this.localKeyboard = new KeyboardDevice(session.localPlayerIndex, P1_KEYS);
      this.netSync = new NetSync(
        netClient,
        session.localPlayerIndex,
        session.inputDelay,
        session.startTick
      );
      this.netSync.onDesync = (tick, ours, theirs) => {
        // eslint-disable-next-line no-console
        console.warn(`[netcode] desync at tick ${tick}: ours=${ours} theirs=${theirs}`);
      };
      this.inputReader = new InputReader([], new Map());
    }

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
    this.fighterRenderer = new FighterRenderer(this, this.fighters, charIds);
    this.fighterRenderer.setSignatureCallback((moveId, x, y, facing, idx, charId) => {
      const accent = idx === 0 ? 0xffd860 : 0x6cb8ff;
      this.vfx.signatureVFX(moveId, x, y, facing, accent, charId);
    });
    this.debugRenderer = new HitboxDebugRenderer(this);
    this.camera = new DynamicCamera(this);
    this.shake = new ScreenShake(this);
    this.vfx = new VFX(this);
    this.hud = new HUD(this);

    // UI overlay camera that doesn't zoom — keeps HUD at fixed screen size.
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    this.cameras.main.ignore(this.hud.objects);
    const initialNonHud = this.children.list.filter((c) => !this.hud.objects.includes(c));
    this.uiCamera.ignore(initialNonHud);
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

    if (this.netSync) {
      this.netStatusText = this.add
        .text(GAME_WIDTH - 12, 12, 'connecting…', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '13px',
          color: '#9bd3a6',
          stroke: '#000',
          strokeThickness: 3
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(2200);
      // Net status sits with the HUD camera so the main camera's zoom
      // doesn't crop it. Push into the HUD object list, hide from main,
      // and clear the auto-ignore bit the ADDED_TO_SCENE handler set on
      // the UI camera (Phaser stores the per-camera ignore in a bitmask
      // on the GameObject).
      this.hud.objects.push(this.netStatusText);
      this.cameras.main.ignore(this.netStatusText);
      const filterHolder = this.netStatusText as unknown as { cameraFilter: number };
      filterHolder.cameraFilter = (filterHolder.cameraFilter ?? 0) & ~this.uiCamera.id;

      // Pause + flag the match if the peer disconnects mid-fight, and
      // forward an explicit "bye" message back to title-screen UX.
      const offNet = netClient.on((msg) => {
        if (msg.t === 'bye') {
          this.netStatusText?.setText(`opponent left: ${msg.reason}`);
          this.netStatusText?.setColor('#ff9a8a');
          this.matchOver = true;
        }
      });
      const offStatus = netClient.onStatus((s) => {
        if (s === 'closed' || s === 'error') {
          this.netStatusText?.setText('disconnected — press ESC for title');
          this.netStatusText?.setColor('#ff9a8a');
          this.matchOver = true;
        }
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        offNet();
        offStatus();
        netClient.disconnect('match ended');
      });
    }

    this.fpsLabel = document.getElementById('fps');
    this.loop = new FixedTimestepLoop((tick) => this.simulate(tick));

    bus.off('hit');
    bus.off('parry');
    bus.off('ko');
    bus.off('clank');

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
      const result = this.vfx.hitBundle({
        impactX: cx,
        impactY: cy,
        victimX: v.body.x,
        victimY: v.body.y,
        victimW: v.body.w,
        victimH: v.body.h,
        damage: e.damage,
        launchAngleDeg: launchDeg,
        attackerColor: tint
      });
      // Dent direction line + voice pop on every hit. Lower-tier hits get
      // smaller text + no big dent. Heavy hits read as "wham" instantly.
      if (e.damage >= 5) this.vfx.dentLine(cx, cy, launchDeg, 18 + e.damage);
      this.vfx.voicePop(cx, cy, e.damage);
      this.shake.add(result.trauma);
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

    bus.on('clank', (e) => {
      const a = this.fighters[e.aId];
      const b = this.fighters[e.bId];
      if (!a || !b) return;
      const mx = (a.body.x + b.body.x) / 2;
      const my = (a.body.y + b.body.y) / 2 - 30;
      this.vfx.clankBurst(mx, my);
      this.shake.add(0.20);
    });

    bus.on('ko', (e) => {
      const v = this.fighters[e.victimId];
      if (!v) return;
      this.vfx.koStar(v.body.x, v.body.y - v.body.h * 0.5);
      this.vfx.koFlash(0xffe04d);
      this.shake.add(1);
      this.camera.focus(v.body.x, v.body.y - 40, frameClock.tick + 64, 1.55);
      this.koFreezeUntilTick = frameClock.tick + 28;
      this.slowMoUntilTick = frameClock.tick + 64;
    });

    bus.on('land', (e) => {
      const f = this.fighters[e.fighterId];
      if (!f || e.speed < 1) return;
      this.vfx.landPoof(f.body.x, f.body.y);
    });

    bus.on('doubleJump', (e) => {
      const f = this.fighters[e.fighterId];
      if (!f) return;
      this.vfx.doubleJumpRing(f.body.x, f.body.y);
    });

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
    // Pause overlay — launches PauseScene on top while suspending the
    // match's input/simulate loop. P resumes (or ESC inside Pause).
    // launch BEFORE pause so the pause scene's create() runs while the
    // match's input is still alive (otherwise the launch never wires).
    this.input.keyboard?.on('keydown-P', () => {
      this.scene.launch('Pause');
      this.scene.pause();
    });

    // Stop the per-stage ambient drone whenever the scene shuts down
    // (rematch via R, ESC to title, or scene swap from a future menu).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => audio.stopAmbient('stage'));

    frameClock.reset();
  }

  private simulate(tick: number): boolean | void {
    if (this.matchOver) return;
    if (tick < this.koFreezeUntilTick) return;
    if (tick < this.slowMoUntilTick) {
      this.skipNextSimulate = !this.skipNextSimulate;
      if (this.skipNextSimulate) return;
    }

    if (this.netSync && this.localKeyboard && this.localBuf && this.remoteBuf) {
      // Sample fresh local input *now* and queue it for execution
      // `inputDelay` ticks in the future. Then look up the inputs that
      // were scheduled to execute on this exact tick.
      const localSample = this.localKeyboard.snapshot();
      this.netSync.sample(tick, localSample);
      const pair = this.netSync.inputsForTick(tick);
      if (!pair) {
        // Remote hasn't delivered this tick's input yet — stall.
        if (this.netStatusText) this.netStatusText.setText(`syncing… ${netClient.ping.toFixed(0)}ms`);
        return false;
      }
      this.localBuf.push(pair.local);
      this.remoteBuf.push(pair.remote);
      this.netSync.prune(tick - 60);
      if (this.netStatusText)
        this.netStatusText.setText(`net ${netClient.ping.toFixed(0)}ms · delay ${this.netSync.inputDelay}f`);
    } else {
      this.inputReader.poll();
      if (this.bot) this.bot.poll(tick);
    }

    for (const f of this.fighters) {
      f.update(tick);
      if (isOutsideBlastZone(f.body, f.world)) {
        bus.emit('ko', { victimId: f.playerIndex });
        f.stocks = Math.max(0, f.stocks - 1);
        f.fsm.force('KO', tick);
      }
    }
    hitDetection.run(this.fighters, tick);

    if (this.netSync && tick > 0 && tick % 60 === 0) {
      this.netSync.reportHash(tick, this.computeStateHash());
    }
  }

  private computeStateHash(): number {
    // Cheap rolling hash over gameplay-affecting fields. Position +
    // velocity + percent + FSM state + hitstun + facing. Enough to flag
    // any meaningful divergence without serializing the whole world.
    let h = 0x811c9dc5 | 0;
    for (const f of this.fighters) {
      h = mix(h, Math.round(f.body.x * 100));
      h = mix(h, Math.round(f.body.y * 100));
      h = mix(h, Math.round(f.body.vx * 100));
      h = mix(h, Math.round(f.body.vy * 100));
      h = mix(h, Math.round(f.percent * 10));
      h = mix(h, f.facing);
      h = mix(h, f.hitstunRemaining);
      h = mix(h, hashString(f.fsm.id ?? ''));
    }
    return h >>> 0;
  }

  update(time: number): void {
    const alpha = this.loop.tick(
      time,
      () => frameClock.tick,
      () => frameClock.advance()
    );

    this.fighterRenderer.draw(frameClock.tick, alpha);
    this.camera.update(this.fighters, frameClock.tick);
    const off = this.shake.offset();
    this.camera.applyTo(this, off.x, off.y);

    if (this.debugVisible) {
      this.debugRenderer.draw(this.fighters[0].world, this.fighters, frameClock.tick);
    } else {
      this.debugRenderer.draw(this.fighters[0].world, [], frameClock.tick);
    }
    this.hud.draw(this.fighters, frameClock.tick);

    if (this.debugVisible) {
      const sw = this.scale.gameSize.width;
      this.debugText.setVisible(true);
      this.debugText.setPosition(sw - 360, 12);
      const lines = this.fighters.map(
        (f) =>
          `P${f.playerIndex + 1} ${f.fsm.id?.padEnd(8) ?? '-'} pct=${f.percent.toFixed(0).padStart(3)} stk=${f.stocks} g=${f.body.grounded ? 'Y' : 'N'} hs=${f.hitstunRemaining}`
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
