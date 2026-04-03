/* @vitest-environment jsdom */

import type { GitWorktree } from '@shared/types';
import React, { act, useCallback, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabId } from '@/App/constants';
import { useSettingsState } from '@/App/hooks/useSettingsState';
import { useWorktreeSelection } from '@/App/hooks/useWorktreeSelection';
import type { SettingsDisplayMode } from '@/stores/settings';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const invalidateQueries = vi.fn();
const switchEditorWorktree = vi.fn();
const gitFetch = vi.fn(() => Promise.resolve());
const restoreWorktreeSessions = vi.fn(() => Promise.resolve({ items: [] }));
const getSessions = vi.fn((repoPath: string, cwd: string) => [{ id: `${repoPath}:${cwd}` }]);
const upsertRecoveredSession = vi.fn();
const updateGroupState = vi.fn();

const settingsStoreState: {
  editorSettings: { autoSave: string };
  settingsDisplayMode: SettingsDisplayMode;
} = {
  editorSettings: { autoSave: 'afterDelay' },
  settingsDisplayMode: 'draggable-modal',
};

const WORKTREE_A: GitWorktree = {
  path: '/repo/.worktrees/a',
  head: 'aaa111',
  branch: 'feature-a',
  isMainWorktree: false,
  isLocked: false,
  prunable: false,
};

const WORKTREE_B: GitWorktree = {
  path: '/repo/.worktrees/b',
  head: 'bbb222',
  branch: 'feature-b',
  isMainWorktree: false,
  isLocked: false,
  prunable: false,
};

interface FlowHarnessProps {
  initialActiveTab?: TabId;
  initialPreviousTab?: TabId | null;
  initialActiveWorktree?: GitWorktree | null;
  initialSettingsDisplayMode?: SettingsDisplayMode;
  initialWorktreeTabMap?: Record<string, TabId>;
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries,
  }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (
    selector: (state: {
      editorSettings: { autoSave: string };
      settingsDisplayMode: SettingsDisplayMode;
    }) => unknown
  ) => selector(settingsStoreState),
}));

vi.mock('@/stores/editor', () => ({
  useEditorStore: (
    selector: (state: {
      switchWorktree: typeof switchEditorWorktree;
      currentWorktreePath: string | null;
    }) => unknown
  ) =>
    selector({
      switchWorktree: switchEditorWorktree,
      currentWorktreePath: null,
    }),
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (state: {
      getSessions: typeof getSessions;
      upsertRecoveredSession: typeof upsertRecoveredSession;
      updateGroupState: typeof updateGroupState;
    }) => unknown
  ) =>
    selector({
      getSessions,
      upsertRecoveredSession,
      updateGroupState,
    }),
}));

vi.mock('@/stores/unsavedPrompt', () => ({
  requestUnsavedChoice: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

function FlowHarness({
  initialActiveTab = 'terminal',
  initialPreviousTab = null,
  initialActiveWorktree = WORKTREE_A,
  initialWorktreeTabMap = {
    [WORKTREE_A.path]: 'settings',
    [WORKTREE_B.path]: 'terminal',
  },
}: FlowHarnessProps) {
  const [, setModeVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>(initialActiveTab);
  const [previousTab, setPreviousTab] = useState<TabId | null>(initialPreviousTab);
  const [activeWorktree, setActiveWorktree] = useState<GitWorktree | null>(initialActiveWorktree);
  const [selectedRepo, setSelectedRepo] = useState('/repo');
  const [worktreeTabMap, setWorktreeTabMap] =
    useState<Record<string, TabId>>(initialWorktreeTabMap);
  const currentWorktreePathRef = useRef<string | null>(initialActiveWorktree?.path ?? null);

  const persistSelectedWorktree = useCallback(() => {}, []);
  const persistCurrentWorktreeTab = useCallback(
    (tab: TabId) => {
      if (!activeWorktree?.path) {
        return;
      }

      setWorktreeTabMap((previousMap) => ({
        ...previousMap,
        [activeWorktree.path]: tab,
      }));
    },
    [activeWorktree?.path]
  );

  const settingsState = useSettingsState(
    activeTab,
    previousTab,
    setActiveTab,
    setPreviousTab,
    persistCurrentWorktreeTab
  );

  const { handleSelectWorktree } = useWorktreeSelection(
    activeWorktree,
    setActiveWorktree,
    currentWorktreePathRef,
    worktreeTabMap,
    setWorktreeTabMap,
    activeTab,
    previousTab,
    setActiveTab,
    selectedRepo,
    setSelectedRepo,
    persistSelectedWorktree
  );

  const updateSettingsDisplayMode = useCallback((mode: SettingsDisplayMode) => {
    settingsStoreState.settingsDisplayMode = mode;
    setModeVersion((previousVersion) => previousVersion + 1);
  }, []);

  return React.createElement(
    'div',
    null,
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'open-settings',
        onClick: settingsState.openSettings,
      },
      'open-settings'
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'close-settings',
        onClick: () => settingsState.handleSettingsDialogOpenChange(false),
      },
      'close-settings'
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'toggle-settings',
        onClick: settingsState.toggleSettings,
      },
      'toggle-settings'
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'set-mode-tab',
        onClick: () => updateSettingsDisplayMode('tab'),
      },
      'set-mode-tab'
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'set-mode-floating',
        onClick: () => updateSettingsDisplayMode('draggable-modal'),
      },
      'set-mode-floating'
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'switch-worktree-a',
        onClick: () => {
          void handleSelectWorktree(WORKTREE_A);
        },
      },
      'switch-worktree-a'
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'switch-worktree-b',
        onClick: () => {
          void handleSelectWorktree(WORKTREE_B);
        },
      },
      'switch-worktree-b'
    ),
    React.createElement('div', { 'data-testid': 'active-tab' }, activeTab),
    React.createElement(
      'div',
      { 'data-testid': 'active-worktree' },
      activeWorktree?.path ?? 'none'
    ),
    React.createElement(
      'div',
      { 'data-testid': 'settings-open' },
      String(settingsState.settingsDialogOpen)
    ),
    React.createElement(
      'div',
      { 'data-testid': 'worktree-tab-map' },
      JSON.stringify(worktreeTabMap)
    ),
    React.createElement(
      'div',
      { 'data-testid': 'settings-display-mode' },
      settingsStoreState.settingsDisplayMode
    )
  );
}

