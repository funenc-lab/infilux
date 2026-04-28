import type { AgentStopNotificationData } from '@shared/types/agent';
import { TASK_COMPLETION_MARKER } from '@shared/types/agent';
import { useCallback, useEffect, useRef } from 'react';
import { normalizePath } from '@/App/storage';
import { resolveAutoExecuteAgentChoice } from '@/components/todo/agentCapabilities';
import {
  buildTodoTaskExecutionContext,
  buildTodoTaskPrompt,
} from '@/components/todo/todoTaskContext';
import type { TodoTaskContext } from '@/components/todo/types';
import type { ResolvedAgent } from '@/components/todo/useEnabledAgents';
import { onRendererAgentStop } from '@/lib/agentStopEvents';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { INITIAL_AUTO_EXECUTE, useTodoStore } from '@/stores/todo';

/**
 * Find the UI session ID matching a Claude CLI session ID.
 * Claude CLI session ID (from hooks) differs from our UI session ID (crypto.randomUUID).
 */
function findUISessionId(cliSessionId: string): string | undefined {
  const session = useAgentSessionsStore
    .getState()
    .sessions.find((s) => s.sessionId === cliSessionId || s.id === cliSessionId);
  return session?.id;
}

function isClaudeLikeSession(sessionId: string | undefined): boolean {
  if (!sessionId) {
    return false;
  }

  const session = useAgentSessionsStore.getState().sessions.find((item) => item.id === sessionId);
  const agentId = session?.agentId.toLowerCase() ?? '';
  const agentCommand = session?.agentCommand.toLowerCase().trim() ?? '';
  return (
    agentId === 'claude' ||
    agentId.startsWith('claude-') ||
    agentCommand === 'claude' ||
    agentCommand.startsWith('claude ')
  );
}

/**
 * Build prompt with auto-execute rules
 */
export function buildAutoExecutePrompt(
  title: string,
  description?: string,
  context?: TodoTaskContext
): string {
  const taskPrompt = buildTodoTaskPrompt(title, description, context);
  return `
${taskPrompt}

---
[AUTO-EXECUTE RULES - MUST FOLLOW]
1. When task is complete, output the following marker on a separate line at the end of your response: ${TASK_COMPLETION_MARKER}
2. Do NOT call AskUserQuestion tool. Do NOT ask user to choose options. Directly select and execute the best approach.
3. Solve problems autonomously. Do NOT interrupt the workflow to wait for user input.
4. Run the relevant project validation commands before completion, such as typecheck, lint, tests, or the nearest targeted equivalent.
5. Do not print the completion marker until validation has passed or you have clearly reported the blocking validation failure.
`.trim();
}

/**
 * Hook to manage auto-execute task completion detection
 *
 * Listens for agent stop events and:
 * 1. Marks current task as done
 * 2. Advances to next task in queue
 */
