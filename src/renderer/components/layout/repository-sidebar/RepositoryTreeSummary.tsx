import { Fragment, type ReactElement } from 'react';
import { useI18n } from '@/i18n';

interface RepositoryTreeSummaryProps {
  worktreeCount: number;
  activeWorktreeCount: number;
  activeWorktreeName?: string | null;
  className?: string;
}

export function RepositoryTreeSummary({
  worktreeCount,
  activeWorktreeCount,
  activeWorktreeName,
  className,
}: RepositoryTreeSummaryProps) {
  const { t } = useI18n();
  const items = [
    worktreeCount > 0 ? (
      <span key="trees" className="control-tree-metric">
        <span className="control-tree-metric-value">{worktreeCount}</span>
        <span className="control-tree-metric-label">{t('Worktrees')}</span>
      </span>
    ) : null,
    activeWorktreeName ? (
      <span
        key="current-worktree"
        className="control-tree-current-worktree"
        data-current-worktree="true"
        title={t('Current worktree: {{name}}', { name: activeWorktreeName })}
      >
        {activeWorktreeName}
      </span>
    ) : activeWorktreeCount > 0 ? (
      <span key="live" className="control-tree-metric">
        <span className="control-tree-metric-value">{activeWorktreeCount}</span>
        <span className="control-tree-metric-label">{t('Active')}</span>
      </span>
    ) : null,
  ].filter((item): item is ReactElement => item !== null);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={[
        'control-tree-meta control-tree-meta-inline control-tree-summary shrink-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {items.map((item, index) => (
        <Fragment key={item.key ?? index}>
          {index > 0 ? <span className="control-tree-separator">·</span> : null}
          {item}
        </Fragment>
      ))}
    </div>
  );
}
