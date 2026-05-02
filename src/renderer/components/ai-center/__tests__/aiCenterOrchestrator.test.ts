import { describe, expect, it } from 'vitest';
import type { AiCenterSummary } from '../../todo/todoViewModel';
import type { ResolvedAgent } from '../../todo/useEnabledAgents';
import { buildAiCenterDecisionPlan, buildAiCenterSessionPrompt } from '../aiCenterOrchestrator';

function agent(overrides: Partial<ResolvedAgent> & Pick<ResolvedAgent, 'agentId'>): ResolvedAgent {
  return {
    agentId: overrides.agentId,
    command: overrides.command ?? overrides.agentId,
    environment: overrides.environment ?? 'native',
    isDefault: overrides.isDefault ?? false,
    name: overrides.name ?? overrides.agentId,
    ...(overrides.customPath ? { customPath: overrides.customPath } : {}),
    ...(overrides.customArgs ? { customArgs: overrides.customArgs } : {}),
  };
}

const summary: AiCenterSummary = {
  projectCount: 2,
  totalTaskCount: 7,
  openTaskCount: 5,
  readyTaskCount: 3,
  blockedTaskCount: 1,
  approvalPendingTaskCount: 1,
  dependencyBlockedTaskCount: 0,
  runningTaskCount: 1,
  runningProjectCount: 1,
  execution: {
    nextAction: 'dispatch-ready',
    dispatchableTasks: [
      {
        repoPath: '/repo/current',
        repoName: 'current',
        taskId: 'api',
        title: 'Implement API validation',
        priority: 'high',
        agentId: 'codex',
        agentLabel: 'Codex CLI',
        isCurrentProject: true,
      },
      {
        repoPath: '/repo/other',
        repoName: 'other',
        taskId: 'audit',
        title: 'Review auth flow',
        priority: 'medium',
        agentId: 'claude',
        agentLabel: 'Claude Code',
        isCurrentProject: false,
      },
      {
        repoPath: '/repo/other',
        repoName: 'other',
        taskId: 'docs',
        title: 'Research deployment docs',
        priority: 'low',
        agentId: 'gemini',
        agentLabel: 'Gemini CLI',
        isCurrentProject: false,
      },
    ],
    interventionTasks: [
      {
        repoPath: '/repo/current',
        repoName: 'current',
        taskId: 'approval',
        title: 'Approve migration',
        reasons: ['approval'],
        dependencyTaskIds: [],
        isCurrentProject: true,
      },
    ],
    runningTasks: [
      {
        repoPath: '/repo/current',
        repoName: 'current',
        taskId: 'running',
        title: 'Apply schema change',
        agentId: 'codex',
        agentLabel: 'Codex CLI',
        sessionId: 'session-running',
        isCurrentProject: true,
      },
    ],
    agentLoads: [
      {
        agentId: 'codex',
        label: 'Codex CLI',
        projectCount: 1,
        readyTaskCount: 1,
        runningTaskCount: 1,
      },
      {
        agentId: 'claude',
        label: 'Claude Code',
        projectCount: 1,
        readyTaskCount: 1,
        runningTaskCount: 0,
      },
    ],
  },
  projects: [
    {
      repoPath: '/repo/current',
      repoName: 'current',
      isCurrent: true,
      status: 'running',
      totalTaskCount: 4,
      openTaskCount: 3,
      completionPercent: 25,
      statusCounts: {
        todo: 2,
        'in-progress': 1,
        done: 1,
      },
      readyTaskCount: 1,
      blockedTaskCount: 1,
      approvalPendingTaskCount: 1,
      dependencyBlockedTaskCount: 0,
      runningTaskCount: 1,
      autoExecuteRunning: true,
    },
    {
      repoPath: '/repo/other',
      repoName: 'other',
      isCurrent: false,
      status: 'ready',
      totalTaskCount: 3,
      openTaskCount: 2,
      completionPercent: 33,
      statusCounts: {
        todo: 2,
        'in-progress': 0,
        done: 1,
      },
      readyTaskCount: 2,
      blockedTaskCount: 0,
      approvalPendingTaskCount: 0,
      dependencyBlockedTaskCount: 0,
      runningTaskCount: 0,
      autoExecuteRunning: false,
    },
  ],
};

