/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiCenterSummary } from '../../todo/todoViewModel';
import { AiCenterView } from '../AiCenterView';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-icon': name });

  return {
    Activity: icon('Activity'),
    AlertTriangle: icon('AlertTriangle'),
    CheckCircle2: icon('CheckCircle2'),
    CircleDot: icon('CircleDot'),
    ClipboardList: icon('ClipboardList'),
    FolderGit2: icon('FolderGit2'),
    BrainCircuit: icon('BrainCircuit'),
    ListChecks: icon('ListChecks'),
    MessageSquareText: icon('MessageSquareText'),
    Play: icon('Play'),
    Route: icon('Route'),
    ShieldCheck: icon('ShieldCheck'),
    Users: icon('Users'),
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, params?: Record<string, string | number>) => {
      if (value === 'Approval Required') return 'Approval label';
      if (!params) return value;
      return value.replace(/\{\{(\w+)\}\}/g, (match, token) =>
        params[token] === undefined ? match : String(params[token])
      );
    },
  }),
}));

function renderInteractive(element: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { container, root };
}

function getLabeledGroup(container: HTMLElement, label: string): HTMLElement {
  const group = Array.from(container.querySelectorAll<HTMLElement>('[role="group"]')).find(
    (element) => element.getAttribute('aria-label') === label
  );

  if (!group) {
    throw new Error(`Missing group: ${label}`);
  }

  return group;
}

type AiCenterTestSummary = AiCenterSummary & {
  execution: AiCenterSummary['execution'] & {
    runningTasks: Array<{
      repoPath: string;
      repoName: string;
      isCurrentProject: boolean;
      taskId: string;
      title: string;
      agentId: string;
      agentLabel: string;
      sessionId?: string;
    }>;
  };
};

