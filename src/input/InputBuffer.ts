import { ActionKey, emptyInput, InputState } from './InputState';

const CAPACITY = 12;

export class InputBuffer {
  private history: InputState[] = [];

  push(state: InputState): void {
    this.history.push({ ...state });
    if (this.history.length > CAPACITY) this.history.shift();
  }

  current(): InputState {
    return this.history[this.history.length - 1] ?? emptyInput();
  }

  previous(): InputState {
    return this.history[this.history.length - 2] ?? emptyInput();
  }

  /** Returns frames-ago of the most recent rising edge for `action`, or -1 if none within window. */
  bufferedFrames(action: ActionKey, withinFrames = 5): number {
    if (typeof this.history[0]?.[action] !== 'boolean') return -1;
    const max = Math.min(withinFrames, this.history.length - 1);
    for (let i = 0; i <= max; i++) {
      const idx = this.history.length - 1 - i;
      const cur = this.history[idx];
      const prev = this.history[idx - 1];
      if (!cur || !prev) break;
      if (!prev[action] && cur[action]) return i;
    }
    return -1;
  }

  justPressed(action: ActionKey): boolean {
    return this.bufferedFrames(action, 1) === 0;
  }

  isHeld(action: ActionKey): boolean {
    const cur = this.current();
    return Boolean(cur[action]);
  }

  /** Number of consecutive frames `action` has been held including the current one. */
  heldFrames(action: ActionKey): number {
    let count = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i][action]) count += 1;
      else break;
    }
    return count;
  }

  clear(): void {
    this.history = [];
  }
}
