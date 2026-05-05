export abstract class State<C> {
  abstract readonly id: string;
  startedAt = 0;

  onEnter(_ctx: C, _prevId: string | null, _tick: number): void {}
  abstract onUpdate(ctx: C, tick: number): string | null;
  onExit(_ctx: C, _nextId: string, _tick: number): void {}

  elapsed(tick: number): number {
    return tick - this.startedAt;
  }
}
