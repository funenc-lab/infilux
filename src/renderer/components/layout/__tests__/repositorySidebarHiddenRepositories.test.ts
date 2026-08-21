/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository, RepositoryGroup } from '@/App/constants';
import { ALL_GROUP_ID } from '@/App/constants';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repositorySettings = vi.hoisted(() => ({
  hidden: {} as Record<string, boolean>,
}));

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-icon': name });
  return {
    BrainCircuit: icon('BrainCircuit'),
    ChevronDown: icon('ChevronDown'),
    ChevronRight: icon('ChevronRight'),
    Clock: icon('Clock'),
    FolderGit2: icon('FolderGit2'),
    FolderMinus: icon('FolderMinus'),
    ListFilter: icon('ListFilter'),
    ListCollapse: icon('ListCollapse'),
    MoreHorizontal: icon('MoreHorizontal'),
    PanelLeftClose: icon('PanelLeftClose'),
    PanelLeftOpen: icon('PanelLeftOpen'),
    Plus: icon('Plus'),
    Search: icon('Search'),
    Settings2: icon('Settings2'),
    X: icon('X'),
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, variables?: Record<string, string | number>) =>
      value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(variables?.[key] ?? '')),
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
  SidebarEmptyState: ({
    icon,
    title,
    actions,
  }: {
    icon?: React.ReactNode;
    title: string;
    actions?: React.ReactNode;
  }) => React.createElement('div', { 'data-sidebar-empty': title }, icon, title, actions),
}));

