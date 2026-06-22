/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type UseXtermOptions, useXterm } from '../useXterm';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface SessionSubscriptionHandlers {
  onData?: (event: { sessionId: string; data: string }) => void;
  onExit?: (event: { sessionId: string; exitCode: number; signal?: number }) => void;
  onState?: (event: { sessionId: string; state: 'live' | 'reconnecting' | 'dead' }) => void;
}

const testState = vi.hoisted(() => ({
  latestSnapshot: {
    isLoading: false,
    runtimeState: 'live' as 'live' | 'reconnecting' | 'dead',
  },
  sessionHandlers: null as SessionSubscriptionHandlers | null,
  attachPromise: null as Promise<unknown> | null,
  resolveAttach: null as ((value: unknown) => void) | null,
  sessionCreate: vi.fn(async () => ({
    session: {
      sessionId: 'backend-session-1',
      backend: 'local' as const,
      kind: 'agent' as const,
      cwd: '/repo/worktree',
      persistOnDisconnect: false,
      createdAt: 1,
      runtimeState: 'live' as const,
      metadata: undefined,
    },
  })),
  sessionAttach: vi.fn(() => {
    testState.attachPromise ??= new Promise((resolve) => {
      testState.resolveAttach = resolve;
    });
    return testState.attachPromise as Promise<unknown>;
  }),
  sessionDetach: vi.fn(async () => undefined),
  sessionKill: vi.fn(async () => undefined),
  sessionResize: vi.fn(async () => undefined),
  sessionWrite: vi.fn(async () => undefined),
  sessionGetRuntimeInfo: vi.fn(async () => null),
  tmuxScrollClient: vi.fn(async () => ({
    applied: true,
    inMode: true,
    paneId: '%0',
  })),
  remoteGetStatus: vi.fn(async () => ({ connected: false })),
  navigationToFile: vi.fn(),
  sessionOpen: vi.fn(),
  terminalWrite: vi.fn(),
  terminalDataHandler: null as ((data: string) => void) | null,
  customKeyHandler: null as ((event: KeyboardEvent) => boolean) | null,
  terminalBufferLines: [] as Array<{ text: string; isWrapped?: boolean }>,
  terminalCursorY: 0,
  terminalBaseY: 0,
  textareaEventTypes: [] as string[],
  latestTextarea: null as HTMLTextAreaElement | null,
  terminalFocus: vi.fn(),
  attachedWheelHandler: null as ((event: WheelEvent) => boolean | undefined) | null,
  resolveAgentWheelPolicy: vi.fn((_input?: unknown) => ({
    action: 'delegate' as const,
    carryY: 0,
  })),
  hookProps: {} as Partial<UseXtermOptions>,
  intersectionObserve: vi.fn(),
  intersectionDisconnect: vi.fn(),
  resizeObserve: vi.fn(),
  resizeDisconnect: vi.fn(),
  unsubscribeVisibility: vi.fn(),
  unsubscribeFocus: vi.fn(),
  unsubscribeResize: vi.fn(),
  activationRefreshCalls: [] as Array<{
    fitViewport: () => void;
    refresh: () => void;
    focus: () => void;
  }>,
  viewportSyncCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    element = document.createElement('div');
    textarea: HTMLTextAreaElement | null = document.createElement('textarea');
    options: Record<string, unknown> = {};
    unicode = { activeVersion: '11' };
    buffer = {
      active: {
        type: 'normal',
        get cursorY() {
          return testState.terminalCursorY;
        },
        get baseY() {
          return testState.terminalBaseY;
        },
        getLine: (index: number) => {
          const line = testState.terminalBufferLines[index];
          if (!line) return null;
          return {
            isWrapped: Boolean(line.isWrapped),
            translateToString: () => line.text,
          };
        },
      },
    };
    modes = { mouseTrackingMode: 'none' };
    dimensions = {
      device: {
        cell: {
          height: 16,
        },
      },
    };

    loadAddon(): void {}
    open(container: HTMLElement): void {
      container.appendChild(this.element);
      if (this.textarea) {
        this.element.appendChild(this.textarea);
        testState.latestTextarea = this.textarea;
        const addEventListener = this.textarea.addEventListener.bind(this.textarea);
        this.textarea.addEventListener = ((
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: AddEventListenerOptions | boolean
        ) => {
          testState.textareaEventTypes.push(type);
          addEventListener(type, listener, options);
        }) as HTMLTextAreaElement['addEventListener'];
      }
    }
    refresh(): void {}
    reset(): void {}
    write(data: string): void {
      testState.terminalWrite(data);
    }
    clear(): void {}
    focus(): void {
      testState.terminalFocus();
    }
    dispose(): void {}
    selectAll(): void {}
    hasSelection(): boolean {
      return false;
    }
    paste(): void {}
    scrollLines(): void {}
    registerLinkProvider(): { dispose: () => void } {
      return { dispose: () => undefined };
    }
    onTitleChange(): { dispose: () => void } {
      return { dispose: () => undefined };
    }
    onData(handler: (data: string) => void): { dispose: () => void } {
      testState.terminalDataHandler = handler;
      return {
        dispose: () => {
          if (testState.terminalDataHandler === handler) {
            testState.terminalDataHandler = null;
          }
        },
      };
    }
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      testState.customKeyHandler = handler;
    }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
  },
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {
    findNext(): boolean {
      return false;
    }
    findPrevious(): boolean {
      return false;
    }
    clearDecorations(): void {}
    onDidChangeResults(): void {}
  },
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {},
}));

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class {},
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss(): void {}
    clearTextureAtlas(): void {}
    dispose(): void {}
  },
}));

