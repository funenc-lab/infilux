/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  terminal: {
    focus: vi.fn(),
    hasSelection: vi.fn(() => false),
    paste: vi.fn(),
    selectAll: vi.fn(),
  },
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
    refreshRenderer: vi.fn(),
    write: vi.fn(),
  },
  terminalWriteStore: {
    register: vi.fn(),
    unregister: vi.fn(),
  },
  agentSessionsStore: {
    runtimeStates: {} as Record<string, { waitingForInput?: boolean }>,
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
    claudeCodeIntegration: {
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
    contextMenuShow: vi.fn(async () => null),
    sessionGetActivity: vi.fn(async () => false),
    utilsGetPathForFile: vi.fn(() => null),
    fileSaveToTemp: vi.fn(async () => ({
      success: true,
      path: '/tmp/file.txt',
    })),
    fileSaveClipboardImageToTemp: vi.fn(async () => ({
      success: true,
      path: '/tmp/image.png',
    })),
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
  },
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
      terminal: testState.terminal,
    };
  },
}));

vi.mock('@/hooks/xtermClipboard', () => ({
  copyTerminalSelectionToClipboard: vi.fn(async () => undefined),
  readClipboardText: vi.fn(async () => ''),
  writeClipboardText: vi.fn(async () => undefined),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
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
  useAgentSessionsStore: (
    selector: (state: typeof testState.agentSessionsStore) => unknown
  ) => selector(testState.agentSessionsStore),
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

function getXtermContainer(): HTMLDivElement {
  const container = testState.xtermResult.containerRef.current;
  expect(container).not.toBeNull();
  return container as HTMLDivElement;
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

    testState.terminal.focus.mockReset();
    testState.terminal.hasSelection.mockReset();
    testState.terminal.hasSelection.mockReturnValue(false);
    testState.terminal.paste.mockReset();
    testState.terminal.selectAll.mockReset();

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
    testState.xtermResult.refreshRenderer.mockReset();
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
    testState.settingsStore.claudeCodeIntegration = {
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

  it('returns false from the registered sender for read-only transcripts', async () => {
    const registerSender = vi.fn();
    const mounted = await mountAgentTerminal({
      readOnlyTranscript: {
        identity: 'transcript-read-only',
        entries: [],
      },
      onRegisterEnhancedInputSender: registerSender,
    });

    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(sender?.('Ping transcript', [])).toBe(false);
    expect(testState.electronAPI.agentInputDispatch).not.toHaveBeenCalled();
    expect(testState.terminal.focus).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('returns false from the registered sender when runtime is not live', async () => {
    testState.xtermResult.runtimeState = 'dead';

    const registerSender = vi.fn();
    const mounted = await mountAgentTerminal({
      onRegisterEnhancedInputSender: registerSender,
    });

    const sender = registerSender.mock.calls[0]?.[1] as
      | ((content: string, attachments: Array<Record<string, string>>) => boolean)
      | undefined;

    expect(sender?.('Ping agent', [])).toBe(false);
    expect(testState.electronAPI.agentInputDispatch).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('opens the search bar on Ctrl+F and focuses it on repeated Ctrl+F', async () => {
    const mounted = await mountAgentTerminal();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, code: 'KeyF' }));
      await flushMicrotasks();
    });

    expect(
      mounted.container.querySelector('[data-testid="terminal-search-bar"]')?.getAttribute(
        'data-open'
      )
    ).toBe('true');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, code: 'KeyF' }));
      await flushMicrotasks();
    });

    expect(testState.searchBarFocus).toHaveBeenCalledTimes(1);

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
