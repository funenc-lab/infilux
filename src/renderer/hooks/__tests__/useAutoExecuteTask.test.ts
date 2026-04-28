/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoTask } from '@/components/todo/types';
import type { ResolvedAgent } from '@/components/todo/useEnabledAgents';
import { emitRendererAgentStop } from '@/lib/agentStopEvents';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useTodoStore } from '@/stores/todo';
import { buildAutoExecutePrompt, useAutoExecuteTask } from '../useAutoExecuteTask';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessSnapshot {
  startAutoExecute?: (taskIds: string[]) => void;
  skipCurrentTask?: () => void;
}

const codexAgent: ResolvedAgent = {
  agentId: 'codex',
  command: 'codex',
  environment: 'native',
  isDefault: true,
  name: 'Codex',
};

const geminiAgent: ResolvedAgent = {
  agentId: 'gemini',
  command: 'gemini',
  environment: 'native',
  isDefault: false,
  name: 'Gemini',
};

let latestSnapshot: HarnessSnapshot = {};
let selectedAutoExecuteAgentId: string | undefined;

function HookHarness() {
  const hook = useAutoExecuteTask(
    '/Repo/Main/',
    '/repo/worktree',
    undefined,
    [codexAgent, geminiAgent],
    selectedAutoExecuteAgentId
  );
  latestSnapshot = {
    startAutoExecute: hook.startAutoExecute,
    skipCurrentTask: hook.skipCurrentTask,
  };
  return React.createElement('div');
}

function mountHookHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(React.createElement(HookHarness));
  });

  return {
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function createTask(id: string, order: number): TodoTask {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    priority: 'medium',
    status: 'todo',
    createdAt: 1,
    updatedAt: 1,
    order,
  };
}

function createTaskWithAgent(id: string, order: number, agentId: string): TodoTask {
  return { ...createTask(id, order), agentId };
}

