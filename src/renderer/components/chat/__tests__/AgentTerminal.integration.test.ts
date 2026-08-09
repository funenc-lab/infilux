/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_STARTUP_STALL_THRESHOLD_MS } from '../agentStartupOverlay';
import { AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS } from '../agentStartupVisibilityPolicy';

type AgentTerminalModule = typeof import('../AgentTerminal');
type AgentTerminalProps = React.ComponentProps<AgentTerminalModule['AgentTerminal']>;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  runtimeContext: { kind: 'local' as 'local' | 'remote' },
  showScrollToBottom: false,
  formattedTranscriptText: 'formatted transcript',
  useXtermOptions: [] as Array<Record<string, unknown>>,
  discoveryCalls: [] as Array<Record<string, unknown>>,
  providerDiscoveryState: {
    providerSessionResolutionPending: false,
  },
  terminal: {
    rows: 24,
    focus: vi.fn(),
    hasSelection: vi.fn(() => false),
    paste: vi.fn(),
    clearSelection: vi.fn(),
    refresh: vi.fn(),
    selectAll: vi.fn(),
    scrollLines: vi.fn(),
  },
  terminalInstance: null as {
    rows: number;
    element?: HTMLDivElement;
    focus: ReturnType<typeof vi.fn>;
    hasSelection: ReturnType<typeof vi.fn>;
    paste: ReturnType<typeof vi.fn>;
    clearSelection: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    selectAll: ReturnType<typeof vi.fn>;
    scrollLines: ReturnType<typeof vi.fn>;
    textarea?: HTMLTextAreaElement;
  } | null,
  xtermResult: {
    containerRef: { current: null as HTMLDivElement | null },
    isLoading: false,
    runtimeState: 'live' as 'live' | 'reconnecting' | 'dead',
    settings: {
      theme: {
        background: '#101014',
        foreground: '#f5f5f5',
      },
    },
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    searchState: {
      term: '',
      resultCount: 0,
      resultIndex: -1,
    },
    clearSearch: vi.fn(),
    clear: vi.fn(),
    fit: vi.fn(),
    refreshRenderer: vi.fn(),
    recreateWebglRenderer: vi.fn(),
    restartSession: vi.fn(),
    write: vi.fn(),
  },
  terminalWriteStore: {
    register: vi.fn(),
    unregister: vi.fn(),
  },
  agentSessionsStore: {
    runtimeStates: {} as Record<string, { lastActivityAt?: number; waitingForInput?: boolean }>,
    setOutputState: vi.fn(),
    markSessionActive: vi.fn(),
    clearRuntimeState: vi.fn(),
    getEnhancedInputState: vi.fn(() => ({ attachments: [] as string[] })),
    setEnhancedInputAttachments: vi.fn(),
  },
  settingsStore: {
    agentNotificationEnabled: false,
    agentNotificationDelay: 5,
    agentNotificationEnterDelay: 0,
    hapiSettings: {
      cliApiToken: '',
    },
    shellConfig: {
      defaultShell: 'zsh',
    },
    agentIntegration: {
      enabled: false,
      tmuxEnabled: false,
      enhancedInputEnabled: true,
      enhancedInputAutoPopup: 'manual',
      stopHookEnabled: false,
    },
  },
  electronAPI: {
    shellResolveForCommand: vi.fn(async () => ({
      shell: '/bin/zsh',
      execArgs: ['-lc'],
    })),
    hapiCheckGlobal: vi.fn(async () => ({
      installed: true,
    })),
    mcpGetStatus: vi.fn(async () => ({
      enabled: false,
      port: null,
      workspaceFolders: [],
      hasMatchingWorkspace: false,
      matchingWorkspaceLockCount: 0,
      canUseIde: false,
      reason: 'bridge-disabled',
    })),
    ensureWorkspaceTrusted: vi.fn(async () => true),
    agentInputDispatch: vi.fn(async () => undefined),
    contextMenuShow: vi.fn(async (_items?: unknown) => null as string | null),
    sessionGetActivity: vi.fn(async () => false),
    tmuxScrollClient: vi.fn(async () => ({
      applied: true,
      inMode: false,
      paneId: '%0',
    })),
    utilsGetPathForFile: vi.fn(() => null),
    fileSaveToTemp: vi.fn<() => Promise<{ error?: string; path?: string; success: boolean }>>(
      async () => ({
        success: true,
        path: '/tmp/file.txt',
      })
    ),
    fileSaveClipboardImageToTemp: vi.fn<
      () => Promise<{ error?: string; path?: string; success: boolean }>
    >(async () => ({
      success: true,
      path: '/tmp/image.png',
    })),
  },
  clipboard: {
    copyTerminalSelectionToClipboard: vi.fn(async () => true),
    readClipboardText: vi.fn(async () => ''),
    restoreTerminalInteractionAfterCopy: vi.fn(
      (
        terminal: {
          clearSelection?: () => void;
          focus?: () => void;
          refresh?: (start: number, end: number) => void;
          rows?: number;
        } | null
      ) => {
        terminal?.clearSelection?.();
        terminal?.focus?.();
        if (typeof terminal?.rows === 'number' && terminal.rows > 0) {
          terminal.refresh?.(0, terminal.rows - 1);
        }
      }
    ),
    writeClipboardText: vi.fn(async () => undefined),
  },
  scrollToBottomSpy: vi.fn(),
  toastAdd: vi.fn(),
  showRendererNotification: vi.fn(async () => undefined),
  searchBarFocus: vi.fn(),
}));

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    ArrowDown: icon,
  };
});

vi.mock('@/components/terminal/TerminalSearchBar', () => ({
  TerminalSearchBar: React.forwardRef<
    { focus: () => void },
    {
      isOpen: boolean;
    }
  >(({ isOpen }, ref) => {
    React.useImperativeHandle(ref, () => ({
      focus: testState.searchBarFocus,
    }));

    return React.createElement('div', {
      'data-testid': 'terminal-search-bar',
      'data-open': String(isOpen),
    });
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: testState.toastAdd,
  },
}));

vi.mock('@/hooks/useAgentProviderSessionDiscovery', () => ({
  useAgentProviderSessionDiscovery: (options: Record<string, unknown>) => {
    testState.discoveryCalls.push(options);
    return testState.providerDiscoveryState;
  },
}));

vi.mock('@/hooks/useAgentProviderSessionTitle', () => ({
  useAgentProviderSessionTitle: () => undefined,
}));

vi.mock('@/hooks/useRepositoryRuntimeContext', () => ({
  useRepositoryRuntimeContext: () => ({
    data: testState.runtimeContext,
  }),
}));

vi.mock('@/hooks/useTerminalScrollToBottom', () => ({
  useTerminalScrollToBottom: () => ({
    showScrollToBottom: testState.showScrollToBottom,
    handleScrollToBottom: testState.scrollToBottomSpy,
  }),
}));

vi.mock('@/hooks/useXterm', () => ({
  useXterm: (options: Record<string, unknown>) => {
    testState.useXtermOptions.push(options);
    return {
      ...testState.xtermResult,
      terminal: testState.terminalInstance,
    };
  },
}));

vi.mock('@/hooks/xtermClipboard', () => ({
  copyTerminalSelectionToClipboard: testState.clipboard.copyTerminalSelectionToClipboard,
  readClipboardText: testState.clipboard.readClipboardText,
  restoreTerminalInteractionAfterCopy: testState.clipboard.restoreTerminalInteractionAfterCopy,
  writeClipboardText: testState.clipboard.writeClipboardText,
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, vars?: Record<string, string | number>) =>
      value.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(vars?.[key] ?? '')),
  }),
}));

vi.mock('@/lib/electronNotification', () => ({
  showRendererNotification: testState.showRendererNotification,
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

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (selector: (state: typeof testState.agentSessionsStore) => unknown) =>
    selector(testState.agentSessionsStore),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: typeof testState.settingsStore) => unknown) =>
    selector(testState.settingsStore),
}));

vi.mock('@/stores/terminalWrite', () => ({
  useTerminalWriteStore: () => testState.terminalWriteStore,
}));

vi.mock('../agentTranscriptTerminalFormat', () => ({
  formatAgentTranscriptForTerminal: () => testState.formattedTranscriptText,
}));

interface MountedAgentTerminal {
  container: HTMLDivElement;
  rerender: (overrides?: Partial<AgentTerminalProps>) => Promise<void>;
  unmount: () => Promise<void>;
}

