import { InputBuffer } from './InputBuffer';
import type { InputDevice } from './InputDevice';

export class InputReader {
  constructor(
    private readonly devices: InputDevice[],
    private readonly buffers: Map<number, InputBuffer>
  ) {}

  poll(): void {
    for (const dev of this.devices) {
      const buf = this.buffers.get(dev.playerIndex);
      if (!buf) continue;
      buf.push(dev.snapshot());
    }
  }
}
