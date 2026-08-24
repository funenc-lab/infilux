import type { GitWorktree } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDisplayMode } from '@/stores/settings';
import { useWorktreeSelection } from '../useWorktreeSelection';

const invalidateQueries = vi.fn();
const switchEditorWorktree = vi.fn();
const gitFetch = vi.fn(() => Promise.resolve());
const agentSessions: Array<{ id: string; repoPath: string; cwd: string }> = [];
const settingsStoreState: {
  editorSettings: { autoSave: string };
  settingsDisplayMode: SettingsDisplayMode;
} = {
  editorSettings: {
    autoSave: 'afterDelay',
  },
  settingsDisplayMode: 'tab',
};

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
  useAgentSessionsStore: (selector: (state: { sessions: typeof agentSessions }) => unknown) =>
    selector({
      sessions: agentSessions,
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

let capturedHandleSelectWorktree:
  | ((worktree: GitWorktree, nextRepoPath?: string) => Promise<void>)
  | null = null;

function HookHarness({ args }: { args: Parameters<typeof useWorktreeSelection> }) {
  const { handleSelectWorktree } = useWorktreeSelection(...args);
  capturedHandleSelectWorktree = handleSelectWorktree;
  return React.createElement('div');
}

function makeWorktree(path: string): GitWorktree {
  return {
    path,
    head: 'abc123',
    branch: 'feature',
    isMainWorktree: false,
    isLocked: false,
    prunable: false,
  };
}

describe('useWorktreeSelection', () => {
  beforeEach(() => {
    capturedHandleSelectWorktree = null;
    invalidateQueries.mockClear();
    switchEditorWorktree.mockClear();
    gitFetch.mockClear();
    agentSessions.length = 0;
    settingsStoreState.editorSettings.autoSave = 'afterDelay';
    settingsStoreState.settingsDisplayMode = 'tab';

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          fetch: gitFetch,
        },
      },
    });
  });

  it('persists the selected worktree immediately for the target repository', async () => {
    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/feature-b');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          {},
          setWorktreeTabMap,
          'chat',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(setSelectedRepo).toHaveBeenCalledWith('/repo-b');
    expect(persistSelectedWorktree).toHaveBeenCalledWith('/repo-b', nextWorktree);
    expect(setActiveWorktree).toHaveBeenCalledWith(nextWorktree);
  });

  it('switches to chat when the target worktree has no agent sessions even if another tab was saved', async () => {
    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/feature-b');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          { [nextWorktree.path]: 'terminal' },
          setWorktreeTabMap,
          'file',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });

  it('restores the saved tab when the target worktree already has agent sessions', async () => {
    agentSessions.push({
      id: 'session-1',
      repoPath: '/repo-b',
      cwd: '/repo-b/.worktrees/feature-b',
    });

    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/feature-b');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          { [nextWorktree.path]: 'terminal' },
          setWorktreeTabMap,
          'file',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(setActiveTab).toHaveBeenCalledWith('terminal');
  });

  it('does not initiate session recovery while switching to a worktree with existing sessions', async () => {
    agentSessions.push({
      id: 'session-1',
      repoPath: '/repo-b',
      cwd: '/repo-b/.worktrees/feature-b',
    });

    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/feature-b');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          { [nextWorktree.path]: 'terminal' },
          setWorktreeTabMap,
          'file',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(setActiveTab).toHaveBeenCalledWith('terminal');
  });

  it('falls back to chat instead of restoring the file tab when switching worktrees', async () => {
    agentSessions.push({
      id: 'session-1',
      repoPath: '/repo-b',
      cwd: '/repo-b/.worktrees/feature-b',
    });

    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/feature-b');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          { [nextWorktree.path]: 'file' },
          setWorktreeTabMap,
          'chat',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });

  it('falls back to chat when a worktree still has a stale settings tab saved in draggable mode', async () => {
    settingsStoreState.settingsDisplayMode = 'draggable-modal';
    agentSessions.push({
      id: 'session-1',
      repoPath: '/repo-b',
      cwd: '/repo-b/.worktrees/feature-b',
    });

    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/feature-b');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          { [nextWorktree.path]: 'settings' },
          setWorktreeTabMap,
          'file',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });

  it('leaves recovery ownership to the canonical session loader when selecting a worktree', async () => {
    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/recovered');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          { [nextWorktree.path]: 'terminal' },
          setWorktreeTabMap,
          'file',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(setActiveWorktree).toHaveBeenCalledWith(nextWorktree);
  });

  it('requests an agent canvas recenter after switching to a new worktree', async () => {
    const setActiveWorktree = vi.fn();
    const setWorktreeTabMap = vi.fn();
    const setActiveTab = vi.fn();
    const setSelectedRepo = vi.fn();
    const persistSelectedWorktree = vi.fn();
    const requestAgentCanvasRecenter = vi.fn();
    const currentWorktreePathRef = { current: null as string | null };
    const activeWorktree = makeWorktree('/repo-a/.worktrees/current');
    const nextWorktree = makeWorktree('/repo-b/.worktrees/feature-b');

    renderToStaticMarkup(
      React.createElement(HookHarness, {
        args: [
          activeWorktree,
          setActiveWorktree,
          currentWorktreePathRef,
          {},
          setWorktreeTabMap,
          'chat',
          null,
          setActiveTab,
          '/repo-a',
          setSelectedRepo,
          persistSelectedWorktree,
          requestAgentCanvasRecenter,
        ],
      })
    );

    expect(capturedHandleSelectWorktree).not.toBeNull();

    await capturedHandleSelectWorktree?.(nextWorktree, '/repo-b');

    expect(requestAgentCanvasRecenter).toHaveBeenCalledWith(nextWorktree.path);
  });
});