vi.mock('@/lib/electronEnvironment', () => ({
  getRendererEnvironment: () => ({
    HOME: '/home/tester',
    platform: 'darwin',
  }),
}));

vi.mock('@/lib/ghosttyTheme', () => ({
  defaultDarkTheme: {
    background: '#101014',
    foreground: '#f5f5f5',
  },
  getXtermTheme: () => ({
    background: '#101014',
    foreground: '#f5f5f5',
  }),
}));

vi.mock('@/lib/keybinding', () => ({
  matchesKeybinding: () => false,
}));

vi.mock('@/lib/terminalSearchState', () => ({
  buildTerminalSearchDecorations: () => ({}),
  createEmptyTerminalSearchState: () => ({
    term: '',
    resultCount: 0,
    resultIndex: -1,
  }),
  createTerminalSearchState: (result: { resultCount: number; resultIndex: number }) => ({
    term: '',
    resultCount: result.resultCount,
    resultIndex: result.resultIndex,
  }),
}));

vi.mock('@/lib/xtermWindowEvents', () => ({
  subscribeToXtermVisibilityChange: () => testState.unsubscribeVisibility,
  subscribeToXtermWindowFocus: () => testState.unsubscribeFocus,
  subscribeToXtermWindowResize: () => testState.unsubscribeResize,
}));

