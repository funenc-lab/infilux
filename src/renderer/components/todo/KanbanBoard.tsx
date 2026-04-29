import {
  closestCorners,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ListOrdered, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizePath } from '@/App/storage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAutoExecuteTask } from '@/hooks/useAutoExecuteTask';
import { useI18n } from '@/i18n';
import { selectTasks, useTodoStore } from '@/stores/todo';
import { AUTO_EXECUTE_AGENT_AUTO_VALUE, resolveAutoExecuteAgentChoice } from './agentCapabilities';
import { ExecutionControlPanel } from './ExecutionControlPanel';
import { ExecutionPlanPreviewDialog } from './ExecutionPlanPreviewDialog';
import { GenerateTasksDialog } from './GenerateTasksDialog';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';
import { buildTodoOrchestrationPlan, getExecutableTodoTaskIds } from './todoOrchestrator';
import { buildApprovedTodoTaskContext } from './todoTaskContext';
import {
  buildTodoBoardSummary,
  getAutoExecuteDisabledReason,
  getTodoBoardHeaderStats,
  getTodoBoardPrimaryAction,
  groupTasksByStatus,
  TODO_STATUS_META,
} from './todoViewModel';
import { TASK_STATUS_LIST, type TaskStatus, type TodoTask } from './types';
import { useEnabledAgents } from './useEnabledAgents';
import { useTodoPersistenceNotifications } from './useTodoPersistenceNotifications';

interface KanbanBoardProps {
  repoPath: string;
  worktreePath?: string;
  focusTaskRequest?: TodoTaskFocusRequest | null;
  onSwitchToAgent?: () => void;
}

export interface TodoTaskFocusRequest {
  repoPath: string;
  taskId: string;
  token: number;
}

