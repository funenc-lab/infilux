import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { TaskCard } from './TaskCard';
import { TODO_STATUS_META } from './todoViewModel';
import type { TaskStatus, TodoTask } from './types';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: TodoTask[];
  onAddTask: () => void;
  onEditTask: (task: TodoTask) => void;
  onDeleteTask: (taskId: string) => void;
  repoPath: string;
  worktreePath?: string;
  onSwitchToAgent?: () => void;
}

export function KanbanColumn({
  status,
  title,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  repoPath,
  worktreePath,
  onSwitchToAgent,
}: KanbanColumnProps) {
  const { t } = useI18n();
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const { setNodeRef, isOver } = useDroppable({ id: status });
  const statusMeta = TODO_STATUS_META[status];

  return (
    <section
      className={cn(
        'control-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl transition-colors',
        isOver && 'border-primary/36 bg-accent/10'
      )}
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-semibold text-foreground">{title}</span>
            <span className={cn(statusMeta.chipClassName, 'px-2 py-0.5 text-[10px]')}>
              {tasks.length}
            </span>
          </div>
        </div>
        <button
          aria-label={t('New Task')}
          type="button"
          onClick={onAddTask}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/58 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={t('New Task')}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={cn(
              'flex min-h-full flex-col gap-2 p-2 transition-colors',
              isOver && 'bg-accent/10'
            )}
          >
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => onEditTask(task)}
                onDelete={() => onDeleteTask(task.id)}
                repoPath={repoPath}
                worktreePath={worktreePath}
                onSwitchToAgent={onSwitchToAgent}
              />
            ))}
            {tasks.length === 0 && (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-6 text-center">
                <span className="text-xs font-medium text-muted-foreground">{t('No tasks')}</span>
                <Button size="xs" variant="ghost" className="gap-1" onClick={onAddTask}>
                  <Plus className="h-3.5 w-3.5" />
                  {t('New Task')}
                </Button>
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </section>
  );
}
