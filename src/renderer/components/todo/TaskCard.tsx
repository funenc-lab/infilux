import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FileText,
  Folder,
  FolderGit2,
  GripVertical,
  ListChecks,
  Pencil,
  Play,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizePath } from '@/App/storage';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useTodoStore } from '@/stores/todo';
import {
  buildTodoTaskExecutionContext,
  buildTodoTaskPrompt,
  getPathDisplayName,
  getTodoTaskApprovalState,
} from './todoTaskContext';
import { getTaskRelativeTimeLabel, TODO_PRIORITY_META } from './todoViewModel';
import type { TodoTask } from './types';
import { type ResolvedAgent, useEnabledAgents } from './useEnabledAgents';

interface TaskCardProps {
  task: TodoTask;
  isOverlay?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  repoPath: string;
  worktreePath?: string;
  onSwitchToAgent?: () => void;
}

export function TaskCard({
  task,
  isOverlay,
  onEdit,
  onDelete,
  repoPath,
  worktreePath,
  onSwitchToAgent,
}: TaskCardProps) {
  const { t } = useI18n();
  const enabledAgents = useEnabledAgents();
  const assignedAgent = task.agentId
    ? enabledAgents.find((agent) => agent.agentId === task.agentId)
    : undefined;
  const assignedAgentName = assignedAgent?.name ?? task.agentId;
  const priorityMeta = TODO_PRIORITY_META[task.priority];
  const updatedAtLabel = getTaskRelativeTimeLabel(task.updatedAt);
  const executionContext = buildTodoTaskExecutionContext(task, { repoPath, worktreePath });
  const launchWorktreePath = executionContext?.worktreePath ?? worktreePath;
  const contextFileCount = executionContext?.files?.length ?? 0;
  const contextDirectoryCount = executionContext?.directories?.length ?? 0;
  const dependencyTaskCount = executionContext?.dependencyTaskIds?.length ?? 0;
  const approvalState = getTodoTaskApprovalState(executionContext);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const canLaunchTask = Boolean(launchWorktreePath && enabledAgents.length > 0);
  const launchButtonTitle = !launchWorktreePath
    ? t('Please select a worktree first')
    : enabledAgents.length === 0
      ? t('No enabled agents')
      : t('Launch Agent');

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showAgentMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        portalRef.current &&
        !portalRef.current.contains(target)
      ) {
        setShowAgentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAgentMenu]);

  // Calculate menu position relative to viewport
  useLayoutEffect(() => {
    if (!showAgentMenu || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.top,
      left: rect.right,
    });
  }, [showAgentMenu]);

  const handleLaunchWithAgent = useCallback(
    (agent: ResolvedAgent) => {
      if (!launchWorktreePath) return;

      const id = crypto.randomUUID();
      // Build task context for sending to agent
      const taskContext = buildTodoTaskPrompt(task.title, task.description, executionContext);

      // Use setState callback to ensure all updates happen in the same batch
      useAgentSessionsStore.setState((state) => {
        // Calculate displayOrder: max order in same worktree + 1
        const worktreeSessions = state.sessions.filter(
          (s) => s.repoPath === repoPath && s.cwd === launchWorktreePath
        );
        const maxOrder = worktreeSessions.reduce(
          (max, s) => Math.max(max, s.displayOrder ?? 0),
          -1
        );

        const newSession = {
          id,
          sessionId: id,
          name: `Task: ${task.title}`,
          agentId: agent.agentId,
          agentCommand: agent.command,
          customPath: agent.customPath,
          customArgs: agent.customArgs,
          initialized: false,
          repoPath,
          cwd: launchWorktreePath,
          environment: agent.environment,
          displayOrder: maxOrder + 1,
          // Store command to send after agent is ready
          pendingCommand: taskContext,
        };

        return {
          sessions: [...state.sessions, newSession],
          activeIds: { ...state.activeIds, [normalizePath(launchWorktreePath)]: id },
          // Initialize enhanced input state (closed)
          enhancedInputStates: {
            ...state.enhancedInputStates,
            [id]: { open: false, content: '', attachments: [] },
          },
        };
      });

      // Move task to in-progress
      if (task.status === 'todo') {
        useTodoStore.getState().updateTask(repoPath, task.id, { status: 'in-progress' });
      }

      setShowAgentMenu(false);
      onSwitchToAgent?.();
    },
    [executionContext, launchWorktreePath, task, repoPath, onSwitchToAgent]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group control-panel-muted flex min-w-0 flex-col gap-2 rounded-lg px-2.5 py-2.5 transition-colors hover:border-primary/24 hover:bg-accent/18',
        isDragging && 'opacity-50',
        isOverlay && 'control-floating border-primary/30 bg-popover'
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent/58 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={t('Move task')}
          title={t('Move task')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="line-clamp-2 min-w-0 text-sm font-medium leading-5 text-foreground">
              {task.title}
            </span>

            <div className="flex shrink-0 items-center gap-0.5">
              {task.status !== 'done' && onSwitchToAgent && (
                <div className="relative" ref={menuRef}>
                  <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => {
                      if (!canLaunchTask) return;
                      setShowAgentMenu((v) => !v);
                    }}
                    disabled={!canLaunchTask}
                    className="flex h-6 shrink-0 items-center justify-center gap-1 rounded-md border border-border/70 bg-background/70 px-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={launchButtonTitle}
                    title={launchButtonTitle}
                  >
                    <Play className="h-3 w-3" />
                    <span className="hidden sm:inline">{t('Run')}</span>
                  </button>

                  {showAgentMenu &&
                    enabledAgents.length > 0 &&
                    createPortal(
                      <div
                        ref={portalRef}
                        className="fixed z-[9999] min-w-36"
                        style={{
                          top: menuPos.top,
                          left: menuPos.left,
                          transform: 'translate(-100%, -100%)',
                        }}
                      >
                        <div className="control-menu rounded-lg p-1">
                          <div className="px-2 py-1">
                            <span className="control-menu-label text-muted-foreground">
                              {t('Select Agent')}
                            </span>
                          </div>
                          {enabledAgents.map((agent) => (
                            <button
                              type="button"
                              key={agent.agentId}
                              onClick={() => handleLaunchWithAgent(agent)}
                              className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 whitespace-nowrap"
                            >
                              <span>{agent.name}</span>
                              {agent.isDefault && (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  ({t('Default')})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('Edit Task')}
                  title={t('Edit')}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('Delete Task')}
                  title={t('Delete')}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {task.description && (
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-7">
        <span
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
            priorityMeta.chipClassName
          )}
          title={t('Priority')}
        >
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', priorityMeta.dotClassName)} />
          {t(priorityMeta.label)}
        </span>
        {assignedAgentName && (
          <span
            className="inline-flex max-w-28 items-center rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={t('Task Agent')}
          >
            <span className="truncate">{assignedAgentName}</span>
          </span>
        )}
        {executionContext?.worktreePath && (
          <span
            className="inline-flex max-w-28 items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={`${t('Worktree')}: ${executionContext.worktreePath}`}
          >
            <FolderGit2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{getPathDisplayName(executionContext.worktreePath)}</span>
          </span>
        )}
        {dependencyTaskCount > 0 && (
          <span
            className="inline-flex max-w-28 items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={(executionContext?.dependencyTaskIds ?? []).join('\n')}
          >
            <ListChecks className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {t('Depends {{count}}', { count: dependencyTaskCount })}
            </span>
          </span>
        )}
        {approvalState !== 'none' && (
          <span
            className={cn(
              'inline-flex max-w-28 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
              approvalState === 'approved'
                ? 'border-success/30 text-success'
                : 'border-warning/40 text-warning'
            )}
            title={approvalState === 'approved' ? t('Approved') : t('Approval Required')}
          >
            <ShieldCheck className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {approvalState === 'approved' ? t('Approved') : t('Approval Required')}
            </span>
          </span>
        )}
        {contextFileCount > 0 && (
          <span
            className="inline-flex max-w-28 items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={(executionContext?.files ?? []).map((file) => file.path).join('\n')}
          >
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {contextFileCount === 1
                ? getPathDisplayName(executionContext?.files?.[0]?.path)
                : t('{{count}} files', { count: contextFileCount })}
            </span>
          </span>
        )}
        {contextDirectoryCount > 0 && (
          <span
            className="inline-flex max-w-28 items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={(executionContext?.directories ?? [])
              .map((directory) => directory.path)
              .join('\n')}
          >
            <Folder className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {contextDirectoryCount === 1
                ? getPathDisplayName(executionContext?.directories?.[0]?.path)
                : t('{{count}} directories', { count: contextDirectoryCount })}
            </span>
          </span>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground/70">
          {t(updatedAtLabel.key, updatedAtLabel.params)}
        </span>
      </div>
    </div>
  );
}
