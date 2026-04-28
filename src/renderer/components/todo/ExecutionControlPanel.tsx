import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ListOrdered,
  Play,
  SkipForward,
  Square,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { TodoOrchestrationPlan, TodoOrchestrationTaskPlan } from './todoOrchestrator';

interface ExecutionControlPanelProps {
  canReviewPlan: boolean;
  onRemoveQueuedTask: (taskId: string) => void;
  onReviewPlan: () => void;
  onSkipCurrentTask: () => void;
  onStop: () => void;
  plan: TodoOrchestrationPlan;
  running: boolean;
}

interface TaskPlanListProps {
  action?: (taskPlan: TodoOrchestrationTaskPlan) => ReactNode;
  emptyLabel: string;
  limit?: number;
  plans: TodoOrchestrationTaskPlan[];
  tone?: 'neutral' | 'warning' | 'live';
}

function getStatusLabel(status: TodoOrchestrationPlan['status']): string {
  if (status === 'running') return 'Running';
  if (status === 'blocked') return 'Blocked';
  if (status === 'ready') return 'Ready';
  return 'Idle';
}

function getStatusClassName(status: TodoOrchestrationPlan['status']): string {
  if (status === 'running') return 'control-chip control-chip-live';
  if (status === 'blocked') return 'control-chip control-chip-wait';
  if (status === 'ready') return 'control-chip control-chip-done';
  return 'control-chip';
}

function StatusIcon({ status }: { status: TodoOrchestrationPlan['status'] }) {
  if (status === 'running') return <Clock3 className="h-3.5 w-3.5" />;
  if (status === 'blocked') return <AlertTriangle className="h-3.5 w-3.5" />;
  if (status === 'ready') return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <ListOrdered className="h-3.5 w-3.5" />;
}

function TaskPlanList({ action, emptyLabel, limit, plans, tone = 'neutral' }: TaskPlanListProps) {
  const { t } = useI18n();
  const visiblePlans = typeof limit === 'number' ? plans.slice(0, limit) : plans;
  const hiddenCount = Math.max(0, plans.length - visiblePlans.length);

  if (plans.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="min-w-0 space-y-1">
      <ul className="grid min-w-0 gap-1">
        {visiblePlans.map((taskPlan) => (
          <li
            key={taskPlan.task.id}
            className={cn(
              'grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/30',
              tone === 'warning' && 'text-warning',
              tone === 'live' && 'text-foreground'
            )}
            title={taskPlan.task.title}
          >
            <span className="text-[10px] font-medium text-muted-foreground">
              {taskPlan.sequence}
            </span>
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {taskPlan.task.title}
            </span>
            <span className="flex min-w-0 shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              {taskPlan.agent ? (
                <span className="max-w-28 truncate">{taskPlan.agent.name}</span>
              ) : (
                <span>{t(taskPlan.blockers[0] ?? taskPlan.assignmentReason)}</span>
              )}
              {action?.(taskPlan)}
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <p className="px-2 text-[10px] text-muted-foreground">
          +{t('{{count}} more', { count: hiddenCount })}
        </p>
      )}
    </div>
  );
}

export function ExecutionControlPanel({
  canReviewPlan,
  onRemoveQueuedTask,
  onReviewPlan,
  onSkipCurrentTask,
  onStop,
  plan,
  running,
}: ExecutionControlPanelProps) {
  const { t } = useI18n();
  const progressValue = plan.progress.progressPercent;
  const blockedPreview = plan.blockedTasks.slice(0, 4);

  return (
    <section className="mt-3 border-t border-border/60 pt-3" aria-label={t('Plan')}>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
              <StatusIcon status={plan.status} />
              <span className="truncate">{t('Plan')}</span>
            </span>
            <span className={cn(getStatusClassName(plan.status), 'shrink-0')}>
              {t(getStatusLabel(plan.status))}
            </span>
          </div>

          {plan.progress.totalTaskCount > 0 && (
            <div
              role="progressbar"
              aria-label={t('Progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressValue}
              className="h-1.5 overflow-hidden rounded-full bg-muted/42"
            >
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="control-chip">
              {t('Ready')} {plan.readyTasks.length}
            </span>
            <span
              className={
                plan.blockedTasks.length > 0 ? 'control-chip control-chip-wait' : 'control-chip'
              }
            >
              {t('Blocked')} {plan.blockedTasks.length}
            </span>
            {plan.maxParallelTasks > 1 && (
              <span className="control-chip">
                {t('Parallel')} {plan.parallelSlotCount}/{plan.maxParallelTasks}
              </span>
            )}
          </div>

          {!running && canReviewPlan && (
            <Button size="xs" variant="outline" className="w-full gap-1" onClick={onReviewPlan}>
              <Play className="h-3.5 w-3.5" />
              {t('Auto Execute')}
            </Button>
          )}
        </div>

        {running ? (
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{t('Current')}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {plan.canSkipCurrent && (
                    <Button variant="ghost" size="xs" className="gap-1" onClick={onSkipCurrentTask}>
                      <SkipForward className="h-3.5 w-3.5" />
                      {t('Skip')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={onStop}
                  >
                    <Square className="h-3.5 w-3.5" />
                    {t('Stop')}
                  </Button>
                </div>
              </div>
              <TaskPlanList
                emptyLabel={t('No ready tasks')}
                plans={plan.currentTask ? [plan.currentTask] : []}
                tone="live"
              />
            </div>

            <div className="min-w-0 space-y-2">
              <span className="text-xs font-semibold text-foreground">{t('Queue')}</span>
              <TaskPlanList
                action={(taskPlan) => (
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={t('Remove')}
                    aria-label={t('Remove')}
                    onClick={() => onRemoveQueuedTask(taskPlan.task.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                emptyLabel={t('No ready tasks')}
                limit={5}
                plans={plan.queuedTasks}
              />
              {plan.missingTaskIds.length > 0 && (
                <p className="text-[10px] text-warning">
                  +{t('{{count}} more', { count: plan.missingTaskIds.length })}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{t('Ready')}</span>
                <span className="text-[10px] text-muted-foreground">
                  {plan.dispatchableTasks.length}/{plan.readyTasks.length}
                </span>
              </div>
              <TaskPlanList emptyLabel={t('No ready tasks')} limit={4} plans={plan.readyTasks} />
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{t('Blocked')}</span>
                <span className="text-[10px] text-muted-foreground">
                  {plan.blockedTasks.length}
                </span>
              </div>
              <TaskPlanList
                emptyLabel={
                  plan.blockers.length > 0
                    ? t(plan.blockers[0] ?? 'No ready tasks')
                    : t('No ready tasks')
                }
                limit={4}
                plans={blockedPreview}
                tone="warning"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
