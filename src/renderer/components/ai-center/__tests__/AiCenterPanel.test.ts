/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTodoGlobalAutoExecute } from '../../todo/todoAutoExecuteRuntime';
import type { TodoTaskContext } from '../../todo/types';
import { AiCenterPanel } from '../AiCenterPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const aiCenterPanelTestDoubles = vi.hoisted(() => {
  const addSession = vi.fn();
  const loadAllProjects = vi.fn();
  const updateTask = vi.fn();
  const enabledAgents = [] as Array<{
    agentId: string;
    command: string;
    environment: 'hapi' | 'happy' | 'native';
    isDefault: boolean;
    name: string;
    customPath?: string;
    customArgs?: string;
  }>;
  const state = {
    autoExecute: {},
    loadAllProjects,
    tasks: {},
    updateTask,
  };

  function reset() {
    addSession.mockReset();
    enabledAgents.splice(0);
    loadAllProjects.mockReset();
    loadAllProjects.mockResolvedValue(undefined);
    updateTask.mockReset();
    state.autoExecute = {};
    state.tasks = {};
  }

  return {
    addSession,
    enabledAgents,
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

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: {
    getState: () => ({
      addSession: aiCenterPanelTestDoubles.addSession,
    }),
  },
}));

vi.mock('../../todo/todoAutoExecuteRuntime', () => ({
  handleTodoAutoExecuteStop: vi.fn(),
  startTodoGlobalAutoExecute: vi.fn(() => ({
    skippedTasks: [],
    startedCount: 0,
    startedProjects: [],
  })),
}));

vi.mock('@/lib/agentStopEvents', () => ({
  onRendererAgentStop: vi.fn(() => () => undefined),
}));

vi.mock('../../todo/useEnabledAgents', () => ({
  useEnabledAgents: () => aiCenterPanelTestDoubles.enabledAgents,
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
    vi.stubGlobal('crypto', {
      randomUUID: () => 'session-ai-center',
    });
    window.electronAPI = {
      notification: {
        onAgentStop: vi.fn(() => () => undefined),
      },
    } as never;
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
    vi.unstubAllGlobals();
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

  it('opens an AI Center decision session with cross-project orchestration context', () => {
    const onSwitchToAgent = vi.fn();
    aiCenterPanelTestDoubles.enabledAgents.push({
      agentId: 'codex',
      command: 'codex',
      environment: 'native',
      isDefault: true,
      name: 'Codex CLI',
    });
    const container = renderAiCenterPanel({
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current/worktree',
      onSwitchToAgent,
    });

    const askButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Ask AI Center"]'
    );
    expect(askButton).not.toBeNull();
    expect(askButton?.disabled).toBe(false);

    act(() => {
      askButton?.click();
    });

    expect(aiCenterPanelTestDoubles.addSession).toHaveBeenCalledTimes(1);
    expect(aiCenterPanelTestDoubles.addSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-ai-center',
        sessionId: 'session-ai-center',
        name: 'AI Center',
        userRenamed: true,
        agentId: 'codex',
        agentCommand: 'codex',
        initialized: false,
        repoPath: '/repo/current',
        cwd: '/repo/current/worktree',
        environment: 'native',
        pendingCommand: expect.stringContaining('[AI CENTER CONTEXT]'),
      })
    );
    const session = aiCenterPanelTestDoubles.addSession.mock.calls[0]?.[0];
    expect(session?.pendingCommand).toContain('Recommended action: dispatch-ready');
    expect(session?.pendingCommand).toContain('- current: ready, open 1, ready 1, blocked 0');
    expect(session?.pendingCommand).toContain('- other: blocked, open 1, ready 0, blocked 1');
    expect(onSwitchToAgent).toHaveBeenCalledTimes(1);
  });

  it('dispatches only startable idle-project tasks while another project is running', () => {
    const onSwitchToAgent = vi.fn();
    aiCenterPanelTestDoubles.enabledAgents.push({
      agentId: 'codex',
      command: 'codex',
      environment: 'native',
      isDefault: true,
      name: 'Codex CLI',
    });
    aiCenterPanelTestDoubles.state.tasks = {
      '/repo/current': [
        createTask({
          id: 'task-running',
          status: 'in-progress',
          title: 'Apply schema change',
        }),
        createTask({
          id: 'task-current-ready',
          title: 'Refine running project follow-up',
        }),
      ],
      '/repo/other': [
        createTask({
          id: 'task-other-ready',
          title: 'Implement idle project work',
        }),
      ],
    };
    aiCenterPanelTestDoubles.state.autoExecute = {
      '/repo/current': {
        running: true,
        queue: ['task-current-ready'],
        currentTaskId: 'task-running',
        currentSessionId: 'session-running',
      },
    };
    const container = renderAiCenterPanel({
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current/worktree',
      onSwitchToAgent,
    });

    const dispatchButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dispatch ready tasks"]'
    );
    expect(dispatchButton).not.toBeNull();
    expect(dispatchButton?.disabled).toBe(false);

    act(() => {
      dispatchButton?.click();
    });

    expect(startTodoGlobalAutoExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchableTasks: [
          expect.objectContaining({
            repoPath: '/repo/other',
            taskId: 'task-other-ready',
          }),
        ],
      })
    );
    expect(startTodoGlobalAutoExecute).not.toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchableTasks: expect.arrayContaining([
          expect.objectContaining({
            repoPath: '/repo/current',
            taskId: 'task-current-ready',
          }),
        ]),
      })
    );
  });

  it('shows the latest global dispatch result after dispatching tasks', () => {
    vi.mocked(startTodoGlobalAutoExecute).mockReturnValueOnce({
      skippedTasks: [
        {
          repoPath: '/repo/current',
          taskId: 'task-current-ready',
          reason: 'project-running',
        },
      ],
      startedCount: 1,
      startedProjects: [{ repoPath: '/repo/other', taskIds: ['task-other-ready'] }],
    });
    aiCenterPanelTestDoubles.enabledAgents.push({
      agentId: 'codex',
      command: 'codex',
      environment: 'native',
      isDefault: true,
      name: 'Codex CLI',
    });
    aiCenterPanelTestDoubles.state.tasks = {
      '/repo/other': [
        createTask({
          id: 'task-other-ready',
          title: 'Implement idle project work',
        }),
      ],
    };
    const container = renderAiCenterPanel({
      currentRepoPath: '/repo/current',
      currentWorktreePath: '/repo/current/worktree',
    });

    const dispatchButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dispatch ready tasks"]'
    );

    act(() => {
      dispatchButton?.click();
    });

    expect(container.textContent).toContain('Dispatch Result');
    expect(container.textContent).toContain('1 projects started');
    expect(container.textContent).toContain('/repo/other');
    expect(container.textContent).toContain('task-other-ready');
    expect(container.textContent).toContain('Project already running');
  });
});
