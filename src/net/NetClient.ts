import type { CharacterId, StageId } from '../config/GameMode';
import { decode, encode, type Msg, type Role } from './Protocol';

type Listener = (msg: Msg) => void;

/**
 * Thin browser-side WebSocket wrapper. Owns the socket and exposes a
 * tiny pub/sub API. The match scene's NetSync drives sequencing on top —
 * NetClient itself is intentionally dumb so it can be stubbed in tests.
 */
export class NetClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(status: NetStatus) => void>();
  private _role: Role | null = null;
  private _status: NetStatus = 'idle';
  private _ping = 0;
  private pingTimer: number | null = null;

  get role(): Role | null {
    return this._role;
  }
  get status(): NetStatus {
    return this._status;
  }
  get ping(): number {
    return this._ping;
  }

  connect(url: string): void {
    this.disconnect();
    this.setStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => this.setStatus('connected');
    ws.onclose = () => {
      this.setStatus('closed');
      this.stopPing();
    };
    ws.onerror = () => this.setStatus('error');
    ws.onmessage = (ev) => {
      const msg = decode(typeof ev.data === 'string' ? ev.data : '');
      if (!msg) return;
      if (msg.t === 'hello') {
        this._role = msg.role;
        this.startPing();
      }
      if (msg.t === 'pong') {
        this._ping = Math.max(0, performance.now() - msg.t0);
      }
      for (const l of this.listeners) l(msg);
    };
  }

  send(msg: Msg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: NetStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this._status);
    return () => this.statusListeners.delete(fn);
  }

  disconnect(reason = 'client closed'): void {
    if (this.ws) {
      try {
        this.send({ t: 'bye', reason });
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.stopPing();
    this._role = null;
    this.setStatus('idle');
  }

  private setStatus(s: NetStatus): void {
    this._status = s;
    for (const l of this.statusListeners) l(s);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ t: 'ping', t0: performance.now() });
    }, 1000);
  }
  private stopPing(): void {
    if (this.pingTimer != null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

export type NetStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

/**
 * Singleton — one socket per browser tab. Lobby + match scenes share
 * this instance so connection state survives scene transitions.
 */
export const netClient = new NetClient();

export interface NetSession {
  chars: [CharacterId, CharacterId];
  stage: StageId;
  seed: number;
  inputDelay: number;
  startTick: number;
  /** 0 if local player is host, 1 if guest. Drives which slot reads the keyboard. */
  localPlayerIndex: 0 | 1;
}
