import type { InputState } from '../input/InputState';
import { emptyInput } from '../input/InputState';
import type { NetClient } from './NetClient';
import { packInput, unpackInput, type Msg } from './Protocol';

/**
 * Delay-based netcode coordinator.
 *
 * Both peers run the same simulation tick at the same wall-clock time
 * (give or take). Local input is recorded each tick and queued to be
 * applied N frames later — this gives the network time to deliver it
 * to the remote so both sides execute that input on the same tick.
 *
 * - `sample(localTick, localInput)` — call once per simulate tick, before
 *   reading inputs. Sends local input over the wire, recorded against
 *   the *future* execution tick (`localTick + delay`).
 * - `inputsForTick(execTick)` — returns `{ local, remote } | null`. Null
 *   means we're missing the remote input for this tick → caller should
 *   stall (do not advance the tick).
 *
 * The two peers must agree on input delay before the match starts —
 * the host picks it from the lobby config and the guest receives it.
 */
export class NetSync {
  private localQueue = new Map<number, InputState>();
  private remoteQueue = new Map<number, InputState>();
  private pendingHashes = new Map<number, number>();
  /** Fired when a hash mismatch is detected. */
  public onDesync: ((tick: number, ours: number, theirs: number) => void) | null = null;

  constructor(
    private readonly client: NetClient,
    public readonly localPlayerIndex: 0 | 1,
    public readonly inputDelay: number,
    public readonly startTick: number
  ) {
    client.on((msg) => this.consume(msg));
    // Pre-fill the first `inputDelay` ticks for both sides with empty
    // input so the sim can start without stalling on the very first frame.
    for (let t = startTick; t < startTick + inputDelay; t++) {
      this.localQueue.set(t, emptyInput());
      this.remoteQueue.set(t, emptyInput());
    }
  }

  /** Record + transmit local input for the tick this input was sampled at. */
  sample(localTick: number, input: InputState): void {
    const execTick = localTick + this.inputDelay;
    this.localQueue.set(execTick, input);
    const { mask, sx, sy } = packInput(input);
    this.client.send({ t: 'input', tick: execTick, mask, sx, sy });
  }

  inputsForTick(execTick: number): { local: InputState; remote: InputState } | null {
    const local = this.localQueue.get(execTick);
    const remote = this.remoteQueue.get(execTick);
    if (!local || !remote) return null;
    return { local, remote };
  }

  /** Drop entries older than `keepFrom` to bound memory. */
  prune(keepFrom: number): void {
    for (const k of this.localQueue.keys()) if (k < keepFrom) this.localQueue.delete(k);
    for (const k of this.remoteQueue.keys()) if (k < keepFrom) this.remoteQueue.delete(k);
  }

  /** Send a state hash + check against remote's hash for the same tick. */
  reportHash(tick: number, hash: number): void {
    this.client.send({ t: 'hash', tick, hash });
    const remoteHash = this.pendingHashes.get(tick);
    if (remoteHash !== undefined) {
      this.pendingHashes.delete(tick);
      if (remoteHash !== hash) this.onDesync?.(tick, hash, remoteHash);
    } else {
      // Stash our own hash so the late arrival from the peer can compare.
      // Using same map; opposite-keyed tick won't collide since each tick
      // is reported at most once by each side.
      this.pendingHashes.set(tick, hash);
    }
  }

  private consume(msg: Msg): void {
    if (msg.t === 'input') {
      this.remoteQueue.set(msg.tick, unpackInput(msg.mask, msg.sx, msg.sy));
    } else if (msg.t === 'hash') {
      const ours = this.pendingHashes.get(msg.tick);
      if (ours !== undefined) {
        this.pendingHashes.delete(msg.tick);
        if (ours !== msg.hash) this.onDesync?.(msg.tick, ours, msg.hash);
      } else {
        this.pendingHashes.set(msg.tick, msg.hash);
      }
    }
  }
}
