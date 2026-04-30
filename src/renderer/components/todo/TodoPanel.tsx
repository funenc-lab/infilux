import { KanbanSquare } from 'lucide-react';
import { ControlStateCard } from '@/components/layout/ControlStateCard';
import { useI18n } from '@/i18n';
import { KanbanBoard, type TodoTaskFocusRequest } from './KanbanBoard';

export interface TodoPanelProps {
  repoPath?: string;
  worktreePath?: string;
  isActive?: boolean;
  focusTaskRequest?: TodoTaskFocusRequest | null;
  onSwitchToAgent?: () => void;
}

export function TodoPanel({
  focusTaskRequest,
  repoPath,
  worktreePath,
  onSwitchToAgent,
}: TodoPanelProps) {
  const { t } = useI18n();

  if (!repoPath) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
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
      <div className="min-h-0 flex-1 overflow-hidden">
        <KanbanBoard
          repoPath={repoPath}
          worktreePath={worktreePath}
          focusTaskRequest={focusTaskRequest ?? null}
          onSwitchToAgent={onSwitchToAgent}
        />
      </div>
    </div>
  );
}
