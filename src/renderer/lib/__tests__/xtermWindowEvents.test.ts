import { describe, expect, it, vi } from 'vitest';
import { createXtermWindowEventHub } from '../xtermWindowEvents';

type ListenerMap = Map<string, Set<EventListener>>;

function createEventTargetMock() {
  const listeners: ListenerMap = new Map();

  return {
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      const eventListeners = listeners.get(event) ?? new Set<EventListener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    }),
    removeEventListener: vi.fn((event: string, listener: EventListener) => {
      const eventListeners = listeners.get(event);
      if (!eventListeners) {
        return;
      }
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        listeners.delete(event);
      }
    }),
    emit: (event: string) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(new Event(event));
      }
    },
    getListenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

describe('xtermWindowEvents', () => {
  it('shares a single underlying resize listener across multiple subscribers', () => {
    const windowTarget = createEventTargetMock();
    const hub = createXtermWindowEventHub({
      windowTarget,
      documentTarget: createEventTargetMock(),
    });
    const onResizeA = vi.fn();
    const onResizeB = vi.fn();

    const cleanupA = hub.subscribeResize(onResizeA);
    const cleanupB = hub.subscribeResize(onResizeB);

    expect(windowTarget.addEventListener).toHaveBeenCalledTimes(1);
    expect(windowTarget.getListenerCount('resize')).toBe(1);

    windowTarget.emit('resize');

    expect(onResizeA).toHaveBeenCalledTimes(1);
    expect(onResizeB).toHaveBeenCalledTimes(1);

    cleanupA();
    expect(windowTarget.removeEventListener).not.toHaveBeenCalled();

    cleanupB();
    expect(windowTarget.removeEventListener).toHaveBeenCalledTimes(1);
    expect(windowTarget.getListenerCount('resize')).toBe(0);
  });

  it('keeps focus and visibility subscriptions isolated by event type', () => {
    const windowTarget = createEventTargetMock();
    const documentTarget = createEventTargetMock();
    const hub = createXtermWindowEventHub({
      windowTarget,
      documentTarget,
    });
    const onFocus = vi.fn();
    const onVisibility = vi.fn();

    const cleanupFocus = hub.subscribeFocus(onFocus);
    const cleanupVisibility = hub.subscribeVisibilityChange(onVisibility);

    expect(windowTarget.getListenerCount('focus')).toBe(1);
    expect(documentTarget.getListenerCount('visibilitychange')).toBe(1);

    windowTarget.emit('focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onVisibility).not.toHaveBeenCalled();

    documentTarget.emit('visibilitychange');
    expect(onVisibility).toHaveBeenCalledTimes(1);

    cleanupFocus();
    cleanupVisibility();

    expect(windowTarget.getListenerCount('focus')).toBe(0);
    expect(documentTarget.getListenerCount('visibilitychange')).toBe(0);
  });
});