describe('aiCenterOrchestrator', () => {
  it('builds a deterministic cross-project decision plan with dispatch batches and risks', () => {
    const plan = buildAiCenterDecisionPlan({
      agents: [agent({ agentId: 'codex', name: 'Codex CLI' }), agent({ agentId: 'claude' })],
      summary,
    });

    expect(plan.headline).toBe('Dispatch ready tasks');
    expect(plan.recommendedAction).toBe('dispatch-ready');
    expect(plan.confidence).toBe('medium');
    expect(plan.dispatchBatches).toEqual([
      {
        agentId: 'codex',
        agentLabel: 'Codex CLI',
        tasks: [
          expect.objectContaining({
            repoPath: '/repo/current',
            taskId: 'api',
            title: 'Implement API validation',
          }),
        ],
      },
      {
        agentId: 'claude',
        agentLabel: 'Claude Code',
        tasks: [
          expect.objectContaining({
            repoPath: '/repo/other',
            taskId: 'audit',
            title: 'Review auth flow',
          }),
        ],
      },
      {
        agentId: 'gemini',
        agentLabel: 'Gemini CLI',
        tasks: [
          expect.objectContaining({
            repoPath: '/repo/other',
            taskId: 'docs',
            title: 'Research deployment docs',
          }),
        ],
      },
    ]);
    expect(plan.interventionItems).toHaveLength(1);
    expect(plan.monitoringItems).toHaveLength(1);
    expect(plan.coordinationSignals).toEqual([
      expect.objectContaining({
        id: 'cross-project-dispatch',
        kind: 'cross-project',
        severity: 'medium',
      }),
      expect.objectContaining({
        id: 'agent-reassignment',
        kind: 'agent-coverage',
        severity: 'high',
      }),
      expect.objectContaining({
        id: 'intervention-queue',
        kind: 'intervention',
        severity: 'high',
      }),
      expect.objectContaining({
        id: 'active-monitoring',
        kind: 'monitoring',
        severity: 'medium',
      }),
      expect.objectContaining({
        id: 'task-splitting',
        kind: 'task-splitting',
        severity: 'low',
      }),
    ]);
    expect(plan.riskItems).toEqual([
      expect.objectContaining({ id: 'blocked-tasks', severity: 'medium' }),
      expect.objectContaining({ id: 'agent-coverage', severity: 'medium' }),
    ]);
  });

  it('builds a session prompt that includes project state and recommended actions', () => {
    const plan = buildAiCenterDecisionPlan({
      agents: [agent({ agentId: 'codex', name: 'Codex CLI' })],
      summary,
    });

    const prompt = buildAiCenterSessionPrompt({
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current/worktree',
      plan,
      summary,
    });

    expect(prompt).toContain('[AI CENTER CONTEXT]');
    expect(prompt).toContain('Current repository: /repo/current');
    expect(prompt).toContain('Recommended action: dispatch-ready');
    expect(prompt).toContain('- current: running, open 3, ready 1, blocked 1');
    expect(prompt).toContain('- [Codex CLI] current/api: Implement API validation');
    expect(prompt).toContain('- [approval] current/approval: Approve migration');
    expect(prompt).toContain('[COORDINATION SIGNALS]');
    expect(prompt).toContain(
      '- [agent-coverage/high] Reassign unavailable agent tasks: claude, gemini'
    );
    expect(prompt).toContain(
      '- [cross-project/medium] Coordinate cross-project dispatch: 2 projects have ready tasks'
    );
    expect(prompt).toContain('Use the current project Todo tasks as source of truth.');
  });
});
