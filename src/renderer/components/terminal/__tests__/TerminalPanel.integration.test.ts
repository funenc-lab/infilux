/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMP_REPO_ID } from '@/App/constants';

type TerminalPanelModule = typeof import('../TerminalPanel');
type TerminalPanelProps = React.ComponentProps<TerminalPanelModule['TerminalPanel']>;
type ShellTerminalModule = typeof import('../ShellTerminal');
type ShellTerminalProps = React.ComponentProps<ShellTerminalModule['ShellTerminal']>;
type TerminalGroupModule = typeof import('../TerminalGroup');
type TerminalGroupProps = React.ComponentProps<TerminalGroupModule['TerminalGroup']>;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const syncSessions = vi.fn();
const setTerminalCount = vi.fn();
const registerTerminalCloseHandler = vi.fn(() => vi.fn());
const clearPendingScriptSpy = vi.fn();

const terminalSessionsRendered: Array<{
  cwd?: string;
  initialCommand?: string;
  isActive?: boolean;
  canMerge?: boolean;
}> = [];

const settingsState = {
  xtermKeybindings: {
    newTab: 'cmd+t',
    closeTab: 'cmd+w',
    nextTab: 'ctrl+tab',
    prevTab: 'ctrl+shift+tab',
  },
  autoCreateSessionOnActivate: false,
  autoCreateSessionOnTempActivate: false,
  fontFamily: 'IBM Plex Sans',
  fontSize: 14,
  editorSettings: {
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    lineHeight: 1.5,
  },
  terminalTheme: 'ghostty-dark',
  backgroundImageEnabled: false,
};

const initScriptState: {
  pendingScript: { worktreePath: string; script: string } | null;
  clearPendingScript: () => void;
} = {
  pendingScript: null,
  clearPendingScript: () => {
    initScriptState.pendingScript = null;
    clearPendingScriptSpy();
  },
};

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    Plus: icon,
    Terminal: icon,
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/App/storage', () => ({
  cleanPath: (value?: string) => value ?? '',
  normalizePath: (value?: string) => (value ?? '').replace(/\\/g, '/'),
  pathsEqual: (left?: string | null, right?: string | null) =>
    (left ?? '').replace(/\\/g, '/') === (right ?? '').replace(/\\/g, '/'),
}));

vi.mock('@shared/utils/path', () => ({
  getDisplayPathBasename: (value: string) => value.split('/').filter(Boolean).pop() ?? value,
}));

vi.mock('@/lib/ghosttyTheme', () => ({
  defaultDarkTheme: {
    background: '#101014',
  },
  getXtermTheme: () => ({
    background: '#101014',
  }),
}));

vi.mock('@/lib/keybinding', () => ({
  matchesKeybinding: () => false,
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (
    selector: (state: typeof settingsState) => unknown
  ) => selector(settingsState),
}));

vi.mock('@/stores/initScript', () => ({
  useInitScriptStore: () => initScriptState,
}));

vi.mock('@/stores/terminal', () => ({
  useTerminalStore: (selector: (state: { syncSessions: typeof syncSessions }) => unknown) =>
    selector({ syncSessions }),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: () => ({
    setTerminalCount,
    registerTerminalCloseHandler,
  }),
}));

vi.mock('@/components/layout/ControlStateActionButton', () => ({
  ControlStateActionButton: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick,
      },
      children
    ),
}));

vi.mock('@/components/layout/ControlStateCard', () => ({
  ControlStateCard: ({
    title,
    description,
    metaValue,
    actions,
  }: {
    title: string;
    description?: string;
    metaValue?: string;
    actions?: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'control-state-card' },
      React.createElement('div', { 'data-testid': 'control-state-title' }, title),
      React.createElement('div', { 'data-testid': 'control-state-description' }, description ?? ''),
      React.createElement('div', { 'data-testid': 'control-state-meta' }, metaValue ?? ''),
      actions ?? null
    ),
}));

vi.mock('../TerminalGroup', () => ({
  TerminalGroup: ({
    group,
    isGroupActive,
  }: TerminalGroupProps) =>
    React.createElement(
      'div',
      {
        'data-testid': 'terminal-group',
        'data-group-id': group.id,
        'data-active': String(isGroupActive),
        'data-tab-count': String(group.tabs.length),
      },
      group.tabs.map((tab) =>
        React.createElement(
          'div',
          {
            key: tab.id,
            'data-testid': 'terminal-group-tab',
            'data-tab-id': tab.id,
          },
          tab.name
        )
      )
    ),
}));

vi.mock('../ShellTerminal', () => ({
  ShellTerminal: ({ cwd, initialCommand, isActive, canMerge }: ShellTerminalProps) => {
    terminalSessionsRendered.push({ cwd, initialCommand, isActive, canMerge });

    return React.createElement('div', {
      'data-testid': 'shell-terminal',
      'data-cwd': cwd ?? '',
      'data-command': initialCommand ?? '',
      'data-active': String(isActive),
      'data-can-merge': String(canMerge),
    });
  },
}));

vi.mock('../ResizeHandle', () => ({
  ResizeHandle: () => React.createElement('div', { 'data-testid': 'resize-handle' }),
}));

interface MountedTerminalPanel {
  container: HTMLDivElement;
  rerender: (overrides?: Partial<TerminalPanelProps>) => Promise<void>;
  unmount: () => Promise<void>;
}