const summary: AiCenterTestSummary = {
  projectCount: 2,
  totalTaskCount: 7,
  openTaskCount: 5,
  readyTaskCount: 2,
  blockedTaskCount: 2,
  approvalPendingTaskCount: 1,
  dependencyBlockedTaskCount: 1,
  runningTaskCount: 1,
  runningProjectCount: 1,
  execution: {
    nextAction: 'dispatch-ready',
    dispatchableTasks: [
      {
        repoPath: '/repo/current',
        repoName: 'current',
        taskId: 'task-ready',
        title: 'Implement dispatcher',
        priority: 'high',
        agentId: 'codex',
        agentLabel: 'codex',
        isCurrentProject: true,
      },
    ],
    interventionTasks: [
      {
        repoPath: '/repo/other',
        repoName: 'other',
        taskId: 'task-approval',
        title: 'Review migration',
        reasons: ['approval'],
        dependencyTaskIds: [],
        isCurrentProject: false,
      },
      {
        repoPath: '/repo/other',
        repoName: 'other',
        taskId: 'task-dependency',
        title: 'Unblock release task',
        reasons: ['dependency'],
        dependencyTaskIds: ['task-approval'],
        isCurrentProject: false,
      },
    ],
    runningTasks: [
      {
        repoPath: '/repo/current',
        repoName: 'current',
        taskId: 'task-running',
        title: 'Apply schema change',
        agentId: 'auto',
        agentLabel: 'Auto Select',
        sessionId: 'session-running',
        isCurrentProject: true,
      },
    ],
    agentLoads: [
      {
        agentId: 'codex',
        label: 'codex',
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
      status: 'blocked',
      totalTaskCount: 3,
      openTaskCount: 2,
      completionPercent: 33,
      statusCounts: {
        todo: 2,
        'in-progress': 0,
        done: 1,
      },
      readyTaskCount: 1,
      blockedTaskCount: 1,
      approvalPendingTaskCount: 0,
      dependencyBlockedTaskCount: 1,
      runningTaskCount: 0,
      autoExecuteRunning: false,
    },
  ],
};

const decisionPlan = {
  confidence: 'medium' as const,
  dispatchBatches: [
    {
      agentId: 'codex',
      agentLabel: 'Codex CLI',
      tasks: [
        {
          repoPath: '/repo/current',
          repoName: 'current',
          taskId: 'task-ready',
          title: 'Implement dispatcher',
          priority: 'high',
        },
      ],
    },
  ],
  headline: 'Dispatch ready tasks',
  coordinationSignals: [
    {
      id: 'cross-project-dispatch',
      kind: 'cross-project' as const,
      severity: 'medium' as const,
      label: 'Coordinate cross-project dispatch',
      detail: '2 projects have ready tasks',
    },
    {
      id: 'agent-reassignment',
      kind: 'agent-coverage' as const,
      severity: 'high' as const,
      label: 'Reassign unavailable agent tasks',
      detail: 'gemini',
    },
  ],
  interventionItems: [
    {
      id: '/repo/other:task-approval',
      label: 'Review migration',
      detail: 'other: approval',
      reasonLabelKeys: ['Approval Required'],
    },
  ],
  monitoringItems: [
    {
      id: '/repo/current:task-running',
      label: 'Apply schema change',
      detail: 'current: Auto Select',
    },
  ],
  recommendedAction: 'dispatch-ready' as const,
  riskItems: [
    {
      id: 'blocked-tasks',
      severity: 'medium' as const,
      label: 'Blocked tasks need intervention',
      detail: '2 blocked, 1 approvals, 1 dependencies',
    },
  ],
};

describe('AiCenterView', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders AI center metrics and per-project intervention state', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AiCenterView, { decisionPlan, summary })
    );

    expect(markup).toContain('AI Center');
    expect(markup).toContain('Cross-project AI orchestration');
    expect(markup).toContain('Loaded Projects');
    expect(markup).toContain('Open Tasks');
    expect(markup).toContain('Ready Tasks');
    expect(markup).toContain('Blocked Tasks');
    expect(markup).toContain('Approvals');
    expect(markup).toContain('Running Projects');
    expect(markup).toContain('Execution Overview');
    expect(markup).toContain('Dispatch Next');
    expect(markup).toContain('Ready to Dispatch');
    expect(markup).toContain('Implement dispatcher');
    expect(markup).toContain('Needs Intervention');
    expect(markup).toContain('Review migration');
    expect(markup).toContain('Unblock release task');
    expect(markup).toContain('Running Now');
    expect(markup).toContain('Apply schema change');
    expect(markup).toContain('1 active');
    expect(markup).toContain('Agent Load');
    expect(markup).toContain('codex');
    expect(markup).toContain('current');
    expect(markup).toContain('/repo/current');
    expect(markup).toContain('Current');
    expect(markup).toContain('Running');
    expect(markup).toContain('other');
    expect(markup).toContain('Dependencies');
    expect(markup).toContain('Decision Plan');
    expect(markup).toContain('Recommended Action');
    expect(markup).toContain('Medium confidence');
    expect(markup).toContain('Dispatch Plan');
    expect(markup).toContain('Codex CLI');
    expect(markup).toContain('Approval label');
    expect(markup).toContain('Coordination Signals');
    expect(markup).toContain('Coordinate cross-project dispatch');
    expect(markup).toContain('Reassign unavailable agent tasks');
    expect(markup).toContain('agent-coverage');
    expect(markup).toContain('Risk Review');
    expect(markup).toContain('Blocked tasks need intervention');
  });

  it('renders decision worklist items in their matching queues', () => {
    const { container, root } = renderInteractive(
      React.createElement(AiCenterView, { decisionPlan, summary })
    );

    const decisionWorklist = getLabeledGroup(container, 'Decision Worklist');
    expect(decisionWorklist.textContent).toContain('2 items');

    const interventionQueue = getLabeledGroup(decisionWorklist, 'Intervention Queue');
    expect(interventionQueue.textContent).toContain('Review migration');
    expect(interventionQueue.textContent).toContain('Approval label');
    expect(interventionQueue.textContent).not.toContain('approval');
    expect(interventionQueue.textContent).not.toContain('Apply schema change');

    const monitoringQueue = getLabeledGroup(decisionWorklist, 'Monitoring Queue');
    expect(monitoringQueue.textContent).toContain('Apply schema change');
    expect(monitoringQueue.textContent).toContain('current: Auto Select');
    expect(monitoringQueue.textContent).not.toContain('Review migration');

    act(() => {
      root.unmount();
    });
  });

  it('opens the AI Center decision chat from the decision plan', () => {
    const onOpenDecisionChat = vi.fn();
    const { container, root } = renderInteractive(
      React.createElement(AiCenterView, {
        decisionPlan,
        summary,
        canOpenDecisionChat: true,
        onOpenDecisionChat,
      })
    );

    const askButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Ask AI Center"]'
    );
    expect(askButton).not.toBeNull();
    expect(askButton?.disabled).toBe(false);

    act(() => {
      askButton?.click();
    });

    expect(onOpenDecisionChat).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('calls the global dispatch handler from the execution overview action', () => {
    const onDispatchReadyTasks = vi.fn();
    const { container, root } = renderInteractive(
      React.createElement(AiCenterView, {
        summary,
        canDispatchReadyTasks: true,
        onDispatchReadyTasks,
      })
    );

    const dispatchButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dispatch ready tasks"]'
    );
    expect(dispatchButton).not.toBeNull();
    expect(dispatchButton?.disabled).toBe(false);

    act(() => {
      dispatchButton?.click();
    });

    expect(onDispatchReadyTasks).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('calls global intervention handlers from approval and dependency actions', () => {
    const onApproveTask = vi.fn();
    const onFocusTask = vi.fn();
    const { container, root } = renderInteractive(
      React.createElement(AiCenterView, {
        summary,
        onApproveTask,
        onFocusTask,
      })
    );

    const approveButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Approve task"]'
    );
    const reviewButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Review task"]'
    );
    expect(approveButton).not.toBeNull();
    expect(reviewButton).not.toBeNull();

    act(() => {
      approveButton?.click();
      reviewButton?.click();
    });

    expect(onApproveTask).toHaveBeenCalledWith('/repo/other', 'task-approval');
    expect(onFocusTask).toHaveBeenCalledWith('/repo/other', 'task-dependency');

    act(() => {
      root.unmount();
    });
  });

  it('opens task details from every global execution lane', () => {
    const onOpenTask = vi.fn();
    const { container, root } = renderInteractive(
      React.createElement(AiCenterView, {
        summary,
        onOpenTask,
      })
    );

    const openButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="Open task"]')
    );
    expect(openButtons).toHaveLength(4);

    act(() => {
      for (const button of openButtons) {
        button.click();
      }
    });

    expect(onOpenTask).toHaveBeenNthCalledWith(1, '/repo/current', 'task-ready');
    expect(onOpenTask).toHaveBeenNthCalledWith(2, '/repo/other', 'task-approval');
    expect(onOpenTask).toHaveBeenNthCalledWith(3, '/repo/other', 'task-dependency');
    expect(onOpenTask).toHaveBeenNthCalledWith(4, '/repo/current', 'task-running');

    act(() => {
      root.unmount();
    });
  });
});
