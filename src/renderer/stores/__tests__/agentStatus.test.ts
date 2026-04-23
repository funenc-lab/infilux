import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('agent status store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates, reads, and clears session status entries', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_000);

    const { useAgentStatusStore } = await import('../agentStatus');
    const store = useAgentStatusStore.getState();

    store.updateStatus('session-1', {
      version: '1.0.0',
      workspace: {
        currentDir: '/repo',
        projectDir: '/repo',
      },
    });

    expect(store.getStatus('session-1')).toEqual({
      version: '1.0.0',
      workspace: {
        currentDir: '/repo',
        projectDir: '/repo',
      },
      updatedAt: 1_710_000_000_000,
    });

    store.updateStatus('session-1', {
      model: {
        id: 'claude-4',
        displayName: 'Claude 4',
      },
    });

    expect(store.getStatus('session-1')).toEqual({
      version: '1.0.0',
      workspace: {
        currentDir: '/repo',
        projectDir: '/repo',
      },
      model: {
        id: 'claude-4',
        displayName: 'Claude 4',
      },
      updatedAt: 1_710_000_000_000,
    });

    store.clearStatus('session-1');

    expect(store.getStatus('session-1')).toBeUndefined();
  });

  it('maps status notifications into the store and unsubscribes on cleanup', async () => {
    const unsubscribe = vi.fn();
    let listener:
      | ((payload: {
          sessionId: string;
          model?: { id: string; display_name: string };
          contextWindow?: {
            total_input_tokens: number;
            total_output_tokens: number;
            context_window_size: number;
            current_usage?: {
              input_tokens: number;
              output_tokens: number;
              cache_creation_input_tokens: number;
              cache_read_input_tokens: number;
            } | null;
          };
          cost?: {
            total_cost_usd: number;
            total_duration_ms: number;
            total_api_duration_ms?: number;
            total_lines_added: number;
            total_lines_removed: number;
          };
          workspace?: {
            current_dir: string;
            project_dir: string;
          };
          version?: string;
        }) => void)
      | null = null;

    vi.doMock('@/lib/electronNotification', () => ({
      onAgentStatusUpdateNotification: vi.fn((callback) => {
        listener = callback;
        return unsubscribe;
      }),
    }));
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_123);

    const { initAgentStatusListener, useAgentStatusStore } = await import('../agentStatus');

    const cleanup = initAgentStatusListener();
    expect(listener).toBeTypeOf('function');

    listener?.({
      sessionId: 'session-2',
      model: {
        id: 'claude-sonnet',
        display_name: 'Claude Sonnet',
      },
      contextWindow: {
        total_input_tokens: 10,
        total_output_tokens: 20,
        context_window_size: 100,
        current_usage: {
          input_tokens: 1,
          output_tokens: 2,
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 4,
        },
      },
      cost: {
        total_cost_usd: 1.25,
        total_duration_ms: 3000,
        total_api_duration_ms: 2000,
        total_lines_added: 5,
        total_lines_removed: 6,
      },
      workspace: {
        current_dir: '/repo/worktree',
        project_dir: '/repo',
      },
      version: '1.2.3',
    });

    expect(useAgentStatusStore.getState().getStatus('session-2')).toEqual({
      model: {
        id: 'claude-sonnet',
        displayName: 'Claude Sonnet',
      },
      contextWindow: {
        totalInputTokens: 10,
        totalOutputTokens: 20,
        contextWindowSize: 100,
        currentUsage: {
          inputTokens: 1,
          outputTokens: 2,
          cacheCreationInputTokens: 3,
          cacheReadInputTokens: 4,
        },
      },
      cost: {
        totalCostUsd: 1.25,
        totalDurationMs: 3000,
        totalApiDurationMs: 2000,
        totalLinesAdded: 5,
        totalLinesRemoved: 6,
      },
      workspace: {
        currentDir: '/repo/worktree',
        projectDir: '/repo',
      },
      version: '1.2.3',
      updatedAt: 1_710_000_000_123,
    });

    cleanup();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('maps null usage and missing api duration to stable defaults', async () => {
    const unsubscribe = vi.fn();
    let listener:
      | ((payload: {
          sessionId: string;
          contextWindow?: {
            total_input_tokens: number;
            total_output_tokens: number;
            context_window_size: number;
            current_usage?: null;
          };
          cost?: {
            total_cost_usd: number;
            total_duration_ms: number;
            total_lines_added: number;
            total_lines_removed: number;
          };
        }) => void)
      | null = null;

    vi.doMock('@/lib/electronNotification', () => ({
      onAgentStatusUpdateNotification: vi.fn((callback) => {
        listener = callback;
        return unsubscribe;
      }),
    }));
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_456);

    const { initAgentStatusListener, useAgentStatusStore } = await import('../agentStatus');

    const cleanup = initAgentStatusListener();

    listener?.({
      sessionId: 'session-3',
      contextWindow: {
        total_input_tokens: 11,
        total_output_tokens: 22,
        context_window_size: 200,
        current_usage: null,
      },
      cost: {
        total_cost_usd: 2.5,
        total_duration_ms: 4000,
        total_lines_added: 7,
        total_lines_removed: 8,
      },
    });

    expect(useAgentStatusStore.getState().getStatus('session-3')).toEqual({
      contextWindow: {
        totalInputTokens: 11,
        totalOutputTokens: 22,
        contextWindowSize: 200,
        currentUsage: null,
      },
      cost: {
        totalCostUsd: 2.5,
        totalDurationMs: 4000,
        totalApiDurationMs: 0,
        totalLinesAdded: 7,
        totalLinesRemoved: 8,
      },
      updatedAt: 1_710_000_000_456,
    });

    cleanup();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
