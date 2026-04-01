import { Fragment, type ReactElement } from 'react';

interface RepositoryTreeSummaryProps {
  worktreeCount: number;
  activeWorktreeCount: number;
  className?: string;
}

export function RepositoryTreeSummary({
  worktreeCount,
  activeWorktreeCount,
  className,
}: RepositoryTreeSummaryProps) {
  const items = [
    worktreeCount > 0 ? (
      <span key="trees" className="control-tree-metric">
        <span className="control-tree-metric-value">{worktreeCount}</span>
        <span className="control-tree-metric-label">trees</span>
      </span>
    ) : null,
    activeWorktreeCount > 0 ? (
      <span key="live" className="control-tree-metric">
        <span className="control-tree-metric-value">{activeWorktreeCount}</span>
        <span className="control-tree-metric-label">live</span>
      </span>
    ) : null,
  ].filter((item): item is ReactElement => item !== null);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={['control-tree-meta control-tree-meta-inline shrink-0', className]
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
