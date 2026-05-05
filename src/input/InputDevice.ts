import { ActionKey, emptyInput, InputState } from './InputState';

export interface InputDevice {
  readonly playerIndex: number;
  snapshot(): InputState;
}

type KeyMap = Record<ActionKey | 'leftAxis' | 'rightAxis' | 'upAxis' | 'downAxis', string[]>;

export class KeyboardDevice implements InputDevice {
  private held = new Set<string>();

  constructor(public readonly playerIndex: number, private readonly keys: KeyMap) {
    window.addEventListener('keydown', (e) => {
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });
    window.addEventListener('blur', () => this.held.clear());
  }

  private isAny(codes: string[]): boolean {
    for (const c of codes) if (this.held.has(c)) return true;
    return false;
  }

  snapshot(): InputState {
    const s = emptyInput();
    s.left = this.isAny(this.keys.left);
    s.right = this.isAny(this.keys.right);
    s.up = this.isAny(this.keys.up);
    s.down = this.isAny(this.keys.down);
    s.jump = this.isAny(this.keys.jump);
    s.attack = this.isAny(this.keys.attack);
    s.special = this.isAny(this.keys.special);
    s.parry = this.isAny(this.keys.parry);
    s.grab = this.isAny(this.keys.grab);
    s.smashMod = this.isAny(this.keys.smashMod);
    s.stickX = (s.right ? 1 : 0) + (s.left ? -1 : 0);
    s.stickY = (s.down ? 1 : 0) + (s.up ? -1 : 0);
    return s;
  }
}

export const P1_KEYS: KeyMap = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  jump: ['Space'],
  attack: ['KeyF'],
  special: ['KeyG'],
  parry: ['KeyH'],
  grab: ['KeyJ'],
  smashMod: ['ShiftLeft'],
  leftAxis: [],
  rightAxis: [],
  upAxis: [],
  downAxis: []
};

export const P2_KEYS: KeyMap = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  jump: ['ShiftRight'],
  attack: ['Slash'],
  special: ['Period'],
  parry: ['ControlRight'],
  grab: ['AltRight'],
  smashMod: ['Numpad0'],
  leftAxis: [],
  rightAxis: [],
  upAxis: [],
  downAxis: []
};
