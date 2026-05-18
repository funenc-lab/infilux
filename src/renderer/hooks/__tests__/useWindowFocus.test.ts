/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let latestShouldPoll = true;

async function mountShouldPollHarness() {
  const { useShouldPoll } = await import('../useWindowFocus');

  function HookHarness() {
    latestShouldPoll = useShouldPoll();
    return React.createElement('div');
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(React.createElement(HookHarness));
  });

  return {
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useShouldPoll', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    latestShouldPoll = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('starts idle detection when the first subscriber mounts', async () => {
    const mounted = await mountShouldPollHarness();

    expect(latestShouldPoll).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(latestShouldPoll).toBe(false);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    });

    expect(latestShouldPoll).toBe(true);

    mounted.unmount();
  });

  it('does not restart idle detection when no subscribers remain', async () => {
    const mounted = await mountShouldPollHarness();
    mounted.unmount();

    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    });

    expect(vi.getTimerCount()).toBe(0);
  });
});
