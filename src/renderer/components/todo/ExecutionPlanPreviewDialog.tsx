import { AlertTriangle, CheckCircle2, ListOrdered, Play } from 'lucide-react';
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
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { TodoOrchestrationPlan, TodoOrchestrationTaskPlan } from './todoOrchestrator';

interface ExecutionPlanPreviewDialogProps {
  onOpenChange: (open: boolean) => void;
  onStart: () => void;
  open: boolean;
  plan: TodoOrchestrationPlan;
}

interface TaskPlanRowProps {
  indexLabel?: string;
  taskPlan: TodoOrchestrationTaskPlan;
  tone?: 'neutral' | 'warning';
}

function TaskPlanRow({ indexLabel, taskPlan, tone = 'neutral' }: TaskPlanRowProps) {
  const { t } = useI18n();
  const blockerLabel = taskPlan.blockers[0];

  return (
    <li
      className={cn(
        'grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-2',
        tone === 'warning' ? 'bg-warning/8 text-warning' : 'bg-muted/12'
      )}
    >
      <span className="pt-0.5 text-[10px] font-medium text-muted-foreground">
        {indexLabel ?? taskPlan.sequence}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="truncate text-xs font-semibold text-foreground">{taskPlan.task.title}</p>
        {taskPlan.task.description && (
          <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {taskPlan.task.description}
          </p>
        )}
      </div>
      <div className="flex max-w-32 shrink-0 flex-col items-end gap-1 text-right text-[10px]">
        {blockerLabel ? (
          <span className="max-w-full truncate text-warning">{t(blockerLabel)}</span>
        ) : taskPlan.agent ? (
          <>
            <span className="max-w-full truncate text-foreground">{taskPlan.agent.name}</span>
            <span className="max-w-full truncate text-muted-foreground">
              {t(taskPlan.assignmentReason)}
            </span>
          </>
        ) : (
          <span className="max-w-full truncate text-warning">
            {t(blockerLabel ?? taskPlan.assignmentReason)}
          </span>
        )}
      </div>
    </li>
  );
}

export function ExecutionPlanPreviewDialog({
  onOpenChange,
  onStart,
  open,
  plan,
}: ExecutionPlanPreviewDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/16 text-muted-foreground">
              <ListOrdered className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{t('Plan')}</DialogTitle>
              <DialogDescription>
                {t('Review execution order, agent assignment, and blockers before starting.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogPanel>
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md bg-muted/12 px-3 py-2">
                <span className="block text-[10px] text-muted-foreground">{t('Ready')}</span>
                <span className="text-sm font-semibold text-foreground">
                  {plan.readyTasks.length}
                </span>
              </div>
              <div className="rounded-md bg-muted/12 px-3 py-2">
                <span className="block text-[10px] text-muted-foreground">{t('Blocked')}</span>
                <span className="text-sm font-semibold text-foreground">
                  {plan.blockedTasks.length}
                </span>
              </div>
              <div className="rounded-md bg-muted/12 px-3 py-2">
                <span className="block text-[10px] text-muted-foreground">{t('Parallel')}</span>
                <span className="text-sm font-semibold text-foreground">
                  {plan.parallelSlotCount}/{plan.maxParallelTasks}
                </span>
              </div>
              <div className="rounded-md bg-muted/12 px-3 py-2">
                <span className="block text-[10px] text-muted-foreground">{t('Progress')}</span>
                <span className="text-sm font-semibold text-foreground">
                  {plan.progress.progressPercent}%
                </span>
              </div>
            </div>

            <section className="min-w-0 space-y-2" aria-label={t('Ready')}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <h3 className="text-xs font-semibold text-foreground">{t('Ready')}</h3>
              </div>
              {plan.readyTasks.length > 0 ? (
                <ul className="grid min-w-0 gap-1.5">
                  {plan.readyTasks.map((taskPlan) => (
                    <TaskPlanRow key={taskPlan.task.id} taskPlan={taskPlan} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-md bg-muted/12 px-3 py-2 text-xs text-muted-foreground">
                  {t(plan.blockers[0] ?? 'No ready tasks')}
                </p>
              )}
            </section>

            {plan.blockedTasks.length > 0 && (
              <section className="min-w-0 space-y-2" aria-label={t('Blocked')}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <h3 className="text-xs font-semibold text-foreground">{t('Blocked')}</h3>
                </div>
                <ul className="grid min-w-0 gap-1.5">
                  {plan.blockedTasks.map((taskPlan) => (
                    <TaskPlanRow
                      key={taskPlan.task.id}
                      indexLabel="-"
                      taskPlan={taskPlan}
                      tone="warning"
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </DialogPanel>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button className="gap-1" disabled={!plan.canStart} onClick={onStart}>
            <Play className="h-4 w-4" />
            {t('Auto Execute')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
