import type { AgentStopNotificationData } from '@shared/types/agent';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { normalizePath } from '@/App/storage';
import { onRendererAgentStop } from '@/lib/agentStopEvents';
import { useTodoStore } from '@/stores/todo';
import {
  handleTodoAutoExecuteStop,
  startTodoGlobalAutoExecute,
} from '../todo/todoAutoExecuteRuntime';
import { buildApprovedTodoTaskContext } from '../todo/todoTaskContext';
import { buildAiCenterSummary } from '../todo/todoViewModel';
import { useEnabledAgents } from '../todo/useEnabledAgents';
import { AiCenterView } from './AiCenterView';

export interface AiCenterPanelProps {
  currentRepoPath?: string;
  currentWorktreePath?: string;
  isActive?: boolean;
  onOpenProjectTask?: (repoPath: string, taskId: string) => void;
  onSwitchToAgent?: () => void;
}

export function AiCenterPanel({
  currentRepoPath,
  currentWorktreePath,
  onOpenProjectTask,
  onSwitchToAgent,
}: AiCenterPanelProps) {
  const tasksByRepo = useTodoStore((state) => state.tasks);
  const autoExecuteByRepo = useTodoStore((state) => state.autoExecute);
  const loadAllProjects = useTodoStore((state) => state.loadAllProjects);
  const updateTask = useTodoStore((state) => state.updateTask);
  const enabledAgents = useEnabledAgents();
  const currentRepoKey = useMemo(
    () => (currentRepoPath ? normalizePath(currentRepoPath) : undefined),
    [currentRepoPath]
  );

  useEffect(() => {
    void loadAllProjects();
  }, [loadAllProjects]);

  const summary = useMemo(() => {
    const repoKeys = new Set(Object.keys(tasksByRepo));

    if (currentRepoKey) {
      repoKeys.add(currentRepoKey);
    }

    return buildAiCenterSummary(
      Array.from(repoKeys).map((repoKey) => ({
        repoPath: repoKey,
        tasks: tasksByRepo[repoKey] ?? [],
        autoExecute: autoExecuteByRepo[repoKey],
        isCurrent: repoKey === currentRepoKey,
      }))
    );
  }, [autoExecuteByRepo, currentRepoKey, tasksByRepo]);

  const worktreePathByRepo = useMemo(
    () =>
      currentRepoKey && currentWorktreePath ? { [currentRepoKey]: currentWorktreePath } : undefined,
    [currentRepoKey, currentWorktreePath]
  );
  const hasRunningAutoExecute = useMemo(
    () => Object.values(autoExecuteByRepo).some((autoExecute) => autoExecute.running),
    [autoExecuteByRepo]
  );
  const canDispatchReadyTasks =
    enabledAgents.length > 0 &&
    summary.execution.nextAction === 'dispatch-ready' &&
    summary.execution.dispatchableTasks.length > 0;

  const handleDispatchReadyTasks = useCallback(() => {
    if (!canDispatchReadyTasks) {
      return;
    }

    startTodoGlobalAutoExecute({
      dispatchableTasks: summary.execution.dispatchableTasks,
      enabledAgents,
      onSwitchToAgent,
      worktreePathByRepo,
    });
  }, [
    canDispatchReadyTasks,
    enabledAgents,
    onSwitchToAgent,
    summary.execution.dispatchableTasks,
    worktreePathByRepo,
  ]);

  const handleApproveTask = useCallback(
    (repoPath: string, taskId: string) => {
      const repoKey = normalizePath(repoPath);
      const task = (tasksByRepo[repoKey] ?? []).find((candidate) => candidate.id === taskId);
      if (!task) {
        return;
      }

      updateTask(repoKey, taskId, {
        context: buildApprovedTodoTaskContext(task.context, Date.now()),
      });
    },
    [tasksByRepo, updateTask]
  );

  const handleOpenTask = useCallback(
    (repoPath: string, taskId: string) => {
      onOpenProjectTask?.(normalizePath(repoPath), taskId);
    },
    [onOpenProjectTask]
  );

  const handleAgentStop = useCallback(
    (data: AgentStopNotificationData) => {
      handleTodoAutoExecuteStop({
        data,
        enabledAgents,
        onSwitchToAgent,
        worktreePathByRepo,
      });
    },
    [enabledAgents, onSwitchToAgent, worktreePathByRepo]
  );
  const handleAgentStopRef = useRef(handleAgentStop);

  useEffect(() => {
    handleAgentStopRef.current = handleAgentStop;
  }, [handleAgentStop]);

  useEffect(() => {
    if (!hasRunningAutoExecute) return;

    const unsubscribeMain = window.electronAPI.notification.onAgentStop((data) =>
      handleAgentStopRef.current(data)
    );
    const unsubscribeRenderer = onRendererAgentStop((data) => handleAgentStopRef.current(data));

    return () => {
      unsubscribeMain();
      unsubscribeRenderer();
    };
  }, [hasRunningAutoExecute]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-auto pb-3">
        <AiCenterView
          canDispatchReadyTasks={canDispatchReadyTasks}
          onApproveTask={handleApproveTask}
          onDispatchReadyTasks={handleDispatchReadyTasks}
          onFocusTask={handleOpenTask}
          onOpenTask={handleOpenTask}
          summary={summary}
        />
      </div>
    </div>
  );
}
