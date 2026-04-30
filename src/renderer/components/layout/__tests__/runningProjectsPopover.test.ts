import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  Dialog: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
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

vi.mock('@/stores/settings', () => ({
  defaultGlobalKeybindings: {
    runningProjects: { key: 'p', meta: true, shift: true },
  },
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(settingsState),
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (state: { sessions: []; setActiveId: ReturnType<typeof vi.fn> }) => unknown
  ) =>
    selector({
      sessions: [],
      setActiveId: vi.fn(),
    }),
}));

vi.mock('@/stores/terminal', () => ({
  useTerminalStore: (
    selector: (state: { sessions: []; setActiveSession: ReturnType<typeof vi.fn> }) => unknown
  ) =>
    selector({
      sessions: [],
      setActiveSession: vi.fn(),
    }),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (
    selector: (state: {
      activities: Record<string, never>;
      closeAgentSessions: ReturnType<typeof vi.fn>;
      closeTerminalSessions: ReturnType<typeof vi.fn>;
    }) => unknown
  ) =>
    selector({
      activities: {},
      closeAgentSessions: vi.fn(),
      closeTerminalSessions: vi.fn(),
    }),
}));

describe('RunningProjectsPopover', () => {
  beforeEach(() => {
    for (const key of Object.keys(settingsState)) {
      delete settingsState[key];
    }

    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
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
});
