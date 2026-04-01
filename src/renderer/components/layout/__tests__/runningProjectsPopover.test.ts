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

vi.mock('@/hooks/useWorktree', () => ({
  useWorktreeListMultiple: vi.fn(() => ({
    worktreesMap: {},
  })),
}));

vi.mock('@/lib/keybinding', () => ({
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
});
