/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeferredComponentLoader } from '../useDeferredComponentLoader';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type TestModule = {
  Panel: React.ComponentType;
};

interface HarnessProps {
  load: () => Promise<TestModule>;
  shouldLoad?: boolean;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function TestPanel() {
  return React.createElement('div', { 'data-testid': 'loaded-panel' });
}

function selectTestPanel(module: TestModule): React.ComponentType {
  return module.Panel;
}

function Harness({ load, shouldLoad = true }: HarnessProps) {
  const { Component, error, retry } = useDeferredComponentLoader<TestModule, Record<string, never>>(
    {
      shouldLoad,
      load,
      selectComponent: selectTestPanel,
      errorLabel: 'Test panel',
    }
  );

  if (Component) {
    return React.createElement(Component);
  }

  if (error) {
    return React.createElement(
      'button',
      {
        'data-testid': 'retry',
        onClick: retry,
        type: 'button',
      },
      error.message
    );
  }

  return React.createElement('div', { 'data-testid': 'loading' });
}

async function renderHarness(props: HarnessProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(React.createElement(Harness, props));
  });

  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe('useDeferredComponentLoader', () => {
  it('surfaces loader failures and retries the import on demand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi
      .fn<() => Promise<TestModule>>()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValueOnce({ Panel: TestPanel });

    const view = await renderHarness({ load });

    expect(view.querySelector('[data-testid="loading"]')).toBeNull();
    const retryButton = view.querySelector<HTMLButtonElement>('[data-testid="retry"]');
    expect(retryButton?.textContent).toBe('chunk unavailable');
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      retryButton?.click();
    });

    expect(view.querySelector('[data-testid="loaded-panel"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="retry"]')).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not call the loader while loading is disabled', async () => {
    const load = vi.fn<() => Promise<TestModule>>().mockResolvedValue({ Panel: TestPanel });

    const view = await renderHarness({ load, shouldLoad: false });

    expect(view.querySelector('[data-testid="loading"]')).not.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
