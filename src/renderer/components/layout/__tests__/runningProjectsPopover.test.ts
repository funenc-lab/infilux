/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabId } from '@/App/constants';
import type { Session } from '@/components/chat/SessionBar';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    Activity: icon,
    Bot: icon,
    Copy: icon,
    FolderGit2: icon,
    FolderOpen: icon,
    Search: icon,
    Sparkles: icon,
    Terminal: icon,
    X: icon,
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? React.createElement(React.Fragment, null, children) : null,
  DialogPopup: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

vi.mock('../SidebarToolbarTooltip', () => ({
  SidebarToolbarTooltip: ({
    label,
    shortcut,
    side,
    align,
    sideOffset,
    children,
  }: {
    label?: React.ReactNode;
    shortcut?: React.ReactNode;
    side?: string;
    align?: string;
    sideOffset?: number;
    children?: React.ReactNode;
  }) =>
    React.createElement(
      'span',
      {
        'data-align': align,
        'data-side': side,
        'data-side-offset': sideOffset,
        'data-testid': 'sidebar-toolbar-tooltip',
      },
      children,
      label,
      shortcut
    ),
}));

vi.mock('@/hooks/useWorktree', () => ({
  useWorktreeListMultiple: vi.fn(() => ({
    worktreesMap: {},
  })),
}));

vi.mock('@/lib/keybinding', () => ({
  formatKeybindingDisplay: vi.fn(
    (binding: { key: string; meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }) => {
      const parts: string[] = [];
      if (binding.meta) parts.push('Cmd');
      if (binding.ctrl) parts.push('Ctrl');
      if (binding.alt) parts.push('Alt');
      if (binding.shift) parts.push('Shift');
      parts.push(binding.key.toUpperCase());
      return parts.join('+');
    }
  ),
  matchesKeybinding: vi.fn(() => false),
}));

const settingsState: Record<string, unknown> = {};
const agentSessionsState = {
  sessions: [] as Session[],
  setActiveId: vi.fn(),
};
const terminalSessionsState = {
  sessions: [] as Array<{ id: string; title: string; cwd: string }>,
  setActiveSession: vi.fn(),
};
const worktreeActivityState = {
  activities: {} as Record<string, { agentCount: number; terminalCount: number }>,
  closeAgentSessions: vi.fn(),
  closeTerminalSessions: vi.fn(),
};

vi.mock('@/stores/settings', () => ({
  defaultGlobalKeybindings: {
    runningProjects: { key: 'p', meta: true, shift: true },
  },
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(settingsState),
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (selector: (state: typeof agentSessionsState) => unknown) =>
    selector(agentSessionsState),
}));

vi.mock('@/stores/terminal', () => ({
  useTerminalStore: (selector: (state: typeof terminalSessionsState) => unknown) =>
    selector(terminalSessionsState),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (selector: (state: typeof worktreeActivityState) => unknown) =>
    selector(worktreeActivityState),
}));

function createAgentSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'agent-session-1',
    name: 'Codex',
    agentId: 'codex',
    agentCommand: 'codex',
    initialized: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    ...overrides,
  };
}

async function mountRunningProjectsPopover({
  onSelectWorktreeByPath,
  onSwitchTab,
}: {
  onSelectWorktreeByPath: (worktreePath: string) => Promise<void> | void;
  onSwitchTab?: (tab: TabId) => void;
}) {
  const { RunningProjectsPopover } = await import('../RunningProjectsPopover');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(RunningProjectsPopover, {
        onSelectWorktreeByPath,
        onSwitchTab,
      })
    );
  });

  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('RunningProjectsPopover', () => {
  beforeEach(() => {
    for (const key of Object.keys(settingsState)) {
      delete settingsState[key];
    }
    agentSessionsState.sessions = [];
    agentSessionsState.setActiveId.mockReset();
    terminalSessionsState.sessions = [];
    terminalSessionsState.setActiveSession.mockReset();
    worktreeActivityState.activities = {};
    worktreeActivityState.closeAgentSessions.mockReset();
    worktreeActivityState.closeTerminalSessions.mockReset();
  });

  it('falls back safely when legacy settings state has no global keybindings', async () => {
    const { RunningProjectsPopover } = await import('../RunningProjectsPopover');

    const render = () =>
      renderToStaticMarkup(
        React.createElement(RunningProjectsPopover, {
          onSelectWorktreeByPath: vi.fn(),
        })
      );

    expect(render).not.toThrow();
  });

  it('includes the configured running projects shortcut in the toolbar tooltip', async () => {
    const { RunningProjectsPopover } = await import('../RunningProjectsPopover');

    settingsState.globalKeybindings = {
      runningProjects: { key: 'l', meta: true },
    };

    const markup = renderToStaticMarkup(
      React.createElement(RunningProjectsPopover, {
        onSelectWorktreeByPath: vi.fn(),
      })
    );

    expect(markup).toContain('Cmd+L');
  });

  it('passes compact rail tooltip placement through to the toolbar tooltip', async () => {
    const { RunningProjectsPopover } = await import('../RunningProjectsPopover');

    const markup = renderToStaticMarkup(
      React.createElement(RunningProjectsPopover, {
        onSelectWorktreeByPath: vi.fn(),
        tooltipSide: 'inline-end',
        tooltipAlign: 'center',
        tooltipSideOffset: 8,
      })
    );

    expect(markup).toContain('data-side="inline-end"');
    expect(markup).toContain('data-align="center"');
    expect(markup).toContain('data-side-offset="8"');
  });

  it('reveals full agent session titles on hover and preserves session selection', async () => {
    const longTitle =
      'Investigate a long-running project session title without losing its full context';
    const session = createAgentSession({
      id: 'agent-session-long-title',
      name: longTitle,
      userRenamed: true,
    });
    const onSelectWorktreeByPath = vi.fn();
    const onSwitchTab = vi.fn();
    agentSessionsState.sessions = [session];
    worktreeActivityState.activities = {
      [session.cwd]: {
        agentCount: 1,
        terminalCount: 0,
      },
    };

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);

    let mounted: Awaited<ReturnType<typeof mountRunningProjectsPopover>> | null = null;
    try {
      mounted = await mountRunningProjectsPopover({
        onSelectWorktreeByPath,
        onSwitchTab,
      });
      const openButton = mounted.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Running Projects (1)"]'
      );
      expect(openButton).not.toBeNull();

      await act(async () => {
        openButton?.click();
      });

      const agentTitle = Array.from(mounted.container.querySelectorAll<HTMLElement>('span')).find(
        (element) => element.textContent === longTitle
      );
      const agentButton = agentTitle?.closest<HTMLButtonElement>('button');
      expect(agentButton).not.toBeNull();

      await act(async () => {
        agentButton?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        agentButton?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        await vi.advanceTimersByTimeAsync(600);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const tooltip = Array.from(
        document.body.querySelectorAll<HTMLElement>('[data-slot="tooltip-popup"]')
      ).find((element) => element.textContent === longTitle);
      expect(tooltip?.hasAttribute('data-open')).toBe(true);

      await act(async () => {
        agentButton?.click();
        await Promise.resolve();
      });
      expect(onSelectWorktreeByPath).toHaveBeenCalledWith(session.cwd);
      expect(agentSessionsState.setActiveId).toHaveBeenCalledWith(session.cwd, session.id);
      expect(onSwitchTab).toHaveBeenCalledWith('chat');
    } finally {
      await mounted?.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      document.body.innerHTML = '';
    }
  });
});