vi.mock('@/stores/navigation', () => ({
  useNavigationStore: (
    selector: (state: { navigateToFile: typeof testState.navigationToFile }) => unknown
  ) => selector({ navigateToFile: testState.navigationToFile }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (
    selector: (state: {
      terminalTheme: string;
      terminalFontSize: number;
      terminalFontFamily: string;
      terminalFontWeight: string;
      terminalFontWeightBold: string;
      terminalScrollback: number;
      terminalOptionIsMeta: boolean;
      xtermKeybindings: Record<string, never>;
      backgroundImageEnabled: boolean;
      terminalRenderer: 'dom';
      copyOnSelection: boolean;
      shellConfig: { shellType: 'zsh' };
    }) => unknown
  ) =>
    selector({
      terminalTheme: 'dark',
      terminalFontSize: 14,
      terminalFontFamily: 'monospace',
      terminalFontWeight: 'normal',
      terminalFontWeightBold: 'bold',
      terminalScrollback: 1000,
      terminalOptionIsMeta: true,
      xtermKeybindings: {},
      backgroundImageEnabled: false,
      terminalRenderer: 'dom',
      copyOnSelection: false,
      shellConfig: { shellType: 'zsh' },
    }),
}));

vi.mock('@/utils/logging', () => ({
  recordAgentStartup: vi.fn(),
}));

vi.mock('../xtermActivationRefresh', () => ({
  scheduleXtermActivationRefresh: (options: {
    fitViewport: () => void;
    refresh: () => void;
    focus: () => void;
  }) => {
    testState.activationRefreshCalls.push(options);
    return () => undefined;
  },
}));

vi.mock('../xtermAgentTranscriptPolicy', () => ({
  attachAgentTranscriptMode: () => ({
    dispose: () => undefined,
  }),
}));

vi.mock('../xtermClipboard', () => ({
  copyTerminalSelectionToClipboard: vi.fn(async () => undefined),
  getTerminalSelectionText: vi.fn(() => ''),
  restoreTerminalInteractionAfterCopy: vi.fn(() => undefined),
  shouldHandleTerminalCopyEvent: vi.fn(() => false),
  writeClipboardText: vi.fn(async () => undefined),
}));

vi.mock('../xtermContainerReady', () => ({
  isXtermContainerReady: () => true,
  scheduleXtermContainerReady: ({ onReady }: { onReady: () => void }) => {
    onReady();
    return () => undefined;
  },
}));

vi.mock('../xtermRendererPolicy', () => ({
  resolveXtermRenderer: ({ requestedRenderer }: { requestedRenderer: string }) => requestedRenderer,
}));

vi.mock('../xtermSessionRecovery', async () => {
  const actual =
    await vi.importActual<typeof import('../xtermSessionRecovery')>('../xtermSessionRecovery');
  return {
    ...actual,
    resolveReusableBackendSessionId: vi.fn(async () => undefined),
  };
});

vi.mock('../xtermTerminalOptions', () => ({
  buildXtermTerminalOptions: () => ({}),
}));

vi.mock('../xtermViewportSync', () => ({
  syncXtermViewportToSession: (options: Record<string, unknown>) => {
    testState.viewportSyncCalls.push(options);
    return false;
  },
}));

vi.mock('../xtermWheelHandlerPersistence', () => ({
  attachPersistentCustomWheelEventHandler: (
    _terminal: unknown,
    handler: (event: WheelEvent) => boolean | undefined
  ) => {
    testState.attachedWheelHandler = handler;
  },
}));

vi.mock('../xtermWheelPolicy', () => ({
  resolveAgentWheelPolicy: () => testState.resolveAgentWheelPolicy(),
}));

function HookHarness() {
  const hook = useXterm({
    cwd: '/repo/worktree',
    kind: 'agent',
    command: {
      shell: '/bin/zsh',
      args: ['-lc', 'codex'],
    },
    ...testState.hookProps,
    onSessionOpen: testState.sessionOpen,
  });

  testState.latestSnapshot = {
    isLoading: hook.isLoading,
    runtimeState: hook.runtimeState,
  };

  return React.createElement('div', {
    ref: hook.containerRef,
  });
}

function mountHookHarness(initialProps: Partial<UseXtermOptions> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  testState.hookProps = initialProps;

  const render = (nextProps: Partial<UseXtermOptions> = {}) => {
    testState.hookProps = {
      ...testState.hookProps,
      ...nextProps,
    };

    act(() => {
      root.render(React.createElement(HookHarness));
    });
  };

  render();

  return {
    rerender(nextProps: Partial<UseXtermOptions> = {}) {
      render(nextProps);
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useXterm startup loading state', () => {
  beforeEach(() => {
    testState.latestSnapshot = {
      isLoading: false,
      runtimeState: 'live',
    };
    testState.sessionHandlers = null;
    testState.attachPromise = null;
    testState.resolveAttach = null;
    testState.sessionCreate.mockClear();
    testState.sessionAttach.mockClear();
    testState.sessionDetach.mockClear();
    testState.sessionKill.mockClear();
    testState.sessionResize.mockClear();
    testState.sessionWrite.mockClear();
    testState.sessionGetRuntimeInfo.mockClear();
    testState.tmuxScrollClient.mockClear();
    testState.tmuxScrollClient.mockResolvedValue({
      applied: true,
      inMode: true,
      paneId: '%0',
    });
    testState.remoteGetStatus.mockClear();
    testState.navigationToFile.mockClear();
    testState.sessionOpen.mockClear();
    testState.terminalWrite.mockClear();
    testState.terminalDataHandler = null;
    testState.customKeyHandler = null;
    testState.terminalBufferLines = [];
    testState.terminalCursorY = 0;
    testState.terminalBaseY = 0;
    testState.textareaEventTypes = [];
    testState.latestTextarea = null;
    testState.terminalFocus.mockClear();
    testState.attachedWheelHandler = null;
    testState.resolveAgentWheelPolicy.mockReset();
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'delegate',
      carryY: 0,
    });
    testState.intersectionObserve.mockClear();
    testState.intersectionDisconnect.mockClear();
    testState.resizeObserve.mockClear();
    testState.resizeDisconnect.mockClear();
    testState.unsubscribeVisibility.mockClear();
    testState.unsubscribeFocus.mockClear();
    testState.unsubscribeResize.mockClear();
    testState.activationRefreshCalls = [];
    testState.viewportSyncCalls = [];
    testState.hookProps = {};

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          testState.resizeObserve();
        }
        disconnect(): void {
          testState.resizeDisconnect();
        }
      }
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {
          testState.intersectionObserve();
        }
        disconnect(): void {
          testState.intersectionDisconnect();
        }
      }
    );

    window.electronAPI = {
      env: {
        HOME: '/home/tester',
        platform: 'darwin',
      },
      shell: {
        openExternal: vi.fn(async () => undefined),
      },
      remote: {
        getStatus: testState.remoteGetStatus,
      },
      tmux: {
        scrollClient: testState.tmuxScrollClient,
      },
      session: {
        create: testState.sessionCreate,
        attach: testState.sessionAttach,
        detach: testState.sessionDetach,
        kill: testState.sessionKill,
        write: testState.sessionWrite,
        resize: testState.sessionResize,
        getRuntimeInfo: testState.sessionGetRuntimeInfo,
        subscribe: (_sessionId: string, handlers: SessionSubscriptionHandlers) => {
          testState.sessionHandlers = handlers;
          return () => {
            testState.sessionHandlers = null;
          };
        },
      },
    } as never;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('stops reporting loading and finalizes session startup after the first session output arrives even if attach is still pending', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionAttach).toHaveBeenCalledTimes(1);
    expect(testState.latestSnapshot.isLoading).toBe(true);
    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'Codex is ready\n',
      });
      await flushMicrotasks();
    });

    expect(testState.latestSnapshot.isLoading).toBe(false);
    expect(testState.sessionOpen).toHaveBeenCalledTimes(1);
    expect(testState.sessionOpen).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      backend: 'local',
      kind: 'agent',
      cwd: '/repo/worktree',
      persistOnDisconnect: false,
      createdAt: 1,
      runtimeState: 'live',
      metadata: undefined,
    });

    await mounted.unmount();
  });

  it('batches retained replay snapshot updates separately from terminal writes', async () => {
    const onReplaySnapshotChange = vi.fn();
    const mounted = mountHookHarness({ onReplaySnapshotChange });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    await act(async () => {
      testState.resolveAttach?.({
        session: {
          sessionId: 'backend-session-1',
          backend: 'local',
          kind: 'agent',
          cwd: '/repo/worktree',
          persistOnDisconnect: false,
          createdAt: 1,
          runtimeState: 'live',
          metadata: undefined,
        },
        replay: '',
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await flushMicrotasks();
    });
    onReplaySnapshotChange.mockClear();
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'first output\n',
      });
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'second output\n',
      });
      await flushMicrotasks();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith('first output\nsecond output\n');
    onReplaySnapshotChange.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
      await flushMicrotasks();
    });

    expect(
      onReplaySnapshotChange.mock.calls
        .filter(([snapshot]) => snapshot)
        .map(([snapshot]) => snapshot)
    ).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      await flushMicrotasks();
    });

    expect(onReplaySnapshotChange).toHaveBeenCalledTimes(1);
    expect(onReplaySnapshotChange).toHaveBeenLastCalledWith(
      'first output\nsecond output\n',
      expect.any(Number)
    );

    await mounted.unmount();
  });

  it('does not add a competing compositionend textarea handler around xterm IME handling', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.textareaEventTypes).not.toContain('compositionend');

    await mounted.unmount();
  });

  it('writes composed xterm input data to the live pty session', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalDataHandler).toBeTypeOf('function');

    act(() => {
      testState.terminalDataHandler?.('\u4f60\u597d');
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', '\u4f60\u597d');

    await mounted.unmount();
  });

  it('passes the full wrapped current input line to custom key handlers', async () => {
    const capturedLine = vi.fn();
    const mounted = mountHookHarness({
      onCustomKey: (_event, _ptyId, getCurrentLine) => {
        capturedLine(getCurrentLine?.());
        return true;
      },
    });
    await act(async () => {
      await flushMicrotasks();
    });

    testState.terminalBufferLines = [
      {
        text: '› Investigate long-running canvas session title without ',
      },
      {
        text: 'losing context and without dropping the beginning',
        isWrapped: true,
      },
    ];
    testState.terminalCursorY = 1;

    act(() => {
      testState.customKeyHandler?.(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(capturedLine).toHaveBeenCalledWith(
      '› Investigate long-running canvas session title without losing context and without dropping the beginning'
    );

    await mounted.unmount();
  });

  it('rearms and prepares the real xterm textarea as the IME input target during activation refresh', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.activationRefreshCalls).toHaveLength(1);
    expect(testState.latestTextarea).not.toBeNull();

    act(() => {
      testState.activationRefreshCalls[0]?.focus();
    });

    expect(testState.terminalFocus).toHaveBeenCalledTimes(2);
    expect(testState.latestTextarea?.inputMode).toBe('text');
    expect(testState.latestTextarea?.spellcheck).toBe(false);
    expect(testState.latestTextarea?.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(testState.latestTextarea?.style.minWidth).toBe('');
    expect(testState.latestTextarea?.style.minHeight).toBe('');
    expect(testState.latestTextarea?.style.opacity).toBe('');
    expect(testState.latestTextarea?.style.zIndex).toBe('');
    expect(testState.latestTextarea?.style.pointerEvents).toBe('');
    expect(document.querySelector('textarea[data-infilux-xterm-ime-rearm="true"]')).toBeNull();
    expect(document.querySelector('textarea[data-infilux-ime-primer="true"]')).toBeNull();
    expect(document.activeElement).toBe(testState.latestTextarea);

    await mounted.unmount();
  });

  it('prepares direct xterm textarea focus without creating a competing IME target', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.latestTextarea).not.toBeNull();
    expect(document.querySelector('textarea[data-infilux-ime-primer="true"]')).toBeNull();

    act(() => {
      testState.latestTextarea?.focus();
    });

    expect(testState.latestTextarea?.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(testState.latestTextarea?.style.opacity).toBe('');
    expect(testState.latestTextarea?.style.zIndex).toBe('');
    expect(testState.latestTextarea?.style.pointerEvents).toBe('');
    expect(document.querySelector('textarea[data-infilux-ime-primer="true"]')).toBeNull();
    expect(document.activeElement).toBe(testState.latestTextarea);

    await mounted.unmount();
  });

  it('keeps renderer refresh out of viewport synchronization', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.viewportSyncCalls.length).toBeGreaterThan(0);
    for (const viewportSyncCall of testState.viewportSyncCalls) {
      expect(viewportSyncCall).not.toHaveProperty('refreshViewport');
    }

    await mounted.unmount();
  });

  it('does not replay attach output again after live data already reached the terminal', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'Codex is ready\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    const writesBeforeAttachReplay = testState.terminalWrite.mock.calls.length;
    expect(writesBeforeAttachReplay).toBeGreaterThan(0);
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('Codex is ready\n');

    await act(async () => {
      testState.resolveAttach?.({
        session: {
          sessionId: 'backend-session-1',
          backend: 'local',
          kind: 'agent',
          cwd: '/repo/worktree',
          persistOnDisconnect: false,
          createdAt: 1,
          runtimeState: 'live',
          metadata: undefined,
        },
        replay: 'Codex is ready\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(writesBeforeAttachReplay);

    await mounted.unmount();
  });

  it('cancels buffered terminal writes when unmounted before the flush timer runs', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'stale output\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).not.toHaveBeenCalled();

    await mounted.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).not.toHaveBeenCalled();
  });

  it('does not auto-start from initialCommand while inactive when that activation path is disabled', async () => {
    const mounted = mountHookHarness({
      isActive: false,
      initialCommand: 'codex resume provider-session-1',
      activateOnInitialCommandWhenInactive: false,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).not.toHaveBeenCalled();
    expect(testState.sessionAttach).not.toHaveBeenCalled();
    expect(testState.latestSnapshot.isLoading).toBe(false);

    mounted.rerender({ isActive: true });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionAttach).toHaveBeenCalledTimes(1);
    expect(testState.latestSnapshot.isLoading).toBe(true);

    await mounted.unmount();
  });

  it('still auto-starts from initialCommand while inactive when that activation path is enabled', async () => {
    const mounted = mountHookHarness({
      isActive: false,
      initialCommand: 'codex resume provider-session-1',
      activateOnInitialCommandWhenInactive: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionAttach).toHaveBeenCalledTimes(1);
    expect(testState.latestSnapshot.isLoading).toBe(true);

    await mounted.unmount();
  });

  it('starts visible inactive terminals without waiting for focus activation', async () => {
    const mounted = mountHookHarness({
      isActive: false,
      isVisible: true,
      activateOnInitialCommandWhenInactive: false,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionAttach).toHaveBeenCalledTimes(1);
    expect(testState.latestSnapshot.isLoading).toBe(true);

    await mounted.unmount();
  });

  it('does not attach resize and window refresh observers until the terminal is active', async () => {
    const mounted = mountHookHarness({
      isActive: false,
      initialCommand: 'codex resume provider-session-1',
      activateOnInitialCommandWhenInactive: false,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.resizeObserve).not.toHaveBeenCalled();
    expect(testState.intersectionObserve).not.toHaveBeenCalled();

    mounted.rerender({ isActive: true });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.resizeObserve).toHaveBeenCalledTimes(1);
    expect(testState.intersectionObserve).toHaveBeenCalledTimes(1);

    mounted.rerender({ isActive: false });

    expect(testState.resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(testState.intersectionDisconnect).toHaveBeenCalledTimes(1);
    expect(testState.unsubscribeVisibility).toHaveBeenCalledTimes(1);
    expect(testState.unsubscribeFocus).toHaveBeenCalledTimes(1);
    expect(testState.unsubscribeResize).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('keeps layout observers attached for visible inactive terminals', async () => {
    const mounted = mountHookHarness({
      isActive: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.resizeObserve).toHaveBeenCalledTimes(1);
    expect(testState.intersectionObserve).toHaveBeenCalledTimes(1);

    mounted.rerender({
      isActive: false,
      isVisible: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.resizeDisconnect).not.toHaveBeenCalled();
    expect(testState.intersectionDisconnect).not.toHaveBeenCalled();
    expect(testState.unsubscribeVisibility).not.toHaveBeenCalled();
    expect(testState.unsubscribeFocus).not.toHaveBeenCalled();
    expect(testState.unsubscribeResize).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('refreshes the renderer when an inactive terminal becomes visible again', async () => {
    const mounted = mountHookHarness({
      isActive: false,
      isVisible: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.activationRefreshCalls).toHaveLength(1);

    mounted.rerender({
      isActive: false,
      isVisible: false,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    testState.activationRefreshCalls = [];

    mounted.rerender({
      isActive: false,
      isVisible: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.activationRefreshCalls).toHaveLength(1);

    await mounted.unmount();
  });

  it('reports tmux host scrollback state after host wheel scrolling', async () => {
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -4,
    } as never);
    const onHostScrollbackStateChange = vi.fn();

    const mounted = mountHookHarness({
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'tmux-session-1',
      },
      preferHostScrollback: true,
      onHostScrollbackStateChange,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.attachedWheelHandler).toBeTypeOf('function');

    vi.useFakeTimers();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await act(async () => {
      testState.attachedWheelHandler?.({
        deltaMode: 1,
        deltaY: -4,
        preventDefault,
        stopPropagation,
      } as unknown as WheelEvent);
      await flushMicrotasks();
    });

    expect(testState.tmuxScrollClient).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
      await flushMicrotasks();
    });

    expect(testState.tmuxScrollClient).toHaveBeenCalledWith('/repo/worktree', {
      sessionName: 'tmux-session-1',
      serverName: 'infilux',
      direction: 'up',
      amount: 4,
    });
    expect(onHostScrollbackStateChange).toHaveBeenCalledWith(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('coalesces repeated tmux host wheel scroll events before sending IPC', async () => {
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -3,
    } as never);

    const mounted = mountHookHarness({
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'tmux-session-1',
      },
      preferHostScrollback: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.attachedWheelHandler).toBeTypeOf('function');

    vi.useFakeTimers();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await act(async () => {
      testState.attachedWheelHandler?.({
        deltaMode: 1,
        deltaY: -3,
        preventDefault,
        stopPropagation,
      } as unknown as WheelEvent);
      testState.attachedWheelHandler?.({
        deltaMode: 1,
        deltaY: -3,
        preventDefault,
        stopPropagation,
      } as unknown as WheelEvent);
      testState.attachedWheelHandler?.({
        deltaMode: 1,
        deltaY: -3,
        preventDefault,
        stopPropagation,
      } as unknown as WheelEvent);
      await flushMicrotasks();
    });

    expect(testState.tmuxScrollClient).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
      await flushMicrotasks();
    });

    expect(testState.tmuxScrollClient).toHaveBeenCalledTimes(1);
    expect(testState.tmuxScrollClient).toHaveBeenCalledWith('/repo/worktree', {
      sessionName: 'tmux-session-1',
      serverName: 'infilux',
      direction: 'up',
      amount: 9,
    });
    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(stopPropagation).toHaveBeenCalledTimes(3);

    await mounted.unmount();
  });
});
