import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { gameMode } from '../config/GameMode';
import { netClient } from '../net/NetClient';
import { DEFAULT_INPUT_DELAY, DEFAULT_PORT } from '../net/Protocol';

/**
 * Host lobby. The user is responsible for running `npm run host` in a
 * terminal — this scene just connects to it and shows status while we
 * wait for the guest to join. Once both peers are present the host
 * sends a `start` message and both sides transition into MatchScene.
 *
 * Keeping the relay out-of-process is deliberate: it lets the same
 * binary serve both LAN (`tailscale ip` discovery) and localhost test
 * runs from two browser tabs without bundling Node into Vite.
 */
export class NetHostScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private addressInput = `ws://127.0.0.1:${DEFAULT_PORT}`;
  private guestReady = false;
  private cleanup: Array<() => void> = [];

  constructor() {
    super({ key: 'NetHost' });
  }

  create() {
    this.cameras.main.setBackgroundColor('#0c0f1a');
    paintBackdrop(this);

    this.add
      .text(GAME_WIDTH / 2, 110, 'HOST A MATCH', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#ffe0a0',
        stroke: '#000',
        strokeThickness: 6
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 175, 'Step 1 — open a terminal in this folder, run:', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '15px',
        color: '#a0a8b8'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 205, 'npm run host', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '22px',
        color: '#ffe04d'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 245, 'Step 2 — share one of the printed ws:// addresses with your friend.', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '15px',
        color: '#a0a8b8'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 290, 'connect THIS browser to:', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 320, this.addressInput, {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '20px',
        color: '#cfd0d6'
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 400, 'press SPACE to connect', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '18px',
        color: '#9bd3a6'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'SPACE / ENTER connect · ESC back', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-SPACE', () => this.connect());
    this.input.keyboard?.on('keydown-ENTER', () => this.connect());
    this.input.keyboard?.on('keydown-ESC', () => this.back());

    const offStatus = netClient.onStatus((s) => {
      if (s === 'connected') this.setStatus('relay reached · waiting for guest…', '#9bd3a6');
      else if (s === 'connecting') this.setStatus('connecting to relay…', '#cfd0d6');
      else if (s === 'closed' || s === 'error') this.setStatus('disconnected — press SPACE to retry', '#ff9a8a');
    });
    const offMsg = netClient.on((msg) => {
      if (msg.t === 'hello') {
        this.setStatus(`connected as ${msg.role}. waiting for partner…`, '#9bd3a6');
      } else if (msg.t === 'ready') {
        this.guestReady = true;
        this.startMatch();
      } else if (msg.t === 'bye') {
        this.setStatus(`peer left: ${msg.reason}`, '#ff9a8a');
      }
    });
    this.cleanup.push(offStatus, offMsg);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const fn of this.cleanup) fn();
      this.cleanup = [];
    });
  }

  private connect(): void {
    netClient.connect(this.addressInput);
  }

  private setStatus(text: string, color = '#cfd0d6'): void {
    this.statusText.setText(text);
    this.statusText.setColor(color);
  }

  private startMatch(): void {
    if (!this.guestReady) return;
    const cfg = gameMode.get();
    // Roll the shared seed once and use the SAME value for the local
    // GameMode and the wire message — otherwise host + guest seed their
    // PRNGs from different sources and any future RNG-driven gameplay
    // (replays, randomized stage hazards, etc) would silently desync.
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    netClient.send({
      t: 'config',
      chars: cfg.characters,
      stage: cfg.stage,
      seed,
      inputDelay: DEFAULT_INPUT_DELAY
    });
    netClient.send({ t: 'start', startTick: 0 });
    gameMode.set({
      mode: 'vs-net',
      netSession: {
        localPlayerIndex: 0,
        inputDelay: DEFAULT_INPUT_DELAY,
        startTick: 0,
        seed
      }
    });
    this.scene.start('Match');
  }

  private back(): void {
    netClient.disconnect('host backed out');
    this.scene.start('ModeSelect');
  }
}

function paintBackdrop(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const r = Math.round(0x0e * (1 - t) + 0x2c * t);
    const gr = Math.round(0x26 * (1 - t) + 0x4a * t);
    const b = Math.round(0x40 * (1 - t) + 0x55 * t);
    g.fillStyle((r << 16) | (gr << 8) | b, 1).fillRect(0, (GAME_HEIGHT * i) / 24, GAME_WIDTH, GAME_HEIGHT / 24 + 1);
  }
}
