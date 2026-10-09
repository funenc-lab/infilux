/* @vitest-environment jsdom */

import type {
  SessionAttachOptions,
  SessionOpenResult,
  SessionRuntimeInfo,
  SessionTranscriptPage,
} from '@shared/types';
import { createAgentStartupTimelineLogger } from '@shared/utils/agentStartupTimeline';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentLaunchPlan } from '../../components/chat/agentLaunchPlan';
import { type UseXtermOptions, useXterm } from '../useXterm';
import { XTERM_HIBERNATION_IDLE_MS } from '../xtermHibernateController';
import {
  XTERM_OUTPUT_BACKLOG_HIGH_WATER_MARK,
  XTERM_OUTPUT_WRITE_CHAR_LIMIT,
} from '../xtermOutputBuffer';
import { resolveReusableBackendSessionId } from '../xtermSessionRecovery';
import type { resolveAgentWheelPolicy } from '../xtermWheelPolicy';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface SessionSubscriptionHandlers {
  onData?: (event: { sessionId: string; data: string }) => void;
  onResync?: (event: { sessionId: string; replay: string }) => void;
  onExit?: (event: { sessionId: string; exitCode: number; signal?: number }) => void;
  onState?: (event: { sessionId: string; state: 'live' | 'reconnecting' | 'dead' }) => void;
}

const testState = vi.hoisted(() => ({
  latestSnapshot: {
    isLoading: false,
    runtimeState: 'live' as 'live' | 'reconnecting' | 'dead',
    searchState: {
      resultCount: 0,
      resultIndex: -1,
    },
  },
  restartSession: null as (() => void) | null,
  sessionHandlers: null as SessionSubscriptionHandlers | null,
  attachPromise: null as Promise<SessionOpenResult> | null,
  resolveAttach: null as ((value: SessionOpenResult) => void) | null,
  sessionCreate: vi.fn(
    async (): Promise<SessionOpenResult> => ({
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
    })
  ),
  sessionAttach: vi.fn((_options: SessionAttachOptions): Promise<SessionOpenResult> => {
    testState.attachPromise ??= new Promise((resolve) => {
      testState.resolveAttach = resolve;
    });
    return testState.attachPromise;
  }),
  sessionDetach: vi.fn(async () => undefined),
  sessionKill: vi.fn(async () => undefined),
  sessionResize: vi.fn(async () => undefined),
  sessionWrite: vi.fn(async () => undefined),
  sessionGetRuntimeInfo: vi.fn(async (): Promise<SessionRuntimeInfo | null> => null),
  sessionGetTranscriptPage: vi.fn(
    async (): Promise<SessionTranscriptPage> => ({
      text: '',
      totalBytes: 0,
      health: 'unavailable' as 'complete' | 'degraded' | 'unavailable',
    })
  ),
  sessionActivateOutput: vi.fn(async () => undefined),
  sessionAcknowledgeOutputResync: vi.fn(async () => undefined),
  sessionSetOutputDelivery: vi.fn(async () => undefined),
  tmuxScrollClient: vi.fn(async () => ({
    applied: true,
    inMode: true,
    paneId: '%0',
  })),
  remoteGetStatus: vi.fn(async () => ({ connected: false })),
  navigationToFile: vi.fn(),
  sessionOpen: vi.fn(),
  terminalWrite: vi.fn(),
  terminalReset: vi.fn(),
  terminalWriteInstanceIds: [] as number[],
  terminalWriteCallbacks: [] as Array<() => void>,
  terminalDispose: vi.fn(),
  terminalLoadAddonError: null as Error | null,
  terminalParserRegisterCsiHandler: vi.fn((_identifier: unknown, _handler: unknown) => ({
    dispose: () => undefined,
  })),
  terminalParserRegisterDcsHandler: vi.fn((_identifier: unknown, _handler: unknown) => ({
    dispose: () => undefined,
  })),
  terminalParserRegisterOscHandler: vi.fn((_identifier: unknown, _handler: unknown) => ({
    dispose: () => undefined,
  })),
  terminalInstanceCount: 0,
  terminalConstructorOptions: [] as Array<Record<string, unknown>>,
  terminalScrollToBottom: vi.fn(),
  terminalScrollToLine: vi.fn(),
  terminalScrollLines: vi.fn(),
  terminalHasSelection: false,
  searchResultHandler: null as
    | ((result: { resultCount: number; resultIndex: number }) => void)
    | null,
  terminalDataHandler: null as ((data: string) => void) | null,
  customKeyHandler: null as ((event: KeyboardEvent) => boolean) | null,
  terminalBufferLines: [] as Array<{ text: string; isWrapped?: boolean }>,
  terminalCursorY: 0,
  terminalBaseY: 0,
  terminalViewportY: 0,
  textareaEventTypes: [] as string[],
  latestTextarea: null as HTMLTextAreaElement | null,
  terminalFocus: vi.fn(),
  attachedWheelHandler: null as ((event: WheelEvent) => boolean | undefined) | null,
  resolveAgentWheelPolicy: vi.fn(
    (_input?: unknown): ReturnType<typeof resolveAgentWheelPolicy> => ({
      action: 'delegate' as const,
      carryY: 0,
    })
  ),
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
  terminalKeybindings: {} as Record<string, never>,
  terminalShellConfig: { shellType: 'zsh' as const },
  rendererPlatform: 'darwin' as 'darwin' | 'win32',
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
      registerDcsHandler: (identifier: unknown, handler: unknown) =>
        testState.terminalParserRegisterDcsHandler(identifier, handler),
      registerOscHandler: (identifier: unknown, handler: unknown) =>
        testState.terminalParserRegisterOscHandler(identifier, handler),
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
        get viewportY() {
          return testState.terminalViewportY;
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
    reset(): void {
      testState.terminalReset();
    }
    write(data: string, callback?: () => void): void {
      testState.terminalWrite(data);
      testState.terminalWriteInstanceIds.push(this.instanceId);
      if (callback) {
        testState.terminalWriteCallbacks.push(callback);
      }
    }
    writeln(data: string): void {
      this.write(`${data}\r\n`);
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
      return testState.terminalHasSelection;
    }
    paste(): void {}
    scrollToBottom(): void {
      testState.terminalScrollToBottom();
    }
    scrollToLine(line: number): void {
      testState.terminalScrollToLine(line);
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
    onDidChangeResults(
      handler: (result: { resultCount: number; resultIndex: number }) => void
    ): void {
      testState.searchResultHandler = handler;
    }
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
    platform: testState.rendererPlatform,
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
      xtermKeybindings: testState.terminalKeybindings,
      backgroundImageEnabled: testState.backgroundImageEnabled,
      terminalRenderer: testState.terminalRenderer,
      copyOnSelection: false,
      shellConfig: testState.terminalShellConfig,
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
  PAGE_DOWN_SEQUENCE: '\x1b[6~',
  PAGE_UP_SEQUENCE: '\x1b[5~',
  resolveAgentProgramScrollRepeat: (scrollLines: number) =>
    Math.min(3, Math.max(1, Math.ceil(Math.abs(scrollLines) / 8))),
  resolveAgentWheelPolicy: (input: unknown) => testState.resolveAgentWheelPolicy(input),
}));

const DEFAULT_TEST_COMMAND = { shell: '/bin/zsh', args: ['-lc', 'codex'] };

function HookHarness() {
  const hook = useXterm({
    cwd: '/repo/worktree',
    kind: 'agent',
    command: DEFAULT_TEST_COMMAND,
    ...testState.hookProps,
    onSessionOpen: testState.sessionOpen,
  });

  testState.latestSnapshot = {
    isLoading: hook.isLoading,
    runtimeState: hook.runtimeState,
    searchState: {
      resultCount: hook.searchState.resultCount,
      resultIndex: hook.searchState.resultIndex,
    },
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
    container,
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

function createDeferredResult<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createTestSessionResult(
  sessionId: string,
  persistOnDisconnect = false
): SessionOpenResult {
  return {
    session: {
      sessionId,
      backend: 'local',
      kind: 'agent',
      cwd: '/repo/worktree',
      persistOnDisconnect,
      createdAt: 1,
      runtimeState: 'live',
    },
  };
}

async function enableRealSessionRecovery() {
  const actual =
    await vi.importActual<typeof import('../xtermSessionRecovery')>('../xtermSessionRecovery');
  vi.mocked(resolveReusableBackendSessionId).mockImplementation(
    actual.resolveReusableBackendSessionId
  );
}

function queueAnimationFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextId;
    pending.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id);
  });

  const flushNext = async () => {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) {
      callback(0);
    }
    await flushMicrotasks();
  };

  return {
    get pendingCount() {
      return pending.size;
    },
    flushNext,
    async flush() {
      for (let index = 0; index < 12; index += 1) {
        if (pending.size === 0) {
          return;
        }
        await flushNext();
      }
      throw new Error('Queued animation frames never settled');
    },
  };
}

function getRegisteredCsiHandler(identifier: Record<string, string>) {
  const registration = testState.terminalParserRegisterCsiHandler.mock.calls.find(
    ([registeredIdentifier]) => JSON.stringify(registeredIdentifier) === JSON.stringify(identifier)
  );
  if (!registration) {
    throw new Error(`Missing CSI handler: ${JSON.stringify(identifier)}`);
  }
  return registration[1] as (params: Array<number | number[]>) => boolean;
}

