import type { Fighter } from './Fighter';
import type { MoveData } from '../data/schema/moves.schema';

/**
 * Cancel categories — what *kind* of action is interrupting recovery. Each
 * is mapped to which input action triggers it. Note that this layer only
 * decides "can the cancel happen now?" — actually performing the transition
 * (running tryStartAttack, JumpSquat → Jump, etc.) is the caller's job.
 */
export type CancelKind =
  | 'attack' // any standard ground/aerial attack press
  | 'special' // special button press
  | 'jump' // jump press (ground only)
  | 'parry' // parry/dodge press (also drives L-cancel)
  | 'dash'; // dash from idle, only used by some moves

export interface CancelDecision {
  /** True if the cancel should happen this frame. */
  cancel: boolean;
  /** What kind of cancel succeeded. */
  kind: CancelKind | null;
  /** How many frames back the cancel-input was buffered (0 = this frame). */
  bufferedFrames: number;
}

/**
 * Universal action buffer — every cancel check looks back this many frames
 * for a rising-edge input. Smash Ultimate uses 5; we match Phase 0
 * baseline. Per-state code may pass `customBuffer` for longer lookbacks
 * (e.g., 7-frame L-cancel window).
 */
const DEFAULT_BUFFER = 5;

/**
 * Returns whether `move` is in an interruptible window for the supplied
 * cancel kinds. If no kinds are given, all kinds are checked.
 *
 * The decision rule:
 *   1. The move must be past its IASA frame (or have no IASA = never
 *      cancellable).
 *   2. The fighter must have a buffered rising-edge for one of the kinds
 *      within the last 5 frames.
 *   3. Aerial autocancel windows are honored separately (see
 *      `aerialAutocanceledOnLand`).
 */
export function canCancel(
  f: Fighter,
  move: MoveData,
  phase: number,
  kinds: CancelKind[] = ['attack', 'special', 'jump', 'parry'],
  buffer = DEFAULT_BUFFER
): CancelDecision {
  if (move.iasaFrame === null || phase < move.iasaFrame) {
    return { cancel: false, kind: null, bufferedFrames: -1 };
  }
  for (const kind of kinds) {
    const action = kind === 'dash' ? 'attack' : kind; // `dash` reuses 'attack' input
    const buffered = f.input.bufferedFrames(action, buffer);
    if (buffered >= 0) {
      // Jump cancel only makes sense when grounded.
      if (kind === 'jump' && !f.body.grounded) continue;
      return { cancel: true, kind, bufferedFrames: buffered };
    }
  }
  return { cancel: false, kind: null, bufferedFrames: -1 };
}

/**
 * Aerial autocancel — landing inside `[autoCancelAfter, ...]` or before
 * `autoCancelBefore` skips landing lag entirely. Equivalent to the
 * frame-data definition of an autocancel window.
 */
export function aerialAutocanceledOnLand(move: MoveData, phase: number): boolean {
  return (
    (move.autoCancelBefore !== null && phase < move.autoCancelBefore) ||
    (move.autoCancelAfter !== null && phase >= move.autoCancelAfter)
  );
}

/**
 * L-cancel — pressing parry/shield within the last 7 frames before landing
 * during an aerial attack reduces the next landing lag by half. This is
 * Melee canon; Smash 4+ removed it (auto-L-cancel) but our project keeps
 * it for tournament-tech depth.
 */
export function lCanceled(f: Fighter, move: MoveData): boolean {
  if (!move.lCancelable) return false;
  return f.input.bufferedFrames('parry', 7) >= 0 || f.input.isHeld('parry');
}
