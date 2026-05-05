export class FrameClock {
  private _tick = 0;

  get tick(): number {
    return this._tick;
  }

  advance(): number {
    this._tick += 1;
    return this._tick;
  }

  reset(): void {
    this._tick = 0;
  }
}

export const frameClock = new FrameClock();
