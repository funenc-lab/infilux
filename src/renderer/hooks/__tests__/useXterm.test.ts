/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type UseXtermOptions, useXterm } from '../useXterm';
import {
  XTERM_OUTPUT_BACKLOG_HIGH_WATER_MARK,
  XTERM_OUTPUT_WRITE_CHAR_LIMIT,
} from '../xtermOutputBuffer';

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
  restartSession: null as (() => void) | null,
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
  terminalWriteInstanceIds: [] as number[],
  terminalWriteCallbacks: [] as Array<() => void>,
  terminalDispose: vi.fn(),
  terminalLoadAddonError: null as Error | null,
  terminalParserRegisterCsiHandler: vi.fn((_identifier: unknown, _handler: unknown) => ({
    dispose: () => undefined,
  })),
  terminalInstanceCount: 0,
  terminalConstructorOptions: [] as Array<Record<string, unknown>>,
  terminalScrollToBottom: vi.fn(),
  terminalScrollLines: vi.fn(),
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
  }>,
  viewportSyncCalls: [] as Array<Record<string, unknown>>,
  terminalRenderer: 'dom' as 'dom' | 'webgl',
  terminalFontSize: 14,
  terminalFontFamily: 'monospace',
  backgroundImageEnabled: false,
  recreateWebglRenderer: null as (() => void) | null,
  webglAddonInstances: [] as object[],
  webglAddons: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    clearTextureAtlas: ReturnType<typeof vi.fn>;
    contextLossHandler: (() => void) | null;
  }>,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    private readonly instanceId = testState.terminalInstanceCount++;
    cols = 80;
    rows = 24;
    element = document.createElement('div');
    textarea: HTMLTextAreaElement | null = document.createElement('textarea');
    options: Record<string, unknown>;
    parser = {
      registerCsiHandler: (identifier: unknown, handler: unknown) =>
        testState.terminalParserRegisterCsiHandler(identifier, handler),
    };
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

    constructor(options: Record<string, unknown> = {}) {
      this.options = { ...options };
      testState.terminalConstructorOptions.push(this.options);
    }

    loadAddon(addon: object): void {
      if (testState.terminalLoadAddonError && testState.webglAddonInstances.includes(addon)) {
        throw testState.terminalLoadAddonError;
      }
    }
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
    write(data: string, callback?: () => void): void {
      testState.terminalWrite(data);
      testState.terminalWriteInstanceIds.push(this.instanceId);
      if (callback) {
        testState.terminalWriteCallbacks.push(callback);
      }
    }
    clear(): void {}
    focus(): void {
      testState.terminalFocus();
    }
    dispose(): void {
      testState.terminalDispose(this.instanceId);
    }
    selectAll(): void {}
    hasSelection(): boolean {
      return false;
    }
    paste(): void {}
    scrollToBottom(): void {
      testState.terminalScrollToBottom();
    }
    scrollLines(amount?: number): void {
      testState.terminalScrollLines(amount);
    }
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
    private readonly state = {
      dispose: vi.fn(),
      clearTextureAtlas: vi.fn(),
      contextLossHandler: null as (() => void) | null,
    };

    constructor() {
      testState.webglAddonInstances.push(this);
      testState.webglAddons.push(this.state);
    }

    onContextLoss(handler: () => void): { dispose: () => void } {
      this.state.contextLossHandler = handler;
      return { dispose: () => undefined };
    }
    clearTextureAtlas(): void {
      this.state.clearTextureAtlas();
    }
    dispose(): void {
      this.state.dispose();
    }
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
      terminalRenderer: 'dom' | 'webgl';
      copyOnSelection: boolean;
      shellConfig: { shellType: 'zsh' };
    }) => unknown
  ) =>
    selector({
      terminalTheme: 'dark',
      terminalFontSize: testState.terminalFontSize,
      terminalFontFamily: testState.terminalFontFamily,
      terminalFontWeight: 'normal',
      terminalFontWeightBold: 'bold',
      terminalScrollback: 1000,
      terminalOptionIsMeta: true,
      xtermKeybindings: {},
      backgroundImageEnabled: testState.backgroundImageEnabled,
      terminalRenderer: testState.terminalRenderer,
      copyOnSelection: false,
      shellConfig: { shellType: 'zsh' },
    }),
}));

vi.mock('@/utils/logging', () => ({
  recordAgentStartup: vi.fn(),
}));

