import type { AgentStopNotificationData } from '@shared/types/agent';
import { KanbanSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizePath } from '@/App/storage';
import { ControlStateCard } from '@/components/layout/ControlStateCard';
import { useI18n } from '@/i18n';
import { onRendererAgentStop } from '@/lib/agentStopEvents';
import { useTodoStore } from '@/stores/todo';
import { KanbanBoard, type TodoTaskFocusRequest } from './KanbanBoard';
import { TodoDecisionCenter } from './TodoDecisionCenter';
import { handleTodoAutoExecuteStop, startTodoGlobalAutoExecute } from './todoAutoExecuteRuntime';
import { buildApprovedTodoTaskContext } from './todoTaskContext';
import { buildTodoDecisionCenterSummary } from './todoViewModel';
import { useEnabledAgents } from './useEnabledAgents';

export interface TodoPanelProps {
  repoPath?: string;
  worktreePath?: string;
  isActive?: boolean;
  onSwitchRepository?: (repoPath: string) => void;
  onSwitchToAgent?: () => void;
}

export function TodoPanel({
  repoPath,
  worktreePath,
  onSwitchRepository,
  onSwitchToAgent,
}: TodoPanelProps) {
  const { t } = useI18n();
  const tasksByRepo = useTodoStore((state) => state.tasks);
  const autoExecuteByRepo = useTodoStore((state) => state.autoExecute);
  const loadAllProjects = useTodoStore((state) => state.loadAllProjects);
  const updateTask = useTodoStore((state) => state.updateTask);
  const enabledAgents = useEnabledAgents();
  const [focusTaskRequest, setFocusTaskRequest] = useState<TodoTaskFocusRequest | null>(null);
  const currentRepoKey = useMemo(
    () => (repoPath ? normalizePath(repoPath) : undefined),
    [repoPath]
  );

  useEffect(() => {
    void loadAllProjects();
  }, [loadAllProjects]);

  const decisionSummary = useMemo(() => {
    const repoKeys = new Set(Object.keys(tasksByRepo));

    if (currentRepoKey) {
      repoKeys.add(currentRepoKey);
    }

    return buildTodoDecisionCenterSummary(
      Array.from(repoKeys).map((repoKey) => ({
        repoPath: repoKey,
        tasks: tasksByRepo[repoKey] ?? [],
        autoExecute: autoExecuteByRepo[repoKey],
        isCurrent: repoKey === currentRepoKey,
      }))
    );
  }, [autoExecuteByRepo, currentRepoKey, tasksByRepo]);

  const worktreePathByRepo = useMemo(
    () => (currentRepoKey && worktreePath ? { [currentRepoKey]: worktreePath } : undefined),
    [currentRepoKey, worktreePath]
  );
  const hasRunningAutoExecute = useMemo(
    () => Object.values(autoExecuteByRepo).some((autoExecute) => autoExecute.running),
    [autoExecuteByRepo]
  );
  const canDispatchReadyTasks =
    enabledAgents.length > 0 &&
    decisionSummary.execution.nextAction === 'dispatch-ready' &&
    decisionSummary.execution.dispatchableTasks.length > 0;

  const handleDispatchReadyTasks = useCallback(() => {
    if (!canDispatchReadyTasks) {
      return;
    }

    startTodoGlobalAutoExecute({
      dispatchableTasks: decisionSummary.execution.dispatchableTasks,
      enabledAgents,
      onSwitchToAgent,
      worktreePathByRepo,
    });
  }, [
    canDispatchReadyTasks,
    decisionSummary.execution.dispatchableTasks,
    enabledAgents,
    onSwitchToAgent,
    worktreePathByRepo,
  ]);

  const handleApproveGlobalTask = useCallback(
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

  const handleFocusGlobalTask = useCallback(
    (repoPath: string, taskId: string) => {
      const repoKey = normalizePath(repoPath);
      setFocusTaskRequest((previousRequest) => ({
        repoPath: repoKey,
        taskId,
        token: (previousRequest?.token ?? 0) + 1,
      }));

      if (repoKey !== currentRepoKey) {
        onSwitchRepository?.(repoKey);
      }
    },
    [currentRepoKey, onSwitchRepository]
  );

  const handleGlobalAgentStop = useCallback(
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
  const handleGlobalAgentStopRef = useRef(handleGlobalAgentStop);

  useEffect(() => {
    handleGlobalAgentStopRef.current = handleGlobalAgentStop;
  }, [handleGlobalAgentStop]);

  useEffect(() => {
    if (!hasRunningAutoExecute) return;

    const unsubscribeMain = window.electronAPI.notification.onAgentStop((data) =>
      handleGlobalAgentStopRef.current(data)
    );
    const unsubscribeRenderer = onRendererAgentStop((data) =>
      handleGlobalAgentStopRef.current(data)
    );

    return () => {
      unsubscribeMain();
      unsubscribeRenderer();
    };
  }, [hasRunningAutoExecute]);

  if (!repoPath) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <TodoDecisionCenter
          canDispatchReadyTasks={canDispatchReadyTasks}
          onApproveTask={handleApproveGlobalTask}
          onDispatchReadyTasks={handleDispatchReadyTasks}
          onFocusTask={handleFocusGlobalTask}
          summary={decisionSummary}
        />
        <div className="min-h-0 flex-1">
          <ControlStateCard
            icon={<KanbanSquare className="h-5 w-5" />}
            eyebrow={t('Todo')}
            title={t('No repository selected')}
            description={t('Select a repository to manage tasks')}
            className="pt-6 sm:pt-8"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <TodoDecisionCenter
        canDispatchReadyTasks={canDispatchReadyTasks}
        onApproveTask={handleApproveGlobalTask}
        onDispatchReadyTasks={handleDispatchReadyTasks}
        onFocusTask={handleFocusGlobalTask}
        summary={decisionSummary}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <KanbanBoard
          repoPath={repoPath}
          worktreePath={worktreePath}
          focusTaskRequest={focusTaskRequest}
          onSwitchToAgent={onSwitchToAgent}
        />
      </div>
    </div>
  );
}
