import { describe, expect, it, vi } from 'vitest';
import { attachPersistentCustomWheelEventHandler } from '../xtermWheelHandlerPersistence';

type WheelHandler = (event: WheelEvent) => boolean;

class FakeTerminal {
  _customWheelEventHandler?: WheelHandler;

  readonly attachCustomWheelEventHandler = vi.fn((handler: WheelHandler) => {
    this._customWheelEventHandler = handler;
  });

  readonly originalReset = vi.fn(() => {
    this._customWheelEventHandler = undefined;
  });

  reset = this.originalReset;
}

describe('attachPersistentCustomWheelEventHandler', () => {
  it('attaches the provided wheel handler immediately', () => {
    const terminal = new FakeTerminal();
    const handler: WheelHandler = vi.fn(() => false);

    attachPersistentCustomWheelEventHandler(terminal as never, handler);

    expect(terminal.attachCustomWheelEventHandler).toHaveBeenCalledTimes(1);
    expect(terminal._customWheelEventHandler).toBe(handler);
  });

  it('restores the wheel handler after terminal reset clears it', () => {
    const terminal = new FakeTerminal();
    const handler: WheelHandler = vi.fn(() => false);

    attachPersistentCustomWheelEventHandler(terminal as never, handler);
    terminal.reset();

    expect(terminal.originalReset).toHaveBeenCalledTimes(1);
    expect(terminal.attachCustomWheelEventHandler).toHaveBeenCalledTimes(2);
    expect(terminal._customWheelEventHandler).toBe(handler);
  });

  it('wraps reset only once and restores the latest handler', () => {
    const terminal = new FakeTerminal();
    const firstHandler: WheelHandler = vi.fn(() => false);
    const secondHandler: WheelHandler = vi.fn(() => false);

    attachPersistentCustomWheelEventHandler(terminal as never, firstHandler);
    const wrappedReset = terminal.reset;
    attachPersistentCustomWheelEventHandler(terminal as never, secondHandler);

    expect(terminal.reset).toBe(wrappedReset);

    terminal.reset();

    expect(terminal.originalReset).toHaveBeenCalledTimes(1);
    expect(terminal._customWheelEventHandler).toBe(secondHandler);
  });
});