function getByTestId<T extends HTMLElement>(container: HTMLElement, testId: string): T | null {
  return container.querySelector<T>(`[data-testid="${testId}"]`);
}

async function clickByText(container: HTMLElement, text: string) {
  const target = Array.from(container.querySelectorAll<HTMLElement>('button')).find((button) =>
    button.textContent?.includes(text)
  );
  expect(target).not.toBeNull();

  await act(async () => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountTerminalPanel(
  overrides: Partial<TerminalPanelProps> = {}
): Promise<MountedTerminalPanel> {
  const { TerminalPanel } = await import('../TerminalPanel');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let currentProps: TerminalPanelProps = {
    repoPath: '/repo',
    cwd: '/repo/worktree',
    isActive: false,
    onExpandWorktree: vi.fn(),
    worktreeCollapsed: false,
    ...overrides,
  };

  const render = async (nextOverrides: Partial<TerminalPanelProps> = {}) => {
    currentProps = {
      ...currentProps,
      ...nextOverrides,
    };

    await act(async () => {
      root.render(React.createElement(TerminalPanel, currentProps));
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  await render();

  return {
    container,
    rerender: render,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('TerminalPanel integration', () => {
  let randomUuidSpy: ReturnType<typeof vi.spyOn> | null = null;
  let randomCounter = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    terminalSessionsRendered.length = 0;
    randomCounter = 0;

    settingsState.autoCreateSessionOnActivate = false;
    settingsState.autoCreateSessionOnTempActivate = false;
    initScriptState.pendingScript = null;

    randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      randomCounter += 1;
      return `uuid-${randomCounter}`;
    });
  });

  afterEach(() => {
    randomUuidSpy?.mockRestore();
    randomUuidSpy = null;
    document.body.innerHTML = '';
  });

  it('shows the worktree chooser empty state when no cwd is selected', async () => {
    const onExpandWorktree = vi.fn();
    const view = await mountTerminalPanel({
      cwd: undefined,
      onExpandWorktree,
      worktreeCollapsed: true,
    });

    try {
      expect(getByTestId(view.container, 'control-state-title')?.textContent).toContain(
        'Terminal needs a worktree'
      );

      await clickByText(view.container, 'Choose Worktree');

      expect(onExpandWorktree).toHaveBeenCalledTimes(1);
    } finally {
      await view.unmount();
    }
  });

  it('auto-creates the first terminal for an active standard worktree when enabled', async () => {
    settingsState.autoCreateSessionOnActivate = true;
    const view = await mountTerminalPanel({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      isActive: true,
    });

    try {
      expect(view.container.querySelectorAll('[data-testid="shell-terminal"]')).toHaveLength(1);
      expect(terminalSessionsRendered).toContainEqual(
        expect.objectContaining({
          cwd: '/repo/worktree',
          initialCommand: undefined,
          isActive: true,
          canMerge: false,
        })
      );
      expect(view.container.textContent).toContain('Untitled-1');
      expect(syncSessions).toHaveBeenLastCalledWith([
        expect.objectContaining({
          cwd: '/repo/worktree',
          title: 'Untitled-1',
        }),
      ]);
      expect(setTerminalCount).toHaveBeenLastCalledWith('/repo/worktree', 1);
    } finally {
      await view.unmount();
    }
  });

  it('creates a terminal from the empty-state action when auto-create is disabled', async () => {
    const view = await mountTerminalPanel({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      isActive: false,
    });

    try {
      expect(view.container.textContent).toContain('No terminals attached to this worktree');
      expect(view.container.querySelector('[data-testid="shell-terminal"]')).toBeNull();

      await clickByText(view.container, 'New Terminal');

      expect(view.container.querySelectorAll('[data-testid="shell-terminal"]')).toHaveLength(1);
      expect(view.container.textContent).toContain('Untitled-1');
    } finally {
      await view.unmount();
    }
  });

  it('uses the temp-workspace auto-create flag for temp repositories', async () => {
    settingsState.autoCreateSessionOnTempActivate = true;
    const view = await mountTerminalPanel({
      repoPath: TEMP_REPO_ID,
      cwd: '/tmp/workspace',
      isActive: true,
    });

    try {
      expect(view.container.querySelectorAll('[data-testid="shell-terminal"]')).toHaveLength(1);
      expect(terminalSessionsRendered).toContainEqual(
        expect.objectContaining({
          cwd: '/tmp/workspace',
        })
      );
    } finally {
      await view.unmount();
    }
  });

  it('converts a matching pending init script into an Init terminal and clears the script', async () => {
    initScriptState.pendingScript = {
      worktreePath: '/repo/worktree',
      script: 'pnpm install\npnpm test',
    };

    const view = await mountTerminalPanel({
      repoPath: '/repo',
      cwd: '/repo/worktree',
      isActive: false,
    });

    try {
      expect(view.container.querySelectorAll('[data-testid="shell-terminal"]')).toHaveLength(1);
      expect(view.container.textContent).toContain('Init');
      expect(terminalSessionsRendered).toContainEqual(
        expect.objectContaining({
          cwd: '/repo/worktree',
          initialCommand: 'pnpm install && pnpm test',
        })
      );
      expect(clearPendingScriptSpy).toHaveBeenCalledTimes(1);
      expect(syncSessions).toHaveBeenLastCalledWith([
        expect.objectContaining({
          cwd: '/repo/worktree',
          title: 'Init',
        }),
      ]);
    } finally {
      await view.unmount();
    }
  });
});
