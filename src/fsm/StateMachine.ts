import { State } from './State';

export class StateMachine<C> {
  private states = new Map<string, State<C>>();
  private currentId: string | null = null;
  private current: State<C> | null = null;

  constructor(private readonly ctx: C) {}

  register(state: State<C>): this {
    this.states.set(state.id, state);
    return this;
  }

  registerMany(states: State<C>[]): this {
    for (const s of states) this.register(s);
    return this;
  }

  get id(): string | null {
    return this.currentId;
  }

  /** Tick when the current state was entered. Useful for renderer interp. */
  get enterTick(): number {
    return this.current?.startedAt ?? 0;
  }

  is(id: string): boolean {
    return this.currentId === id;
  }

  getState<T extends State<C>>(id: string): T | undefined {
    return this.states.get(id) as T | undefined;
  }

  /** Force-transitions even if a state would normally not allow it. Used for hitstun. */
  force(nextId: string, tick: number): void {
    this.transitionTo(nextId, tick);
  }

  start(initialId: string, tick: number): void {
    this.transitionTo(initialId, tick);
  }

  update(tick: number): void {
    if (!this.current) return;
    const next = this.current.onUpdate(this.ctx, tick);
    if (next && next !== this.currentId) {
      this.transitionTo(next, tick);
    }
  }

  private transitionTo(nextId: string, tick: number): void {
    const next = this.states.get(nextId);
    if (!next) {
      console.warn(`[FSM] unknown state: ${nextId}`);
      return;
    }
    if (this.current) {
      this.current.onExit(this.ctx, nextId, tick);
    }
    const prevId = this.currentId;
    this.currentId = nextId;
    this.current = next;
    next.startedAt = tick;
    next.onEnter(this.ctx, prevId, tick);
  }
}
