import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/game.config';
import { gameMode } from '../config/GameMode';
import { netClient } from '../net/NetClient';
import { DEFAULT_PORT } from '../net/Protocol';

const STORAGE_KEY = 'kotv.netJoin.lastIp';

/**
 * Guest lobby. The user types the host's address (LAN IP, Tailscale IP,
 * or `localhost`) and presses ENTER. We connect, listen for the host's
 * `config` + `start` messages, then transition into MatchScene with
 * `localPlayerIndex = 1`. The last successful address is persisted so
 * repeat connects feel like one keypress.
 */
export class NetJoinScene extends Phaser.Scene {
  private addressInput = '';
  private addressText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cleanup: Array<() => void> = [];

  constructor() {
    super({ key: 'NetJoin' });
  }

  create() {
    this.cameras.main.setBackgroundColor('#0c0f1a');
    paintBackdrop(this);

    this.addressInput =
      window.localStorage?.getItem(STORAGE_KEY) ?? `127.0.0.1:${DEFAULT_PORT}`;

    this.add
      .text(GAME_WIDTH / 2, 110, 'JOIN A MATCH', {
        fontFamily: 'Cinzel, ui-serif, serif',
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#ffe0a0',
        stroke: '#000',
        strokeThickness: 6
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 175, 'enter your friend\'s host address', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '15px',
        color: '#a0a8b8'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 200, '(e.g. 100.64.1.5:8080 from `tailscale ip -4`)', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.addressText = this.add
      .text(GAME_WIDTH / 2, 270, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '26px',
        color: '#ffe04d',
        backgroundColor: '#1a1f2e',
        padding: { x: 12, y: 8 }
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 360, 'press ENTER to connect', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '18px',
        color: '#9bd3a6'
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'type to edit · ENTER connect · ESC back', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#7a8298'
      })
      .setOrigin(0.5);

    this.refresh();

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    const offStatus = netClient.onStatus((s) => {
      if (s === 'connecting') this.setStatus('connecting…', '#cfd0d6');
      else if (s === 'connected') this.setStatus('connected — waiting for host config…', '#9bd3a6');
      else if (s === 'closed' || s === 'error') this.setStatus('disconnected — press ENTER to retry', '#ff9a8a');
    });
    const offMsg = netClient.on((msg) => {
      if (msg.t === 'hello') {
        // Announce to host that we are present so it can start the match.
        netClient.send({ t: 'ready' });
      } else if (msg.t === 'config') {
        gameMode.set({
          mode: 'vs-net',
          characters: msg.chars,
          stage: msg.stage,
          netSession: {
            localPlayerIndex: 1,
            inputDelay: msg.inputDelay,
            startTick: 0,
            seed: msg.seed
          }
        });
      } else if (msg.t === 'start') {
        this.scene.start('Match');
      } else if (msg.t === 'bye') {
        this.setStatus(`disconnected: ${msg.reason}`, '#ff9a8a');
      }
    });
    this.cleanup.push(offStatus, offMsg);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const fn of this.cleanup) fn();
      this.cleanup = [];
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      this.connect();
      return;
    }
    if (e.key === 'Escape') {
      this.back();
      return;
    }
    if (e.key === 'Backspace') {
      this.addressInput = this.addressInput.slice(0, -1);
      this.refresh();
      return;
    }
    if (e.key.length === 1 && /[0-9a-zA-Z.:_-]/.test(e.key)) {
      this.addressInput += e.key;
      this.refresh();
    }
  }

  private refresh(): void {
    this.addressText.setText(this.addressInput.length ? this.addressInput : ' ');
  }

  private connect(): void {
    if (!this.addressInput.trim()) return;
    let url = this.addressInput.trim();
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) url = `ws://${url}`;
    if (!url.match(/:\d+/)) url = `${url}:${DEFAULT_PORT}`;
    window.localStorage?.setItem(STORAGE_KEY, this.addressInput);
    netClient.connect(url);
  }

  private setStatus(text: string, color = '#cfd0d6'): void {
    this.statusText.setText(text);
    this.statusText.setColor(color);
  }

  private back(): void {
    netClient.disconnect('guest backed out');
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
