import { Howl, Howler } from 'howler';

/**
 * Lightweight wrapper around Howler with three independent volume
 * channels — master / sfx / ambient — each persisted to localStorage so
 * the player's mix preference survives reload. Pitch + tier layering on
 * top of Howler give the existing 7 ogg samples enough variety that
 * nothing sounds repeated even at Mash-F-jab speeds.
 *
 * Audio files are optional — if a key has no sound registered, play()
 * is a no-op. This keeps the build runnable before assets land.
 *
 * Halal note: SFX + procedural ambient pads only. No melodic music.
 */
export type AudioChannel = 'sfx' | 'ambient';

interface ChannelMix {
  master: number;
  sfx: number;
  ambient: number;
  muted: boolean;
}

const STORAGE_KEY = 'roa-vibe-audio-mix';

function loadMix(): ChannelMix {
  if (typeof localStorage === 'undefined') return { master: 0.6, sfx: 1, ambient: 0.45, muted: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { master: 0.6, sfx: 1, ambient: 0.45, muted: false, ...JSON.parse(raw) };
  } catch {
    // ignore parse errors — fall back to defaults
  }
  return { master: 0.6, sfx: 1, ambient: 0.45, muted: false };
}

function saveMix(mix: ChannelMix): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mix));
  } catch {
    // ignore quota errors — non-critical
  }
}

interface RegisteredSound {
  howl: Howl;
  channel: AudioChannel;
  /** Base volume baked into the sample (independent of master/channel mix). */
  baseVolume: number;
}

export class AudioManager {
  private sounds = new Map<string, RegisteredSound>();
  private mix: ChannelMix = loadMix();
  /**
   * Per-source procedural Web Audio buffers used for whoosh + ambient
   * pads. We keep a single AudioContext that piggybacks on Howler's
   * shared context so unlock() works for procedural too.
   */
  private get ctx(): AudioContext | null {
    return (Howler as unknown as { ctx?: AudioContext }).ctx ?? null;
  }
  private ambientNodes = new Map<string, { osc: OscillatorNode; gain: GainNode }>();

  register(key: string, urls: string[], opts: { volume?: number; channel?: AudioChannel } = {}): void {
    const channel: AudioChannel = opts.channel ?? 'sfx';
    const baseVolume = opts.volume ?? 1;
    const sound = new Howl({
      src: urls,
      volume: baseVolume,
      preload: true
    });
    this.sounds.set(key, { howl: sound, channel, baseVolume });
  }

  /**
   * Compute the effective volume for a registered sound given the
   * current master / channel / mute mix and any per-call override.
   */
  private effectiveVolume(snd: RegisteredSound, override?: number): number {
    if (this.mix.muted) return 0;
    const channelMul = snd.channel === 'sfx' ? this.mix.sfx : this.mix.ambient;
    const overrideMul = override ?? 1;
    return Math.max(0, Math.min(1, snd.baseVolume * channelMul * this.mix.master * overrideMul));
  }

  play(key: string, opts: { volume?: number; rate?: number } = {}): void {
    if (this.mix.muted) return;
    const snd = this.sounds.get(key);
    if (!snd) return;
    const id = snd.howl.play();
    snd.howl.volume(this.effectiveVolume(snd, opts.volume), id);
    if (opts.rate !== undefined) snd.howl.rate(opts.rate, id);
  }

  /**
   * Tier-mapped hit playback with pitch variation + heavy layering.
   * Light hits get +/- 10% pitch jitter; heavy hits also play a low-
   * pitched hit_med underneath for body, which fakes a custom sample
   * without needing a new file. Calling code just hands us the damage.
   */
  playHit(damage: number): void {
    const jitter = 0.92 + Math.random() * 0.16; // ±8% pitch
    if (damage >= 19) {
      this.play('hit_heavy', { rate: jitter * 0.92, volume: 1 });
      this.play('hit_med', { rate: 0.7, volume: 0.55 });
    } else if (damage >= 13) {
      this.play('hit_heavy', { rate: jitter, volume: 0.95 });
    } else if (damage >= 7) {
      this.play('hit_med', { rate: jitter, volume: 0.9 });
    } else {
      this.play('hit_light', { rate: jitter, volume: 0.85 });
    }
  }

