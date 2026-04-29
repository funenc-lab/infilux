/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodoDecisionCenter } from '../TodoDecisionCenter';
import type { TodoDecisionCenterSummary } from '../todoViewModel';

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
    Gauge: icon('Gauge'),
    ListChecks: icon('ListChecks'),
    Play: icon('Play'),
    Route: icon('Route'),
    ShieldCheck: icon('ShieldCheck'),
    Users: icon('Users'),
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, params?: Record<string, string | number>) => {
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

type TodoDecisionCenterTestSummary = TodoDecisionCenterSummary & {
  execution: TodoDecisionCenterSummary['execution'] & {
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

const summary: TodoDecisionCenterTestSummary = {
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

describe('TodoDecisionCenter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders global decision metrics and per-project intervention state', () => {
    const markup = renderToStaticMarkup(React.createElement(TodoDecisionCenter, { summary }));

    expect(markup).toContain('Decision Center');
    expect(markup).toContain('Global Todo');
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
  });

  it('calls the global dispatch handler from the execution overview action', () => {
    const onDispatchReadyTasks = vi.fn();
    const { container, root } = renderInteractive(
      React.createElement(TodoDecisionCenter, {
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
});