describe('useXterm startup loading state', () => {
  beforeEach(() => {
    testState.latestSnapshot = {
      isLoading: false,
      runtimeState: 'live',
      searchState: {
        resultCount: 0,
        resultIndex: -1,
      },
    };
    testState.restartSession = null;
    testState.sessionHandlers = null;
    testState.attachPromise = null;
    testState.resolveAttach = null;
    vi.mocked(resolveReusableBackendSessionId).mockReset();
    vi.mocked(resolveReusableBackendSessionId).mockResolvedValue(undefined);
    testState.sessionCreate.mockReset();
    testState.sessionCreate.mockResolvedValue(createTestSessionResult('backend-session-1'));
    testState.sessionAttach.mockReset();
    testState.sessionAttach.mockImplementation(() => {
      testState.attachPromise ??= new Promise((resolve) => {
        testState.resolveAttach = resolve;
      });
      return testState.attachPromise;
    });
    testState.sessionDetach.mockReset();
    testState.sessionDetach.mockResolvedValue(undefined);
    testState.sessionKill.mockClear();
    testState.sessionResize.mockClear();
    testState.sessionWrite.mockReset();
    testState.sessionWrite.mockResolvedValue(undefined);
    testState.sessionGetRuntimeInfo.mockReset();
    testState.sessionGetRuntimeInfo.mockResolvedValue(null);
    testState.sessionGetTranscriptPage.mockReset();
    testState.sessionGetTranscriptPage.mockResolvedValue({
      text: '',
      totalBytes: 0,
      health: 'unavailable',
    });
    testState.sessionActivateOutput.mockReset();
    testState.sessionActivateOutput.mockResolvedValue(undefined);
    testState.sessionAcknowledgeOutputResync.mockClear();
    testState.sessionSetOutputDelivery.mockReset();
    testState.sessionSetOutputDelivery.mockResolvedValue(undefined);
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
    testState.terminalReset.mockClear();
    testState.terminalWriteInstanceIds = [];
    testState.terminalWriteCallbacks = [];
    testState.terminalDispose.mockClear();
    testState.terminalLoadAddonError = null;
    testState.terminalParserRegisterCsiHandler.mockClear();
    testState.terminalParserRegisterDcsHandler.mockClear();
    testState.terminalParserRegisterOscHandler.mockClear();
    testState.terminalInstanceCount = 0;
    testState.terminalConstructorOptions = [];
    testState.terminalScrollToBottom.mockClear();
    testState.terminalScrollToLine.mockClear();
    testState.terminalScrollLines.mockClear();
    testState.terminalHasSelection = false;
    testState.searchResultHandler = null;
    testState.terminalDataHandler = null;
    testState.customKeyHandler = null;
    testState.terminalBufferLines = [];
    testState.terminalCursorY = 0;
    testState.terminalBaseY = 0;
    testState.terminalViewportY = 0;
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
    testState.rendererPlatform = 'darwin';
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
        getTranscriptPage: testState.sessionGetTranscriptPage,
        activateOutput: testState.sessionActivateOutput,
        acknowledgeOutputResync: testState.sessionAcknowledgeOutputResync,
        setOutputDelivery: testState.sessionSetOutputDelivery,
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

  it('continues the prerequisite timeline through input and surface readiness', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const logger = createAgentStartupTimelineLogger({
      source: 'renderer',
      getLabel: () => 'ui-session-1',
      log: vi.fn(),
    });
    logger.markStage('prerequisites-start');
    const mounted = mountHookHarness({ startupTimeline: logger });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(logger.getEntries().map((entry) => entry.stage)).toEqual(
      expect.arrayContaining([
        'prerequisites-start',
        'init-terminal-start',
        'input-channel-ready',
        'surface-ready',
      ])
    );
    await mounted.unmount();
  });

  it('records the first actual input send once without logging its content', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const messages: string[] = [];
    const logger = createAgentStartupTimelineLogger({
      source: 'renderer',
      getLabel: () => 'ui-session-1',
      log: (message) => messages.push(message),
    });
    const mounted = mountHookHarness({ startupTimeline: logger });
    await act(async () => {
      await flushMicrotasks();
    });
    testState.terminalDataHandler?.('private-input-one');
    testState.terminalDataHandler?.('private-input-two');

    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', 'private-input-one');
    expect(logger.getEntries().filter((entry) => entry.stage === 'first-input-sent')).toHaveLength(
      1
    );
    expect(messages.join('\n')).not.toContain('private-input');
    await mounted.unmount();
  });

  it('does not announce surface readiness before current output activation completes', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const activation = createDeferredResult<undefined>();
    testState.sessionActivateOutput.mockReturnValueOnce(activation.promise);
    const logger = createAgentStartupTimelineLogger({
      source: 'renderer',
      getLabel: () => 'ui-session-1',
      log: vi.fn(),
    });
    const mounted = mountHookHarness({ startupTimeline: logger });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(logger.getEntries().map((entry) => entry.stage)).toContain('input-channel-ready');
    expect(logger.getEntries().map((entry) => entry.stage)).not.toContain('surface-ready');
    await act(async () => {
      activation.resolve(undefined);
      await flushMicrotasks();
    });
    expect(logger.getEntries().filter((entry) => entry.stage === 'surface-ready')).toHaveLength(1);
    await mounted.unmount();
  });

  it('does not report a failed initialization as input ready', async () => {
    testState.sessionCreate.mockRejectedValueOnce(new Error('fixture create failed'));
    const logger = createAgentStartupTimelineLogger({
      source: 'renderer',
      getLabel: () => 'ui-session-1',
      log: vi.fn(),
    });
    const mounted = mountHookHarness({ startupTimeline: logger });
    await act(async () => {
      await flushMicrotasks();
    });

    const stages = logger.getEntries().map((entry) => entry.stage);
    expect(stages).toContain('init-terminal-failed');
    expect(stages).not.toContain('input-channel-ready');
    expect(stages).not.toContain('surface-ready');
    await mounted.unmount();
  });

  it('registers replay query guards without overriding general terminal mode handling', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalParserRegisterCsiHandler).toHaveBeenCalled();
    expect(testState.terminalParserRegisterCsiHandler).not.toHaveBeenCalledWith(
      expect.objectContaining({ final: 'l' }),
      expect.any(Function)
    );

    await mounted.unmount();
  });

  it('binds persistent Windows agent recovery to the current worktree', async () => {
    testState.rendererPlatform = 'win32';
    vi.mocked(resolveReusableBackendSessionId).mockClear();

    const mounted = mountHookHarness({
      backendSessionId: 'pty-8',
      cwd: 'C:/repo/current',
      persistOnDisconnect: true,
      metadata: { uiSessionId: 'current-session' },
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(resolveReusableBackendSessionId).toHaveBeenCalledWith(
      expect.objectContaining({
        backendSessionId: 'pty-8',
        cwd: 'C:/repo/current',
        allowUntrackedLocalAttach: true,
        sessionBinding: {
          cwd: 'C:/repo/current',
          kind: 'agent',
          persistentUiSessionId: 'current-session',
        },
      })
    );

    await mounted.unmount();
  });

  it('does not suppress tmux alternate-screen transitions required by full-screen agents', async () => {
    const mounted = mountHookHarness({
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'tmux-session-1',
      },
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalParserRegisterCsiHandler).not.toHaveBeenCalledWith(
      { prefix: '?', final: 'h' },
      expect.any(Function)
    );
    expect(testState.terminalParserRegisterCsiHandler).not.toHaveBeenCalledWith(
      { prefix: '?', final: 'l' },
      expect.any(Function)
    );

    await mounted.unmount();
  });

  it('activates a remote stream only after xterm writes its attach replay', async () => {
    testState.sessionCreate.mockResolvedValueOnce({
      session: {
        sessionId: 'remote-session-1',
        backend: 'remote',
        kind: 'agent',
        cwd: '/workspace',
        persistOnDisconnect: true,
        createdAt: 1,
        runtimeState: 'live',
        metadata: undefined,
      },
      replay: 'remote bootstrap\n',
    } as never);
    const mounted = mountHookHarness({
      cwd: '/__enso_remote__/connection-1/workspace',
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith('remote bootstrap\n');
    await act(async () => {
      const callbacks = testState.terminalWriteCallbacks.splice(0);
      callbacks.forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });
    expect(testState.sessionActivateOutput).toHaveBeenCalledWith('remote-session-1');
    expect(testState.terminalWrite.mock.invocationCallOrder[0]).toBeLessThan(
      testState.sessionActivateOutput.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );

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

  it('keeps the supplied agent replay when the archive cannot confirm a complete transcript', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onResync).toBeTypeOf('function');

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: 'complete replay output',
      });
      await flushMicrotasks();
    });

    expect(testState.sessionGetTranscriptPage).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      maxBytes: 128 * 1024,
      terminalReplay: true,
    });
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('complete replay output');

    await act(async () => {
      testState.terminalWriteCallbacks.at(-1)?.();
      await flushMicrotasks();
    });

    expect(testState.sessionAcknowledgeOutputResync).toHaveBeenCalledWith('backend-session-1');
    await mounted.unmount();
  });

  it('falls back to archived agent output when a resync has no replay', async () => {
    testState.sessionGetTranscriptPage
      .mockResolvedValueOnce({
        text: 'archived output',
        totalBytes: 15,
        health: 'complete',
        initialParserState: 'text',
      })
      .mockResolvedValueOnce({
        text: 'archived output',
        totalBytes: 15,
        health: 'complete',
        initialParserState: 'text',
      });
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: '',
      });
      await flushMicrotasks();
    });

    expect(testState.sessionGetTranscriptPage).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      maxBytes: 128 * 1024,
      terminalReplay: true,
    });
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('archived output');

    await act(async () => {
      testState.terminalWriteCallbacks.at(-1)?.();
      await flushMicrotasks();
    });

    expect(testState.sessionAcknowledgeOutputResync).toHaveBeenCalledWith('backend-session-1');
    await mounted.unmount();
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

  it('keeps startup loading visible until the initial replay has been rendered', async () => {
    let resolveTranscriptPage:
      | ((value: { health: 'complete'; text: string; totalBytes: number }) => void)
      | null = null;
    testState.sessionGetTranscriptPage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTranscriptPage = resolve;
        })
    );
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

    expect(testState.latestSnapshot.isLoading).toBe(true);
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

    await act(async () => {
      resolveTranscriptPage?.({
        health: 'complete',
        text: '',
        totalBytes: 0,
      });
      await flushMicrotasks();
    });

    expect(testState.latestSnapshot.isLoading).toBe(false);

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

    expect(testState.terminalDataHandler).toBeTypeOf('function');

    act(() => {
      testState.terminalDataHandler?.('\u4f60\u597d');
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', '\u4f60\u597d');

    await mounted.unmount();
  });

  it('preserves input typed during a reconnect and flushes it when the session is live again', async () => {
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

    expect(testState.sessionHandlers?.onState).toBeTypeOf('function');
    act(() => {
      testState.sessionHandlers?.onState?.({
        sessionId: 'backend-session-1',
        state: 'reconnecting',
      });
      testState.terminalDataHandler?.('typed while reconnecting');
    });

    expect(testState.sessionWrite).not.toHaveBeenCalledWith(
      'backend-session-1',
      'typed while reconnecting'
    );

    act(() => {
      testState.sessionHandlers?.onState?.({
        sessionId: 'backend-session-1',
        state: 'live',
      });
      testState.terminalDataHandler?.('typed immediately after recovery');
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith(
      'backend-session-1',
      'typed while reconnecting'
    );
    expect(testState.sessionWrite).toHaveBeenCalledWith(
      'backend-session-1',
      'typed immediately after recovery'
    );

    await mounted.unmount();
  });

  it('waits for attach before replaying input when a live state event arrives early', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      testState.terminalDataHandler?.('typed before attach');
      testState.sessionHandlers?.onState?.({
        sessionId: 'backend-session-1',
        state: 'live',
      });
    });

    expect(testState.sessionWrite).not.toHaveBeenCalledWith(
      'backend-session-1',
      'typed before attach'
    );

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
        },
      });
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', 'typed before attach');
    await mounted.unmount();
  });

  it('queues terminal input until a new session is attached', async () => {
    let resolveSessionCreate:
      | ((value: {
          session: {
            sessionId: string;
            backend: 'local';
            kind: 'agent';
            cwd: string;
            persistOnDisconnect: boolean;
            createdAt: number;
            runtimeState: 'live';
            metadata: undefined;
          };
        }) => void)
      | null = null;
    let resolveSessionAttach: ((value: SessionOpenResult) => void) | null = null;
    testState.sessionCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSessionCreate = resolve;
        })
    );
    testState.sessionAttach.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSessionAttach = resolve;
        })
    );

    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalDataHandler).toBeTypeOf('function');
    act(() => {
      testState.terminalDataHandler?.('describe the issue\r');
    });
    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await act(async () => {
      resolveSessionCreate?.({
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
      });
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await act(async () => {
      resolveSessionAttach?.({
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
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith(
      'backend-session-1',
      'describe the issue\r'
    );

    await mounted.unmount();
  });

  it('replays queued terminal input only to the replacement after an existing attach fails', async () => {
    let rejectExistingAttach: ((reason?: unknown) => void) | null = null;
    vi.mocked(resolveReusableBackendSessionId).mockResolvedValueOnce('stale-session-1');
    testState.sessionAttach.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectExistingAttach = reject;
        })
    );
    testState.sessionAttach.mockResolvedValueOnce({
      session: {
        sessionId: 'replacement-session-1',
        backend: 'local',
        kind: 'agent',
        cwd: '/repo/worktree',
        persistOnDisconnect: false,
        createdAt: 2,
        runtimeState: 'live',
      },
    });
    testState.sessionCreate.mockResolvedValueOnce({
      session: {
        sessionId: 'replacement-session-1',
        backend: 'local',
        kind: 'agent',
        cwd: '/repo/worktree',
        persistOnDisconnect: false,
        createdAt: 2,
        runtimeState: 'live',
        metadata: undefined,
      },
    });

    const mounted = mountHookHarness({ backendSessionId: 'stale-session-1' });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionAttach).toHaveBeenCalledWith({
      sessionId: 'stale-session-1',
      cwd: '/repo/worktree',
    });
    act(() => {
      testState.terminalDataHandler?.('continue from here\r');
    });
    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await act(async () => {
      rejectExistingAttach?.(new Error('Session not found'));
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith(
      'replacement-session-1',
      'continue from here\r'
    );
    expect(testState.sessionWrite).not.toHaveBeenCalledWith(
      'stale-session-1',
      'continue from here\r'
    );

    await mounted.unmount();
  });

  it('does not retain oversized terminal input while session creation is pending', async () => {
    let resolveSessionCreate:
      | ((value: {
          session: {
            sessionId: string;
            backend: 'local';
            kind: 'agent';
            cwd: string;
            persistOnDisconnect: boolean;
            createdAt: number;
            runtimeState: 'live';
            metadata: undefined;
          };
        }) => void)
      | null = null;
    testState.sessionCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSessionCreate = resolve;
        })
    );
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

    const oversizedInput = 'x'.repeat(1024 * 1024 + 1);
    act(() => {
      testState.terminalDataHandler?.(oversizedInput);
    });

    await act(async () => {
      resolveSessionCreate?.({
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
      });
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('does not write terminal protocol responses generated while replaying a session', async () => {
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
      replay: '\x1b[>q',
    });
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith('\x1b[>q');
    expect(testState.terminalDataHandler).toBeTypeOf('function');

    await act(async () => {
      const handled = getRegisteredCsiHandler({ prefix: '>', final: 'q' })([0]);
      if (!handled) {
        testState.terminalDataHandler?.('\x1bP>|xterm.js(6.1.0-beta.141)\x1b\\');
      }
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });
    await mounted.unmount();
  });

  it('does not write terminal protocol responses generated while rendering live session output', async () => {
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: '\x1b[>q',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    await act(async () => {
      const handled = getRegisteredCsiHandler({ prefix: '>', final: 'q' })([0]);
      if (!handled) {
        testState.terminalDataHandler?.('\x1bP>|xterm.js(6.1.0-beta.141)\x1b\\');
      }
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).not.toHaveBeenCalled();

    act(() => {
      testState.terminalDataHandler?.('preserved input');
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', 'preserved input');

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });
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

  it('keeps the replay surface hidden when a resync supersedes initial replay', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const terminalSurface = mounted.container.firstElementChild as HTMLDivElement;
    expect(terminalSurface.style.visibility).toBe('hidden');

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
        replay: 'initial replay\n',
      });
      await flushMicrotasks();
    });

    const initialReplayCallback = testState.terminalWriteCallbacks.at(-1);
    expect(initialReplayCallback).toBeTypeOf('function');

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: 'resynced replay\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWriteCallbacks).toHaveLength(1);
    expect(testState.terminalWriteCallbacks.at(-1)).toBe(initialReplayCallback);

    await act(async () => {
      initialReplayCallback?.();
      await flushMicrotasks();
    });

    expect(terminalSurface.style.visibility).toBe('hidden');
    expect(testState.sessionAcknowledgeOutputResync).not.toHaveBeenCalled();

    const resyncReplayCallback = testState.terminalWriteCallbacks.at(-1);
    expect(resyncReplayCallback).toBeTypeOf('function');
    expect(resyncReplayCallback).not.toBe(initialReplayCallback);

    await act(async () => {
      resyncReplayCallback?.();
      await flushMicrotasks();
    });

    expect(terminalSurface.style.visibility).toBe('');
    expect(testState.latestSnapshot.isLoading).toBe(false);
    expect(testState.sessionAcknowledgeOutputResync).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });

  it('keeps the newest resync authoritative while an earlier resync replay is pending', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const terminalSurface = mounted.container.firstElementChild as HTMLDivElement;

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: 'first resync replay\n',
      });
      await flushMicrotasks();
    });

    const firstReplayCallback = testState.terminalWriteCallbacks.at(-1);
    expect(firstReplayCallback).toBeTypeOf('function');

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: 'second resync replay\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWriteCallbacks).toHaveLength(1);
    expect(testState.terminalWriteCallbacks.at(-1)).toBe(firstReplayCallback);

    await act(async () => {
      firstReplayCallback?.();
      await flushMicrotasks();
    });

    expect(terminalSurface.style.visibility).toBe('hidden');
    expect(testState.sessionAcknowledgeOutputResync).not.toHaveBeenCalled();

    const secondReplayCallback = testState.terminalWriteCallbacks.at(-1);
    expect(secondReplayCallback).toBeTypeOf('function');
    expect(secondReplayCallback).not.toBe(firstReplayCallback);

    await act(async () => {
      secondReplayCallback?.();
      await flushMicrotasks();
    });

    expect(terminalSurface.style.visibility).toBe('');
    expect(testState.sessionAcknowledgeOutputResync).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });

  it('serializes overlapping output resync replays until xterm finishes the current write', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: 'first resync replay\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith('first resync replay\n');
    expect(testState.terminalReset).toHaveBeenCalledTimes(1);
    expect(testState.terminalWriteCallbacks).toHaveLength(1);

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: 'second resync replay\n',
      });
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    expect(testState.terminalReset).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('does not start buffered output before an output resync reset', async () => {
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'first output\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledWith('first output\n');
    const firstWriteCallback = testState.terminalWriteCallbacks.shift();
    expect(firstWriteCallback).toBeTypeOf('function');

    await act(async () => {
      testState.sessionHandlers?.onResync?.({
        sessionId: 'backend-session-1',
        replay: 'resynced output\n',
      });
      await flushMicrotasks();
    });

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'buffered output\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstWriteCallback?.();
      await flushMicrotasks();
    });

    const resetOrder = testState.terminalReset.mock.invocationCallOrder[0];
    const replayWriteOrder = testState.terminalWrite.mock.invocationCallOrder[1];
    expect(resetOrder).toBeLessThan(replayWriteOrder);
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('resynced output\n');

    const replayWriteCallback = testState.terminalWriteCallbacks.shift();
    expect(replayWriteCallback).toBeTypeOf('function');

    await act(async () => {
      replayWriteCallback?.();
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenLastCalledWith('buffered output\n');
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

  it('flushes a demoted interactive output batch when unmounted before its delay expires', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const onData = vi.fn();
    const mounted = mountHookHarness({ onData });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionHandlers?.onData).toBeTypeOf('function');
    vi.useFakeTimers();
    vi.setSystemTime(0);

    await act(async () => {
      testState.terminalDataHandler?.('typed input');
      for (const data of ['output-1\n', 'output-2\n', 'output-3\n', 'output-4\n', 'output-5\n']) {
        testState.sessionHandlers?.onData?.({
          sessionId: 'backend-session-1',
          data,
        });
      }
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', 'typed input');
    expect(testState.terminalWrite).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(Date.now()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
      await flushMicrotasks();
    });
    expect(testState.terminalWrite).not.toHaveBeenCalled();

    await mounted.unmount();

    expect(testState.terminalWrite).toHaveBeenCalledWith(
      'output-1\noutput-2\noutput-3\noutput-4\noutput-5\n'
    );
    expect(onData).toHaveBeenCalledWith('output-1\noutput-2\noutput-3\noutput-4\noutput-5\n');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
  });

  it('expedites one visible output response after terminal input', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'echo\n' });
      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
    });
    expect(testState.terminalWrite).toHaveBeenCalledWith('echo\n');
    await mounted.unmount();
  });

  it('reports rejected input once without replaying the failed text', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const onInputError = vi.fn();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = Promise.reject(new Error('private input was rejected'));
    void failure.catch(() => undefined);
    testState.sessionWrite.mockReturnValue(failure);
    const mounted = mountHookHarness({ onInputError });
    await act(async () => {
      await flushMicrotasks();
    });
    await act(async () => {
      testState.terminalDataHandler?.('private input');
      testState.terminalDataHandler?.('second input');
      await flushMicrotasks();
    });
    expect(onInputError).toHaveBeenCalledTimes(1);
    expect(onInputError).toHaveBeenCalledWith();
    expect(testState.sessionWrite.mock.calls).toEqual([
      ['backend-session-1', 'private input'],
      ['backend-session-1', 'second input'],
    ]);
    expect(testState.latestSnapshot.runtimeState).toBe('live');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private input');
    await mounted.unmount();
  });

  it('does not let an older successful send clear a newer failure notification', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const onInputError = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const oldSend = createDeferredResult<undefined>();
    const failure = Promise.reject(new Error('write rejected'));
    void failure.catch(() => undefined);
    testState.sessionWrite.mockReturnValueOnce(oldSend.promise).mockReturnValue(failure);
    const mounted = mountHookHarness({ onInputError });
    await act(async () => {
      await flushMicrotasks();
    });
    await act(async () => {
      testState.terminalDataHandler?.('first');
      testState.terminalDataHandler?.('second');
      await flushMicrotasks();
      oldSend.resolve(undefined);
      await flushMicrotasks();
      testState.terminalDataHandler?.('third');
      await flushMicrotasks();
    });
    expect(onInputError).toHaveBeenCalledTimes(1);
    testState.sessionWrite.mockResolvedValueOnce(undefined);
    await act(async () => {
      testState.terminalDataHandler?.('accepted');
      await flushMicrotasks();
      testState.terminalDataHandler?.('failed again');
      await flushMicrotasks();
    });
    expect(onInputError).toHaveBeenCalledTimes(2);
    await mounted.unmount();
  });

  it('ignores input failure after its terminal has unmounted', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const onInputError = vi.fn();
    const send = createDeferredResult<undefined>();
    void send.promise.catch(() => undefined);
    testState.sessionWrite.mockReturnValueOnce(send.promise);
    const mounted = mountHookHarness({ onInputError });
    await act(async () => {
      await flushMicrotasks();
    });
    await act(async () => {
      testState.terminalDataHandler?.('before unmount');
    });
    await mounted.unmount();
    send.reject(new Error('write rejected'));
    await flushMicrotasks();
    expect(onInputError).not.toHaveBeenCalled();
    expect(testState.sessionWrite).toHaveBeenCalledTimes(1);
  });

  it('ignores input failure from an obsolete session initialization attempt', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-2'));
    testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('backend-session-2'));
    const onInputError = vi.fn();
    const send = createDeferredResult<undefined>();
    void send.promise.catch(() => undefined);
    testState.sessionWrite.mockReturnValueOnce(send.promise);
    const mounted = mountHookHarness({ onInputError });
    await act(async () => {
      await flushMicrotasks();
    });
    await act(async () => {
      testState.terminalDataHandler?.('old');
    });
    mounted.rerender({ onInputError, cwd: '/repo/other' });
    await act(async () => {
      await flushMicrotasks();
      send.reject(new Error('old failure'));
      await flushMicrotasks();
    });
    expect(onInputError).not.toHaveBeenCalled();
    await mounted.unmount();
  });

  it('supplies the guarded input writer to custom key handlers', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness({
      onCustomKey: (_event, _sessionId, _getCurrentLine, writeInput) => {
        writeInput('\x0a');
        return false;
      },
    });
    await act(async () => {
      await flushMicrotasks();
    });
    expect(
      testState.customKeyHandler?.(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))
    ).toBe(false);
    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', '\x0a');
    await mounted.unmount();
  });

  it('expedites an already scheduled output batch without losing its earlier output', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'earlier output\n',
      });
      await vi.advanceTimersByTimeAsync(10);
      testState.terminalDataHandler?.('typed-input');
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'echo\n' });
      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    expect(testState.terminalWrite).toHaveBeenCalledWith('earlier output\necho\n');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });

  it('keeps autonomous output batched after the brief input response window', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'echo\n' });
      await vi.advanceTimersByTimeAsync(1);
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await vi.advanceTimersByTimeAsync(50);
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'autonomous output\n',
      });
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    expect(testState.terminalWrite).toHaveBeenCalledWith('echo\n');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('autonomous output\n');
    await mounted.unmount();
  });

  it('expedites echo even when background output arrives first', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'background\n' });
      await vi.advanceTimersByTimeAsync(1);
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await vi.advanceTimersByTimeAsync(25);
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'echo\n' });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite.mock.calls.map(([data]) => data)).toEqual([
      'background\n',
      'echo\n',
    ]);
    await mounted.unmount();
  });

  it('limits an accelerated response burst to four output events', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      for (let index = 0; index < 4; index += 1) {
        testState.sessionHandlers?.onData?.({
          sessionId: 'backend-session-1',
          data: `response-${index}\n`,
        });
        await vi.advanceTimersByTimeAsync(1);
        testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
          callback();
        });
      }
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'autonomous\n' });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('autonomous\n');
    await mounted.unmount();
  });

  it('keeps oversized output normally batched despite recent input', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'a'.repeat(64 * 1024 + 1),
      });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(testState.terminalWrite).toHaveBeenCalledWith('a'.repeat(64 * 1024));
    await mounted.unmount();
  });

  it.each([
    'event limit',
    'character limit',
  ] as const)('normally batches coalesced output that exceeds the accelerated %s', async (limitKind) => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => {
        await flushMicrotasks();
      });
      vi.useFakeTimers();
      const chunks =
        limitKind === 'event limit'
          ? ['one\n', 'two\n', 'three\n', 'four\n', 'five\n']
          : ['small\n', 'large'.repeat(16 * 1024)];
      await act(async () => {
        testState.terminalDataHandler?.('typed-input');
        for (const data of chunks) {
          testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data });
        }
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(testState.terminalWrite).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(29);
      });
      expect(testState.terminalWrite).toHaveBeenCalledWith(chunks.join('').slice(0, 64 * 1024));
    } finally {
      await mounted.unmount();
    }
  });

  it.each([
    'event limit',
    'character limit',
  ] as const)('keeps excess %s output batched when an earlier writer finishes', async (limitKind) => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => {
        await flushMicrotasks();
      });
      vi.useFakeTimers();
      const chunks =
        limitKind === 'event limit' ? ['one\n', 'two\n', 'three\n', 'four\n'] : ['small\n'];
      const excess = limitKind === 'event limit' ? 'five\n' : 'large'.repeat(16 * 1024);
      await act(async () => {
        testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'earlier\n' });
        await vi.advanceTimersByTimeAsync(30);
        testState.terminalDataHandler?.('typed-input');
        for (const data of chunks) {
          testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data });
        }
        await vi.advanceTimersByTimeAsync(1);
        testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: excess });
        testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
          callback();
        });
        await vi.advanceTimersByTimeAsync(29);
      });
      expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(testState.terminalWrite).toHaveBeenLastCalledWith(
        [...chunks, excess].join('').slice(0, 64 * 1024)
      );
    } finally {
      await mounted.unmount();
    }
  });

  it('limits accelerated character volume across multiple small output events', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'a'.repeat(32 * 1024),
      });
      await vi.advanceTimersByTimeAsync(1);
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'b'.repeat(32 * 1024 + 1),
      });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('b'.repeat(32 * 1024 + 1));
    await mounted.unmount();
  });

  it('keeps excess output batched when the initial replay writer finishes', async () => {
    testState.sessionAttach.mockResolvedValueOnce({
      ...createTestSessionResult('backend-session-1'),
      replay: 'history\n',
    });
    const mounted = mountHookHarness();
    try {
      await act(async () => {
        await flushMicrotasks();
      });
      const initialWriteCount = testState.terminalWrite.mock.calls.length;
      expect(initialWriteCount).toBeGreaterThan(0);
      vi.useFakeTimers();
      await act(async () => {
        testState.terminalDataHandler?.('typed-input');
        testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'small\n' });
        await vi.advanceTimersByTimeAsync(1);
        testState.sessionHandlers?.onData?.({
          sessionId: 'backend-session-1',
          data: 'large'.repeat(16 * 1024),
        });
        testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
          callback();
        });
        await vi.advanceTimersByTimeAsync(29);
      });
      expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', 'typed-input');
      expect(testState.terminalWrite).toHaveBeenCalledTimes(initialWriteCount);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(testState.terminalWrite).toHaveBeenLastCalledWith(
        `small\n${'large'.repeat(16 * 1024)}`.slice(0, 64 * 1024)
      );
    } finally {
      await mounted.unmount();
    }
  });

  it('does not extend the original input deadline when its first response is late', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      await vi.advanceTimersByTimeAsync(480);
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'first\n' });
      await vi.advanceTimersByTimeAsync(1);
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await vi.advanceTimersByTimeAsync(20);
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'late\n' });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('late\n');
    await mounted.unmount();
  });

  it('expires the response acceleration marker before unrelated later output', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.terminalDataHandler?.('typed-input');
      await vi.advanceTimersByTimeAsync(1000);
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'later output\n',
      });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(testState.terminalWrite).toHaveBeenCalledWith('later output\n');
    await mounted.unmount();
  });

  it('keeps an expedited response behind an in-flight terminal write', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'first batch\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      testState.terminalDataHandler?.('typed-input');
      testState.sessionHandlers?.onData?.({ sessionId: 'backend-session-1', data: 'echo\n' });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(1);
    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });
    expect(testState.terminalWrite).toHaveBeenCalledTimes(2);
    expect(testState.terminalWrite).toHaveBeenLastCalledWith('echo\n');
    await mounted.unmount();
  });

  it('clears response acceleration when the terminal is hidden', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    await act(async () => {
      await flushMicrotasks();
    });
    vi.useFakeTimers();
    testState.terminalDataHandler?.('typed-input');
    mounted.rerender({ isActive: false, isVisible: false });
    mounted.rerender({ isActive: true, isVisible: true });
    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'later output\n',
      });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(testState.terminalWrite).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(testState.terminalWrite).toHaveBeenCalledWith('later output\n');
    await mounted.unmount();
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

  it('does not create a fallback shell while session creation is deferred', async () => {
    const mounted = mountHookHarness({
      deferSessionCreate: true,
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).not.toHaveBeenCalled();
    expect(testState.sessionAttach).not.toHaveBeenCalled();

    mounted.rerender({ deferSessionCreate: false });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionAttach).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it.each([
    'descriptor only',
    'command only',
    'command and descriptor',
  ] as const)('creates the latest Codex plan when %s changes after the deferred start is queued', async (change) => {
    const frames = queueAnimationFrames();
    const buildPlan = (resumeSessionId: string) =>
      buildAgentLaunchPlan({
        agentCommand: 'codex',
        resumeSessionId,
        terminalSessionId: 'ui-queued-start',
        initialized: true,
        environment: 'native',
        hapiGlobalInstalled: null,
        isRemoteExecution: false,
        executionPlatform: 'darwin',
        resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
      });
    const firstPlan = buildPlan('thread-before');
    const latestPlan = buildPlan('thread-after');
    const firstCommand = {
      shell: firstPlan.command?.shell ?? 'codex',
      args: firstPlan.command?.args ?? [],
      fallbackCommand: firstPlan.fallbackCommand,
    };
    const latestCommand = {
      shell: latestPlan.command?.shell ?? 'codex',
      args: latestPlan.command?.args ?? [],
      fallbackCommand: latestPlan.fallbackCommand,
    };
    const mounted = mountHookHarness({
      command: firstCommand,
      codexLaunch: change === 'command and descriptor' ? firstPlan.codexLaunch : undefined,
      deferSessionCreate: true,
    });

    await act(frames.flush);
    expect(testState.sessionCreate).not.toHaveBeenCalled();

    mounted.rerender({ deferSessionCreate: false });
    expect(frames.pendingCount).toBeGreaterThan(0);
    mounted.rerender({
      ...(change !== 'descriptor only' ? { command: latestCommand } : {}),
      ...(change !== 'command only'
        ? {
            codexLaunch:
              change === 'descriptor only' ? firstPlan.codexLaunch : latestPlan.codexLaunch,
          }
        : {}),
    });

    await act(frames.flush);

    const expectedCommand = change === 'descriptor only' ? firstCommand : latestCommand;
    const expectedDescriptor =
      change === 'command only'
        ? undefined
        : change === 'descriptor only'
          ? firstPlan.codexLaunch
          : latestPlan.codexLaunch;
    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        shell: expectedCommand.shell,
        args: expectedCommand.args,
        ...(expectedDescriptor ? { codexLaunch: expectedDescriptor } : {}),
      })
    );

    await mounted.unmount();
  });

  it('uses a Codex descriptor supplied after the initial activation frame is queued', async () => {
    const frames = queueAnimationFrames();
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const mounted = mountHookHarness({
      command: {
        shell: plan.command?.shell ?? 'codex',
        args: plan.command?.args ?? [],
        fallbackCommand: plan.fallbackCommand,
      },
      codexLaunch: undefined,
    });

    expect(frames.pendingCount).toBeGreaterThan(0);
    mounted.rerender({ codexLaunch: plan.codexLaunch });
    await act(frames.flush);

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ codexLaunch: plan.codexLaunch })
    );
    await mounted.unmount();
  });

  it('does not start a canceled deferred Codex session after unmount', async () => {
    const frames = queueAnimationFrames();
    const mounted = mountHookHarness({ deferSessionCreate: true });

    await act(frames.flush);
    expect(testState.sessionCreate).not.toHaveBeenCalled();

    mounted.rerender({ deferSessionCreate: false });
    expect(frames.pendingCount).toBeGreaterThan(0);
    await mounted.unmount();
    await act(frames.flush);

    expect(testState.sessionCreate).not.toHaveBeenCalled();
  });

  it('cancels the second deferred-start frame when session creation is deferred again', async () => {
    const frames = queueAnimationFrames();
    const mounted = mountHookHarness({ deferSessionCreate: true });

    await act(frames.flush);
    mounted.rerender({ deferSessionCreate: false });
    await act(frames.flushNext);
    expect(frames.pendingCount).toBeGreaterThan(0);

    mounted.rerender({ deferSessionCreate: true });
    await act(frames.flush);

    expect(testState.sessionCreate).not.toHaveBeenCalled();
    await mounted.unmount();
  });

  it('keeps the selected Codex hostless fallback paired with its queued primary launch', async () => {
    const frames = queueAnimationFrames();
    const buildPlan = (initialPrompt: string) => {
      const options = {
        agentCommand: 'codex',
        initialPrompt,
        environment: 'native' as const,
        hapiGlobalInstalled: null,
        isRemoteExecution: false,
        executionPlatform: 'darwin',
        terminalSessionId: 'ui-hosted-fallback',
        resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
      };
      const hosted = buildAgentLaunchPlan({ ...options, tmuxEnabled: true });
      const hostless = buildAgentLaunchPlan({ ...options, tmuxEnabled: false });
      return {
        hosted,
        fallback: {
          initialCommand: hostless.initialCommand,
          codexLaunch: hostless.codexLaunch,
          hostSession: undefined,
          command: undefined,
          onRetry: vi.fn(),
        },
      };
    };
    const firstPlan = buildPlan('Inspect old host');
    const latestPlan = buildPlan('Inspect latest host');
    const mounted = mountHookHarness({
      command: undefined,
      initialCommand: firstPlan.hosted.initialCommand,
      hostSession: firstPlan.hosted.hostSession,
      codexLaunch: firstPlan.hosted.codexLaunch,
      sessionCreateFallback: firstPlan.fallback,
      persistOnDisconnect: true,
      deferSessionCreate: true,
      env: { CAPABILITY_VERSION: 'first' },
      metadata: { uiSessionId: 'first' },
    });

    await act(frames.flush);
    mounted.rerender({ deferSessionCreate: false });
    mounted.rerender({
      initialCommand: latestPlan.hosted.initialCommand,
      hostSession: latestPlan.hosted.hostSession,
      codexLaunch: latestPlan.hosted.codexLaunch,
      sessionCreateFallback: latestPlan.fallback,
      env: { CAPABILITY_VERSION: 'latest' },
      metadata: { uiSessionId: 'latest' },
    });
    testState.sessionCreate.mockRejectedValueOnce(
      new Error('Failed to recover tmux session: ui-hosted-fallback')
    );

    await act(frames.flush);
    await act(flushMicrotasks);

    expect(testState.sessionCreate).toHaveBeenCalledTimes(2);
    expect(testState.sessionCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        initialCommand: latestPlan.hosted.initialCommand,
        codexLaunch: latestPlan.hosted.codexLaunch,
        hostSession: latestPlan.hosted.hostSession,
        env: { CAPABILITY_VERSION: 'latest' },
        metadata: { uiSessionId: 'latest' },
      })
    );
    expect(testState.sessionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        initialCommand: latestPlan.fallback.initialCommand,
        codexLaunch: latestPlan.fallback.codexLaunch,
        hostSession: undefined,
        env: { CAPABILITY_VERSION: 'latest' },
        metadata: { uiSessionId: 'latest' },
      })
    );
    expect(latestPlan.fallback.onRetry).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });

  it('uses the current Codex launch descriptor and command after a deferred-plan rerender', async () => {
    const buildPlan = (initialPrompt: string) =>
      buildAgentLaunchPlan({
        agentCommand: 'codex',
        initialPrompt,
        environment: 'native',
        hapiGlobalInstalled: null,
        isRemoteExecution: false,
        executionPlatform: 'darwin',
        resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
      });
    const firstPlan = buildPlan('Inspect the initial worktree');
    const latestPlan = buildPlan('Inspect the selected worktree');
    const mounted = mountHookHarness({
      command: undefined,
      initialCommand: firstPlan.initialCommand,
      codexLaunch: firstPlan.codexLaunch,
      deferSessionCreate: true,
    });

    await act(flushMicrotasks);
    expect(testState.sessionCreate).not.toHaveBeenCalled();

    mounted.rerender({
      initialCommand: latestPlan.initialCommand,
      codexLaunch: latestPlan.codexLaunch,
    });
    await act(flushMicrotasks);
    expect(testState.sessionCreate).not.toHaveBeenCalled();

    mounted.rerender({ deferSessionCreate: false });
    await act(flushMicrotasks);

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        initialCommand: latestPlan.initialCommand,
        codexLaunch: latestPlan.codexLaunch,
      })
    );

    await mounted.unmount();
  });

  it('uses a Codex descriptor that becomes ready before a deferred command is created', async () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      initialPrompt: 'Inspect this worktree',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const mounted = mountHookHarness({
      command: undefined,
      initialCommand: plan.initialCommand,
      deferSessionCreate: true,
    });

    await act(flushMicrotasks);
    expect(testState.sessionCreate).not.toHaveBeenCalled();

    mounted.rerender({ codexLaunch: plan.codexLaunch });
    mounted.rerender({ deferSessionCreate: false });
    await act(flushMicrotasks);

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        initialCommand: plan.initialCommand,
        codexLaunch: plan.codexLaunch,
      })
    );

    await mounted.unmount();
  });

  it('does not recreate an already running session when only its Codex descriptor changes', async () => {
    const firstPlan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      initialPrompt: 'Inspect current worktree',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const mounted = mountHookHarness({
      command: undefined,
      initialCommand: firstPlan.initialCommand,
      codexLaunch: firstPlan.codexLaunch,
    });

    await act(flushMicrotasks);
    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);

    mounted.rerender({
      codexLaunch:
        firstPlan.codexLaunch?.kind === 'native'
          ? { ...firstPlan.codexLaunch, rawArgs: [...firstPlan.codexLaunch.rawArgs] }
          : undefined,
    });
    await act(flushMicrotasks);

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });

  it('cancels a deferred-start retry when session creation is deferred again', async () => {
    const queuedFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const frameId = ++nextFrameId;
      queuedFrames.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
      queuedFrames.delete(frameId);
    });
    const flushQueuedFrames = async () => {
      for (let index = 0; index < 8; index += 1) {
        const frames = Array.from(queuedFrames.values());
        queuedFrames.clear();
        if (frames.length === 0) {
          return;
        }
        for (const frame of frames) {
          frame(0);
        }
        await flushMicrotasks();
      }
    };
    const mounted = mountHookHarness({
      deferSessionCreate: true,
    });

    await act(async () => {
      await flushQueuedFrames();
    });

    expect(testState.sessionCreate).not.toHaveBeenCalled();

    mounted.rerender({ deferSessionCreate: false });
    mounted.rerender({ deferSessionCreate: true });

    await act(async () => {
      await flushQueuedFrames();
    });

    expect(testState.sessionCreate).not.toHaveBeenCalled();
    expect(testState.sessionAttach).not.toHaveBeenCalled();

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

  it('hibernates only hidden inactive terminals and suppresses their live output', async () => {
    testState.terminalRenderer = 'webgl';
    const mounted = mountHookHarness();

    await act(async () => {
      await flushMicrotasks();
    });

    const rendererAddon = testState.webglAddons.at(-1);
    expect(rendererAddon).toBeDefined();
    vi.useFakeTimers();

    mounted.rerender({
      isActive: false,
      isVisible: false,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS - 1);
      await flushMicrotasks();
    });
    expect(testState.terminalDispose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
    });

    expect(testState.terminalDispose).toHaveBeenCalledWith(0);
    expect(rendererAddon?.dispose).toHaveBeenCalledTimes(1);
    const writesBeforeHiddenOutput = testState.terminalWrite.mock.calls.length;

    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'hidden output\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      await flushMicrotasks();
    });

    expect(testState.terminalWrite).toHaveBeenCalledTimes(writesBeforeHiddenOutput);
    await mounted.unmount();
  });

  it.each([
    'codex',
    'claude',
  ])('recreates a hibernated surface for %s from replay before resuming output delivery', async (agentId) => {
    const mounted = mountHookHarness({ agentId });

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
        replay: '',
      });
      await flushMicrotasks();
    });

    await act(async () => {
      testState.searchResultHandler?.({
        resultCount: 3,
        resultIndex: 1,
      });
      await flushMicrotasks();
    });
    expect(testState.latestSnapshot.searchState).toEqual({
      resultCount: 3,
      resultIndex: 1,
    });

    vi.useFakeTimers();
    await act(async () => {
      testState.sessionHandlers?.onData?.({
        sessionId: 'backend-session-1',
        data: 'replay before hibernation\n',
      });
      await vi.advanceTimersByTimeAsync(30);
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await vi.advanceTimersByTimeAsync(500);
      await flushMicrotasks();
    });

    testState.terminalViewportY = 7;
    mounted.rerender({
      isActive: false,
      isVisible: false,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
      await flushMicrotasks();
    });

    expect(testState.terminalDispose).toHaveBeenCalledWith(0);
    testState.sessionSetOutputDelivery.mockClear();
    testState.terminalWrite.mockClear();
    testState.terminalScrollToLine.mockClear();

    mounted.rerender({
      isActive: false,
      isVisible: true,
    });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.terminalInstanceCount).toBe(2);
    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionAttach).toHaveBeenCalledTimes(1);
    expect(testState.terminalWrite).toHaveBeenCalledWith('replay before hibernation\n');
    expect(testState.sessionSetOutputDelivery).not.toHaveBeenCalledWith('backend-session-1', true);

    act(() => {
      testState.terminalDataHandler?.('typed while restoring');
    });
    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await act(async () => {
      testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
        callback();
      });
      await flushMicrotasks();
    });

    expect(testState.sessionSetOutputDelivery).toHaveBeenCalledWith('backend-session-1', true);
    expect(testState.terminalScrollToLine).toHaveBeenCalledWith(7);
    expect(testState.latestSnapshot.searchState).toEqual({
      resultCount: 3,
      resultIndex: 1,
    });
    expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
      'backend-session-1',
      'typed while restoring'
    );

    act(() => {
      testState.terminalDataHandler?.('typed after restoring');
    });
    expect(testState.sessionWrite).toHaveBeenLastCalledWith(
      'backend-session-1',
      'typed after restoring'
    );

    for (let cycle = 0; cycle < 2; cycle += 1) {
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
        await flushMicrotasks();
      });
      expect(testState.terminalDispose).toHaveBeenCalledWith(cycle + 1);

      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => {
        await flushMicrotasks();
      });
      const writesBeforeRestore = testState.sessionWrite.mock.calls.length;
      const input = `${agentId} input for cycle ${cycle}`;
      act(() => testState.terminalDataHandler?.(input));
      expect(testState.sessionWrite).toHaveBeenCalledTimes(writesBeforeRestore);

      await act(async () => {
        testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
          callback();
        });
        await flushMicrotasks();
      });
      expect(testState.sessionWrite).toHaveBeenCalledTimes(writesBeforeRestore + 1);
      expect(testState.sessionWrite).toHaveBeenLastCalledWith('backend-session-1', input);
    }

    expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    expect(testState.sessionAttach).toHaveBeenCalledTimes(1);
    expect(testState.terminalInstanceCount).toBe(4);
    await mounted.unmount();
  });

  it('retains input after surface restoration until a reconnecting runtime becomes live', async () => {
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
    await act(async () => await flushMicrotasks());
    vi.useFakeTimers();
    mounted.rerender({ isActive: false, isVisible: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
      await flushMicrotasks();
    });
    expect(testState.terminalDispose).toHaveBeenCalledWith(0);

    let resumeOutput: (() => void) | undefined;
    testState.sessionSetOutputDelivery.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resumeOutput = () => resolve(undefined);
        })
    );
    mounted.rerender({ isActive: true, isVisible: true });
    await act(async () => await flushMicrotasks());
    expect(resumeOutput).toBeTypeOf('function');
    act(() => {
      testState.terminalDataHandler?.('before reconnect');
      testState.sessionHandlers?.onState?.({
        sessionId: 'backend-session-1',
        state: 'reconnecting',
      });
      testState.terminalDataHandler?.(' during reconnect');
    });
    await act(async () => {
      resumeOutput?.();
      await flushMicrotasks();
    });
    expect(testState.sessionWrite).not.toHaveBeenCalled();
    act(() => {
      testState.terminalDataHandler?.(' after restore');
      testState.sessionHandlers?.onState?.({ sessionId: 'backend-session-1', state: 'live' });
      testState.sessionHandlers?.onState?.({ sessionId: 'backend-session-1', state: 'live' });
    });
    expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
      'backend-session-1',
      'before reconnect during reconnect after restore'
    );
    await mounted.unmount();
  });

  it('does not release pending restoration input after the surface is unmounted', async () => {
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
    await act(async () => await flushMicrotasks());
    vi.useFakeTimers();
    mounted.rerender({ isActive: false, isVisible: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
      await flushMicrotasks();
    });

    let resumeOutput: (() => void) | undefined;
    testState.sessionSetOutputDelivery.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resumeOutput = () => resolve(undefined);
        })
    );
    mounted.rerender({ isActive: true, isVisible: true });
    await act(async () => await flushMicrotasks());
    expect(resumeOutput).toBeTypeOf('function');
    act(() => testState.terminalDataHandler?.('cancelled input'));
    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await mounted.unmount();
    await act(async () => {
      resumeOutput?.();
      await flushMicrotasks();
    });
    expect(testState.sessionWrite).not.toHaveBeenCalled();
  });

  it('does not let a superseded surface restore release input for a replacement session', async () => {
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
    await act(async () => await flushMicrotasks());
    vi.useFakeTimers();
    mounted.rerender({ isActive: false, isVisible: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
      await flushMicrotasks();
    });

    let resumeOldOutput: (() => void) | undefined;
    testState.sessionSetOutputDelivery.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resumeOldOutput = () => resolve(undefined);
        })
    );
    mounted.rerender({ isActive: true, isVisible: true });
    await act(async () => await flushMicrotasks());
    expect(resumeOldOutput).toBeTypeOf('function');
    act(() => testState.terminalDataHandler?.('old restoration input'));

    testState.sessionCreate.mockResolvedValueOnce({
      session: {
        sessionId: 'backend-session-2',
        backend: 'local',
        kind: 'agent',
        cwd: '/repo/worktree',
        persistOnDisconnect: false,
        createdAt: 2,
        runtimeState: 'live',
        metadata: undefined,
      },
    });
    await act(async () => {
      testState.restartSession?.();
      await vi.advanceTimersByTimeAsync(32);
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(testState.sessionAttach).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionId: 'backend-session-2' })
    );
    act(() => testState.terminalDataHandler?.('replacement pending'));

    await act(async () => {
      resumeOldOutput?.();
      await flushMicrotasks();
    });
    act(() => testState.terminalDataHandler?.(' still pending'));
    expect(testState.sessionWrite).not.toHaveBeenCalled();

    await act(async () => {
      testState.resolveAttach?.({
        session: {
          sessionId: 'backend-session-2',
          backend: 'local',
          kind: 'agent',
          cwd: '/repo/worktree',
          persistOnDisconnect: false,
          createdAt: 2,
          runtimeState: 'live',
        },
        replay: '',
      });
      await flushMicrotasks();
    });
    expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
      'backend-session-2',
      'replacement pending still pending'
    );
    await mounted.unmount();
  });

  it('does not let obsolete hibernation replay consume replacement output', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => await flushMicrotasks());
      vi.useFakeTimers();
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
        await flushMicrotasks();
      });
      const oldTranscript = createDeferredResult<SessionTranscriptPage>();
      testState.sessionGetTranscriptPage.mockImplementationOnce(() => oldTranscript.promise);
      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => await flushMicrotasks());
      expect(testState.terminalInstanceCount).toBe(2);

      testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      await act(async () => {
        testState.restartSession?.();
        await vi.advanceTimersByTimeAsync(32);
        await flushMicrotasks();
      });
      expect(testState.terminalInstanceCount).toBe(3);
      expect(testState.terminalDispose).toHaveBeenCalledWith(1);
      testState.terminalWrite.mockClear();
      testState.terminalWriteInstanceIds = [];
      act(() => {
        testState.sessionHandlers?.onData?.({
          sessionId: 'replacement-session',
          data: 'replacement output awaiting its flush timer',
        });
      });
      await act(async () => {
        oldTranscript.resolve({
          text: 'old replay',
          totalBytes: 10,
          health: 'complete',
          initialParserState: 'text',
        });
        await flushMicrotasks();
      });
      expect(testState.terminalWriteInstanceIds).not.toContain(1);
      await act(async () => await vi.advanceTimersByTimeAsync(32));
      expect(testState.terminalWrite).toHaveBeenCalledExactlyOnceWith(
        'replacement output awaiting its flush timer'
      );
      expect(testState.terminalWriteInstanceIds).toEqual([2]);
      act(() => testState.terminalDataHandler?.('after obsolete replay'));
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'replacement-session',
        'after obsolete replay'
      );
    } finally {
      await mounted.unmount();
    }
  });

  it.each([
    'codex',
    'claude',
  ])('defers %s hibernation while its previous restoration is still pending', async (agentId) => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness({ agentId });
    try {
      await act(async () => await flushMicrotasks());
      vi.useFakeTimers();
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
        await flushMicrotasks();
      });
      const resume = createDeferredResult<undefined>();
      testState.sessionSetOutputDelivery.mockImplementationOnce(() => resume.promise);
      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => await flushMicrotasks());
      act(() => testState.terminalDataHandler?.('queued during unfinished restore'));
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
        await flushMicrotasks();
      });
      expect(testState.terminalDispose.mock.calls).toEqual([[0]]);
      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => {
        resume.resolve(undefined);
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(32);
      });
      expect(testState.terminalInstanceCount).toBe(2);
      expect(testState.terminalDataHandler).not.toBeNull();
      expect(testState.latestSnapshot.isLoading).toBe(false);
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'backend-session-1',
        'queued during unfinished restore'
      );
      expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
      expect(testState.sessionAttach).toHaveBeenCalledTimes(1);

      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
        await flushMicrotasks();
      });
      expect(testState.terminalDispose.mock.calls).toEqual([[0], [1]]);
    } finally {
      await mounted.unmount();
    }
  });

  it('reschedules hibernation when restoration finishes on a hidden surface', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => await flushMicrotasks());
      vi.useFakeTimers();
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS));
      const resume = createDeferredResult<undefined>();
      testState.sessionSetOutputDelivery.mockImplementationOnce(() => resume.promise);
      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => await flushMicrotasks());
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS));
      expect(testState.terminalDispose.mock.calls).toEqual([[0]]);
      await act(async () => {
        resume.resolve(undefined);
        await flushMicrotasks();
      });
      expect(testState.terminalDispose.mock.calls).toEqual([[0], [1]]);
      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => await flushMicrotasks());
      expect(testState.terminalInstanceCount).toBe(3);
      expect(testState.latestSnapshot.isLoading).toBe(false);
      act(() => testState.terminalDataHandler?.('after delayed hibernation'));
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'backend-session-1',
        'after delayed hibernation'
      );
    } finally {
      await mounted.unmount();
    }
  });

  it('restarts a hibernated session without restoring its obsolete binding again', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => await flushMicrotasks());
      vi.useFakeTimers();
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
        await flushMicrotasks();
      });
      expect(testState.terminalDispose).toHaveBeenCalledWith(0);
      testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      await act(async () => {
        testState.restartSession?.();
        await vi.advanceTimersByTimeAsync(32);
        await flushMicrotasks();
      });
      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => await flushMicrotasks());
      act(() => {
        testState.terminalDataHandler?.('after hibernated restart');
        testState.sessionHandlers?.onData?.({
          sessionId: 'replacement-session',
          data: 'fresh output',
        });
      });
      await act(async () => await vi.advanceTimersByTimeAsync(32));
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'replacement-session',
        'after hibernated restart'
      );
      expect(testState.terminalWrite).toHaveBeenCalledWith('fresh output');
      expect(testState.sessionCreate).toHaveBeenCalledTimes(2);
      expect(testState.sessionAttach).toHaveBeenCalledTimes(2);
      expect(testState.sessionDetach).toHaveBeenCalledWith('backend-session-1');
    } finally {
      await mounted.unmount();
    }
  });

  it.each([
    'codex',
    'claude',
  ])('keeps %s input bound when activation interrupts output suspension', async (agentId) => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness({ agentId });
    try {
      await act(async () => await flushMicrotasks());
      vi.useFakeTimers();
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => await flushMicrotasks());

      const suspension = createDeferredResult<undefined>();
      testState.sessionSetOutputDelivery.mockImplementationOnce(() => suspension.promise);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS);
        await flushMicrotasks();
      });
      expect(testState.terminalDispose).not.toHaveBeenCalled();

      mounted.rerender({ isActive: true, isVisible: true });
      await act(async () => await flushMicrotasks());
      act(() => testState.terminalDataHandler?.('during suspension'));
      await act(async () => {
        suspension.resolve(undefined);
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('after suspension'));

      expect(testState.sessionWrite.mock.calls).toEqual([
        ['backend-session-1', 'during suspension'],
        ['backend-session-1', 'after suspension'],
      ]);
      expect(testState.sessionDetach).not.toHaveBeenCalled();
      expect(testState.terminalDispose).not.toHaveBeenCalled();
      expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
      expect(testState.sessionAttach).toHaveBeenCalledTimes(1);
      expect(testState.latestSnapshot.isLoading).toBe(false);
    } finally {
      await mounted.unmount();
    }
  });

  it.each([
    { agentId: 'codex', outcome: 'resolve' },
    { agentId: 'claude', outcome: 'resolve' },
    { agentId: 'codex', outcome: 'reject' },
    { agentId: 'claude', outcome: 'reject' },
  ])('preserves replacement input after obsolete $agentId creation $outcome', async ({
    agentId,
    outcome,
  }) => {
    const oldCreation = createDeferredResult<SessionOpenResult>();
    testState.sessionCreate.mockImplementationOnce(() => oldCreation.promise);
    testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
    testState.sessionAttach.mockImplementation(async ({ sessionId }) =>
      createTestSessionResult(sessionId)
    );
    const onRetry = vi.fn();
    const mounted = mountHookHarness({
      agentId,
      persistOnDisconnect: true,
      hostSession: { kind: 'tmux', serverName: 'infilux', sessionName: 'agent-host' },
      sessionCreateFallback: { onRetry },
    });
    try {
      await act(async () => await flushMicrotasks());
      await act(async () => {
        testState.restartSession?.();
        await flushMicrotasks();
      });
      const replacementHandlers = testState.sessionHandlers;
      act(() => testState.terminalDataHandler?.('before old creation'));
      expect(testState.sessionWrite).toHaveBeenCalledWith(
        'replacement-session',
        'before old creation'
      );

      await act(async () => {
        if (outcome === 'resolve') {
          oldCreation.resolve(createTestSessionResult('obsolete-session'));
        } else {
          oldCreation.reject(new Error('Failed to recover tmux server: infilux'));
        }
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('after old creation'));
      expect(testState.sessionWrite).toHaveBeenLastCalledWith(
        'replacement-session',
        'after old creation'
      );
      expect(testState.sessionHandlers).toBe(replacementHandlers);
      expect(testState.sessionCreate).toHaveBeenCalledTimes(2);
      expect(testState.sessionAttach).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ sessionId: 'replacement-session' })
      );
      expect(onRetry).not.toHaveBeenCalled();
      expect(testState.sessionKill).not.toHaveBeenCalledWith('replacement-session');
      act(() =>
        replacementHandlers?.onData?.({
          sessionId: 'replacement-session',
          data: 'replacement output',
        })
      );
      await act(
        async () =>
          await vi.waitFor(() =>
            expect(testState.terminalWrite).toHaveBeenCalledWith('replacement output')
          )
      );
    } finally {
      await mounted.unmount();
    }
  });

  it.each([
    'resolve',
    'reject',
  ])('preserves the replacement and recovered host after obsolete attach %s', async (outcome) => {
    await enableRealSessionRecovery();
    const oldAttach = createDeferredResult<SessionOpenResult>();
    testState.sessionGetRuntimeInfo.mockResolvedValueOnce({
      pid: 101,
      isAlive: true,
      isActive: true,
      cwd: '/repo/worktree',
      kind: 'agent',
    });
    testState.sessionAttach.mockImplementationOnce(() => oldAttach.promise);
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
    testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
    const mounted = mountHookHarness({
      backendSessionId: 'recovered-session',
      persistOnDisconnect: true,
    });
    try {
      await act(async () => await flushMicrotasks());
      expect(testState.sessionAttach).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'recovered-session' })
      );
      await act(async () => {
        testState.restartSession?.();
        await flushMicrotasks();
      });
      const replacementHandlers = testState.sessionHandlers;
      await act(async () => {
        if (outcome === 'resolve') {
          oldAttach.resolve(createTestSessionResult('recovered-session', true));
        } else {
          oldAttach.reject(new Error('Session not found'));
        }
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('replacement after obsolete attach'));
      expect(testState.sessionWrite).toHaveBeenLastCalledWith(
        'replacement-session',
        'replacement after obsolete attach'
      );
      expect(testState.sessionHandlers).toBe(replacementHandlers);
      expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
      expect(testState.sessionKill).not.toHaveBeenCalled();
    } finally {
      await mounted.unmount();
    }
  });

  it.each([
    'local',
    'remote',
  ] as const)('keeps replacement input queued while an obsolete %s creation completes', async (backend) => {
    const resultFor = (sessionId: string): SessionOpenResult => ({
      session: { ...createTestSessionResult(sessionId).session, backend },
    });
    const oldCreation = createDeferredResult<SessionOpenResult>();
    const replacementCreation = createDeferredResult<SessionOpenResult>();
    testState.sessionCreate.mockImplementationOnce(() => oldCreation.promise);
    testState.sessionCreate.mockImplementationOnce(() => replacementCreation.promise);
    testState.sessionAttach.mockResolvedValueOnce(resultFor('replacement-session'));
    const mounted = mountHookHarness({
      cwd: backend === 'remote' ? '/__enso_remote__/connection-1/workspace' : '/repo/worktree',
    });
    try {
      await act(async () => await flushMicrotasks());
      await act(async () => {
        testState.restartSession?.();
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('new input'));
      await act(async () => {
        oldCreation.resolve(resultFor('obsolete-session'));
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.(' still pending'));
      expect(testState.sessionWrite).not.toHaveBeenCalled();
      expect(testState.latestSnapshot.isLoading).toBe(true);
      await act(async () => {
        replacementCreation.resolve(resultFor('replacement-session'));
        await flushMicrotasks();
      });
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'replacement-session',
        'new input still pending'
      );
      expect(testState.sessionKill).not.toHaveBeenCalledWith('replacement-session');
    } finally {
      await mounted.unmount();
    }
  });

  it('does not terminate a created session that the replacement has already adopted', async () => {
    const oldCreation = createDeferredResult<SessionOpenResult>();
    testState.sessionCreate.mockImplementationOnce(() => oldCreation.promise);
    testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('shared-session', true));
    testState.sessionAttach.mockImplementation(async ({ sessionId }) =>
      createTestSessionResult(sessionId, true)
    );
    const mounted = mountHookHarness({ persistOnDisconnect: true });
    try {
      await act(async () => await flushMicrotasks());
      await act(async () => {
        testState.restartSession?.();
        await flushMicrotasks();
      });
      await act(async () => {
        oldCreation.resolve(createTestSessionResult('shared-session', true));
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('adopted session input'));
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'shared-session',
        'adopted session input'
      );
      expect(testState.sessionKill).not.toHaveBeenCalled();
      expect(testState.sessionDetach).not.toHaveBeenCalled();
      expect(testState.sessionOpen).toHaveBeenCalledTimes(1);
    } finally {
      await mounted.unmount();
    }
  });

  it('cancels pending hibernation when a transcript selection appears', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => await flushMicrotasks());
      vi.useFakeTimers();
      mounted.rerender({ isActive: false, isVisible: false });
      await act(async () => await flushMicrotasks());
      const suspension = createDeferredResult<undefined>();
      testState.sessionSetOutputDelivery.mockImplementationOnce(() => suspension.promise);
      await act(async () => await vi.advanceTimersByTimeAsync(XTERM_HIBERNATION_IDLE_MS));
      testState.terminalHasSelection = true;
      await act(async () => {
        suspension.resolve(undefined);
        await flushMicrotasks();
      });
      expect(testState.terminalDispose).not.toHaveBeenCalled();
      expect(testState.sessionSetOutputDelivery).toHaveBeenLastCalledWith(
        'backend-session-1',
        true
      );
    } finally {
      await mounted.unmount();
    }
  });

  it('does not let obsolete runtime discovery start a new session', async () => {
    await enableRealSessionRecovery();
    const runtimeInfo = createDeferredResult<SessionRuntimeInfo | null>();
    testState.sessionGetRuntimeInfo.mockImplementationOnce(() => runtimeInfo.promise);
    testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
    const mounted = mountHookHarness({ backendSessionId: 'missing-session' });
    try {
      await act(async () => await flushMicrotasks());
      expect(testState.sessionGetRuntimeInfo).toHaveBeenCalledExactlyOnceWith('missing-session');
      await act(async () => {
        testState.restartSession?.();
        await flushMicrotasks();
      });
      await act(async () => {
        runtimeInfo.resolve(null);
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('after obsolete discovery'));
      expect(testState.sessionWrite).toHaveBeenLastCalledWith(
        'replacement-session',
        'after obsolete discovery'
      );
      expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
    } finally {
      await mounted.unmount();
    }
  });

  it('does not dispose a replacement surface when an obsolete detach completes', async () => {
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => await flushMicrotasks());
      const oldDetach = createDeferredResult<undefined>();
      testState.sessionDetach.mockImplementationOnce(() => oldDetach.promise);
      testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      await act(async () => {
        testState.restartSession?.();
        await flushMicrotasks();
        testState.restartSession?.();
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('before obsolete detach'));
      expect(testState.sessionWrite).toHaveBeenLastCalledWith(
        'replacement-session',
        'before obsolete detach'
      );
      await act(async () => {
        oldDetach.resolve(undefined);
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('after obsolete detach'));
      expect(testState.sessionWrite).toHaveBeenLastCalledWith(
        'replacement-session',
        'after obsolete detach'
      );
      expect(testState.terminalDispose).toHaveBeenCalledExactlyOnceWith(0);
    } finally {
      await mounted.unmount();
    }
  });

  it('ignores an obsolete output activation error instead of clearing the replacement', async () => {
    const oldActivation = createDeferredResult<undefined>();
    testState.sessionActivateOutput.mockImplementationOnce(() => oldActivation.promise);
    testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    const mounted = mountHookHarness();
    try {
      await act(async () => await flushMicrotasks());
      testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      await act(async () => {
        testState.restartSession?.();
        await flushMicrotasks();
      });
      await act(async () => {
        oldActivation.reject(new Error('Output activation failed'));
        await flushMicrotasks();
      });
      act(() => testState.terminalDataHandler?.('after obsolete activation'));
      expect(testState.sessionWrite).toHaveBeenLastCalledWith(
        'replacement-session',
        'after obsolete activation'
      );
      expect(testState.latestSnapshot.isLoading).toBe(false);
    } finally {
      await mounted.unmount();
    }
  });

  it.each([
    false,
    true,
  ])('cleans up only an abandoned creation with persistence=%s after unmount', async (persistOnDisconnect) => {
    const creation = createDeferredResult<SessionOpenResult>();
    testState.sessionCreate.mockImplementationOnce(() => creation.promise);
    testState.sessionAttach.mockResolvedValueOnce(
      createTestSessionResult('abandoned-session', persistOnDisconnect)
    );
    const mounted = mountHookHarness({ persistOnDisconnect });
    await act(async () => await flushMicrotasks());
    await mounted.unmount();
    await act(async () => {
      creation.resolve(createTestSessionResult('abandoned-session', persistOnDisconnect));
      await flushMicrotasks();
    });
    expect(testState.sessionAttach).not.toHaveBeenCalled();
    expect(testState.sessionOpen).not.toHaveBeenCalled();
    expect(testState.sessionWrite).not.toHaveBeenCalled();
    if (persistOnDisconnect) {
      expect(testState.sessionDetach).toHaveBeenCalledExactlyOnceWith('abandoned-session');
      expect(testState.sessionKill).not.toHaveBeenCalled();
    } else {
      expect(testState.sessionKill).toHaveBeenCalledExactlyOnceWith('abandoned-session');
    }
  });

  it.each([
    { persistOnDisconnect: false, outcome: 'resolve' },
    { persistOnDisconnect: true, outcome: 'resolve' },
    { persistOnDisconnect: false, outcome: 'reject' },
    { persistOnDisconnect: true, outcome: 'reject' },
  ])('preserves a published agent session adopted by a replacement host ($persistOnDisconnect, $outcome)', async ({
    persistOnDisconnect,
    outcome,
  }) => {
    const oldAttach = createDeferredResult<SessionOpenResult>();
    const onSessionIdChange = vi.fn();
    testState.sessionCreate.mockResolvedValueOnce(
      createTestSessionResult('moved-session', persistOnDisconnect)
    );
    testState.sessionAttach.mockImplementationOnce(() => oldAttach.promise);
    const original = mountHookHarness({ persistOnDisconnect, onSessionIdChange });
    await act(async () => await flushMicrotasks());
    expect(onSessionIdChange).toHaveBeenCalledExactlyOnceWith('moved-session');
    await original.unmount();

    await enableRealSessionRecovery();
    testState.sessionGetRuntimeInfo.mockResolvedValue({
      pid: 101,
      isAlive: true,
      isActive: true,
      kind: 'agent',
      cwd: '/repo/worktree',
    });
    testState.sessionAttach.mockResolvedValueOnce(
      createTestSessionResult('moved-session', persistOnDisconnect)
    );
    const replacement = mountHookHarness({
      backendSessionId: 'moved-session',
      persistOnDisconnect,
    });
    try {
      await act(async () => await flushMicrotasks());
      act(() => testState.terminalDataHandler?.('after host move'));
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'moved-session',
        'after host move'
      );
      await act(async () => {
        if (outcome === 'resolve') {
          oldAttach.resolve(createTestSessionResult('moved-session', persistOnDisconnect));
        } else {
          oldAttach.reject(new Error('Old host attach failed'));
        }
        await flushMicrotasks();
      });
      expect(testState.sessionKill).not.toHaveBeenCalled();
      expect(testState.sessionDetach).not.toHaveBeenCalled();
      act(() => testState.terminalDataHandler?.('after old host finishes'));
      expect(testState.sessionWrite.mock.calls).toEqual([
        ['moved-session', 'after host move'],
        ['moved-session', 'after old host finishes'],
      ]);
      expect(testState.sessionCreate).toHaveBeenCalledTimes(1);
      expect(testState.latestSnapshot.isLoading).toBe(false);
    } finally {
      await replacement.unmount();
    }
  });

  it.each([
    'attach',
    'transcript',
    'activate',
    'resync',
  ])('does not clear replacement loading when obsolete %s finishes during detach', async (stage) => {
    const oldAttach = createDeferredResult<SessionOpenResult>();
    const oldTranscript = createDeferredResult<SessionTranscriptPage>();
    const oldActivation = createDeferredResult<undefined>();
    if (stage === 'attach') {
      testState.sessionAttach.mockImplementationOnce(() => oldAttach.promise);
    } else {
      testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('backend-session-1'));
    }
    if (stage === 'transcript') {
      testState.sessionGetTranscriptPage.mockImplementationOnce(() => oldTranscript.promise);
    }
    if (stage === 'activate') {
      testState.sessionActivateOutput.mockImplementationOnce(() => oldActivation.promise);
    }
    const mounted = mountHookHarness();
    try {
      await act(async () => await flushMicrotasks());
      if (stage === 'resync') {
        await act(async () => {
          testState.sessionHandlers?.onResync?.({
            sessionId: 'backend-session-1',
            replay: 'obsolete resync replay',
          });
          await flushMicrotasks();
        });
        expect(testState.terminalWriteCallbacks).toHaveLength(1);
      }
      vi.useFakeTimers();
      const oldDetach = createDeferredResult<undefined>();
      testState.sessionDetach.mockImplementationOnce(() => oldDetach.promise);
      testState.sessionCreate.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      testState.sessionAttach.mockResolvedValueOnce(createTestSessionResult('replacement-session'));
      await act(async () => {
        testState.restartSession?.();
        await vi.advanceTimersByTimeAsync(32);
        await flushMicrotasks();
      });
      expect(testState.latestSnapshot.isLoading).toBe(true);
      expect(testState.terminalInstanceCount).toBe(1);
      await act(async () => {
        if (stage === 'attach') {
          oldAttach.resolve(createTestSessionResult('backend-session-1'));
        } else if (stage === 'transcript') {
          oldTranscript.resolve({ text: '', totalBytes: 0, health: 'unavailable' });
        } else if (stage === 'resync') {
          testState.terminalWriteCallbacks.splice(0).forEach((callback) => {
            callback();
          });
        } else {
          oldActivation.resolve(undefined);
        }
        await flushMicrotasks();
      });
      expect(testState.latestSnapshot.isLoading).toBe(true);
      await act(async () => {
        oldDetach.resolve(undefined);
        await flushMicrotasks();
      });
      expect(testState.latestSnapshot.isLoading).toBe(false);
      act(() => testState.terminalDataHandler?.('after delayed detach'));
      expect(testState.sessionWrite).toHaveBeenCalledExactlyOnceWith(
        'replacement-session',
        'after delayed detach'
      );
    } finally {
      await mounted.unmount();
    }
  });

  it('does not create a session after runtime discovery completes on an unmounted surface', async () => {
    await enableRealSessionRecovery();
    const runtimeInfo = createDeferredResult<SessionRuntimeInfo | null>();
    testState.sessionGetRuntimeInfo.mockImplementationOnce(() => runtimeInfo.promise);
    const mounted = mountHookHarness({ backendSessionId: 'missing-session' });
    await act(async () => await flushMicrotasks());
    expect(testState.sessionGetRuntimeInfo).toHaveBeenCalledExactlyOnceWith('missing-session');
    await mounted.unmount();
    await act(async () => {
      runtimeInfo.resolve(null);
      await flushMicrotasks();
    });
    expect(testState.sessionCreate).not.toHaveBeenCalled();
  });

  it('scrolls tmux-backed agent output through the host scrollback', async () => {
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -4,
    } as never);

    const mounted = mountHookHarness({
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'tmux-session-1',
      },
      kind: 'agent',
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
      await vi.advanceTimersByTimeAsync(16);
      await flushMicrotasks();
    });

    expect(testState.tmuxScrollClient).toHaveBeenCalledWith('/repo/worktree', {
      sessionName: 'tmux-session-1',
      serverName: 'infilux',
      direction: 'up',
      amount: 4,
    });
    expect(testState.terminalScrollLines).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('sends Codex alternate-buffer program scrolling to the session instead of tmux', async () => {
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'program-scroll',
      carryY: 0,
      sequence: '\x1b[5~',
      repeat: 1,
    });
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

    const mounted = mountHookHarness({
      agentId: 'codex',
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'tmux-session-1',
      },
      kind: 'agent',
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(testState.attachedWheelHandler).toBeTypeOf('function');

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

    expect(testState.resolveAgentWheelPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'codex',
        kind: 'agent',
        hostScrollMode: 'tmux',
        deltaY: -4,
      })
    );
    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', '\x1b[5~');
    expect(testState.tmuxScrollClient).not.toHaveBeenCalled();
    expect(testState.terminalScrollLines).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('falls back to Claude page scrolling when tmux host scrolling is unavailable', async () => {
    testState.resolveAgentWheelPolicy.mockReturnValue({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -4,
      fallbackToProgramScroll: true,
    } as never);
    testState.tmuxScrollClient.mockResolvedValue({
      applied: false,
      inMode: false,
      paneId: '%0',
    });
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

    const mounted = mountHookHarness({
      agentId: 'claude',
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'tmux-session-1',
      },
      kind: 'agent',
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
      await vi.advanceTimersByTimeAsync(16);
      await flushMicrotasks();
    });

    expect(testState.sessionWrite).toHaveBeenCalledWith('backend-session-1', '\x1b[5~');
    expect(testState.terminalScrollLines).not.toHaveBeenCalled();

    await mounted.unmount();
  });
});