  /**
   * Procedural whoosh — short white-noise burst with envelope, used on
   * attack startup so every swing has audio even before recorded swing
   * samples land. Pitch varies with `weight` parameter (0..1).
   */
  whoosh(weight = 0.5): void {
    const ctx = this.ctx;
    if (!ctx || this.mix.muted) return;
    const dur = 0.16 + weight * 0.12;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      // Pink-ish noise with quick attack + exp decay for the "swing" envelope
      const env = Math.pow(1 - t, 2.2);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // High-shelf-ish filtering via biquad lowpass — sweep down for "swoosh"
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400 - weight * 800, ctx.currentTime);
    lp.frequency.exponentialRampToValueAtTime(800 + weight * 200, ctx.currentTime + dur);
    const gain = ctx.createGain();
    const vol = 0.18 * this.mix.master * this.mix.sfx;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(lp).connect(gain).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  /**
   * Procedural ambient pad — a slow detuned sine drone at a chosen
   * frequency, gain-faded in. Used for stage atmosphere (forest hum,
   * mountain wind whistle). Halal note: this is a single tone, not a
   * melody, so it stays in the "ambient" category, not music.
   */
  startAmbient(key: string, freqHz: number, gainAmount = 0.18): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.ambientNodes.has(key)) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freqHz;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(gainAmount * this.mix.master * this.mix.ambient, ctx.currentTime + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.ambientNodes.set(key, { osc, gain });
  }

  stopAmbient(key: string): void {
    const node = this.ambientNodes.get(key);
    if (!node) return;
    const ctx = this.ctx;
    if (!ctx) return;
    node.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(() => {
      try {
        node.osc.stop();
        node.osc.disconnect();
        node.gain.disconnect();
      } catch {
        // Node may already be GC'd
      }
    }, 600);
    this.ambientNodes.delete(key);
  }

  setMuted(m: boolean): void {
    this.mix.muted = m;
    saveMix(this.mix);
    this.refreshAmbientGain();
  }

  setMasterVolume(v: number): void {
    this.mix.master = Math.max(0, Math.min(1, v));
    saveMix(this.mix);
    this.refreshAmbientGain();
  }

  setChannelVolume(channel: AudioChannel, v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    if (channel === 'sfx') this.mix.sfx = clamped;
    else this.mix.ambient = clamped;
    saveMix(this.mix);
    this.refreshAmbientGain();
  }

  getMix(): ChannelMix {
    return { ...this.mix };
  }

  private refreshAmbientGain(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const node of this.ambientNodes.values()) {
      const target = this.mix.muted ? 0 : 0.18 * this.mix.master * this.mix.ambient;
      node.gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.2);
    }
  }

  unlock(): void {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }
}

export const audio = new AudioManager();

/**
 * Wires gameplay events from EventBus to SFX keys. Called once from
 * MatchScene. Hits go through tiered playback (pitch jitter +
 * heavy-hit layering); jumps + lands get pitch jitter; clank gets a
 * pitched hit_light double-tap.
 */
export function bindAudioEvents(bus: { on: (event: string, fn: (e: unknown) => void) => void }): void {
  bus.on('hit', (e) => {
    const ev = e as { damage: number };
    audio.playHit(ev.damage);
  });
  bus.on('parry', () => audio.play('parry'));
  bus.on('ko', () => audio.play('ko'));
  bus.on('jump', () => audio.play('jump', { rate: 0.95 + Math.random() * 0.1 }));
  bus.on('doubleJump', () => audio.play('jump', { rate: 1.15, volume: 0.7 }));
  bus.on('land', (e) => {
    const ev = e as { speed: number };
    if (ev.speed > 1) audio.play('land', { volume: Math.min(1, 0.3 + ev.speed / 14), rate: 0.95 + Math.random() * 0.1 });
  });
  bus.on('dash', () => audio.play('land', { rate: 1.4, volume: 0.4 }));
  bus.on('clank', () => {
    audio.play('hit_light', { rate: 1.6, volume: 0.7 });
    audio.play('hit_light', { rate: 1.9, volume: 0.5 });
  });
}
