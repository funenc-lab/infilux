/* @vitest-environment jsdom */

import React, { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useEditorStore } from '@/stores/editor';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { MainContent } from '../MainContent';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { liveSubagentsByWorktree } = vi.hoisted(() => ({ liveSubagentsByWorktree: new Map() }));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      settingsDisplayMode: 'tab',
      setSettingsDisplayMode: () => undefined,
      fileTreeDisplayMode: 'legacy',
      agentSessionDisplayMode: 'tab',
      chatPanelInactivityThresholdMinutes: 5,
      retainSessionBackedChatPanels: true,
      floatingToolbarEnabled: false,
      todoEnabled: false,
      bgImageEnabled: false,
    }),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (value: string) => value }) }));

vi.mock('@/hooks/useLiveSubagents', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useLiveSubagents')>(
    '@/hooks/useLiveSubagents'
  );
  return { ...actual, useLiveSubagents: () => liveSubagentsByWorktree };
});
vi.mock('../MainContentPanels', () => ({ MainContentPanels: () => null }));
vi.mock('../MainContentTopbar', () => ({ MainContentTopbar: () => null }));
vi.mock('../DeferredDiffReviewModal', () => ({ DeferredDiffReviewModal: () => null }));
vi.mock('../DeferredAgentPanel', () => ({
  preloadAgentPanelComponent: async () => undefined,
}));

describe('MainContent session updates', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onRender = vi.fn();

  beforeEach(() => {
    onRender.mockClear();
    const session: Session = {
      id: 'session-a',
      name: 'Codex',
      agentId: 'codex',
      agentCommand: 'codex',
      initialized: true,
      activated: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
    };
    useAgentSessionsStore.setState({
      sessions: [session],
      activeIds: { '/repo/worktree': session.id },
      runtimeStates: {},
      groupStates: {},
    });
    useEditorStore.setState({ tabs: [], currentWorktreePath: null, worktreeStates: {} });
    useWorktreeActivityStore.setState({ activities: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useAgentSessionsStore.setState({ sessions: [], activeIds: {}, runtimeStates: {} });
    useWorktreeActivityStore.setState({ activities: {} });
  });

  async function mount() {
    await act(async () => {
      root.render(
        React.createElement(
          Profiler,
          { id: 'main-content', onRender },
          React.createElement(MainContent, {
            activeTab: 'chat',
            onTabChange: () => undefined,
            repoPath: '/repo',
            worktreePath: '/repo/worktree',
          })
        )
      );
    });
    onRender.mockClear();
  }

  it('does not re-render layout for replay-only session updates', async () => {
    await mount();

    await act(async () => {
      useAgentSessionsStore.getState().updateSession('session-a', {
        replaySnapshot: 'New terminal output',
        replaySnapshotCapturedAt: 1_000,
      });
    });

    expect(onRender).not.toHaveBeenCalled();
  });

  it('still updates layout when a session moves to another worktree', async () => {
    await mount();

    await act(async () => {
      useAgentSessionsStore.getState().updateSession('session-a', { cwd: '/repo/other-worktree' });
    });

    expect(onRender).toHaveBeenCalled();
  });

  it('still updates layout for runtime activity changes', async () => {
    await mount();

    await act(async () => {
      useAgentSessionsStore.getState().setWaitingForInput('session-a', true);
    });

    expect(onRender).toHaveBeenCalled();
  });
});