function getByTestId(container: HTMLElement, testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Missing element: ${testId}`);
  }
  return element;
}

async function click(container: HTMLElement, testId: string) {
  const element = getByTestId(container, testId);
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('settings worktree flow', () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    switchEditorWorktree.mockClear();
    gitFetch.mockClear();
    restoreWorktreeSessions.mockClear();
    getSessions.mockClear();
    upsertRecoveredSession.mockClear();
    updateGroupState.mockClear();
    settingsStoreState.editorSettings.autoSave = 'afterDelay';
    settingsStoreState.settingsDisplayMode = 'draggable-modal';

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          fetch: gitFetch,
        },
        agentSession: {
          restoreWorktreeSessions,
        },
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function mountFlowHarness(props?: FlowHarnessProps) {
    settingsStoreState.settingsDisplayMode = props?.initialSettingsDisplayMode ?? 'draggable-modal';

    const container = document.createElement('div');
    document.body.appendChild(container);

    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(FlowHarness, props));
    });

    return {
      container,
      root,
      async unmount() {
        await act(async () => {
          root.unmount();
        });
      },
    };
  }

  it('keeps the worktree on its real tab after closing floating settings and switching away and back', async () => {
    const { container, unmount } = await mountFlowHarness();

    expect(getByTestId(container, 'active-tab').textContent).toBe('terminal');
    expect(getByTestId(container, 'worktree-tab-map').textContent).toContain('"settings"');

    await click(container, 'open-settings');
    expect(getByTestId(container, 'settings-open').textContent).toBe('true');

    await click(container, 'close-settings');
    expect(getByTestId(container, 'settings-open').textContent).toBe('false');
    expect(getByTestId(container, 'worktree-tab-map').textContent).toContain(
      `"${WORKTREE_A.path}":"terminal"`
    );

    await click(container, 'switch-worktree-b');
    expect(getByTestId(container, 'active-worktree').textContent).toBe(WORKTREE_B.path);
    expect(getByTestId(container, 'active-tab').textContent).toBe('terminal');

    await click(container, 'switch-worktree-a');
    expect(getByTestId(container, 'active-worktree').textContent).toBe(WORKTREE_A.path);
    expect(getByTestId(container, 'active-tab').textContent).toBe('terminal');
    expect(getByTestId(container, 'settings-open').textContent).toBe('false');
    expect(getByTestId(container, 'worktree-tab-map').textContent).not.toContain(
      `"${WORKTREE_A.path}":"settings"`
    );

    await unmount();
  });

  it('restores the previous tab after switching settings from tab mode to floating mode before a worktree round-trip', async () => {
    const { container, unmount } = await mountFlowHarness({
      initialActiveTab: 'settings',
      initialPreviousTab: 'terminal',
      initialSettingsDisplayMode: 'tab',
    });

    expect(getByTestId(container, 'active-tab').textContent).toBe('settings');
    expect(getByTestId(container, 'settings-display-mode').textContent).toBe('tab');
    expect(getByTestId(container, 'settings-open').textContent).toBe('false');

    await click(container, 'set-mode-floating');
    expect(getByTestId(container, 'settings-display-mode').textContent).toBe('draggable-modal');
    expect(getByTestId(container, 'active-tab').textContent).toBe('terminal');
    expect(getByTestId(container, 'settings-open').textContent).toBe('true');
    expect(getByTestId(container, 'worktree-tab-map').textContent).toContain(
      `"${WORKTREE_A.path}":"terminal"`
    );

    await click(container, 'close-settings');
    expect(getByTestId(container, 'settings-open').textContent).toBe('false');

    await click(container, 'switch-worktree-b');
    await click(container, 'switch-worktree-a');

    expect(getByTestId(container, 'active-tab').textContent).toBe('terminal');
    expect(getByTestId(container, 'settings-open').textContent).toBe('false');
    expect(getByTestId(container, 'worktree-tab-map').textContent).not.toContain(
      `"${WORKTREE_A.path}":"settings"`
    );

    await unmount();
  });

  it('keeps the worktree on its real tab when the floating settings window is toggled closed before switching away and back', async () => {
    const { container, unmount } = await mountFlowHarness({
      initialActiveTab: 'terminal',
      initialPreviousTab: 'chat',
      initialSettingsDisplayMode: 'draggable-modal',
    });

    await click(container, 'toggle-settings');
    expect(getByTestId(container, 'settings-open').textContent).toBe('true');

    await click(container, 'toggle-settings');
    expect(getByTestId(container, 'settings-open').textContent).toBe('false');
    expect(getByTestId(container, 'worktree-tab-map').textContent).toContain(
      `"${WORKTREE_A.path}":"terminal"`
    );

    await click(container, 'switch-worktree-b');
    await click(container, 'switch-worktree-a');

    expect(getByTestId(container, 'active-tab').textContent).toBe('terminal');
    expect(getByTestId(container, 'settings-open').textContent).toBe('false');
    expect(getByTestId(container, 'worktree-tab-map').textContent).not.toContain(
      `"${WORKTREE_A.path}":"settings"`
    );

    await unmount();
  });
});