function getDefaultProps(): AgentTerminalProps {
  return {
    id: 'ui-session-1',
    sessionId: 'provider-session-1',
    backendSessionId: 'backend-session-1',
    cwd: '/repo/worktree',
    agentId: 'codex',
    agentCommand: 'codex',
    isActive: true,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDomRectLike(input: {
  height: number;
  left?: number;
  top?: number;
  width: number;
}): DOMRect {
  const left = input.left ?? 0;
  const top = input.top ?? 0;
  return {
    bottom: top + input.height,
    height: input.height,
    left,
    right: left + input.width,
    top,
    width: input.width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function installQueuedAnimationFrame() {
  let nextFrameId = 1;
  let queuedFrames: Array<{ callback: FrameRequestCallback; id: number }> = [];

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    queuedFrames.push({ callback, id });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queuedFrames = queuedFrames.filter((frame) => frame.id !== id);
  });

  return {
    flushNextFrame() {
      const frame = queuedFrames.shift();
      expect(frame).toBeDefined();
      frame?.callback(performance.now());
    },
    get pendingFrameCount() {
      return queuedFrames.length;
    },
  };
}

function getXtermContainer(): HTMLDivElement {
  const container = testState.xtermResult.containerRef.current;
  expect(container).not.toBeNull();
  return container as HTMLDivElement;
}

function createImageSignalPasteEvent(types = ['image/png']): Event {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: {
      items: [],
      types,
    },
  });
  return pasteEvent;
}

async function mountAgentTerminal(
  overrides: Partial<AgentTerminalProps> = {}
): Promise<MountedAgentTerminal> {
  const { AgentTerminal } = await import('../AgentTerminal');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let currentProps: AgentTerminalProps = {
    ...getDefaultProps(),
    ...overrides,
  };

  const render = async (nextOverrides: Partial<AgentTerminalProps> = {}) => {
    currentProps = {
      ...currentProps,
      ...nextOverrides,
    };

    await act(async () => {
      root.render(React.createElement(AgentTerminal, currentProps));
      await flushMicrotasks();
    });
  };

  await render();

  return {
    container,
    rerender: render,
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await flushMicrotasks();
      });
      container.remove();
    },
  };
}

