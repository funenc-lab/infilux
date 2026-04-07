import type { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';
import { attachPersistentCustomWheelEventHandler } from '../xtermWheelHandlerPersistence';

describe('xtermWheelHandlerPersistence', () => {
  it('routes DOM wheel events through the latest handler even when xterm mouse reporting is disabled', () => {
    const wheelListenerRef: { current: ((event: Event) => void) | null } = {
      current: null,
    };
    const element = {
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'wheel') {
          wheelListenerRef.current =
            typeof listener === 'function'
              ? listener
              : (event: Event) => {
                  listener.handleEvent(event);
                };
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLDivElement;

    const terminal = {
      element,
      attachCustomWheelEventHandler: vi.fn(),
    } as unknown as Terminal;

    const firstHandler = vi.fn(() => true);
    attachPersistentCustomWheelEventHandler(terminal, firstHandler);

    expect(element.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), {
      passive: false,
      capture: true,
    });

    const firstEvent = { deltaY: -120 } as WheelEvent;
    const firstWheelListener = wheelListenerRef.current;
    expect(firstWheelListener).not.toBeNull();
    if (!firstWheelListener) {
      throw new Error('Expected wheel listener to be registered');
    }
    firstWheelListener(firstEvent);
    expect(firstHandler).toHaveBeenCalledWith(firstEvent);

    const secondHandler = vi.fn(() => true);
    attachPersistentCustomWheelEventHandler(terminal, secondHandler);

    expect(element.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), true);

    const secondEvent = { deltaY: 120 } as WheelEvent;
    const secondWheelListener = wheelListenerRef.current;
    expect(secondWheelListener).not.toBeNull();
    if (!secondWheelListener) {
      throw new Error('Expected wheel listener to be re-registered');
    }
    secondWheelListener(secondEvent);
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledWith(secondEvent);
  });
});
