import { KanbanSquare } from 'lucide-react';
import { ControlStateCard } from '@/components/layout/ControlStateCard';
import { useI18n } from '@/i18n';
import { KanbanBoard } from './KanbanBoard';

export interface TodoPanelProps {
  repoPath?: string;
  worktreePath?: string;
  isActive?: boolean;
  onSwitchToAgent?: () => void;
}

export function TodoPanel({ repoPath, worktreePath, onSwitchToAgent }: TodoPanelProps) {
  const { t } = useI18n();

  if (!repoPath) {
    return (
      <ControlStateCard
        icon={<KanbanSquare className="h-5 w-5" />}
        eyebrow={t('Todo')}
        title={t('No repository selected')}
        description={t('Select a repository to manage tasks')}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <KanbanBoard
        repoPath={repoPath}
        worktreePath={worktreePath}
        onSwitchToAgent={onSwitchToAgent}
      />
    </div>
  );
}