export function useAutoExecuteTask(
  repoPath: string,
  worktreePath: string | undefined,
  onSwitchToAgent?: () => void,
  enabledAgents?: ResolvedAgent[],
  selectedAgentId?: string
) {
  const repoKey = normalizePath(repoPath);
  const autoExecute = useTodoStore((s) => s.autoExecute[repoKey] ?? INITIAL_AUTO_EXECUTE);
  const advanceQueue = useTodoStore((s) => s.advanceQueue);
  const stopAutoExecute = useTodoStore((s) => s.stopAutoExecute);
  const updateTask = useTodoStore((s) => s.updateTask);
  const setCurrentExecution = useTodoStore((s) => s.setCurrentExecution);

  // Use ref to break circular dependency between handleAgentStop and executeTask
  const executeTaskRef = useRef<(taskId: string) => void>(() => {});

  // Execute a single task
  const executeTask = useCallback(
    (taskId: string) => {
      if (!enabledAgents || enabledAgents.length === 0) {
        stopAutoExecute(repoKey);
        return;
      }

      const tasks = useTodoStore.getState().tasks[repoKey] ?? [];
      const task = tasks.find((t) => t.id === taskId);
      if (!task) {
        // Task was deleted - skip to next in queue
        const nextTaskId = advanceQueue(repoKey);
        if (nextTaskId) {
          executeTaskRef.current(nextTaskId);
        } else {
          stopAutoExecute(repoKey);
        }
        return;
      }

      const taskExecutionContext = buildTodoTaskExecutionContext(task, {
        repoPath: repoKey,
        worktreePath,
      });
      const executionWorktreePath = taskExecutionContext?.worktreePath ?? worktreePath;
      if (!executionWorktreePath) {
        stopAutoExecute(repoKey);
        return;
      }

      // Build prompt with auto-execute rules
      const taskContext = buildAutoExecutePrompt(
        task.title,
        task.description,
        taskExecutionContext
      );

      const agentChoice = resolveAutoExecuteAgentChoice({
        agents: enabledAgents,
        selectedAgentId,
        tasks: [task],
      });
      const agent =
        agentChoice.agent ?? enabledAgents.find((item) => item.isDefault) ?? enabledAgents[0];

      const sessionId = crypto.randomUUID();

      // Create session via store action (handles displayOrder, activeIds, enhancedInputStates)
      useAgentSessionsStore.getState().addSession({
        id: sessionId,
        sessionId,
        name: `Task: ${task.title}`,
        userRenamed: true,
        agentId: agent.agentId,
        agentCommand: agent.command,
        customPath: agent.customPath,
        customArgs: agent.customArgs,
        initialized: false,
        repoPath: repoKey,
        cwd: executionWorktreePath,
        environment: agent.environment,
        pendingCommand: taskContext,
      });

      // Update task status and link session
      updateTask(repoKey, taskId, { status: 'in-progress', sessionId });
      setCurrentExecution(repoKey, taskId, sessionId);

      onSwitchToAgent?.();
    },
    [
      repoKey,
      worktreePath,
      enabledAgents,
      selectedAgentId,
      updateTask,
      setCurrentExecution,
      onSwitchToAgent,
      stopAutoExecute,
      advanceQueue,
    ]
  );

  // Keep ref in sync to avoid circular dependency in handleAgentStop
  useEffect(() => {
    executeTaskRef.current = executeTask;
  }, [executeTask]);

  // Handle task completion based on stop notification
  const handleAgentStop = useCallback(
    (data: AgentStopNotificationData) => {
      // Read latest state to avoid stale closure
      const currentAutoExecute =
        useTodoStore.getState().autoExecute[repoKey] ?? INITIAL_AUTO_EXECUTE;

      if (!currentAutoExecute.running) return;

      // Match CLI session ID to our UI session ID
      const uiSessionId = findUISessionId(data.sessionId);
      if (uiSessionId !== currentAutoExecute.currentSessionId) return;

      const currentTaskId = currentAutoExecute.currentTaskId;
      if (!currentTaskId) return;

      if (
        data.source === 'renderer-terminal' &&
        data.taskCompletionStatus !== 'completed' &&
        isClaudeLikeSession(uiSessionId)
      ) {
        return;
      }

      if (data.taskCompletionStatus === 'completed') {
        // Completion marker detected - mark done and advance
        updateTask(repoKey, currentTaskId, { status: 'done', sessionId: undefined });
        const nextTaskId = advanceQueue(repoKey);
        if (nextTaskId && enabledAgents && enabledAgents.length > 0) {
          executeTaskRef.current(nextTaskId);
        } else {
          stopAutoExecute(repoKey);
        }
      } else {
        // No completion marker - revert task and stop
        updateTask(repoKey, currentTaskId, { status: 'todo', sessionId: undefined });
        stopAutoExecute(repoKey);
      }
    },
    [repoKey, updateTask, advanceQueue, stopAutoExecute, enabledAgents]
  );

  // Use ref for handler to avoid re-subscription on every callback change
  const handleAgentStopRef = useRef(handleAgentStop);
  useEffect(() => {
    handleAgentStopRef.current = handleAgentStop;
  }, [handleAgentStop]);

  // Start auto-execute with a list of tasks
  const startAutoExecute = useCallback(
    (taskIds: string[]) => {
      if (taskIds.length === 0 || !enabledAgents || enabledAgents.length === 0) {
        return;
      }

      const [firstTaskId, ...rest] = taskIds;

      // Queue only remaining tasks (exclude the first one being executed now)
      useTodoStore.getState().startAutoExecute(repoKey, rest);

      // Execute first task
      executeTask(firstTaskId);
    },
    [repoKey, enabledAgents, executeTask]
  );

  // Stop auto-execute
  const stop = useCallback(() => {
    stopAutoExecute(repoKey);
  }, [repoKey, stopAutoExecute]);

  const skipCurrentTask = useCallback(() => {
    const currentAutoExecute = useTodoStore.getState().autoExecute[repoKey] ?? INITIAL_AUTO_EXECUTE;

    if (!currentAutoExecute.running || !currentAutoExecute.currentTaskId) {
      return;
    }

    updateTask(repoKey, currentAutoExecute.currentTaskId, {
      status: 'todo',
      sessionId: undefined,
    });

    const nextTaskId = advanceQueue(repoKey);
    if (nextTaskId && enabledAgents && enabledAgents.length > 0) {
      executeTaskRef.current(nextTaskId);
      return;
    }

    stopAutoExecute(repoKey);
  }, [advanceQueue, enabledAgents, repoKey, stopAutoExecute, updateTask]);

  // Reorder queue
  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      useTodoStore.getState().reorderAutoExecuteQueue(repoKey, fromIndex, toIndex);
    },
    [repoKey]
  );

  // Remove from queue
  const removeFromQueue = useCallback(
    (taskId: string) => {
      useTodoStore.getState().removeFromAutoExecuteQueue(repoKey, taskId);
    },
    [repoKey]
  );

  // Listen for agent stop events - only subscribe when running
  useEffect(() => {
    if (!autoExecute?.running) return;

    const unsubscribeMain = window.electronAPI.notification.onAgentStop((data) =>
      handleAgentStopRef.current(data)
    );
    const unsubscribeRenderer = onRendererAgentStop((data) => handleAgentStopRef.current(data));
    return () => {
      unsubscribeMain();
      unsubscribeRenderer();
    };
  }, [autoExecute?.running]);

  return {
    autoExecute,
    startAutoExecute,
    stop,
    skipCurrentTask,
    reorderQueue,
    removeFromQueue,
    executeTask,
  };
}
