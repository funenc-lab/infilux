/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UseXtermOptions } from '../../../hooks/useXterm';
import { ShellTerminal } from '../ShellTerminal';

const input = vi.hoisted(() => ({ options: null as UseXtermOptions | null, toast: vi.fn() }));

vi.mock('@/hooks/useXterm', () => ({
  useXterm: (options: UseXtermOptions) => {
    input.options = options;
    return {
      containerRef: { current: null },
      isLoading: false,
      runtimeState: 'live',
      settings: { theme: {} },
      terminal: null,
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      clearSearch: vi.fn(),
      searchState: {},
      clear: vi.fn(),
      refreshRenderer: vi.fn(),
    };
  },
}));
vi.mock('@/hooks/useTerminalScrollToBottom', () => ({
  useTerminalScrollToBottom: () => ({ showScrollToBottom: false, handleScrollToBottom: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({ toastManager: { add: input.toast } }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (text: string) => text }) }));
vi.mock('../TerminalSearchBar', () => ({ TerminalSearchBar: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ShellTerminal input feedback', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports delivery uncertainty through the existing toast surface', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(ShellTerminal));
      });
      input.options?.onInputError?.();
      expect(input.toast).toHaveBeenCalledWith({
        type: 'error',
        title: 'Failed to send message',
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('routes Shift+Enter through the guarded hook writer', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const write = vi.fn();
    try {
      await act(async () => {
        root.render(React.createElement(ShellTerminal));
      });
      expect(
        input.options?.onCustomKey?.(
          new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }),
          'session-1',
          () => null,
          write
        )
      ).toBe(false);
      input.options?.onCustomKey?.(
        new KeyboardEvent('keypress', { key: 'Enter', shiftKey: true }),
        'session-1',
        () => null,
        write
      );
      expect(write.mock.calls).toEqual([['\x0a']]);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
