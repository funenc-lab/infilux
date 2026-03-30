import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('worktree activity store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubGlobal('window', {
      electronAPI: {
        worktree: {
          activate: vi.fn(),
        },
      },
    });
  });

  it('does not rewrite activity state when agent count is unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    store.setAgentCount('/repo', 2);
    const previousActivities = useWorktreeActivityStore.getState().activities;

    store.setAgentCount('/repo', 2);

    expect(useWorktreeActivityStore.getState().activities).toBe(previousActivities);
  });

  it('does not rewrite activity state when terminal count is unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    store.setTerminalCount('/repo', 3);
    const previousActivities = useWorktreeActivityStore.getState().activities;

    store.setTerminalCount('/repo', 3);

    expect(useWorktreeActivityStore.getState().activities).toBe(previousActivities);
  });
});
