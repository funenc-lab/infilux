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
  textareaEventTypes: [] as string[],
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
        cursorY: 0,
        baseY: 0,
        getLine: () => null,
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
    focus(): void {}
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
    onData(): { dispose: () => void } {
      return { dispose: () => undefined };
    }
    attachCustomKeyEventHandler(): void {}
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
  syncXtermViewportToSession: () => false,
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
    testState.textareaEventTypes = [];
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

  it('does not add a competing compositionend textarea handler around xterm IME handling', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.textareaEventTypes).not.toContain('compositionend');

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
