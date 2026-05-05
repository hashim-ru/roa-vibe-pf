import { describe, it, expect } from 'vitest';
import { InputBuffer } from '../input/InputBuffer';
import { emptyInput } from '../input/InputState';

describe('InputBuffer', () => {
  it('detects rising edge as justPressed', () => {
    const b = new InputBuffer();
    b.push({ ...emptyInput(), jump: false });
    b.push({ ...emptyInput(), jump: true });
    expect(b.justPressed('jump')).toBe(true);
  });

  it('does not flag held button as justPressed after first frame', () => {
    const b = new InputBuffer();
    b.push({ ...emptyInput(), jump: false });
    b.push({ ...emptyInput(), jump: true });
    b.push({ ...emptyInput(), jump: true });
    expect(b.justPressed('jump')).toBe(false);
  });

  it('returns frames-ago for buffered press within window', () => {
    const b = new InputBuffer();
    b.push({ ...emptyInput(), attack: false });
    b.push({ ...emptyInput(), attack: true });
    b.push({ ...emptyInput(), attack: false });
    b.push({ ...emptyInput(), attack: false });
    expect(b.bufferedFrames('attack', 5)).toBe(2);
  });

  it('counts heldFrames consecutively backwards', () => {
    const b = new InputBuffer();
    b.push({ ...emptyInput(), parry: false });
    b.push({ ...emptyInput(), parry: true });
    b.push({ ...emptyInput(), parry: true });
    b.push({ ...emptyInput(), parry: true });
    expect(b.heldFrames('parry')).toBe(3);
  });
});
