export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
  special: boolean;
  parry: boolean;
  grab: boolean;
  smashMod: boolean;
  stickX: number;
  stickY: number;
}

export function emptyInput(): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    attack: false,
    special: false,
    parry: false,
    grab: false,
    smashMod: false,
    stickX: 0,
    stickY: 0
  };
}

export type ActionKey =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'special'
  | 'parry'
  | 'grab'
  | 'smashMod';
