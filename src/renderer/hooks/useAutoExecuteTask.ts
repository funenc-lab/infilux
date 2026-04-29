import type { AgentStopNotificationData } from '@shared/types/agent';
import { useCallback, useEffect, useRef } from 'react';
import { normalizePath } from '@/App/storage';
import {
  buildAutoExecutePrompt,
  executeTodoTask,
  handleTodoAutoExecuteStop,
  startTodoAutoExecuteQueue,
} from '@/components/todo/todoAutoExecuteRuntime';
import type { ResolvedAgent } from '@/components/todo/useEnabledAgents';
import { onRendererAgentStop } from '@/lib/agentStopEvents';
import { INITIAL_AUTO_EXECUTE, useTodoStore } from '@/stores/todo';

export { buildAutoExecutePrompt };

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

  // Execute a single task
  const executeTask = useCallback(
    (taskId: string) => {
      executeTodoTask({
        repoPath: repoKey,
        taskId,
        enabledAgents,
        selectedAgentId,
        worktreePath,
        onSwitchToAgent,
      });
    },
    [enabledAgents, onSwitchToAgent, repoKey, selectedAgentId, worktreePath]
  );

  // Handle task completion based on stop notification
  const handleAgentStop = useCallback(
    (data: AgentStopNotificationData) => {
      handleTodoAutoExecuteStop({
        data,
        repoPath: repoKey,
        enabledAgents,
        selectedAgentId,
        worktreePath,
        onSwitchToAgent,
      });
    },
    [enabledAgents, onSwitchToAgent, repoKey, selectedAgentId, worktreePath]
  );

  // Use ref for handler to avoid re-subscription on every callback change
  const handleAgentStopRef = useRef(handleAgentStop);
  useEffect(() => {
    handleAgentStopRef.current = handleAgentStop;
  }, [handleAgentStop]);

  // Start auto-execute with a list of tasks
  const startAutoExecute = useCallback(
    (taskIds: string[]) => {
      startTodoAutoExecuteQueue({
        repoPath: repoKey,
        taskIds,
        enabledAgents,
        selectedAgentId,
        worktreePath,
        onSwitchToAgent,
      });
    },
    [enabledAgents, onSwitchToAgent, repoKey, selectedAgentId, worktreePath]
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
      executeTask(nextTaskId);
      return;
    }

    stopAutoExecute(repoKey);
  }, [advanceQueue, enabledAgents, executeTask, repoKey, stopAutoExecute, updateTask]);

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
