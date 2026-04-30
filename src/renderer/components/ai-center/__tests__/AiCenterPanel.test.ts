/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoTaskContext } from '../../todo/types';
import { AiCenterPanel } from '../AiCenterPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const aiCenterPanelTestDoubles = vi.hoisted(() => {
  const loadAllProjects = vi.fn();
  const updateTask = vi.fn();
  const state = {
    autoExecute: {},
    loadAllProjects,
    tasks: {},
    updateTask,
  };

  function reset() {
    loadAllProjects.mockReset();
    loadAllProjects.mockResolvedValue(undefined);
    updateTask.mockReset();
    state.autoExecute = {};
    state.tasks = {};
  }

  return {
    loadAllProjects,
    reset,
    state,
    updateTask,
  };
});

vi.mock('@/stores/todo', () => ({
  useTodoStore: (selector: (state: typeof aiCenterPanelTestDoubles.state) => unknown) =>
    selector(aiCenterPanelTestDoubles.state),
}));

vi.mock('../../todo/todoAutoExecuteRuntime', () => ({
  handleTodoAutoExecuteStop: vi.fn(),
  startTodoGlobalAutoExecute: vi.fn(),
}));

vi.mock('@/lib/agentStopEvents', () => ({
  onRendererAgentStop: vi.fn(() => () => undefined),
}));

vi.mock('../../todo/useEnabledAgents', () => ({
  useEnabledAgents: () => [],
}));

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

function createTask(overrides: {
  context?: TodoTaskContext;
  id: string;
  status?: 'done' | 'in-progress' | 'todo';
  title: string;
}) {
  return {
    createdAt: 1,
    description: `${overrides.title} description`,
    id: overrides.id,
    order: 0,
    priority: 'high' as const,
    status: overrides.status ?? ('todo' as const),
    title: overrides.title,
    updatedAt: 1,
    ...(overrides.context ? { context: overrides.context } : {}),
  };
}

function renderAiCenterPanel(props: React.ComponentProps<typeof AiCenterPanel>): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(AiCenterPanel, props));
  });
  mountedRoots.push(root);

  return container;
}

const mountedRoots: Root[] = [];

describe('AiCenterPanel', () => {
  beforeEach(() => {
    aiCenterPanelTestDoubles.reset();
    aiCenterPanelTestDoubles.state.tasks = {
      '/repo/current': [
        createTask({
          id: 'task-ready',
          title: 'Implement dispatcher',
        }),
      ],
      '/repo/other': [
        createTask({
          context: {
            dependencyTaskIds: ['task-ready'],
            executionGate: { requiresApproval: true },
            files: [{ path: '/repo/other/docs/migration.md', label: 'migration.md' }],
          },
          id: 'task-approval',
          title: 'Review migration',
        }),
      ],
    };
  });

  afterEach(() => {
    for (const mountedRoot of mountedRoots.splice(0)) {
      act(() => {
        mountedRoot.unmount();
      });
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('loads project tasks and routes AI center task openings back to project todo', () => {
    const onOpenProjectTask = vi.fn();
    const container = renderAiCenterPanel({
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current',
      onOpenProjectTask,
    });

    expect(aiCenterPanelTestDoubles.loadAllProjects).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('AI Center');

    const openButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="Open task"]')
    );
    expect(openButtons).toHaveLength(2);

    act(() => {
      openButtons[1]?.click();
    });

    expect(onOpenProjectTask).toHaveBeenCalledWith('/repo/other', 'task-approval');
  });

  it('approves intervention tasks through the todo store', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const container = renderAiCenterPanel({
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current',
    });

    const approveButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Approve task"]'
    );
    expect(approveButton).not.toBeNull();

    act(() => {
      approveButton?.click();
    });

    expect(aiCenterPanelTestDoubles.updateTask).toHaveBeenCalledWith(
      '/repo/other',
      'task-approval',
      {
        context: {
          dependencyTaskIds: ['task-ready'],
          executionGate: {
            approvedAt: 1700000000000,
            requiresApproval: true,
          },
          files: [{ path: '/repo/other/docs/migration.md', label: 'migration.md' }],
        },
      }
    );
  });
});
