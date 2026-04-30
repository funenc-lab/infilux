/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryGroup } from '@/App/constants';
import { ALL_GROUP_ID } from '@/App/constants';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repositorySettings = vi.hoisted(() => ({
  hidden: {} as Record<string, boolean>,
}));

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    BrainCircuit: icon,
    ChevronRight: icon,
    Clock: icon,
    FolderGit2: icon,
    FolderMinus: icon,
    MoreHorizontal: icon,
    PanelLeftClose: icon,
    PanelLeftOpen: icon,
    Plus: icon,
    Search: icon,
    Settings2: icon,
    X: icon,
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/App/storage', async () => {
  const actual = await vi.importActual<typeof import('@/App/storage')>('@/App/storage');
  return {
    ...actual,
    getStoredGroupCollapsedState: () => ({}),
    saveGroupCollapsedState: vi.fn(),
    getStoredRepositorySettings: () =>
      Object.fromEntries(
        Object.entries(repositorySettings.hidden).map(([repoPath, hidden]) => [
          repoPath,
          { hidden },
        ])
      ),
  };
});

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: { hideGroups: boolean; todoEnabled: boolean }) => unknown) =>
    selector({ hideGroups: false, todoEnabled: false }),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (
    selector: (state: { activities: Record<string, unknown> }) => unknown
  ) => selector({ activities: {} }),
}));

vi.mock('@/hooks/useWorktree', () => ({
  useWorktreeListMultiple: () => ({
    worktreesMap: {},
    errorsMap: {},
    loadingMap: {},
    refetchAll: vi.fn(),
  }),
}));

vi.mock('@/components/group', () => ({
  CreateGroupDialog: () => null,
  GroupEditDialog: () => null,
  GroupSelector: () => React.createElement('div', { 'data-group-selector': 'true' }),
  MoveToGroupSubmenu: () => null,
}));

vi.mock('@/components/repository/RepositorySettingsDialog', () => ({
  RepositorySettingsDialog: () => null,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  AlertDialogClose: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogPopup: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { ...props, type: props.type ?? 'button' }, children),
}));

vi.mock('../RunningProjectsPopover', () => ({
  RunningProjectsPopover: () => React.createElement('div', { 'data-running-projects': 'true' }),
}));

vi.mock('../SidebarAiCenterButton', () => ({
  SidebarAiCenterButton: () => React.createElement('button', { type: 'button' }, 'AI Center'),
}));

vi.mock('../SidebarEmptyState', () => ({
  SidebarEmptyState: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-sidebar-empty': title }, title),
}));

async function mountRepositorySidebar() {
  const { RepositorySidebar } = await import('../RepositorySidebar');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(RepositorySidebar, {
        repositories: [
          {
            name: 'Visible Repo',
            path: '/visible-repo',
          },
          {
            name: 'Hidden Repo',
            path: '/hidden-repo',
          },
        ],
        selectedRepo: '/visible-repo',
        onSelectRepo: vi.fn(),
        canLoadRepo: () => true,
        onAddRepository: vi.fn(),
        onRemoveRepository: vi.fn(),
        groups: [] as RepositoryGroup[],
        activeGroupId: ALL_GROUP_ID,
        onSwitchGroup: vi.fn(),
        onCreateGroup: vi.fn(() => ({
          id: 'group',
          name: 'Group',
          emoji: 'G',
          color: '#000000',
          order: 0,
        })),
        onUpdateGroup: vi.fn(),
        onDeleteGroup: vi.fn(),
      })
    );
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('RepositorySidebar hidden repositories', () => {
  beforeEach(() => {
    repositorySettings.hidden = {
      '/hidden-repo': true,
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('omits repositories marked hidden from the columns sidebar', async () => {
    const view = await mountRepositorySidebar();

    try {
      expect(view.container.textContent).toContain('Visible Repo');
      expect(view.container.textContent).not.toContain('Hidden Repo');
    } finally {
      view.unmount();
    }
  });
});