export function KanbanBoard({
  repoPath,
  worktreePath,
  focusTaskRequest,
  onSwitchToAgent,
}: KanbanBoardProps) {
  const { t } = useI18n();
  const tasks = useTodoStore((s) => selectTasks(s, repoPath));
  const moveTask = useTodoStore((s) => s.moveTask);
  const reorderTasks = useTodoStore((s) => s.reorderTasks);
  const updateTask = useTodoStore((s) => s.updateTask);
  const loadTasks = useTodoStore((s) => s.loadTasks);
  const enabledAgents = useEnabledAgents();
  const [selectedAutoExecuteAgentId, setSelectedAutoExecuteAgentId] = useState<string>(
    AUTO_EXECUTE_AGENT_AUTO_VALUE
  );

  useTodoPersistenceNotifications();

  // Load tasks from SQLite on mount / repoPath change
  useEffect(() => {
    loadTasks(repoPath);
  }, [repoPath, loadTasks]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [planPreviewOpen, setPlanPreviewOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TodoTask | null>(null);
  const [deleteTaskCandidate, setDeleteTaskCandidate] = useState<TodoTask | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track pending cross-column move during drag (not yet committed)
  const [pendingMove, setPendingMove] = useState<{
    taskId: string;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
  } | null>(null);

  // Snapshot of tasks at drag start for cancel rollback
  const dragStartSnapshotRef = useRef<TodoTask[] | null>(null);
  const handledFocusTaskTokenRef = useRef<number | null>(null);

  // Merge pending move into displayed tasks
  const displayTasks = useMemo(() => {
    if (!pendingMove) return tasks;
    return tasks.map((t) =>
      t.id === pendingMove.taskId ? { ...t, status: pendingMove.toStatus } : t
    );
  }, [tasks, pendingMove]);

  const tasksByStatus = useMemo(() => {
    return groupTasksByStatus(displayTasks);
  }, [displayTasks]);

  const boardSummary = useMemo(() => buildTodoBoardSummary(displayTasks), [displayTasks]);
  const headerStats = useMemo(() => getTodoBoardHeaderStats(boardSummary), [boardSummary]);

  const activeTask = useMemo(
    () => (activeId ? (displayTasks.find((t) => t.id === activeId) ?? null) : null),
    [activeId, displayTasks]
  );

  useEffect(() => {
    if (!focusTaskRequest) {
      return;
    }
    if (handledFocusTaskTokenRef.current === focusTaskRequest.token) {
      return;
    }
    if (normalizePath(focusTaskRequest.repoPath) !== normalizePath(repoPath)) {
      return;
    }

    const task = tasks.find((candidate) => candidate.id === focusTaskRequest.taskId);
    if (!task) {
      return;
    }

    handledFocusTaskTokenRef.current = focusTaskRequest.token;
    setEditingTask(task);
    setDialogOpen(true);
  }, [focusTaskRequest, repoPath, tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Find which column a task belongs to (using displayTasks for visual consistency)
  const findColumn = useCallback(
    (id: string): TaskStatus | null => {
      const task = displayTasks.find((t) => t.id === id);
      if (task) return task.status;
      if (TASK_STATUS_LIST.includes(id as TaskStatus)) return id as TaskStatus;
      return null;
    },
    [displayTasks]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(String(event.active.id));
      dragStartSnapshotRef.current = tasks;
    },
    [tasks]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeColumn = findColumn(String(active.id));
      let overColumn = findColumn(String(over.id));

      if (TASK_STATUS_LIST.includes(String(over.id) as TaskStatus)) {
        overColumn = String(over.id) as TaskStatus;
      }

      if (!activeColumn || !overColumn || activeColumn === overColumn) return;

      // Only update visual pending state, don't persist
      const task = displayTasks.find((t) => t.id === String(active.id));
      if (!task) return;

      const originalStatus =
        dragStartSnapshotRef.current?.find((t) => t.id === String(active.id))?.status ??
        task.status;

      setPendingMove({
        taskId: String(active.id),
        fromStatus: originalStatus,
        toStatus: overColumn,
      });
    },
    [findColumn, displayTasks]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const currentPendingMove = pendingMove;

      setActiveId(null);
      setPendingMove(null);
      dragStartSnapshotRef.current = null;

      if (!over) return;

      // Commit cross-column move
      if (currentPendingMove && currentPendingMove.taskId === String(active.id)) {
        const overItems = tasksByStatus[currentPendingMove.toStatus];
        const newOrder = overItems.length > 0 ? overItems[overItems.length - 1].order + 1 : 0;
        moveTask(repoPath, currentPendingMove.taskId, currentPendingMove.toStatus, newOrder);
        return;
      }

      // Same column reorder
      const activeColumn = findColumn(String(active.id));
      let overColumn = findColumn(String(over.id));

      if (TASK_STATUS_LIST.includes(String(over.id) as TaskStatus)) {
        overColumn = String(over.id) as TaskStatus;
      }

      if (!activeColumn || !overColumn) return;

      if (activeColumn === overColumn && String(active.id) !== String(over.id)) {
        const items = tasksByStatus[activeColumn];
        const oldIndex = items.findIndex((t) => t.id === String(active.id));
        const newIndex = items.findIndex((t) => t.id === String(over.id));

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(items, oldIndex, newIndex);
          reorderTasks(
            repoPath,
            activeColumn,
            reordered.map((t) => t.id)
          );
        }
      }
    },
    [findColumn, tasksByStatus, reorderTasks, moveTask, repoPath, pendingMove]
  );

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveId(null);
    setPendingMove(null);
    dragStartSnapshotRef.current = null;
  }, []);

  const handleAddTask = useCallback((status: TaskStatus) => {
    setEditingTask(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }, []);

  const handleEditTask = useCallback((task: TodoTask) => {
    setEditingTask(task);
    setDefaultStatus(task.status);
    setDialogOpen(true);
  }, []);

  const handleRequestDeleteTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((item) => item.id === taskId);
      if (task) {
        setDeleteTaskCandidate(task);
      }
    },
    [tasks]
  );

  const handleConfirmDeleteTask = useCallback(() => {
    if (!deleteTaskCandidate) return;
    useTodoStore.getState().deleteTask(repoPath, deleteTaskCandidate.id);
    setDeleteTaskCandidate(null);
  }, [deleteTaskCandidate, repoPath]);

  // Get todo tasks for auto-execute
  const todoTasks = useMemo(() => tasksByStatus.todo, [tasksByStatus]);
  const hasExecutableWorktreeContext = useMemo(
    () => todoTasks.length > 0 && todoTasks.every((task) => task.context?.worktreePath?.trim()),
    [todoTasks]
  );
  const autoExecuteDisabledReason = getAutoExecuteDisabledReason({
    enabledAgentCount: enabledAgents.length,
    hasExecutableWorktreeContext,
    todoTaskCount: todoTasks.length,
    worktreePath,
  });

  const selectedAutoExecuteChoice = useMemo(
    () =>
      resolveAutoExecuteAgentChoice({
        agents: enabledAgents,
        respectTaskAgentSelection: false,
        selectedAgentId: selectedAutoExecuteAgentId,
        tasks: todoTasks,
      }),
    [enabledAgents, selectedAutoExecuteAgentId, todoTasks]
  );
  const selectedAutoExecuteAgent = selectedAutoExecuteChoice.agent;
  const autoRecommendedAgent = useMemo(
    () =>
      resolveAutoExecuteAgentChoice({
        agents: enabledAgents,
        respectTaskAgentSelection: false,
        selectedAgentId: AUTO_EXECUTE_AGENT_AUTO_VALUE,
        tasks: todoTasks,
      }).agent,
    [enabledAgents, todoTasks]
  );
  const selectedManualAutoExecuteAgent = useMemo(
    () => enabledAgents.find((agent) => agent.agentId === selectedAutoExecuteAgentId),
    [enabledAgents, selectedAutoExecuteAgentId]
  );
  const selectedAutoExecuteDisplayAgent =
    selectedAutoExecuteAgentId === AUTO_EXECUTE_AGENT_AUTO_VALUE
      ? autoRecommendedAgent
      : (selectedManualAutoExecuteAgent ?? selectedAutoExecuteAgent);

  // Auto-execute hook
  const { autoExecute, removeFromQueue, skipCurrentTask, startAutoExecute, stop } =
    useAutoExecuteTask(
      repoPath,
      worktreePath,
      onSwitchToAgent,
      enabledAgents,
      selectedAutoExecuteAgentId
    );
  const maxParallelTasks = Math.max(1, Math.min(enabledAgents.length, 3));
  const orchestrationPlan = useMemo(
    () =>
      buildTodoOrchestrationPlan({
        allTasks: displayTasks,
        candidateTasks: autoExecute.running ? displayTasks : todoTasks,
        currentTaskId: autoExecute.currentTaskId,
        enabledAgents,
        maxParallelTasks,
        queue: autoExecute.queue,
        running: autoExecute.running,
        selectedAgentId: selectedAutoExecuteAgentId,
        worktreePath,
      }),
    [
      autoExecute.currentTaskId,
      autoExecute.queue,
      autoExecute.running,
      displayTasks,
      enabledAgents,
      maxParallelTasks,
      selectedAutoExecuteAgentId,
      todoTasks,
      worktreePath,
    ]
  );
  const currentExecutingTask = useMemo(
    () => tasks.find((task) => task.id === autoExecute.currentTaskId),
    [autoExecute.currentTaskId, tasks]
  );
  const currentExecutingAgent = useMemo(
    () =>
      currentExecutingTask
        ? resolveAutoExecuteAgentChoice({
            agents: enabledAgents,
            selectedAgentId: selectedAutoExecuteAgentId,
            tasks: [currentExecutingTask],
          }).agent
        : selectedAutoExecuteAgent,
    [currentExecutingTask, enabledAgents, selectedAutoExecuteAgentId, selectedAutoExecuteAgent]
  );

  // Handle start auto-execute
  const handleStartAutoExecute = useCallback(() => {
    const taskIds = getExecutableTodoTaskIds(orchestrationPlan);
    if (taskIds.length === 0) return;
    startAutoExecute(taskIds);
    setPlanPreviewOpen(false);
  }, [orchestrationPlan, startAutoExecute]);

  const handleRequestAutoExecute = useCallback(() => {
    if (!orchestrationPlan.canStart) return;
    setPlanPreviewOpen(true);
  }, [orchestrationPlan.canStart]);

  const handleApproveTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) return;

      updateTask(repoPath, taskId, {
        context: buildApprovedTodoTaskContext(task.context, Date.now()),
      });
    },
    [repoPath, tasks, updateTask]
  );

  useEffect(() => {
    if (selectedAutoExecuteAgentId === AUTO_EXECUTE_AGENT_AUTO_VALUE) return;
    if (enabledAgents.some((agent) => agent.agentId === selectedAutoExecuteAgentId)) return;
    setSelectedAutoExecuteAgentId(AUTO_EXECUTE_AGENT_AUTO_VALUE);
  }, [enabledAgents, selectedAutoExecuteAgentId]);

  const autoExecuteTitle = useMemo(() => {
    if (autoExecuteDisabledReason === 'worktree') return t('Please select a worktree first');
    if (autoExecuteDisabledReason === 'agents') return t('No enabled agents');
    if (autoExecuteDisabledReason === 'tasks') return t('No tasks');
    if (!orchestrationPlan.canStart) return t(orchestrationPlan.blockers[0] ?? 'No ready tasks');
    return selectedAutoExecuteAgent
      ? t('Auto execute with {{agent}}', { agent: selectedAutoExecuteAgent.name })
      : undefined;
  }, [
    autoExecuteDisabledReason,
    orchestrationPlan.blockers,
    orchestrationPlan.canStart,
    selectedAutoExecuteAgent,
    t,
  ]);
  const hasBoardTasks = boardSummary.totalTaskCount > 0;
  const primaryAction = getTodoBoardPrimaryAction({
    canAutoExecute: autoExecuteDisabledReason === null && orchestrationPlan.canStart,
    todoTaskCount: todoTasks.length,
    totalTaskCount: boardSummary.totalTaskCount,
  });
  const showAutoExecuteControls = autoExecute.running || todoTasks.length > 0;
  const hasPendingExecutionTasks = autoExecute.running || todoTasks.length > 0;
  const showExecutionSection =
    hasPendingExecutionTasks &&
    (autoExecute.running ||
      orchestrationPlan.readyTasks.length > 0 ||
      orchestrationPlan.blockedTasks.length > 0 ||
      orchestrationPlan.blockers.length > 0);
  const canReviewPlan = !autoExecute.running && orchestrationPlan.canStart;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="control-panel m-3 mb-0 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">{t('Todo')}</h2>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {headerStats.map((stat) => (
                  <span
                    key={stat.id}
                    className={
                      stat.tone === 'done' ? 'control-chip control-chip-done' : 'control-chip'
                    }
                    title={t(stat.labelKey, stat.labelParams)}
                  >
                    {stat.compactValue ?? t(stat.labelKey, stat.labelParams)}
                  </span>
                ))}
              </div>
            </div>
            {hasBoardTasks && (
              <div
                role="progressbar"
                aria-label={t('Completion {{percent}}%', {
                  percent: boardSummary.completionPercent,
                })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={boardSummary.completionPercent}
                className="h-1.5 w-40 overflow-hidden rounded-full bg-muted/42"
              >
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${boardSummary.completionPercent}%` }}
                />
              </div>
            )}
          </div>

          {hasBoardTasks && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {autoExecute.running ? (
                <span className="control-chip control-chip-live min-w-0 max-w-72 truncate">
                  {autoExecute.currentTaskId && currentExecutingAgent
                    ? t('Executing with {{agent}}...', { agent: currentExecutingAgent.name })
                    : t('Queue: {{count}}', { count: autoExecute.queue.length })}
                </span>
              ) : showAutoExecuteControls ? (
                <>
                  {enabledAgents.length > 0 && selectedAutoExecuteDisplayAgent && (
                    <Select
                      value={selectedAutoExecuteAgentId}
                      onValueChange={(value) => {
                        if (typeof value === 'string') {
                          setSelectedAutoExecuteAgentId(value);
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label={t('Auto Execute Agent')}
                        className="h-7 min-h-7 w-36 rounded-md text-xs"
                        size="sm"
                      >
                        <SelectValue>
                          {selectedAutoExecuteAgentId === AUTO_EXECUTE_AGENT_AUTO_VALUE
                            ? t('Auto: {{agent}}', { agent: selectedAutoExecuteDisplayAgent.name })
                            : selectedAutoExecuteDisplayAgent.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {autoRecommendedAgent && (
                          <SelectItem value={AUTO_EXECUTE_AGENT_AUTO_VALUE}>
                            {t('Auto: {{agent}}', { agent: autoRecommendedAgent.name })}
                          </SelectItem>
                        )}
                        {enabledAgents.map((agent) => (
                          <SelectItem key={agent.agentId} value={agent.agentId}>
                            {agent.name}
                            {agent.isDefault ? ` (${t('Default')})` : ''}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  )}
                  <Button
                    variant={primaryAction === 'auto-execute' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={handleRequestAutoExecute}
                    disabled={autoExecuteDisabledReason !== null || !orchestrationPlan.canStart}
                    title={autoExecuteTitle}
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                    {t('Auto Execute')}
                  </Button>
                </>
              ) : null}
              {!autoExecute.running && (
                <Button
                  variant={primaryAction === 'generate' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setGenerateDialogOpen(true)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('AI Tasks')}
                </Button>
              )}
              <Button
                variant={primaryAction === 'new-task' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => handleAddTask('todo')}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('New Task')}
              </Button>
            </div>
          )}
        </div>

        {showExecutionSection && (
          <ExecutionControlPanel
            canReviewPlan={canReviewPlan}
            onApproveTask={handleApproveTask}
            onRemoveQueuedTask={removeFromQueue}
            onReviewPlan={handleRequestAutoExecute}
            onSkipCurrentTask={skipCurrentTask}
            onStop={stop}
            plan={orchestrationPlan}
            running={autoExecute.running}
          />
        )}
      </div>

      {!hasBoardTasks ? (
        <div className="min-h-0 flex-1 p-3">
          <div className="control-panel flex h-full min-h-80 flex-col items-center justify-center rounded-xl border-dashed border-border/70 px-4 py-10 text-center">
            <div className="flex max-w-md flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-muted/16 text-muted-foreground">
                <ListOrdered className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{t('No tasks yet')}</h3>
              <p className="text-balance text-xs leading-5 text-muted-foreground">
                {t('Generate tasks from a work request, or create one manually.')}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setGenerateDialogOpen(true)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t('Generate Tasks')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => handleAddTask('todo')}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('New Task')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid min-h-0 flex-1 grid-cols-[repeat(3,minmax(17rem,1fr))] gap-3 overflow-x-auto p-3">
            {TASK_STATUS_LIST.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                title={t(TODO_STATUS_META[status].label)}
                tasks={tasksByStatus[status]}
                onAddTask={() => handleAddTask(status)}
                onEditTask={handleEditTask}
                onDeleteTask={handleRequestDeleteTask}
                repoPath={repoPath}
                worktreePath={worktreePath}
                onSwitchToAgent={onSwitchToAgent}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                isOverlay
                onEdit={() => {}}
                onDelete={() => {}}
                repoPath={repoPath}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Task dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        defaultStatus={defaultStatus}
        repoPath={repoPath}
        worktreePath={worktreePath}
        availableTasks={displayTasks}
      />
      <GenerateTasksDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        repoPath={repoPath}
        worktreePath={worktreePath}
        enabledAgents={enabledAgents}
      />
      <ExecutionPlanPreviewDialog
        open={planPreviewOpen}
        onOpenChange={setPlanPreviewOpen}
        onStart={handleStartAutoExecute}
        plan={orchestrationPlan}
      />
      <Dialog
        open={deleteTaskCandidate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTaskCandidate(null);
          }
        }}
      >
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('Delete task?')}</DialogTitle>
            <DialogDescription>{t('This action cannot be undone.')}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-muted/12 px-3 py-2 text-sm">
              <Trash2 className="h-4 w-4 shrink-0 text-destructive" />
              <span className="min-w-0 truncate text-foreground">
                {deleteTaskCandidate?.title ?? t('Task')}
              </span>
            </div>
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button variant="outline" onClick={() => setDeleteTaskCandidate(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteTask}>
              {t('Delete Task')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
