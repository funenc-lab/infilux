import { describe, expect, it } from 'vitest';
import {
  markStartupBlockingKeyReady,
  resolveInitialStartupBlockingKeys,
  type StartupBlockingKey,
} from '../startupOverlayPolicy';

describe('startupOverlayPolicy', () => {
  it('tracks visible startup blockers for the default columns layout', () => {
    expect(
      resolveInitialStartupBlockingKeys({
        layoutMode: 'columns',
        repositoryCollapsed: false,
        worktreeCollapsed: false,
        isTempRepo: false,
        activeTab: 'file',
        hasActiveWorktree: true,
        hasSelectedSubagent: false,
        settingsDisplayMode: 'tab',
      })
    ).toEqual(['repository-sidebar', 'worktree-panel', 'file-panel']);
  });

  it('skips worktree-bound panels when no active worktree is restored', () => {
    expect(
      resolveInitialStartupBlockingKeys({
        layoutMode: 'columns',
        repositoryCollapsed: false,
        worktreeCollapsed: false,
        isTempRepo: false,
        activeTab: 'chat',
        hasActiveWorktree: false,
        hasSelectedSubagent: false,
        settingsDisplayMode: 'tab',
      })
    ).toEqual(['repository-sidebar', 'worktree-panel']);
  });

  it('uses the tree sidebar as the single navigation blocker in tree layout', () => {
    expect(
      resolveInitialStartupBlockingKeys({
        layoutMode: 'tree',
        repositoryCollapsed: false,
        worktreeCollapsed: false,
        isTempRepo: false,
        activeTab: 'source-control',
        hasActiveWorktree: true,
        hasSelectedSubagent: false,
        settingsDisplayMode: 'tab',
      })
    ).toEqual(['tree-sidebar', 'source-control-panel']);
  });

  it('does not wait for the chat panel when a subagent transcript is the active chat surface', () => {
    expect(
      resolveInitialStartupBlockingKeys({
        layoutMode: 'columns',
        repositoryCollapsed: false,
        worktreeCollapsed: false,
        isTempRepo: false,
        activeTab: 'chat',
        hasActiveWorktree: true,
        hasSelectedSubagent: true,
        settingsDisplayMode: 'tab',
      })
    ).toEqual(['repository-sidebar', 'worktree-panel']);
  });

  it('removes ready keys idempotently', () => {
    expect(
      markStartupBlockingKeyReady(
        ['repository-sidebar', 'worktree-panel', 'file-panel'],
        'worktree-panel'
      )
    ).toEqual(['repository-sidebar', 'file-panel']);

    expect(
      markStartupBlockingKeyReady(['repository-sidebar', 'file-panel'], 'worktree-panel')
    ).toEqual(['repository-sidebar', 'file-panel']);
  });

  it('preserves the same array reference when the key is already absent', () => {
    const pendingKeys: StartupBlockingKey[] = ['repository-sidebar', 'file-panel'];

    expect(markStartupBlockingKeyReady(pendingKeys, 'worktree-panel')).toBe(pendingKeys);
  });

  it('derives startup progress from the current blocking queue', async () => {
    const policyModule = (await import('../startupOverlayPolicy')) as Record<string, unknown>;
    const resolveStartupProgress = policyModule.resolveStartupProgress;

    expect(resolveStartupProgress).toBeTypeOf('function');

    expect(
      (
        resolveStartupProgress as (args: {
          pendingKeys: StartupBlockingKey[];
          totalKeys: number;
        }) => {
          completedCount: number;
          currentKey: StartupBlockingKey | null;
          currentStep: number;
          totalSteps: number;
        }
      )({
        pendingKeys: ['worktree-panel', 'file-panel'],
        totalKeys: 3,
      })
    ).toEqual({
      completedCount: 1,
      currentKey: 'worktree-panel',
      currentStep: 2,
      totalSteps: 3,
    });
  });
});
