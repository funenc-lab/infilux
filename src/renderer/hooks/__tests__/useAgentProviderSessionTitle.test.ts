/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentProviderSessionTitle } from '../useAgentProviderSessionTitle';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const readProviderSessionTitle = vi.fn();
const onProviderSessionTitle = vi.fn();

function HookHarness({ args }: { args: Parameters<typeof useAgentProviderSessionTitle>[0] }) {
  useAgentProviderSessionTitle(args);
  return React.createElement('div');
}

function mountHookHarness(args: Parameters<typeof useAgentProviderSessionTitle>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(React.createElement(HookHarness, { args }));
  });

  return {
    rerender(nextArgs: Parameters<typeof useAgentProviderSessionTitle>[0]) {
      act(() => {
        root.render(React.createElement(HookHarness, { args: nextArgs }));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useAgentProviderSessionTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readProviderSessionTitle.mockReset();
    onProviderSessionTitle.mockReset();
    window.electronAPI = {
      agentSession: {
        readProviderSessionTitle,
      },
    } as never;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('polls a resolved local Codex provider transcript until its first user title is available', async () => {
    readProviderSessionTitle
      .mockResolvedValueOnce({ title: null })
      .mockResolvedValueOnce({ title: 'Investigate recovered agent titles' });

    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'codex-session-1',
      titleSource: 'default',
      onProviderSessionTitle,
      pollIntervalMs: 1000,
      maxAttempts: 3,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(readProviderSessionTitle).toHaveBeenCalledWith({
      agentCommand: 'codex',
      providerSessionId: 'codex-session-1',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(onProviderSessionTitle).toHaveBeenCalledWith('Investigate recovered agent titles');

    mounted.unmount();
  });

  it('does not read terminal-derived titles or unresolved provider identities', async () => {
    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'ui-session-1',
      titleSource: 'default',
      onProviderSessionTitle,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(readProviderSessionTitle).not.toHaveBeenCalled();

    mounted.unmount();
  });

  it('does not replace a title that already has trusted provenance', async () => {
    const mounted = mountHookHarness({
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'codex-session-1',
      titleSource: 'enhanced-input',
      onProviderSessionTitle,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(readProviderSessionTitle).not.toHaveBeenCalled();

    mounted.unmount();
  });

  it('retries after terminal activity when the initial polling window expires', async () => {
    readProviderSessionTitle
      .mockResolvedValueOnce({ title: null })
      .mockResolvedValueOnce({ title: null })
      .mockResolvedValueOnce({ title: 'Late provider transcript title' });

    const baseArgs = {
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'codex-session-1',
      titleSource: 'default' as const,
      onProviderSessionTitle,
      pollIntervalMs: 1000,
      maxAttempts: 2,
    };
    const mounted = mountHookHarness({ ...baseArgs, activitySignal: 0 });

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(readProviderSessionTitle).toHaveBeenCalledTimes(2);

    mounted.rerender({ ...baseArgs, activitySignal: 1 });
    await act(async () => {
      await Promise.resolve();
    });

    expect(readProviderSessionTitle).toHaveBeenCalledTimes(3);
    expect(onProviderSessionTitle).toHaveBeenCalledWith('Late provider transcript title');

    mounted.unmount();
  });

  it('retries when terminal activity arrives during the final polling attempt', async () => {
    readProviderSessionTitle
      .mockResolvedValueOnce({ title: null })
      .mockResolvedValueOnce({ title: null })
      .mockResolvedValueOnce({ title: 'Title written during final lookup' });

    const baseArgs = {
      agentCommand: 'codex',
      uiSessionId: 'ui-session-1',
      providerSessionId: 'codex-session-1',
      titleSource: 'default' as const,
      onProviderSessionTitle,
      pollIntervalMs: 1000,
      maxAttempts: 2,
    };
    const mounted = mountHookHarness({ ...baseArgs, activitySignal: 0 });

    await act(async () => {
      await Promise.resolve();
    });
    mounted.rerender({ ...baseArgs, activitySignal: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(readProviderSessionTitle).toHaveBeenCalledTimes(3);
    expect(onProviderSessionTitle).toHaveBeenCalledWith('Title written during final lookup');

    mounted.unmount();
  });
});
