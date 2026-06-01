/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTerminalScrollToBottom } from '../useTerminalScrollToBottom';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Listener = () => void;
type EventName = 'lineFeed' | 'render' | 'resize' | 'scroll' | 'writeParsed';

class MockTerminal {
  rows = 24;
  buffer = {
    active: {
      baseY: 0,
      viewportY: 0,
    },
  };
  readonly clearSelection = vi.fn();
  readonly focus = vi.fn();
  readonly scrollToBottom = vi.fn(() => {
    this.buffer.active.viewportY = this.buffer.active.baseY;
  });

  private readonly listeners: Record<EventName, Set<Listener>> = {
    lineFeed: new Set(),
    render: new Set(),
    resize: new Set(),
    scroll: new Set(),
    writeParsed: new Set(),
  };

  onLineFeed(listener: Listener) {
    return this.subscribe('lineFeed', listener);
  }

  onRender(listener: Listener) {
    return this.subscribe('render', listener);
  }

  onResize(listener: Listener) {
    return this.subscribe('resize', listener);
  }

  onScroll(listener: Listener) {
    return this.subscribe('scroll', listener);
  }

  onWriteParsed(listener: Listener) {
    return this.subscribe('writeParsed', listener);
  }

  emit(eventName: EventName) {
    for (const listener of this.listeners[eventName]) {
      listener();
    }
  }

  private subscribe(eventName: EventName, listener: Listener) {
    this.listeners[eventName].add(listener);
    return {
      dispose: () => {
        this.listeners[eventName].delete(listener);
      },
    };
  }
}

function ScrollHarness({ terminal }: { terminal: MockTerminal | null }) {
  const { showScrollToBottom, handleScrollToBottom } = useTerminalScrollToBottom(terminal as never);

  return React.createElement(
    'div',
    {
      'data-testid': 'scroll-state',
      'data-visible': String(showScrollToBottom),
    },
    showScrollToBottom
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: handleScrollToBottom,
          },
          'scroll'
        )
      : null
  );
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function mountHarness(terminal: MockTerminal | null) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(ScrollHarness, { terminal }));
    await flushMicrotasks();
  });

  return {
    container,
    rerender: async (nextTerminal: MockTerminal | null) => {
      await act(async () => {
        root.render(React.createElement(ScrollHarness, { terminal: nextTerminal }));
        await flushMicrotasks();
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await flushMicrotasks();
      });
      container.remove();
    },
  };
}

describe('useTerminalScrollToBottom', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('shows the control immediately when the terminal is already scrolled away from the bottom', async () => {
    const terminal = new MockTerminal();
    terminal.buffer.active.baseY = 24;
    terminal.buffer.active.viewportY = 0;

    const mounted = await mountHarness(terminal);

    expect(
      mounted.container.querySelector('[data-testid="scroll-state"]')?.getAttribute('data-visible')
    ).toBe('true');

    await mounted.unmount();
  });

  it('reacts to parsed output events when new content pushes the viewport away from the bottom', async () => {
    const terminal = new MockTerminal();
    const mounted = await mountHarness(terminal);

    expect(
      mounted.container.querySelector('[data-testid="scroll-state"]')?.getAttribute('data-visible')
    ).toBe('false');

    terminal.buffer.active.baseY = 18;
    terminal.buffer.active.viewportY = 0;

    await act(async () => {
      terminal.emit('writeParsed');
      await flushMicrotasks();
    });

    expect(
      mounted.container.querySelector('[data-testid="scroll-state"]')?.getAttribute('data-visible')
    ).toBe('true');

    await mounted.unmount();
  });

  it('clears selection, focuses the terminal, and hides the control after scrolling back to bottom', async () => {
    const terminal = new MockTerminal();
    terminal.buffer.active.baseY = 20;
    terminal.buffer.active.viewportY = 10;

    const mounted = await mountHarness(terminal);
    const button = mounted.container.querySelector<HTMLButtonElement>('button');
    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(terminal.clearSelection).toHaveBeenCalledTimes(1);
    expect(terminal.focus).toHaveBeenCalledTimes(1);
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(terminal.buffer.active.viewportY).toBe(20);
    expect(
      mounted.container.querySelector('[data-testid="scroll-state"]')?.getAttribute('data-visible')
    ).toBe('false');

    await mounted.unmount();
  });
});
