import type { TempWorkspaceItem } from '@shared/types';
import { getDisplayPath } from '@shared/utils/path';
import { GitBranch } from 'lucide-react';
import { useState } from 'react';
import { TempWorkspaceContextMenu } from '@/components/temp-workspace/TempWorkspaceContextMenu';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

interface TempWorkspaceTreeItemProps {
  item: TempWorkspaceItem;
  isActive: boolean;
  onSelect: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}

export function TempWorkspaceTreeItem({
  item,
  isActive,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: TempWorkspaceTreeItemProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const activities = useWorktreeActivityStore((s) => s.activities);
  const activity = activities[item.path] || { agentCount: 0, terminalCount: 0 };
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const displayTempPath = getDisplayPath(item.path);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <>
      <div className="control-tree-guide-item">
        <button
          type="button"
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          className="control-tree-node group flex w-full flex-col gap-0.5 px-2 py-1 text-left"
          data-active={isActive ? 'worktree' : 'false'}
          aria-current={isActive ? 'page' : undefined}
          title={displayTempPath}
        >
          <div className="control-tree-row">
            <span className="control-tree-glyph h-4 w-4 shrink-0">
              <GitBranch className="control-tree-icon h-3.5 w-3.5" />
            </span>
            <div className="control-tree-text-stack min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="control-tree-title min-w-0 flex-1 truncate">{item.title}</span>
                {hasActivity ? (
                  <div className="control-tree-meta control-tree-meta-inline">
                    {activity.agentCount > 0 ? (
                      <span className="control-tree-metric">
                        <span className="control-tree-metric-value">{activity.agentCount}</span>
                        <span className="control-tree-metric-label">{t('agents')}</span>
                      </span>
                    ) : null}
                    {activity.agentCount > 0 && activity.terminalCount > 0 ? (
                      <span className="control-tree-separator">·</span>
                    ) : null}
                    {activity.terminalCount > 0 ? (
                      <span className="control-tree-metric">
                        <span className="control-tree-metric-value">{activity.terminalCount}</span>
                        <span className="control-tree-metric-label">{t('terminals')}</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div
                className={cn(
                  'control-tree-subtitle truncate [unicode-bidi:plaintext]',
                  '[text-align:left]'
                )}
              >
                {displayTempPath}
              </div>
            </div>
          </div>
        </button>
      </div>

      <TempWorkspaceContextMenu
        open={menuOpen}
        position={menuPosition}
        path={item.path}
        onClose={() => setMenuOpen(false)}
        onRename={onRequestRename}
        onDelete={onRequestDelete}
      />
    </>
  );
}