async function mountRepositorySidebar(
  repositories: Repository[] = [
    {
      id: 'visible-repo',
      name: 'Visible Repo',
      path: '/visible-repo',
    },
    {
      id: 'hidden-repo',
      name: 'Hidden Repo',
      path: '/hidden-repo',
    },
  ],
  options: {
    groups?: RepositoryGroup[];
    activeGroupId?: string;
    selectedRepo?: string | null;
  } = {}
) {
  const { RepositorySidebar } = await import('../RepositorySidebar');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(RepositorySidebar, {
        repositories,
        selectedRepo: options.selectedRepo ?? repositories[0]?.path ?? null,
        onSelectRepo: vi.fn(),
        canLoadRepo: () => true,
        onAddRepository: vi.fn(),
        onRemoveRepository: vi.fn(),
        groups: options.groups ?? ([] as RepositoryGroup[]),
        activeGroupId: options.activeGroupId ?? ALL_GROUP_ID,
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

  it('uses a list-filter icon while the active quick filter is applied', async () => {
    const view = await mountRepositorySidebar();

    try {
      const getLeadingIcon = () =>
        view.container.querySelector('.control-sidebar-search-icon')?.getAttribute('data-icon');
      const searchInput = view.container.querySelector(
        'input[aria-label="Search projects"]'
      ) as HTMLInputElement | null;

      expect(searchInput).not.toBeNull();
      expect(getLeadingIcon()).toBe('Search');

      await act(async () => {
        if (!searchInput) return;
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        valueSetter?.call(searchInput, ':active');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(getLeadingIcon()).toBe('ListFilter');
      expect(view.container.querySelector('[data-sidebar-empty="No matches"]')).not.toBeNull();
      expect(
        view.container.querySelector(
          '[data-sidebar-empty="No matches"] svg[data-icon="ListFilter"]'
        )
      ).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('exposes the active-project filter as a discoverable control', async () => {
    const view = await mountRepositorySidebar();

    try {
      const activeFilter = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Only show active projects"]'
      );

      expect(activeFilter).not.toBeNull();
      expect(activeFilter?.getAttribute('aria-pressed')).toBe('false');

      await act(async () => {
        activeFilter?.click();
      });

      expect(activeFilter?.getAttribute('aria-pressed')).toBe('true');
      expect(view.container.querySelector('[data-sidebar-empty="No matches"]')).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('clears the active-project filter from the empty-state recovery action', async () => {
    const view = await mountRepositorySidebar();

    try {
      const activeFilter = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Only show active projects"]'
      );

      await act(async () => {
        activeFilter?.click();
      });

      const clearFilter = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('button')
      ).find((button) => button.textContent === 'Clear Search');
      expect(clearFilter).toBeDefined();

      await act(async () => {
        clearFilter?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(
        view.container
          .querySelector<HTMLButtonElement>('.control-sidebar-inline-filter')
          ?.getAttribute('aria-pressed')
      ).toBe('false');
      expect(view.container.querySelector('[data-sidebar-empty="No matches"]')).toBeNull();
      expect(view.container.textContent).toContain('Visible Repo');
    } finally {
      view.unmount();
    }
  });

  it('preserves end-aligned truncation for ordinary repository paths', async () => {
    repositorySettings.hidden = {};
    const view = await mountRepositorySidebar([
      {
        id: 'nested-repo',
        name: 'Nested Repo',
        path: '/workspace/clients/acme/nested-repo',
      },
    ]);

    try {
      const subtitle = view.container.querySelector<HTMLElement>(
        '[title="/workspace/clients/acme/nested-repo"]'
      );
      expect(subtitle?.classList.contains('[direction:rtl]')).toBe(true);
    } finally {
      view.unmount();
    }
  });

  it('shows recent inactive repositories progressively and reveals more in place', async () => {
    repositorySettings.hidden = {};
    const repositories = Array.from({ length: 12 }, (_, index) => ({
      id: `repo-${index}`,
      name: `Repo ${index}`,
      path: `/repo/${index}`,
      lastAccessedAt: index,
    }));
    const view = await mountRepositorySidebar(repositories);

    try {
      expect(view.container.textContent).toContain('Repo 0');
      expect(view.container.querySelector('[title="/repo/1"]')).toBeNull();
      expect(
        Array.from(
          view.container.querySelectorAll<HTMLElement>('.control-tree-subtitle[title]')
        ).map((element) => element.title)
      ).toEqual([
        '/repo/0',
        '/repo/11',
        '/repo/10',
        '/repo/9',
        '/repo/8',
        '/repo/7',
        '/repo/6',
        '/repo/5',
        '/repo/4',
      ]);
      const showMoreButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Load more projects"]'
      );
      expect(showMoreButton).not.toBeNull();

      await act(async () => {
        showMoreButton?.click();
      });

      expect(view.container.querySelector('[title="/repo/1"]')).not.toBeNull();
      expect(view.container.querySelector('button[aria-label="Load more projects"]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('applies the active group before calculating progressive visibility', async () => {
    repositorySettings.hidden = {};
    const groups: RepositoryGroup[] = [
      { id: 'alpha', name: 'Alpha', emoji: 'A', color: '#336699', order: 0 },
      { id: 'beta', name: 'Beta', emoji: 'B', color: '#993366', order: 1 },
    ];
    const alphaRepositories: Repository[] = Array.from({ length: 10 }, (_, index) => ({
      id: `alpha-${index}`,
      name: `Alpha ${index}`,
      path: `/alpha/${index}`,
      groupId: 'alpha',
      lastAccessedAt: index,
    }));
    const betaRepositories: Repository[] = Array.from({ length: 10 }, (_, index) => ({
      id: `beta-${index}`,
      name: `Beta ${index}`,
      path: `/beta/${index}`,
      groupId: 'beta',
      lastAccessedAt: 100 + index,
    }));
    const view = await mountRepositorySidebar([...alphaRepositories, ...betaRepositories], {
      groups,
      activeGroupId: 'alpha',
      selectedRepo: '/beta/0',
    });

    try {
      const visibleAlphaRows = alphaRepositories.filter((repository) =>
        view.container.querySelector(`[title="${repository.path}"]`)
      );

      expect(visibleAlphaRows).toHaveLength(8);
      expect(view.container.textContent).not.toContain('Beta 9');
      expect(
        view.container.querySelector('button[aria-label="Load more projects"]')
      ).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('removes collapsed group content without retaining an animated text layer', async () => {
    repositorySettings.hidden = {};
    const groups: RepositoryGroup[] = [
      { id: 'alpha', name: 'Alpha', emoji: 'A', color: '#336699', order: 0 },
    ];
    const view = await mountRepositorySidebar(
      [{ id: 'alpha-repo', name: 'Alpha Repo', path: '/alpha/repo', groupId: 'alpha' }],
      { groups }
    );

    try {
      const groupToggle = view.container.querySelector<HTMLButtonElement>(
        'button[aria-controls="repository-section-alpha"]'
      );
      expect(view.container.querySelector('#repository-section-alpha')).not.toBeNull();

      await act(async () => {
        groupToggle?.click();
      });

      expect(view.container.querySelector('#repository-section-alpha')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('collapses every visible project section with one toolbar action', async () => {
    repositorySettings.hidden = {};
    const groups: RepositoryGroup[] = [
      { id: 'alpha', name: 'Alpha', emoji: 'A', color: '#336699', order: 0 },
      { id: 'beta', name: 'Beta', emoji: 'B', color: '#993366', order: 1 },
    ];
    const view = await mountRepositorySidebar(
      [
        { id: 'alpha-repo', name: 'Alpha Repo', path: '/alpha/repo', groupId: 'alpha' },
        { id: 'beta-repo', name: 'Beta Repo', path: '/beta/repo', groupId: 'beta' },
      ],
      { groups }
    );

    try {
      const moreActionsButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="More project actions"]'
      );
      expect(moreActionsButton).not.toBeNull();
      expect(view.container.querySelector('#repository-section-alpha')).not.toBeNull();
      expect(view.container.querySelector('#repository-section-beta')).not.toBeNull();

      await act(async () => {
        moreActionsButton?.click();
      });

      const collapseAllButton = document.querySelector<HTMLElement>('[role="menuitem"]');
      expect(collapseAllButton?.textContent).toContain('Collapse all');

      await act(async () => {
        collapseAllButton?.click();
      });

      expect(view.container.querySelector('#repository-section-alpha')).toBeNull();
      expect(view.container.querySelector('#repository-section-beta')).toBeNull();
      expect(collapseAllButton?.getAttribute('data-disabled')).toBe('');
    } finally {
      view.unmount();
    }
  });

  it('keeps project sections collapsed when lazy loading reveals another group', async () => {
    repositorySettings.hidden = {};
    const groups: RepositoryGroup[] = [
      { id: 'alpha', name: 'Alpha', emoji: 'A', color: '#336699', order: 0 },
      { id: 'beta', name: 'Beta', emoji: 'B', color: '#993366', order: 1 },
      { id: 'gamma', name: 'Gamma', emoji: 'G', color: '#669933', order: 2 },
    ];
    const repositories: Repository[] = [
      {
        id: 'alpha-selected',
        name: 'Alpha Selected',
        path: '/alpha/selected',
        groupId: 'alpha',
        lastAccessedAt: 100,
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `beta-${index}`,
        name: `Beta ${index}`,
        path: `/beta/${index}`,
        groupId: 'beta',
        lastAccessedAt: 90 - index,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `gamma-${index}`,
        name: `Gamma ${index}`,
        path: `/gamma/${index}`,
        groupId: 'gamma',
        lastAccessedAt: index,
      })),
    ];
    const view = await mountRepositorySidebar(repositories, {
      groups,
      selectedRepo: '/alpha/selected',
    });

    try {
      expect(view.container.querySelector('[aria-controls="repository-section-gamma"]')).toBeNull();

      const moreActionsButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="More project actions"]'
      );
      await act(async () => {
        moreActionsButton?.click();
      });

      const collapseAllButton = Array.from(
        document.querySelectorAll<HTMLElement>('[role="menuitem"]')
      ).find((item) => item.textContent?.includes('Collapse all'));
      await act(async () => {
        collapseAllButton?.click();
      });

      const showMoreButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Load more projects"]'
      );
      expect(showMoreButton).not.toBeNull();
      await act(async () => {
        showMoreButton?.click();
      });

      expect(
        view.container.querySelector('[aria-controls="repository-section-gamma"]')
      ).not.toBeNull();
      expect(view.container.querySelector('#repository-section-gamma')).toBeNull();
    } finally {
      view.unmount();
    }
  });
});
