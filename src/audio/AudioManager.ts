import { Howl, Howler } from 'howler';

/**
 * Lightweight wrapper around Howler. Audio files are optional — if a key has
 * no sound registered, play() is a no-op. This keeps the build runnable
 * before assets land. Halal note: only SFX, no music tracks.
 */
export class AudioManager {
  private sounds = new Map<string, Howl>();
  private muted = false;
  private masterVolume = 0.6;

  register(key: string, urls: string[], opts: { volume?: number } = {}): void {
    const sound = new Howl({
      src: urls,
      volume: opts.volume ?? 1,
      preload: true
    });
    this.sounds.set(key, sound);
  }

  play(key: string, opts: { volume?: number; rate?: number } = {}): void {
    if (this.muted) return;
    const s = this.sounds.get(key);
    if (!s) return;
    const id = s.play();
    if (opts.volume !== undefined) s.volume(opts.volume * this.masterVolume, id);
    else s.volume(this.masterVolume, id);
    if (opts.rate !== undefined) s.rate(opts.rate, id);
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  setVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }

  unlock(): void {
    const ctx = (Howler as unknown as { ctx?: AudioContext }).ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }
}

export const audio = new AudioManager();

/**
 * Wires gameplay events from EventBus to SFX keys. Called once from MatchScene.
 */
export function bindAudioEvents(bus: { on: (event: string, fn: (e: unknown) => void) => void }): void {
  bus.on('hit', (e) => {
    const ev = e as { damage: number };
    if (ev.damage >= 13) audio.play('hit_heavy');
    else if (ev.damage >= 7) audio.play('hit_med');
    else audio.play('hit_light');
  });
  bus.on('parry', () => audio.play('parry'));
  bus.on('ko', () => audio.play('ko'));
  bus.on('jump', () => audio.play('jump', { rate: 0.95 + Math.random() * 0.1 }));
  bus.on('doubleJump', () => audio.play('jump', { rate: 1.15, volume: 0.7 }));
  bus.on('land', (e) => {
    const ev = e as { speed: number };
    if (ev.speed > 1) audio.play('land', { volume: Math.min(1, 0.3 + ev.speed / 14) });
  });
  bus.on('dash', () => audio.play('land', { rate: 1.4, volume: 0.4 }));
}