describe('AgentTerminal integration', () => {
  beforeEach(() => {
    testState.runtimeContext = { kind: 'local' };
    testState.showScrollToBottom = false;
    testState.formattedTranscriptText = 'formatted transcript';
    testState.useXtermOptions = [];
    testState.discoveryCalls = [];
    testState.providerDiscoveryState = {
      providerSessionResolutionPending: false,
    };

    testState.terminal.focus.mockReset();
    testState.terminal.hasSelection.mockReset();
    testState.terminal.hasSelection.mockReturnValue(false);
    testState.terminal.paste.mockReset();
    testState.terminal.clearSelection.mockReset();
    testState.terminal.refresh.mockReset();
    testState.terminal.selectAll.mockReset();
    testState.terminal.scrollLines.mockReset();
    testState.terminalInstance = testState.terminal;

    testState.xtermResult.containerRef = { current: null };
    testState.xtermResult.isLoading = false;
    testState.xtermResult.runtimeState = 'live';
    testState.xtermResult.settings = {
      theme: {
        background: '#101014',
        foreground: '#f5f5f5',
      },
    };
    testState.xtermResult.findNext.mockReset();
    testState.xtermResult.findPrevious.mockReset();
    testState.xtermResult.searchState = {
      term: '',
      resultCount: 0,
      resultIndex: -1,
    };
    testState.xtermResult.clearSearch.mockReset();
    testState.xtermResult.clear.mockReset();
    testState.xtermResult.fit.mockReset();
    testState.xtermResult.refreshRenderer.mockReset();
    testState.xtermResult.recreateWebglRenderer.mockReset();
    testState.xtermResult.restartSession.mockReset();
    testState.xtermResult.write.mockReset();

    testState.terminalWriteStore.register.mockReset();
    testState.terminalWriteStore.unregister.mockReset();

    testState.agentSessionsStore.runtimeStates = {};
    testState.agentSessionsStore.setOutputState.mockReset();
    testState.agentSessionsStore.markSessionActive.mockReset();
    testState.agentSessionsStore.clearRuntimeState.mockReset();
    testState.agentSessionsStore.getEnhancedInputState.mockReset();
    testState.agentSessionsStore.getEnhancedInputState.mockReturnValue({ attachments: [] });
    testState.agentSessionsStore.setEnhancedInputAttachments.mockReset();

    testState.settingsStore.agentNotificationEnabled = false;
    testState.settingsStore.agentNotificationDelay = 5;
    testState.settingsStore.agentNotificationEnterDelay = 0;
    testState.settingsStore.hapiSettings = { cliApiToken: '' };
    testState.settingsStore.shellConfig = { defaultShell: 'zsh' };
    testState.settingsStore.agentIntegration = {
      enabled: false,
      tmuxEnabled: false,
      enhancedInputEnabled: true,
      enhancedInputAutoPopup: 'manual',
      stopHookEnabled: false,
    };

    testState.electronAPI.shellResolveForCommand.mockReset();
    testState.electronAPI.shellResolveForCommand.mockResolvedValue({
      shell: '/bin/zsh',
      execArgs: ['-lc'],
    });
    testState.electronAPI.hapiCheckGlobal.mockReset();
    testState.electronAPI.hapiCheckGlobal.mockResolvedValue({ installed: true });
    testState.electronAPI.mcpGetStatus.mockReset();
    testState.electronAPI.mcpGetStatus.mockResolvedValue({
      enabled: false,
      port: null,
      workspaceFolders: [],
      hasMatchingWorkspace: false,
      matchingWorkspaceLockCount: 0,
      canUseIde: false,
      reason: 'bridge-disabled',
    });
    testState.electronAPI.ensureWorkspaceTrusted.mockReset();
    testState.electronAPI.ensureWorkspaceTrusted.mockResolvedValue(true);
    testState.electronAPI.agentInputDispatch.mockReset();
    testState.electronAPI.agentInputDispatch.mockResolvedValue(undefined);
    testState.electronAPI.contextMenuShow.mockReset();
    testState.electronAPI.contextMenuShow.mockResolvedValue(null);
    testState.electronAPI.sessionGetActivity.mockReset();
    testState.electronAPI.sessionGetActivity.mockResolvedValue(false);
    testState.electronAPI.tmuxScrollClient.mockReset();
    testState.electronAPI.tmuxScrollClient.mockResolvedValue({
      applied: true,
      inMode: false,
      paneId: '%0',
    });
    testState.electronAPI.utilsGetPathForFile.mockReset();
    testState.electronAPI.utilsGetPathForFile.mockReturnValue(null);
    testState.electronAPI.fileSaveToTemp.mockReset();
    testState.electronAPI.fileSaveToTemp.mockResolvedValue({
      success: true,
      path: '/tmp/file.txt',
    });
    testState.electronAPI.fileSaveClipboardImageToTemp.mockReset();
    testState.electronAPI.fileSaveClipboardImageToTemp.mockResolvedValue({
      success: true,
      path: '/tmp/image.png',
    });
    testState.clipboard.copyTerminalSelectionToClipboard.mockReset();
    testState.clipboard.copyTerminalSelectionToClipboard.mockResolvedValue(true);
    testState.clipboard.readClipboardText.mockReset();
    testState.clipboard.readClipboardText.mockResolvedValue('');
    testState.clipboard.restoreTerminalInteractionAfterCopy.mockReset();
    testState.clipboard.restoreTerminalInteractionAfterCopy.mockImplementation((terminal) => {
      terminal?.clearSelection?.();
      terminal?.focus?.();
      if (typeof terminal?.rows === 'number' && terminal.rows > 0) {
        terminal.refresh?.(0, terminal.rows - 1);
      }
    });
    testState.clipboard.writeClipboardText.mockReset();
    testState.clipboard.writeClipboardText.mockResolvedValue(undefined);

    testState.scrollToBottomSpy.mockReset();
    testState.toastAdd.mockReset();
    testState.showRendererNotification.mockReset();
    testState.searchBarFocus.mockReset();

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        env: {
          platform: 'darwin',
          runtimeChannel: 'prod',
        },
        shell: {
          resolveForCommand: testState.electronAPI.shellResolveForCommand,
        },
        hapi: {
          checkGlobal: testState.electronAPI.hapiCheckGlobal,
        },
        mcp: {
          getStatus: testState.electronAPI.mcpGetStatus,
        },
        claudeConfig: {
          projectTrust: {
            ensureWorkspaceTrusted: testState.electronAPI.ensureWorkspaceTrusted,
          },
        },
        agentInput: {
          dispatch: testState.electronAPI.agentInputDispatch,
        },
        contextMenu: {
          show: testState.electronAPI.contextMenuShow,
        },
        session: {
          getActivity: testState.electronAPI.sessionGetActivity,
          write: vi.fn(),
        },
        tmux: {
          scrollClient: testState.electronAPI.tmuxScrollClient,
        },
        utils: {
          getPathForFile: testState.electronAPI.utilsGetPathForFile,
        },
        file: {
          saveToTemp: testState.electronAPI.fileSaveToTemp,
          saveClipboardImageToTemp: testState.electronAPI.fileSaveClipboardImageToTemp,
        },
      },
    });

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders transcript mode and passes formatted static content to useXterm', async () => {
    const mounted = await mountAgentTerminal({
      readOnlyTranscript: {
        identity: 'transcript-identity',
        entries: [
          {
            id: 'entry-1',
            text: 'Review the terminal state',
            kind: 'message',
            role: 'user',
            timestamp: Date.parse('2026-04-23T00:00:00.000Z'),
          },
        ],
      },
    });

    const terminalRoot = mounted.container.querySelector<HTMLElement>('[data-agent-terminal-mode]');
    expect(terminalRoot?.dataset.agentTerminalMode).toBe('transcript');

    const lastUseXtermCall = testState.useXtermOptions.at(-1);
    expect(lastUseXtermCall?.staticContent).toEqual({
      text: 'formatted transcript',
      identity: 'transcript-identity',
    });
    expect(testState.electronAPI.shellResolveForCommand).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('registers an enhanced input sender, dispatches formatted content, and unregisters it', async () => {
    const registerSender = vi.fn();
    const unregisterSender = vi.fn();
    const mounted = await mountAgentTerminal({
      onRegisterEnhancedInputSender: registerSender,
      onUnregisterEnhancedInputSender: unregisterSender,
    });

    expect(registerSender).toHaveBeenCalledTimes(1);
    const registeredSessionId = registerSender.mock.calls[0]?.[0];
    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(registeredSessionId).toBe('ui-session-1');
    expect(sender).toBeTypeOf('function');

    const sent = sender?.('Review this diff', [
      {
        id: 'attachment-1',
        kind: 'file',
        name: 'notes.md',
        path: '/tmp/notes.md',
      },
    ]);

    expect(sent).toBe(true);
    await flushMicrotasks();

    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: 'Review this diff\n\n@/tmp/notes.md',
      submit: true,
      submitDelayMs: 300,
    });
    expect(testState.terminal.focus).toHaveBeenCalledTimes(1);

    await mounted.unmount();

    expect(unregisterSender).toHaveBeenCalledWith('ui-session-1');
  });

  it('activates the session and derives its title from the first enhanced input only', async () => {
    const registerSender = vi.fn();
    const onActivated = vi.fn();
    const onActivatedWithFirstLine = vi.fn();
    const mounted = await mountAgentTerminal({
      activated: false,
      onActivated,
      onActivatedWithFirstLine,
      onRegisterEnhancedInputSender: registerSender,
    });
    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(sender?.('Investigate enhanced input title\nInclude recovery behavior', [])).toBe(true);
    expect(sender?.('Do not replace the first title', [])).toBe(true);
    await flushMicrotasks();

    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(onActivatedWithFirstLine).toHaveBeenCalledTimes(1);
    expect(onActivatedWithFirstLine).toHaveBeenCalledWith('Investigate enhanced input title');

    await mounted.unmount();
  });

  it('activates attachment-only enhanced input without using an attachment path as the title', async () => {
    const registerSender = vi.fn();
    const onActivated = vi.fn();
    const onActivatedWithFirstLine = vi.fn();
    const mounted = await mountAgentTerminal({
      activated: false,
      onActivated,
      onActivatedWithFirstLine,
      onRegisterEnhancedInputSender: registerSender,
    });
    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(
      sender?.('', [
        {
          id: 'attachment-1',
          kind: 'file',
          name: 'notes.md',
          path: '/tmp/notes.md',
        },
      ])
    ).toBe(true);
    await flushMicrotasks();

    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(onActivatedWithFirstLine).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('does not activate the session when enhanced input dispatch fails', async () => {
    const dispatchError = new Error('dispatch failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    testState.electronAPI.agentInputDispatch.mockRejectedValueOnce(dispatchError);
    const registerSender = vi.fn();
    const onActivated = vi.fn();
    const onActivatedWithFirstLine = vi.fn();
    const mounted = await mountAgentTerminal({
      activated: false,
      onActivated,
      onActivatedWithFirstLine,
      onRegisterEnhancedInputSender: registerSender,
    });
    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(sender?.('Do not persist failed input', [])).toBe(true);
    await flushMicrotasks();

    expect(onActivated).not.toHaveBeenCalled();
    expect(onActivatedWithFirstLine).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[AgentTerminal] Failed to dispatch agent input',
      dispatchError
    );

    await mounted.unmount();
  });

  it('uses the configured renderer by default', async () => {
    const mounted = await mountAgentTerminal();

    expect(testState.useXtermOptions.at(-1)).toMatchObject({
      kind: 'agent',
      preferCompatibilityRenderer: false,
    });

    await mounted.unmount();
  });

  it('honors an explicit compatibility renderer override', async () => {
    const mounted = await mountAgentTerminal({ preferCompatibilityRenderer: true });

    expect(testState.useXtermOptions.at(-1)).toMatchObject({
      kind: 'agent',
      preferCompatibilityRenderer: true,
    });

    await mounted.unmount();
  });

  it('returns false from the registered sender for read-only transcripts', async () => {
    const registerSender = vi.fn();
    const onActivated = vi.fn();
    const onActivatedWithFirstLine = vi.fn();
    const mounted = await mountAgentTerminal({
      readOnlyTranscript: {
        identity: 'transcript-read-only',
        entries: [],
      },
      onActivated,
      onActivatedWithFirstLine,
      onRegisterEnhancedInputSender: registerSender,
    });

    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(sender?.('Ping transcript', [])).toBe(false);
    expect(testState.electronAPI.agentInputDispatch).not.toHaveBeenCalled();
    expect(testState.terminal.focus).not.toHaveBeenCalled();
    expect(onActivated).not.toHaveBeenCalled();
    expect(onActivatedWithFirstLine).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('returns false from the registered sender when runtime is not live', async () => {
    testState.xtermResult.runtimeState = 'dead';

    const registerSender = vi.fn();
    const onActivated = vi.fn();
    const onActivatedWithFirstLine = vi.fn();
    const mounted = await mountAgentTerminal({
      onActivated,
      onActivatedWithFirstLine,
      onRegisterEnhancedInputSender: registerSender,
    });

    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(sender?.('Ping agent', [])).toBe(false);
    expect(testState.electronAPI.agentInputDispatch).not.toHaveBeenCalled();
    expect(onActivated).not.toHaveBeenCalled();
    expect(onActivatedWithFirstLine).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('does not show the startup overlay for inactive local agent terminals while shell resolution is pending', async () => {
    testState.electronAPI.shellResolveForCommand.mockReturnValue(new Promise(() => undefined));

    const mounted = await mountAgentTerminal({
      isActive: false,
    });

    expect(mounted.container.textContent).not.toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('does not show the startup overlay for recently active visible inactive terminals while shell resolution is pending', async () => {
    testState.electronAPI.shellResolveForCommand.mockReturnValue(new Promise(() => undefined));
    testState.agentSessionsStore.runtimeStates = {
      'ui-session-1': {
        lastActivityAt: Date.now(),
      },
    };

    const mounted = await mountAgentTerminal({
      isActive: false,
      isVisible: true,
    });

    expect(mounted.container.textContent).not.toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('shows the startup overlay for long-inactive visible inactive terminals while shell resolution is pending', async () => {
    testState.electronAPI.shellResolveForCommand.mockReturnValue(new Promise(() => undefined));
    testState.agentSessionsStore.runtimeStates = {
      'ui-session-1': {
        lastActivityAt: Date.now() - AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS,
      },
    };

    const mounted = await mountAgentTerminal({
      isActive: false,
      isVisible: true,
    });

    expect(mounted.container.textContent).toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('does not show the startup overlay for recently active visible inactive terminals while awaiting first output', async () => {
    testState.agentSessionsStore.runtimeStates = {
      'ui-session-1': {
        lastActivityAt: Date.now(),
      },
    };

    const mounted = await mountAgentTerminal({
      initialized: false,
      isActive: false,
      isVisible: true,
    });

    expect(mounted.container.textContent).not.toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('keeps startup feedback visible after falling back to a default command shell', async () => {
    testState.electronAPI.shellResolveForCommand.mockRejectedValue(
      new Error('shell resolver failed')
    );

    const mounted = await mountAgentTerminal();
    await act(async () => {
      await flushMicrotasks();
    });

    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Preparing runtime');
    expect(testState.useXtermOptions.length).toBeGreaterThan(1);

    await mounted.unmount();
  });

  it('disables inactive initial-command auto-start for recovered sessions without pending commands', async () => {
    const mounted = await mountAgentTerminal({
      agentId: 'codex',
      agentCommand: 'codex',
      recovered: true,
      initialized: true,
      isActive: false,
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1);
    expect(lastUseXtermCall?.activateOnInitialCommandWhenInactive).toBe(false);

    await mounted.unmount();
  });

  it('keeps inactive initial-command auto-start enabled when a recovered session still has a pending command', async () => {
    const mounted = await mountAgentTerminal({
      agentId: 'codex',
      agentCommand: 'codex',
      recovered: true,
      initialized: true,
      isActive: false,
      hasPendingCommand: true,
      initialPrompt: 'Review the current diff',
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1);
    expect(lastUseXtermCall?.activateOnInitialCommandWhenInactive).toBe(true);

    await mounted.unmount();
  });

  it('does not mark hidden pending-command terminals active for renderer refresh listeners', async () => {
    const mounted = await mountAgentTerminal({
      agentId: 'codex',
      agentCommand: 'codex',
      recovered: true,
      initialized: true,
      isActive: false,
      hasPendingCommand: true,
      initialPrompt: 'Review the current diff',
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1);
    expect(lastUseXtermCall?.activateOnInitialCommandWhenInactive).toBe(true);
    expect(lastUseXtermCall?.isActive).toBe(false);
    expect(lastUseXtermCall?.isVisible).toBe(false);

    await mounted.unmount();
  });

  it('keeps visible inactive terminals subscribed for layout sync without marking them active', async () => {
    const mounted = await mountAgentTerminal({
      agentId: 'codex',
      agentCommand: 'codex',
      recovered: true,
      initialized: true,
      isActive: false,
      isVisible: true,
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1);
    expect(lastUseXtermCall?.isActive).toBe(false);
    expect(lastUseXtermCall?.isVisible).toBe(true);

    await mounted.unmount();
  });

  it('marks the terminal wrapper as a canvas scroll surface', async () => {
    const mounted = await mountAgentTerminal();

    expect(
      mounted.container.querySelector('[data-agent-canvas-scroll-surface="true"]')
    ).not.toBeNull();

    await mounted.unmount();
  });

  it('does not show the startup overlay for inactive agent terminals that are still loading', async () => {
    testState.xtermResult.isLoading = true;

    const mounted = await mountAgentTerminal({
      isActive: false,
    });

    expect(mounted.container.textContent).not.toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('renders the startup overlay as a polite status for active loading terminals', async () => {
    testState.xtermResult.isLoading = true;

    const mounted = await mountAgentTerminal();
    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('status');
    expect(overlay?.getAttribute('aria-live')).toBe('polite');
    expect(overlay?.getAttribute('aria-label')).toBe('Session startup status');
    expect(overlay?.getAttribute('data-agent-terminal-startup-state')).toBe('starting');
    expect(overlay?.textContent).toContain('Agent runtime');
    expect(overlay?.textContent).toContain('Preparing runtime');
    expect(overlay?.textContent).toContain(
      'Attaching the terminal and waiting for the agent prompt.'
    );
    expect(overlay?.textContent).not.toContain('Resolve shell');
    expect(overlay?.textContent).not.toContain('Attach terminal');
    expect(overlay?.textContent).not.toContain('Await prompt');

    await mounted.unmount();
  });

  it('does not cover active loading terminals when replay content is available', async () => {
    testState.xtermResult.isLoading = true;

    const mounted = await mountAgentTerminal({
      replaySnapshot: 'previous terminal output',
    });

    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay).toBeNull();

    await mounted.unmount();
  });

  it('renders the startup overlay for active new sessions before xterm reports loading', async () => {
    testState.terminalInstance = null;

    const mounted = await mountAgentTerminal({
      initialized: false,
    });
    await act(async () => {
      await flushMicrotasks();
    });

    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('data-agent-terminal-startup-state')).toBe('starting');
    expect(overlay?.textContent).toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('keeps the startup overlay visible for active new sessions after xterm attaches but before first output', async () => {
    const mounted = await mountAgentTerminal({
      initialized: false,
    });
    await act(async () => {
      await flushMicrotasks();
    });

    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('data-agent-terminal-startup-state')).toBe('starting');
    expect(overlay?.textContent).toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('keeps the startup overlay visible when initialization has not produced readable output', async () => {
    const mounted = await mountAgentTerminal({
      initialized: true,
    });
    await act(async () => {
      await flushMicrotasks();
    });

    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('data-agent-terminal-startup-state')).toBe('starting');
    expect(overlay?.textContent).toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('upgrades the startup overlay copy when loading takes longer than expected', async () => {
    vi.useFakeTimers();
    testState.xtermResult.isLoading = true;

    const mounted = await mountAgentTerminal();
    await act(async () => {
      vi.advanceTimersByTime(AGENT_STARTUP_STALL_THRESHOLD_MS + 1);
      await flushMicrotasks();
    });

    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay?.getAttribute('data-agent-terminal-startup-state')).toBe('stalled');
    expect(overlay?.textContent).toContain('Still preparing');
    expect(overlay?.textContent).toContain(
      'Runtime is taking longer than expected. Retry if the terminal stays quiet.'
    );

    vi.useRealTimers();
    await mounted.unmount();
  });

  it('shows a retry action for stalled startup even when readiness checks are pending but xterm is not loading', async () => {
    vi.useFakeTimers();
    testState.electronAPI.shellResolveForCommand.mockReturnValue(new Promise(() => undefined));

    const mounted = await mountAgentTerminal();
    await act(async () => {
      vi.advanceTimersByTime(AGENT_STARTUP_STALL_THRESHOLD_MS + 1);
      await flushMicrotasks();
    });

    const retryButton = mounted.container.querySelector('button[title="Retry"]');
    expect(retryButton).not.toBeNull();

    await act(async () => {
      (retryButton as HTMLButtonElement).click();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.restartSession).toHaveBeenCalledTimes(1);
    expect(testState.electronAPI.shellResolveForCommand).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    await mounted.unmount();
  });

  it('shows a retry action for stalled startup and triggers a real session restart', async () => {
    vi.useFakeTimers();
    testState.xtermResult.isLoading = true;

    const mounted = await mountAgentTerminal();
    await act(async () => {
      vi.advanceTimersByTime(AGENT_STARTUP_STALL_THRESHOLD_MS + 1);
      await flushMicrotasks();
    });

    const retryButton = mounted.container.querySelector('button[title="Retry"]');
    expect(retryButton).not.toBeNull();

    await act(async () => {
      (retryButton as HTMLButtonElement).click();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.restartSession).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    await mounted.unmount();
  });

  it('keeps startup feedback visible while the hapi fallback waits for readable output', async () => {
    testState.electronAPI.hapiCheckGlobal.mockRejectedValue(new Error('hapi probe failed'));

    const mounted = await mountAgentTerminal({
      environment: 'hapi',
    });
    await act(async () => {
      await flushMicrotasks();
    });

    const overlay = mounted.container.querySelector('[data-agent-terminal-startup-overlay="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Preparing runtime');

    await mounted.unmount();
  });

  it('passes a hostless fallback launch plan to useXterm for persistent tmux-backed codex sessions', async () => {
    testState.settingsStore.agentIntegration.tmuxEnabled = true;

    const mounted = await mountAgentTerminal({
      initialized: true,
      persistenceEnabled: true,
      hostSessionKey: 'infilux-ui-session-1',
      recoveryState: 'live',
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          hostSession?: Record<string, unknown>;
          sessionCreateFallback?: {
            hostSession?: Record<string, unknown>;
            command?: {
              shell: string;
              args: string[];
            };
          };
        }
      | undefined;

    expect(lastUseXtermCall?.hostSession).toEqual({
      kind: 'tmux',
      serverName: 'infilux',
      sessionName: 'infilux-ui-session-1',
      mode: 'attach-existing',
    });
    expect(lastUseXtermCall?.sessionCreateFallback?.hostSession).toBeUndefined();
    expect(lastUseXtermCall?.sessionCreateFallback?.command).toEqual({
      shell: 'codex',
      args: ['resume', 'provider-session-1'],
      fallbackCommand: {
        shell: '/bin/zsh',
        args: ['-lc', 'codex resume provider-session-1'],
      },
    });

    await mounted.unmount();
  });

  it('holds codex missing-host resume while resolved provider session validation is pending', async () => {
    testState.settingsStore.agentIntegration.tmuxEnabled = true;
    testState.providerDiscoveryState = {
      providerSessionResolutionPending: true,
    };

    const mounted = await mountAgentTerminal({
      id: 'ui-session-1',
      sessionId: 'stale-provider-session',
      backendSessionId: undefined,
      initialized: true,
      persistenceEnabled: true,
      recoveryState: 'missing-host-session',
      hostSessionKey: 'infilux-ui-session-1',
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          command?: unknown;
          backendSessionId?: unknown;
          initialCommand?: unknown;
          isActive?: boolean;
          isVisible?: boolean;
          sessionCreateFallback?: unknown;
        }
      | undefined;

    expect(testState.discoveryCalls.at(-1)).toEqual(
      expect.objectContaining({
        validateResolvedProviderSession: true,
      })
    );
    expect(lastUseXtermCall?.backendSessionId).toBeUndefined();
    expect(lastUseXtermCall?.command).toBeUndefined();
    expect(lastUseXtermCall?.initialCommand).toBeUndefined();
    expect(lastUseXtermCall?.isActive).toBe(false);
    expect(lastUseXtermCall?.isVisible).toBe(false);
    expect(lastUseXtermCall?.sessionCreateFallback).toBeUndefined();

    await mounted.unmount();
  });

  it('validates codex missing-host provider identity even when a stale backend session id exists', async () => {
    testState.settingsStore.agentIntegration.tmuxEnabled = true;
    testState.providerDiscoveryState = {
      providerSessionResolutionPending: true,
    };

    const mounted = await mountAgentTerminal({
      id: 'ui-session-1',
      sessionId: 'stale-provider-session',
      backendSessionId: 'stale-backend-session',
      initialized: true,
      persistenceEnabled: true,
      recoveryState: 'missing-host-session',
      hostSessionKey: 'infilux-ui-session-1',
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          command?: unknown;
          initialCommand?: unknown;
          sessionCreateFallback?: unknown;
        }
      | undefined;

    expect(testState.discoveryCalls.at(-1)).toEqual(
      expect.objectContaining({
        validateResolvedProviderSession: true,
      })
    );
    expect(lastUseXtermCall?.command).toBeUndefined();
    expect(lastUseXtermCall?.initialCommand).toBeUndefined();
    expect(lastUseXtermCall?.sessionCreateFallback).toBeUndefined();

    await mounted.unmount();
  });

  it('restarts recovery automatically after a missing host session resolves a real provider session id', async () => {
    const mounted = await mountAgentTerminal({
      id: 'ui-session-1',
      sessionId: 'ui-session-1',
      backendSessionId: undefined,
      initialized: true,
      persistenceEnabled: true,
      recoveryState: 'missing-host-session',
      hostSessionKey: 'infilux-ui-session-1',
    });

    expect(testState.xtermResult.restartSession).not.toHaveBeenCalled();

    await mounted.rerender({
      sessionId: 'provider-session-1',
    });

    expect(testState.xtermResult.restartSession).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('does not restart inactive recovered sessions when provider session discovery resolves in the background', async () => {
    const mounted = await mountAgentTerminal({
      id: 'ui-session-1',
      sessionId: 'ui-session-1',
      backendSessionId: undefined,
      initialized: true,
      persistenceEnabled: true,
      recoveryState: 'missing-host-session',
      hostSessionKey: 'infilux-ui-session-1',
      isActive: false,
    });

    await mounted.rerender({
      sessionId: 'provider-session-1',
    });

    expect(testState.xtermResult.restartSession).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('restarts visible inactive recovered sessions when provider session discovery resolves', async () => {
    const mounted = await mountAgentTerminal({
      id: 'ui-session-1',
      sessionId: 'ui-session-1',
      backendSessionId: undefined,
      initialized: true,
      persistenceEnabled: true,
      recoveryState: 'missing-host-session',
      hostSessionKey: 'infilux-ui-session-1',
      isActive: false,
      isVisible: true,
    });

    await mounted.rerender({
      sessionId: 'provider-session-1',
    });

    expect(testState.xtermResult.restartSession).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('restarts inactive recovered sessions after provider discovery only when a pending command still needs execution', async () => {
    const mounted = await mountAgentTerminal({
      id: 'ui-session-1',
      sessionId: 'ui-session-1',
      backendSessionId: undefined,
      initialized: true,
      persistenceEnabled: true,
      recoveryState: 'missing-host-session',
      hostSessionKey: 'infilux-ui-session-1',
      isActive: false,
      hasPendingCommand: true,
      initialPrompt: 'Review the current diff',
    });

    await mounted.rerender({
      sessionId: 'provider-session-1',
    });

    expect(testState.xtermResult.restartSession).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('opens the search bar on Ctrl+F and focuses it on repeated Ctrl+F', async () => {
    const mounted = await mountAgentTerminal();

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, code: 'KeyF' })
      );
      await flushMicrotasks();
    });

    expect(
      mounted.container
        .querySelector('[data-testid="terminal-search-bar"]')
        ?.getAttribute('data-open')
    ).toBe('true');

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, code: 'KeyF' })
      );
      await flushMicrotasks();
    });

    expect(testState.searchBarFocus).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('does not activate the agent session when Enter confirms an IME composition', async () => {
    const onActivated = vi.fn();
    const mounted = await mountAgentTerminal({
      onActivated,
    });
    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          onCustomKey?: (event: KeyboardEvent, ptyId: string) => boolean;
        }
      | undefined;
    expect(lastUseXtermCall?.onCustomKey).toBeTypeOf('function');

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    });
    Object.defineProperty(event, 'keyCode', {
      configurable: true,
      value: 229,
    });
    Object.defineProperty(event, 'which', {
      configurable: true,
      value: 229,
    });

    const result = lastUseXtermCall?.onCustomKey?.(event, 'pty-ime');

    expect(result).toBe(true);
    expect(onActivated).not.toHaveBeenCalled();
    expect(testState.electronAPI.sessionGetActivity).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('does not derive a session title from a native terminal menu line', async () => {
    const onActivated = vi.fn();
    const onActivatedWithFirstLine = vi.fn();
    const mounted = await mountAgentTerminal({
      activated: false,
      onActivated,
      onActivatedWithFirstLine,
    });
    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          onCustomKey?: (
            event: KeyboardEvent,
            ptyId: string,
            getCurrentLine?: () => string | null
          ) => boolean;
        }
      | undefined;

    await act(async () => {
      lastUseXtermCall?.onCustomKey?.(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        'backend-session-1',
        () => '2. Skip'
      );
      await flushMicrotasks();
    });

    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(onActivatedWithFirstLine).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('restores terminal focus when a controlled enhanced input closes', async () => {
    const mounted = await mountAgentTerminal({
      enhancedInputOpen: false,
    });

    testState.terminal.focus.mockClear();

    await mounted.rerender({
      enhancedInputOpen: true,
    });

    expect(testState.terminal.focus).not.toHaveBeenCalled();

    await mounted.rerender({
      enhancedInputOpen: false,
    });

    expect(testState.terminal.focus).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('opens the context menu for live terminals and handles the clear action', async () => {
    testState.electronAPI.contextMenuShow.mockResolvedValue('clear');

    const onFocus = vi.fn();
    const mounted = await mountAgentTerminal({
      onFocus,
    });

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(testState.electronAPI.contextMenuShow).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.clear).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('refreshes the terminal renderer from the context menu', async () => {
    testState.electronAPI.contextMenuShow.mockResolvedValue('refresh');

    const mounted = await mountAgentTerminal();

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.xtermResult.refreshRenderer).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('routes split and merge context menu actions to the provided callbacks', async () => {
    testState.electronAPI.contextMenuShow
      .mockResolvedValueOnce('split')
      .mockResolvedValueOnce('merge');

    const onSplit = vi.fn();
    const onMerge = vi.fn();
    const mounted = await mountAgentTerminal({
      canMerge: true,
      onSplit,
      onMerge,
    });

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(onMerge).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('restores terminal interaction after copying from the context menu', async () => {
    testState.electronAPI.contextMenuShow.mockResolvedValue('copy');
    testState.terminal.hasSelection.mockReturnValue(true);

    const mounted = await mountAgentTerminal();

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.clipboard.copyTerminalSelectionToClipboard).toHaveBeenCalledWith(
      testState.terminal
    );
    expect(testState.terminal.clearSelection).toHaveBeenCalledTimes(1);
    expect(testState.terminal.focus).toHaveBeenCalledTimes(1);
    expect(testState.terminal.refresh).toHaveBeenCalledWith(0, 23);

    await mounted.unmount();
  });

  it('copies the latest output block from the context menu and restores terminal interaction', async () => {
    testState.electronAPI.contextMenuShow.mockResolvedValue('copyLatestOutputBlock');

    const mounted = await mountAgentTerminal();
    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          onData?: (data: string) => void;
        }
      | undefined;

    await act(async () => {
      lastUseXtermCall?.onData?.(
        '\u001b[32mPlan updated\u001b[0m\r\nNext step ready\r\n\r\nuser@host ~/repo $ '
      );
      await flushMicrotasks();
    });

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.clipboard.writeClipboardText).toHaveBeenCalledWith(
      'Plan updated\nNext step ready'
    );
    expect(testState.terminal.clearSelection).toHaveBeenCalledTimes(1);
    expect(testState.terminal.focus).toHaveBeenCalledTimes(1);
    expect(testState.terminal.refresh).toHaveBeenCalledWith(0, 23);

    await mounted.unmount();
  });

  it('pastes plain clipboard text from the context menu into the terminal', async () => {
    testState.electronAPI.contextMenuShow.mockResolvedValue('paste');
    testState.clipboard.readClipboardText.mockResolvedValue('pnpm test');

    const mounted = await mountAgentTerminal();

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.clipboard.readClipboardText).toHaveBeenCalledTimes(1);
    expect(testState.terminal.paste).toHaveBeenCalledWith('pnpm test');

    await mounted.unmount();
  });

  it('pastes clipboard images from the terminal context menu as agent attachments', async () => {
    testState.electronAPI.contextMenuShow.mockResolvedValue('pasteAttachment');

    const mounted = await mountAgentTerminal();

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(testState.electronAPI.fileSaveClipboardImageToTemp).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'png',
      })
    );
    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: ' /tmp/image.png',
      submit: false,
    });

    await mounted.unmount();
  });

  it('handles app menu attachment paste requests for the active terminal', async () => {
    const mounted = await mountAgentTerminal();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('infilux:paste-agent-attachment'));
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(testState.electronAPI.fileSaveClipboardImageToTemp).toHaveBeenCalledTimes(1);
    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: ' /tmp/image.png',
      submit: false,
    });

    await mounted.unmount();
  });

  it('pastes clipboard image signals from the terminal without requiring Escape', async () => {
    const mounted = await mountAgentTerminal();
    const pasteEvent = createImageSignalPasteEvent();

    await act(async () => {
      getXtermContainer().dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(testState.electronAPI.fileSaveClipboardImageToTemp).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'png',
      })
    );
    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: ' /tmp/image.png',
      submit: false,
    });

    await mounted.unmount();
  });

  it('pastes clipboard image signals during output without requiring Escape', async () => {
    const mounted = await mountAgentTerminal();
    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          onData?: (data: string) => void;
          onCustomKey?: (event: KeyboardEvent, ptyId: string) => boolean;
        }
      | undefined;

    await act(async () => {
      lastUseXtermCall?.onCustomKey?.(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        'backend-session-1'
      );
      lastUseXtermCall?.onData?.('agent is still streaming output'.repeat(10));
      await flushMicrotasks();
    });
    expect(testState.agentSessionsStore.setOutputState).toHaveBeenCalledWith(
      'ui-session-1',
      'outputting',
      true
    );

    const pasteEvent = createImageSignalPasteEvent();

    await act(async () => {
      getXtermContainer().dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: ' /tmp/image.png',
      submit: false,
    });

    await mounted.unmount();
  });

  it('pastes macOS native clipboard image signals from the terminal without requiring Escape', async () => {
    const mounted = await mountAgentTerminal();
    const pasteEvent = createImageSignalPasteEvent(['public.tiff']);

    await act(async () => {
      getXtermContainer().dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(testState.electronAPI.fileSaveClipboardImageToTemp).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'png',
      })
    );
    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: ' /tmp/image.png',
      submit: false,
    });

    await mounted.unmount();
  });

  it('routes active terminal image paste requests from session chrome without requiring Escape', async () => {
    const mounted = await mountAgentTerminal();
    const pasteTarget = document.createElement('button');
    mounted.container.appendChild(pasteTarget);
    const pasteEvent = createImageSignalPasteEvent();

    await act(async () => {
      pasteTarget.dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(testState.electronAPI.fileSaveClipboardImageToTemp).toHaveBeenCalledTimes(1);
    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: ' /tmp/image.png',
      submit: false,
    });

    pasteTarget.remove();
    await mounted.unmount();
  });

  it('does not steal image paste events from editable controls outside the terminal', async () => {
    const mounted = await mountAgentTerminal();
    const pasteTarget = document.createElement('textarea');
    document.body.appendChild(pasteTarget);
    const pasteEvent = createImageSignalPasteEvent();

    await act(async () => {
      pasteTarget.dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(testState.electronAPI.fileSaveClipboardImageToTemp).not.toHaveBeenCalled();
    expect(testState.electronAPI.agentInputDispatch).not.toHaveBeenCalled();

    pasteTarget.remove();
    await mounted.unmount();
  });

  it('falls back to renderer temp storage for clipboard image files without showing a false fast-path error', async () => {
    testState.electronAPI.fileSaveClipboardImageToTemp.mockResolvedValue({
      success: false,
      error: 'Clipboard image is unavailable',
    });
    testState.electronAPI.fileSaveToTemp.mockResolvedValue({
      success: true,
      path: '/tmp/fallback-image.png',
    });

    const mounted = await mountAgentTerminal();
    const file = new File([new Uint8Array([1, 2, 3])], 'clipboard.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    });

    await act(async () => {
      getXtermContainer().dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(testState.electronAPI.fileSaveClipboardImageToTemp).toHaveBeenCalledTimes(1);
    expect(testState.electronAPI.fileSaveToTemp).toHaveBeenCalledTimes(1);
    expect(testState.electronAPI.agentInputDispatch).toHaveBeenCalledWith({
      sessionId: 'backend-session-1',
      agentId: 'codex',
      text: ' /tmp/fallback-image.png',
      submit: false,
    });
    expect(testState.toastAdd).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('ignores context menu requests for read-only transcripts', async () => {
    const mounted = await mountAgentTerminal({
      readOnlyTranscript: {
        identity: 'transcript-no-context-menu',
        entries: [],
      },
    });

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.electronAPI.contextMenuShow).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('selects all terminal content from the context menu', async () => {
    testState.electronAPI.contextMenuShow.mockResolvedValue('selectAll');

    const mounted = await mountAgentTerminal();

    await act(async () => {
      getXtermContainer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.terminal.selectAll).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('shows remote runtime overlay copy for reconnecting and disconnected sessions', async () => {
    testState.runtimeContext = { kind: 'remote' };
    testState.xtermResult.runtimeState = 'reconnecting';

    const mounted = await mountAgentTerminal();

    expect(mounted.container.textContent).toContain('Remote terminal reconnecting...');

    testState.xtermResult.runtimeState = 'dead';
    await mounted.rerender();

    expect(mounted.container.textContent).toContain('Remote terminal disconnected');

    await mounted.unmount();
  });

  it('shows local runtime overlay copy and retry for unavailable local agent sessions', async () => {
    testState.runtimeContext = { kind: 'local' };
    testState.xtermResult.runtimeState = 'dead';

    const mounted = await mountAgentTerminal();

    expect(mounted.container.textContent).toContain('Terminal session unavailable');
    expect(mounted.container.textContent).toContain(
      'Terminal session is unavailable. Start a fresh session to continue.'
    );

    const retryButton = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Retry"]'
    );
    expect(retryButton).not.toBeNull();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.xtermResult.restartSession).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('focuses transcript terminals without rebinding the active session', async () => {
    const onFocus = vi.fn();
    const mounted = await mountAgentTerminal({
      isActive: false,
      onFocus,
      readOnlyTranscript: {
        identity: 'transcript-focus',
        entries: [],
      },
    });

    const terminalRoot = mounted.container.querySelector<HTMLElement>(
      '[data-agent-terminal-mode="transcript"]'
    );
    expect(terminalRoot).not.toBeNull();

    await act(async () => {
      terminalRoot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(onFocus).not.toHaveBeenCalled();
    expect(testState.terminal.focus).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('refreshes xterm layout when the terminal content host moves', async () => {
    const frames = installQueuedAnimationFrame();
    const mounted = await mountAgentTerminal();
    const xtermContainer = getXtermContainer();
    Object.defineProperty(xtermContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => createDomRectLike({ height: 360, width: 640 }),
    });

    await mounted.rerender({
      layoutRefreshKey: 'tile',
    } as Partial<AgentTerminalProps>);
    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.fit).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.refreshRenderer).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.recreateWebglRenderer).toHaveBeenCalledTimes(1);

    testState.xtermResult.fit.mockClear();
    testState.xtermResult.refreshRenderer.mockClear();
    testState.xtermResult.recreateWebglRenderer.mockClear();

    await mounted.rerender({
      layoutRefreshKey: 'floating',
    } as Partial<AgentTerminalProps>);
    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.fit).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.refreshRenderer).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.recreateWebglRenderer).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('recreates the WebGL renderer when a Canvas zoom changes the terminal font scale', async () => {
    const frames = installQueuedAnimationFrame();
    const mounted = await mountAgentTerminal();
    const xtermContainer = getXtermContainer();
    Object.defineProperty(xtermContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => createDomRectLike({ height: 360, width: 640 }),
    });

    await mounted.rerender({
      layoutRefreshKey: 'tile',
      terminalFontScale: 1,
    } as Partial<AgentTerminalProps>);

    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    testState.xtermResult.fit.mockClear();
    testState.xtermResult.refreshRenderer.mockClear();
    testState.xtermResult.recreateWebglRenderer.mockClear();

    await mounted.rerender({
      terminalFontScale: 1.1,
    } as Partial<AgentTerminalProps>);
    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.fit).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.refreshRenderer).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.recreateWebglRenderer).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('recreates the WebGL renderer when a terminal returns to the same Canvas tile', async () => {
    const frames = installQueuedAnimationFrame();
    const mounted = await mountAgentTerminal();
    const xtermContainer = getXtermContainer();
    Object.defineProperty(xtermContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => createDomRectLike({ height: 360, width: 640 }),
    });

    await mounted.rerender({
      layoutRefreshKey: 'tile',
    } as Partial<AgentTerminalProps>);
    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    await mounted.rerender({
      layoutRefreshKey: undefined,
    } as Partial<AgentTerminalProps>);

    testState.xtermResult.fit.mockClear();
    testState.xtermResult.refreshRenderer.mockClear();
    testState.xtermResult.recreateWebglRenderer.mockClear();

    await mounted.rerender({
      layoutRefreshKey: 'tile',
    } as Partial<AgentTerminalProps>);
    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.fit).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.refreshRenderer).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.recreateWebglRenderer).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('restores the real xterm IME input target when a canvas terminal host moves to floating mode', async () => {
    const frames = installQueuedAnimationFrame();
    const terminalElement = document.createElement('div');
    const terminalTextarea = document.createElement('textarea');
    terminalElement.appendChild(terminalTextarea);
    document.body.appendChild(terminalElement);
    testState.terminalInstance = {
      ...testState.terminal,
      element: terminalElement,
      textarea: terminalTextarea,
    };

    const mounted = await mountAgentTerminal();
    const xtermContainer = getXtermContainer();
    Object.defineProperty(xtermContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => createDomRectLike({ height: 360, width: 640 }),
    });
    await mounted.rerender({
      layoutRefreshKey: 'tile',
    } as Partial<AgentTerminalProps>);
    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    testState.terminal.focus.mockClear();
    terminalTextarea.blur();
    testState.xtermResult.fit.mockClear();
    testState.xtermResult.refreshRenderer.mockClear();

    await mounted.rerender({
      layoutRefreshKey: 'floating',
    } as Partial<AgentTerminalProps>);
    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.fit).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.refreshRenderer).toHaveBeenCalledTimes(1);
    expect(testState.terminal.focus).toHaveBeenCalledTimes(1);
    expect(terminalTextarea.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(document.activeElement).toBe(terminalTextarea);

    terminalElement.remove();
    await mounted.unmount();
  });

  it('waits for a measurable floating host before refreshing xterm layout', async () => {
    const frames = installQueuedAnimationFrame();
    let hostReady = true;

    const mounted = await mountAgentTerminal();
    const xtermContainer = getXtermContainer();
    Object.defineProperty(xtermContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        hostReady
          ? createDomRectLike({ height: 360, width: 640 })
          : createDomRectLike({ height: 0, width: 0 }),
    });

    testState.xtermResult.fit.mockClear();
    testState.xtermResult.refreshRenderer.mockClear();
    hostReady = false;

    await mounted.rerender({
      layoutRefreshKey: 'floating',
    } as Partial<AgentTerminalProps>);

    await act(async () => {
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.fit).not.toHaveBeenCalled();
    expect(testState.xtermResult.refreshRenderer).not.toHaveBeenCalled();
    expect(frames.pendingFrameCount).toBeGreaterThan(0);

    hostReady = true;
    await act(async () => {
      frames.flushNextFrame();
      frames.flushNextFrame();
      await flushMicrotasks();
    });

    expect(testState.xtermResult.fit).toHaveBeenCalledTimes(1);
    expect(testState.xtermResult.refreshRenderer).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('renders the scroll-to-bottom button when requested and handles clicks', async () => {
    testState.showScrollToBottom = true;

    const mounted = await mountAgentTerminal();
    const button = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll to bottom"]'
    );

    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.scrollToBottomSpy).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });

  it('disables the scroll-to-bottom button pointer events while mouse selection is dragging', async () => {
    testState.showScrollToBottom = true;

    const mounted = await mountAgentTerminal();
    const terminalContainer = getXtermContainer();
    const button = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll to bottom"]'
    );

    expect(button).not.toBeNull();
    expect(button?.className).not.toContain('pointer-events-none');

    await act(async () => {
      terminalContainer.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    expect(button?.className).toContain('pointer-events-none');

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    expect(button?.className).not.toContain('pointer-events-none');

    await mounted.unmount();
  });

  it('tracks mouse selection started from imperatively mounted xterm children', async () => {
    testState.showScrollToBottom = true;

    const mounted = await mountAgentTerminal();
    const terminalContainer = getXtermContainer();
    const xtermChild = document.createElement('div');
    terminalContainer.appendChild(xtermChild);
    const button = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll to bottom"]'
    );

    expect(button).not.toBeNull();
    expect(button?.className).not.toContain('pointer-events-none');

    await act(async () => {
      xtermChild.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    expect(button?.className).toContain('pointer-events-none');

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    expect(button?.className).not.toContain('pointer-events-none');

    await mounted.unmount();
  });

  it('auto-scrolls terminal history while mouse selection is dragged near the bottom edge', async () => {
    vi.useFakeTimers();

    const mounted = await mountAgentTerminal();
    const terminalContainer = getXtermContainer();
    const xtermScreen = document.createElement('div');
    xtermScreen.className = 'xterm-screen';
    const xtermMouseMoveSpy = vi.fn();
    xtermScreen.addEventListener('mousemove', xtermMouseMoveSpy);
    terminalContainer.appendChild(xtermScreen);
    const stopDocumentBubbleMouseMove = (event: MouseEvent) => {
      event.stopImmediatePropagation();
    };
    document.addEventListener('mousemove', stopDocumentBubbleMouseMove);
    Object.defineProperty(terminalContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 300,
        top: 0,
        width: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      terminalContainer.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientY: 120,
        })
      );
      terminalContainer.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientY: 196,
        })
      );
      vi.advanceTimersByTime(120);
      await flushMicrotasks();
    });

    document.removeEventListener('mousemove', stopDocumentBubbleMouseMove);
    expect(testState.terminal.scrollLines).toHaveBeenCalled();
    expect(testState.terminal.scrollLines.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);
    expect(xtermMouseMoveSpy).toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    await mounted.unmount();
  });

  it('auto-scrolls from xterm screen bounds when a canvas tile wrapper is larger than the visible transcript', async () => {
    vi.useFakeTimers();

    const mounted = await mountAgentTerminal();
    const terminalContainer = getXtermContainer();
    const xtermScreen = document.createElement('div');
    xtermScreen.className = 'xterm-screen';
    const xtermMouseMoveSpy = vi.fn();
    xtermScreen.addEventListener('mousemove', xtermMouseMoveSpy);
    terminalContainer.appendChild(xtermScreen);

    Object.defineProperty(terminalContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 260,
        height: 260,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(xtermScreen, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 300,
        top: 0,
        width: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      terminalContainer.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientY: 120,
        })
      );
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientY: 196,
        })
      );
      vi.advanceTimersByTime(120);
      await flushMicrotasks();
    });

    expect(testState.terminal.scrollLines).toHaveBeenCalled();
    expect(testState.terminal.scrollLines.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);
    expect(xtermMouseMoveSpy).toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    await mounted.unmount();
  });

  it('tracks drag position before xterm document capture handlers can stop mousemove propagation', async () => {
    vi.useFakeTimers();

    const mounted = await mountAgentTerminal();
    const terminalContainer = getXtermContainer();
    const xtermScreen = document.createElement('div');
    xtermScreen.className = 'xterm-screen';
    terminalContainer.appendChild(xtermScreen);
    const stopDocumentCaptureMouseMove = (event: MouseEvent) => {
      event.stopImmediatePropagation();
    };

    Object.defineProperty(xtermScreen, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 300,
        top: 0,
        width: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    document.addEventListener('mousemove', stopDocumentCaptureMouseMove, true);

    await act(async () => {
      terminalContainer.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientY: 120,
        })
      );
      xtermScreen.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientY: 196,
        })
      );
      vi.advanceTimersByTime(120);
      await flushMicrotasks();
    });

    document.removeEventListener('mousemove', stopDocumentCaptureMouseMove, true);
    expect(testState.terminal.scrollLines).toHaveBeenCalled();
    expect(testState.terminal.scrollLines.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    await mounted.unmount();
  });

  it('starts drag auto-scroll before xterm document capture handlers can stop mousedown propagation', async () => {
    vi.useFakeTimers();

    const mounted = await mountAgentTerminal();
    const terminalContainer = getXtermContainer();
    const xtermScreen = document.createElement('div');
    xtermScreen.className = 'xterm-screen';
    terminalContainer.appendChild(xtermScreen);
    const stopDocumentCaptureMouseDown = (event: MouseEvent) => {
      event.stopImmediatePropagation();
    };

    Object.defineProperty(xtermScreen, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 300,
        top: 0,
        width: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    document.addEventListener('mousedown', stopDocumentCaptureMouseDown, true);

    await act(async () => {
      xtermScreen.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientY: 120,
        })
      );
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientY: 196,
        })
      );
      vi.advanceTimersByTime(120);
      await flushMicrotasks();
    });

    document.removeEventListener('mousedown', stopDocumentCaptureMouseDown, true);
    expect(testState.terminal.scrollLines).toHaveBeenCalled();
    expect(testState.terminal.scrollLines.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    await mounted.unmount();
  });

  it('routes drag auto-scroll through tmux host scrollback for persistent recovered sessions', async () => {
    vi.useFakeTimers();
    testState.settingsStore.agentIntegration.tmuxEnabled = true;

    const mounted = await mountAgentTerminal({
      initialized: true,
      persistenceEnabled: true,
      hostSessionKey: 'infilux-ui-session-1',
      recoveryState: 'live',
    });
    const terminalContainer = getXtermContainer();
    const xtermScreen = document.createElement('div');
    xtermScreen.className = 'xterm-screen';
    terminalContainer.appendChild(xtermScreen);

    Object.defineProperty(xtermScreen, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 300,
        top: 0,
        width: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      xtermScreen.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientY: 120,
        })
      );
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientY: 196,
        })
      );
      vi.advanceTimersByTime(120);
      await flushMicrotasks();
    });

    expect(testState.electronAPI.tmuxScrollClient).toHaveBeenCalledWith('/repo/worktree', {
      sessionName: 'infilux-ui-session-1',
      serverName: 'infilux',
      direction: 'down',
      amount: expect.any(Number),
    });
    expect(testState.terminal.scrollLines).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    await mounted.unmount();
  });

  it('keeps drag auto-scroll on xterm viewport for fresh tmux-backed sessions', async () => {
    vi.useFakeTimers();
    testState.settingsStore.agentIntegration.tmuxEnabled = true;

    const mounted = await mountAgentTerminal({
      initialized: true,
      persistenceEnabled: true,
      backendSessionId: undefined,
      hostSessionKey: 'infilux-ui-session-1',
      recoveryState: 'live',
    });
    const terminalContainer = getXtermContainer();
    const xtermScreen = document.createElement('div');
    xtermScreen.className = 'xterm-screen';
    terminalContainer.appendChild(xtermScreen);

    Object.defineProperty(xtermScreen, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 200,
        height: 200,
        left: 0,
        right: 300,
        top: 0,
        width: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      xtermScreen.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientY: 120,
        })
      );
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientY: 196,
        })
      );
      vi.advanceTimersByTime(120);
      await flushMicrotasks();
    });

    expect(testState.electronAPI.tmuxScrollClient).not.toHaveBeenCalled();
    expect(testState.terminal.scrollLines).toHaveBeenCalled();
    expect(testState.terminal.scrollLines.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    await mounted.unmount();
  });

  it('clears mouse-selection drag state when the window loses focus', async () => {
    testState.showScrollToBottom = true;

    const mounted = await mountAgentTerminal();
    const terminalContainer = getXtermContainer();
    const button = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll to bottom"]'
    );

    expect(button).not.toBeNull();

    await act(async () => {
      terminalContainer.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
        })
      );
      await flushMicrotasks();
    });

    expect(button?.className).toContain('pointer-events-none');

    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await flushMicrotasks();
    });

    expect(button?.className).not.toContain('pointer-events-none');

    await mounted.unmount();
  });

  it('shows the scroll-to-bottom button for tmux host scrollback and exits copy mode on click', async () => {
    testState.settingsStore.agentIntegration.tmuxEnabled = true;

    const mounted = await mountAgentTerminal({
      initialized: true,
      persistenceEnabled: true,
      hostSessionKey: 'infilux-ui-session-1',
      recoveryState: 'live',
    });

    const lastUseXtermCall = testState.useXtermOptions.at(-1) as
      | {
          onHostScrollbackStateChange?: (active: boolean) => void;
        }
      | undefined;
    const terminalRoot = mounted.container.querySelector<HTMLElement>('[data-agent-terminal-mode]');

    expect(lastUseXtermCall?.onHostScrollbackStateChange).toBeTypeOf('function');
    expect(terminalRoot?.dataset.agentHostScrollback).toBe('false');
    await act(async () => {
      lastUseXtermCall?.onHostScrollbackStateChange?.(true);
      await flushMicrotasks();
    });

    expect(terminalRoot?.dataset.agentHostScrollback).toBe('true');
    const button = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll to bottom"]'
    );
    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(testState.scrollToBottomSpy).toHaveBeenCalledTimes(1);
    expect(testState.electronAPI.tmuxScrollClient).toHaveBeenCalledWith('/repo/worktree', {
      sessionName: 'infilux-ui-session-1',
      serverName: 'infilux',
      direction: 'bottom',
    });
    expect(terminalRoot?.dataset.agentHostScrollback).toBe('false');

    await mounted.unmount();
  });

  it('focuses the terminal after clicking an inactive session', async () => {
    const onFocus = vi.fn();
    const mounted = await mountAgentTerminal({
      isActive: false,
      onFocus,
    });

    const terminalRoot = mounted.container.querySelector<HTMLElement>(
      '[data-agent-terminal-mode="live"]'
    );
    expect(terminalRoot).not.toBeNull();

    await act(async () => {
      terminalRoot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(testState.terminal.focus).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });
});