describe('useAutoExecuteTask', () => {
  beforeEach(() => {
    latestSnapshot = {};
    selectedAutoExecuteAgentId = undefined;
    localStorage.clear();
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValueOnce('session-1').mockReturnValueOnce('session-2'),
    });
    window.electronAPI = {
      notification: {
        onAgentStop: vi.fn(() => vi.fn()),
      },
      todo: {
        updateTask: vi.fn(async () => undefined),
      },
    } as never;
    useTodoStore.setState({
      tasks: {
        '/repo/main': [createTask('task-1', 0), createTask('task-2', 1)],
      },
      _loaded: new Set(['/repo/main']),
      autoExecute: {},
    });
    useAgentSessionsStore.setState({
      sessions: [],
      activeIds: {},
      groupStates: {},
      runtimeStates: {},
      enhancedInputStates: {},
      attachmentTrayStates: {},
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes repo keys and advances non-Claude auto-execute tasks from renderer terminal stop events', async () => {
    const harness = mountHookHarness();

    act(() => {
      latestSnapshot.startAutoExecute?.(['task-1', 'task-2']);
    });

    expect(useAgentSessionsStore.getState().sessions.map((session) => session.id)).toEqual([
      'session-1',
    ]);
    expect(useTodoStore.getState().tasks['/repo/main'][0]).toMatchObject({
      id: 'task-1',
      sessionId: 'session-1',
      status: 'in-progress',
    });

    await act(async () => {
      emitRendererAgentStop({
        sessionId: 'session-1',
        cwd: '/repo/worktree',
        source: 'renderer-terminal',
        taskCompletionStatus: 'completed',
      });
    });

    expect(useTodoStore.getState().tasks['/repo/main'][0]).toMatchObject({
      id: 'task-1',
      status: 'done',
    });
    expect(useTodoStore.getState().tasks['/repo/main'][1]).toMatchObject({
      id: 'task-2',
      sessionId: 'session-2',
      status: 'in-progress',
    });
    expect(useAgentSessionsStore.getState().sessions.map((session) => session.id)).toEqual([
      'session-1',
      'session-2',
    ]);

    harness.unmount();
  });

  it('uses the explicitly selected agent for auto-execute sessions', async () => {
    selectedAutoExecuteAgentId = 'gemini';
    const harness = mountHookHarness();

    act(() => {
      latestSnapshot.startAutoExecute?.(['task-1']);
    });

    expect(useAgentSessionsStore.getState().sessions[0]).toMatchObject({
      id: 'session-1',
      agentId: 'gemini',
      agentCommand: 'gemini',
      name: 'Task: Task task-1',
    });

    harness.unmount();
  });

  it('uses the task-level agent selection when auto-executing a locked task', async () => {
    useTodoStore.setState({
      tasks: {
        '/repo/main': [createTaskWithAgent('task-1', 0, 'gemini')],
      },
      _loaded: new Set(['/repo/main']),
      autoExecute: {},
    });
    const harness = mountHookHarness();

    act(() => {
      latestSnapshot.startAutoExecute?.(['task-1']);
    });

    expect(useAgentSessionsStore.getState().sessions[0]).toMatchObject({
      id: 'session-1',
      agentId: 'gemini',
      agentCommand: 'gemini',
      name: 'Task: Task task-1',
    });

    harness.unmount();
  });

  it('skips the current task and advances to the next queued task', async () => {
    const harness = mountHookHarness();

    act(() => {
      latestSnapshot.startAutoExecute?.(['task-1', 'task-2']);
    });

    act(() => {
      latestSnapshot.skipCurrentTask?.();
    });

    expect(useTodoStore.getState().tasks['/repo/main'][0]).toMatchObject({
      id: 'task-1',
      sessionId: undefined,
      status: 'todo',
    });
    expect(useTodoStore.getState().tasks['/repo/main'][1]).toMatchObject({
      id: 'task-2',
      sessionId: 'session-2',
      status: 'in-progress',
    });
    expect(useTodoStore.getState().autoExecute['/repo/main']).toMatchObject({
      currentSessionId: 'session-2',
      currentTaskId: 'task-2',
      queue: [],
      running: true,
    });

    harness.unmount();
  });

  it('passes structured task context to auto-execute session prompts', () => {
    useTodoStore.setState({
      tasks: {
        '/repo/main': [
          {
            ...createTask('task-1', 0),
            context: {
              repoPath: '/repo/main',
              worktreePath: '/repo/worktree',
              files: [{ path: 'src/renderer/App.tsx', label: 'App.tsx' }],
            },
          },
        ],
      },
      _loaded: new Set(['/repo/main']),
      autoExecute: {},
    });
    const harness = mountHookHarness();

    act(() => {
      latestSnapshot.startAutoExecute?.(['task-1']);
    });

    const pendingCommand = useAgentSessionsStore.getState().sessions[0]?.pendingCommand ?? '';
    expect(pendingCommand).toContain('[TASK CONTEXT]');
    expect(pendingCommand).toContain('Repository: /repo/main');
    expect(pendingCommand).toContain('Worktree: /repo/worktree');
    expect(pendingCommand).toContain('- src/renderer/App.tsx (App.tsx)');

    harness.unmount();
  });

  it('instructs auto-execute agents to verify their work before completion', () => {
    const prompt = buildAutoExecutePrompt('Fix a bug', 'Update the implementation.');

    expect(prompt).toContain('Run the relevant project validation commands');
    expect(prompt).toContain('Do not print the completion marker until validation has passed');
  });

  it('builds prompts with fallback project context and related files', () => {
    const prompt = buildAutoExecutePrompt('Fix a bug', 'Update the implementation.', {
      repoPath: '/repo/main',
      worktreePath: '/repo/worktree',
      files: [{ path: 'src/main/index.ts' }, { path: 'src/renderer/App.tsx', label: 'App.tsx' }],
    });

    expect(prompt).toContain('[TASK CONTEXT]');
    expect(prompt).toContain('Repository: /repo/main');
    expect(prompt).toContain('Worktree: /repo/worktree');
    expect(prompt).toContain('Related files:');
    expect(prompt).toContain('- src/main/index.ts');
    expect(prompt).toContain('- src/renderer/App.tsx (App.tsx)');
  });
});
