import { describe, expect, it } from 'vitest';
import type { AgentSessionInventoryItem } from '@/stores/agentSessionInventory';
import {
  buildAgentSessionAgentSummaries,
  buildAgentSessionControlSections,
  buildAgentSessionControlSummary,
  resolveAgentSessionControlActionHint,
  resolveAgentSessionControlTone,
  resolveAgentSessionStatusPresentation,
} from '../agentSessionControlCenterModel';

function inventoryItem(
  overrides: Partial<AgentSessionInventoryItem> & Pick<AgentSessionInventoryItem, 'sessionId'>
): AgentSessionInventoryItem {
  return {
    sessionId: overrides.sessionId,
    displayName: overrides.displayName ?? overrides.sessionId,
    agentId: overrides.agentId ?? 'codex',
    agentFamily: overrides.agentFamily ?? 'codex',
    agentName: overrides.agentName ?? 'Codex',
    agentCommand: overrides.agentCommand ?? 'codex',
    repoPath: overrides.repoPath ?? '/repo',
    cwd: overrides.cwd ?? '/repo/worktree',
    environment: overrides.environment ?? 'native',
    status: overrides.status ?? 'idle',
    isActive: overrides.isActive ?? false,
    isRecoverable: overrides.isRecoverable ?? false,
    isStale: overrides.isStale ?? false,
    lastActivityAt: overrides.lastActivityAt ?? 1,
    taskCompletionUnread: overrides.taskCompletionUnread ?? false,
    providerSessionId: overrides.providerSessionId,
    backendSessionId: overrides.backendSessionId,
    task: overrides.task,
  };
}

describe('agent session control center model', () => {
  it('summarizes inventory into operator-facing counts', () => {
    const summary = buildAgentSessionControlSummary([
      inventoryItem({ sessionId: 'running', status: 'running' }),
      inventoryItem({ sessionId: 'waiting', status: 'waiting-for-input' }),
      inventoryItem({ sessionId: 'unread', status: 'unread', taskCompletionUnread: true }),
      inventoryItem({ sessionId: 'dead', status: 'dead', isRecoverable: true }),
      inventoryItem({ sessionId: 'stale', status: 'idle', isStale: true }),
      inventoryItem({
        sessionId: 'task-linked',
        task: {
          id: 'task-1',
          title: 'Fix failing tests',
          priority: 'high',
          status: 'in-progress',
        },
      }),
    ]);

    expect(summary).toEqual({
      total: 6,
      running: 1,
      waitingForInput: 1,
      unread: 1,
      idle: 2,
      dead: 1,
      stale: 1,
      recoverable: 1,
      taskLinked: 1,
      taskCompletionUnread: 1,
      needsAttention: 3,
    });
  });

  it('prioritizes waiting, running, unread, stale, then idle tones', () => {
    expect(
      resolveAgentSessionControlTone(
        buildAgentSessionControlSummary([
          inventoryItem({ sessionId: 'waiting', status: 'waiting-for-input' }),
          inventoryItem({ sessionId: 'running', status: 'running' }),
        ])
      )
    ).toBe('wait');

    expect(
      resolveAgentSessionControlTone(
        buildAgentSessionControlSummary([
          inventoryItem({ sessionId: 'running', status: 'running' }),
        ])
      )
    ).toBe('live');

    expect(
      resolveAgentSessionControlTone(
        buildAgentSessionControlSummary([inventoryItem({ sessionId: 'unread', status: 'unread' })])
      )
    ).toBe('done');

    expect(
      resolveAgentSessionControlTone(
        buildAgentSessionControlSummary([inventoryItem({ sessionId: 'stale', isStale: true })])
      )
    ).toBe('wait');

    expect(
      resolveAgentSessionControlTone(
        buildAgentSessionControlSummary([inventoryItem({ sessionId: 'idle' })])
      )
    ).toBe('idle');
  });

  it('maps runtime statuses to stable labels and chip classes', () => {
    expect(resolveAgentSessionStatusPresentation('running')).toEqual({
      labelKey: 'Running',
      chipClassName: 'control-chip control-chip-live',
    });
    expect(resolveAgentSessionStatusPresentation('waiting-for-input')).toEqual({
      labelKey: 'Waiting',
      chipClassName: 'control-chip control-chip-wait',
    });
    expect(resolveAgentSessionStatusPresentation('dead')).toEqual({
      labelKey: 'Dead',
      chipClassName: 'control-chip',
    });
  });

  it('groups sessions by operator priority and sorts active recent sessions first', () => {
    const sections = buildAgentSessionControlSections([
      inventoryItem({ sessionId: 'idle-old', status: 'idle', lastActivityAt: 1 }),
      inventoryItem({ sessionId: 'running', status: 'running', lastActivityAt: 3 }),
      inventoryItem({ sessionId: 'dead', status: 'dead', lastActivityAt: 4 }),
      inventoryItem({ sessionId: 'waiting', status: 'waiting-for-input', lastActivityAt: 2 }),
      inventoryItem({ sessionId: 'stale', status: 'idle', isStale: true, lastActivityAt: 5 }),
      inventoryItem({
        sessionId: 'idle-active',
        status: 'idle',
        isActive: true,
        lastActivityAt: 0,
      }),
    ]);

    expect(sections.map((section) => section.key)).toEqual([
      'attention',
      'running',
      'idle',
      'dead',
    ]);
    expect(sections[0].items.map((item) => item.sessionId)).toEqual(['stale', 'waiting']);
    expect(sections[2].items.map((item) => item.sessionId)).toEqual(['idle-active', 'idle-old']);
  });

  it('summarizes agent mix and resolves the next operator action', () => {
    const items = [
      inventoryItem({ sessionId: 'codex-1', agentName: 'Codex', agentFamily: 'codex' }),
      inventoryItem({ sessionId: 'codex-2', agentName: 'Codex', agentFamily: 'codex' }),
      inventoryItem({
        sessionId: 'claude-1',
        agentName: 'Claude',
        agentFamily: 'claude',
        status: 'waiting-for-input',
      }),
    ];

    expect(buildAgentSessionAgentSummaries(items)).toEqual([
      { key: 'codex:Codex', label: 'Codex', count: 2 },
      { key: 'claude:Claude', label: 'Claude', count: 1 },
    ]);
    expect(resolveAgentSessionControlActionHint(buildAgentSessionControlSummary(items))).toEqual({
      labelKey: 'Review waiting sessions',
      chipClassName: 'control-chip control-chip-wait',
    });
    expect(resolveAgentSessionControlActionHint(buildAgentSessionControlSummary([]))).toEqual({
      labelKey: 'No active sessions',
      chipClassName: 'control-chip',
    });
  });
});