vi.mock('../xtermActivationRefresh', () => ({
  scheduleXtermActivationRefresh: (options: { fitViewport: () => void; refresh: () => void }) => {
    testState.activationRefreshCalls.push(options);
    return () => undefined;
  },
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
  testState.restartSession = hook.restartSession;
  testState.recreateWebglRenderer =
    (hook as typeof hook & { recreateWebglRenderer?: () => void }).recreateWebglRenderer ?? null;

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
    testState.restartSession = null;
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
    testState.terminalWriteInstanceIds = [];
    testState.terminalWriteCallbacks = [];
    testState.terminalDispose.mockClear();
    testState.terminalLoadAddonError = null;
    testState.terminalParserRegisterCsiHandler.mockClear();
    testState.terminalInstanceCount = 0;
    testState.terminalConstructorOptions = [];
    testState.terminalScrollToBottom.mockClear();
    testState.terminalScrollLines.mockClear();
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
    testState.terminalRenderer = 'dom';
    testState.terminalFontSize = 14;
    testState.terminalFontFamily = 'monospace';
    testState.backgroundImageEnabled = false;
    testState.recreateWebglRenderer = null;
    testState.webglAddonInstances = [];
    testState.webglAddons = [];

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

  it('leaves agent terminal private mode handling to xterm', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalParserRegisterCsiHandler).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('keeps an agent backend session attached when its terminal view unmounts', async () => {
    testState.sessionAttach.mockResolvedValueOnce({
      session: {
        sessionId: 'backend-session-1',
        backend: 'local',
        kind: 'agent',
        cwd: '/repo/worktree',
        persistOnDisconnect: false,
        createdAt: 1,
        runtimeState: 'live',
      },
    });
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });
    await mounted.unmount();

    expect(testState.sessionDetach).not.toHaveBeenCalledWith('backend-session-1');
  });

  it('detaches a non-agent backend session when its terminal view unmounts', async () => {
    testState.sessionAttach.mockResolvedValueOnce({
      session: {
        sessionId: 'backend-session-1',
        backend: 'local',
        kind: 'terminal',
        cwd: '/repo/worktree',
        persistOnDisconnect: false,
        createdAt: 1,
        runtimeState: 'live',
      },
    });
    const mounted = mountHookHarness({ kind: 'terminal' });

    await act(async () => {
      await flushMicrotasks();
    });
    await mounted.unmount();

    expect(testState.sessionDetach).toHaveBeenCalledWith('backend-session-1');
  });

  it('disposes a WebGL addon when activation fails', async () => {
    testState.terminalRenderer = 'webgl';
    testState.terminalLoadAddonError = new Error('WebGL activation failed');
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const failedAddons = [...testState.webglAddons];
    expect(failedAddons.length).toBeGreaterThan(0);
    for (const failedAddon of failedAddons) {
      expect(failedAddon.dispose).toHaveBeenCalledTimes(1);
    }

    await mounted.unmount();

    for (const failedAddon of failedAddons) {
      expect(failedAddon.dispose).toHaveBeenCalledTimes(1);
    }
  });

  it('recreates a healthy WebGL renderer after a Canvas layout transition', async () => {
    testState.terminalRenderer = 'webgl';
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const initialAddonCount = testState.webglAddons.length;
    const activeAddon = testState.webglAddons.at(-1);
    expect(initialAddonCount).toBeGreaterThan(0);
    expect(testState.recreateWebglRenderer).toBeTypeOf('function');

    act(() => {
      testState.recreateWebglRenderer?.();
    });

    expect(activeAddon?.dispose).toHaveBeenCalledTimes(1);
    expect(testState.webglAddons).toHaveLength(initialAddonCount + 1);

    await mounted.unmount();
  });

  it('does not reactivate WebGL after its context is lost', async () => {
    testState.terminalRenderer = 'webgl';
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const initialAddonCount = testState.webglAddons.length;
    const activeAddon = testState.webglAddons.at(-1);
    expect(activeAddon?.contextLossHandler).toBeTypeOf('function');
    expect(testState.recreateWebglRenderer).toBeTypeOf('function');

    act(() => {
      activeAddon?.contextLossHandler?.();
      testState.recreateWebglRenderer?.();
    });

    expect(activeAddon?.dispose).toHaveBeenCalledTimes(1);
    expect(testState.webglAddons).toHaveLength(initialAddonCount);

    await mounted.unmount();
  });

  it('clears the WebGL texture atlas when terminal visual settings change', async () => {
    testState.terminalRenderer = 'webgl';
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const activeAddon = testState.webglAddons.at(-1);
    expect(activeAddon).toBeDefined();
    activeAddon?.clearTextureAtlas.mockClear();

    testState.terminalFontFamily = '"SF Mono", monospace';
    mounted.rerender();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(activeAddon?.clearTextureAtlas).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('keeps the WebGL texture atlas when font settings resolve to the same runtime stack', async () => {
    testState.terminalRenderer = 'webgl';
    testState.terminalFontFamily = 'monospace';
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const activeAddon = testState.webglAddons.at(-1);
    expect(activeAddon).toBeDefined();
    activeAddon?.clearTextureAtlas.mockClear();

    testState.terminalFontFamily = '"PingFang SC", monospace';
    mounted.rerender();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(activeAddon?.clearTextureAtlas).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('preserves the resolved CJK font fallback when terminal settings rerender', async () => {
    testState.terminalRenderer = 'webgl';
    testState.terminalFontFamily = 'ui-monospace, monospace';
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const terminalOptions = testState.terminalConstructorOptions.at(-1);

    testState.terminalFontSize = 15;
    mounted.rerender();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(terminalOptions?.fontSize).toBe(15);
    expect(terminalOptions?.fontFamily).toContain('"PingFang SC"');

    await mounted.unmount();
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

  it('refreshes the active terminal without scheduling a focus restore', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.activationRefreshCalls).toHaveLength(1);
    expect(testState.latestTextarea).not.toBeNull();

    expect(testState.terminalFocus).not.toHaveBeenCalled();
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
    expect(document.activeElement).not.toBe(testState.latestTextarea);

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

  it('keeps restored replay hidden until xterm has written it and then starts at the bottom', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.latestSnapshot.isLoading).toBe(true);

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
        replay: 'line 1\nline 2\nlatest line\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith('line 1\nline 2\nlatest line\n');
    expect(testState.terminalWriteCallbacks).toHaveLength(1);
    expect(testState.terminalScrollToBottom).not.toHaveBeenCalled();
    expect(testState.latestSnapshot.isLoading).toBe(true);

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.terminalScrollToBottom).toHaveBeenCalledTimes(1);
    expect(testState.latestSnapshot.isLoading).toBe(false);

    await mounted.unmount();
  });

  it('writes restored replay in bounded xterm chunks', async () => {
    const mounted = mountHookHarness();
    const replay = 'x'.repeat(XTERM_OUTPUT_WRITE_CHAR_LIMIT + 2);

    await act(async () => {
      await flushMicrotasks();
    });

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
        replay,
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith(
      replay.slice(0, XTERM_OUTPUT_WRITE_CHAR_LIMIT)
    );
    expect(testState.terminalWrite).not.toHaveBeenCalledWith(replay);

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenLastCalledWith(
      replay.slice(XTERM_OUTPUT_WRITE_CHAR_LIMIT)
    );

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    await mounted.unmount();
  });

  it('scrolls updated static transcript content to the bottom after xterm writes it', async () => {
    const mounted = mountHookHarness({
      staticContent: {
        text: 'old transcript\n',
        identity: 'old',
      },
    });

    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    testState.terminalWrite.mockClear();
    testState.terminalWriteCallbacks = [];
    testState.terminalScrollToBottom.mockClear();

    mounted.rerender({
      staticContent: {
        text: 'new transcript\nlatest line\n',
        identity: 'new',
      },
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith('new transcript\nlatest line\n');
    expect(testState.terminalWriteCallbacks).toHaveLength(1);
    expect(testState.terminalScrollToBottom).not.toHaveBeenCalled();

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.terminalScrollToBottom).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('flushes buffered terminal writes when unmounted before the flush timer runs', async () => {
    const onData = vi.fn();
    const mounted = mountHookHarness({ onData });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'final output\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).not.toHaveBeenCalled();

    await mounted.unmount();

    expect(testState.terminalWrite).toHaveBeenCalledWith('final output\n');
    expect(onData).toHaveBeenCalledWith('final output\n');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
  });

  it('waits for xterm to consume one output batch before writing the next batch', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'first batch\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('first batch\n');
    expect(testState.terminalWriteCallbacks).toHaveLength(1);

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'second batch\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(2);
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('second batch\n');

    await mounted.unmount();
  });

  it('defers a viewport sync requested during terminal output until xterm finishes the write', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    vi.useFakeTimers();
    testState.viewportSyncCalls = [];

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: '\x1bM',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWriteCallbacks).toHaveLength(1);

    testState.terminalFontSize = 15;
    mounted.rerender();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.viewportSyncCalls).toEqual([]);

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.viewportSyncCalls).toHaveLength(1);

    await mounted.unmount();
  });

  it('splits queued terminal output into bounded xterm writes', async () => {
    const mounted = mountHookHarness();
    const output = 'x'.repeat(64 * 1024 + 2);

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: output,
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith(output.slice(0, 64 * 1024));
    expect(testState.terminalWrite).not.toHaveBeenCalledWith(output);

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenLastCalledWith(output.slice(64 * 1024));

    await mounted.unmount();
  });

  it('preserves every pending terminal output chunk when xterm falls behind', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mounted = mountHookHarness();
    const output = `begin:${'x'.repeat(XTERM_OUTPUT_BACKLOG_HIGH_WATER_MARK * 2)}:end`;

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: output,
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    await act(async () => {
      while (testState.terminalWriteCallbacks.length > 0) {
        testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
          callback();
        });
        await flushMicrotasks();
      }
    });

    expect(testState.terminalWrite.mock.calls.map(([data]) => data).join('')).toBe(output);
    expect(warningSpy).toHaveBeenCalledWith(
      '[xterm] Terminal output backlog exceeded high-water mark',
      expect.objectContaining({
        pendingChars: output.length,
        sessionId: 'backend-session-1',
      })
    );

    warningSpy.mockRestore();
    await mounted.unmount();
  });

  it('waits for queued terminal output before notifying the session exit', async () => {
    const onExit = vi.fn();
    const mounted = mountHookHarness({ onExit });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    expect(testState.sessionHandlers?.onExit).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'first batch\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'second batch\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      testState.sessionHandlers?.onExit?.({
        sessionId: 'backend-session-1',
        exitCode: 0,
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenLastCalledWith('second batch\n');
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(onExit).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('keeps new-terminal write backpressure isolated from a late old-terminal callback', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'old in-flight output\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'discarded queued output\n',
      });
      await flushMicrotasks();
    });

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
      await flushMicrotasks();
    });

    const oldWriteCallback = testState.terminalWriteCallbacks[0];
    expect(oldWriteCallback).toBeTypeOf('function');
    expect(testState.terminalWriteInstanceIds).toEqual([0]);

    await act(async () => {
      testState.restartSession?.();
      await vi.advanceTimersByTimeAsync(32);
      await flushMicrotasks();
    });

    expect(testState.terminalDispose).toHaveBeenCalledWith(0);

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'new in-flight output\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    const newWriteCallback = testState.terminalWriteCallbacks[1];
    expect(newWriteCallback).toBeTypeOf('function');
    expect(testState.terminalWriteInstanceIds).toEqual([0, 1]);

    await act(async () => {
      oldWriteCallback?.();
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'queued new-terminal output\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(2);

    await act(async () => {
      newWriteCallback?.();
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(3);
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('queued new-terminal output\n');

    await mounted.unmount();
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
    expect(testState.terminalScrollLines).not.toHaveBeenCalled();
    expect(onHostScrollbackStateChange).toHaveBeenCalledWith(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('falls back to local history when tmux host scrolling is not applied', async () => {
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -4,
    } as never);
    testState.tmuxScrollClient.mockResolvedValue({
      applied: false,
      inMode: false,
      paneId: '%0',
    });
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

    vi.useFakeTimers();

    await act(async () => {
      testState.attachedWheelHandler?.({
        deltaMode: 1,
        deltaY: -4,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as WheelEvent);
      await vi.advanceTimersByTimeAsync(20);
      await flushMicrotasks();
    });

    expect(testState.tmuxScrollClient).toHaveBeenCalledWith('/repo/worktree', {
      sessionName: 'tmux-session-1',
      serverName: 'infilux',
      direction: 'up',
      amount: 4,
    });
    expect(testState.terminalScrollLines).toHaveBeenCalledWith(-4);
    expect(onHostScrollbackStateChange).toHaveBeenCalledWith(false);

    await mounted.unmount();
  });

  it('falls back to local history when tmux host scrolling fails', async () => {
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -3,
    } as never);
    testState.tmuxScrollClient.mockRejectedValue(new Error('tmux unavailable'));
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

    vi.useFakeTimers();

    await act(async () => {
      testState.attachedWheelHandler?.({
        deltaMode: 1,
        deltaY: -3,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as WheelEvent);
      await vi.advanceTimersByTimeAsync(20);
      await flushMicrotasks();
    });

    expect(testState.terminalScrollLines).toHaveBeenCalledWith(-3);
    expect(onHostScrollbackStateChange).toHaveBeenCalledWith(false);

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
