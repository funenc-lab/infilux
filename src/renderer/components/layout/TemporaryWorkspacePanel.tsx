import type { TempWorkspaceItem } from '@shared/types';
import { getDisplayPath, isWslUncPath } from '@shared/utils/path';
import {
  FolderGit2,
  GitBranch,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { TempWorkspaceContextMenu } from '@/components/temp-workspace/TempWorkspaceContextMenu';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { SidebarEmptyState } from './SidebarEmptyState';

interface TemporaryWorkspacePanelProps {
  items: TempWorkspaceItem[];
  activePath: string | null;
  onSelect: (item: TempWorkspaceItem) => void;
  onCreate: () => void;
  onRequestRename: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRefresh: () => void;
  onCollapse?: () => void;
}

export function TemporaryWorkspacePanel({
  items,
  activePath,
  onSelect,
  onCreate,
  onRequestRename,
  onRequestDelete,
  onRefresh,
  onCollapse,
}: TemporaryWorkspacePanelProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => b.createdAt - a.createdAt), [items]);
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedItems;
    const query = searchQuery.toLowerCase();
    return sortedItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.folderName.toLowerCase().includes(query) ||
        item.path.toLowerCase().includes(query)
    );
  }, [sortedItems, searchQuery]);
  const hasSearchFilter = searchQuery.trim().length > 0;

  return (
    <aside className="control-sidebar flex h-full w-full flex-col border-r bg-background">
      <div className="control-sidebar-header drag-region">
        <div className="control-sidebar-heading no-drag">
          <div className="control-sidebar-heading-copy">
            <span className="control-sidebar-title">{t('Temp Sessions')}</span>
            <span className="control-sidebar-subtitle">{t('Disposable workspaces')}</span>
          </div>
        </div>
        <div className="control-sidebar-toolbar no-drag">
          <button
            type="button"
            className="control-sidebar-toolbutton no-drag"
            onClick={onRefresh}
            aria-label={t('Refresh')}
            title={t('Refresh')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {onCollapse && (
            <button
              type="button"
              className="control-sidebar-toolbutton no-drag"
              onClick={onCollapse}
              aria-label={t('Collapse')}
              title={t('Collapse')}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="control-sidebar-strip">
        <div className="control-sidebar-filter control-sidebar-search">
          <Search className="control-sidebar-search-icon h-3.5 w-3.5" />
          <input
            ref={searchInputRef}
            type="text"
            aria-label={t('Search sessions')}
            placeholder={t('Search sessions')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="control-sidebar-search-input"
          />
          {hasSearchFilter ? (
            <button
              type="button"
              className="control-sidebar-search-clear"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label={t('Clear search')}
              title={t('Clear')}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1.5 py-1.5">
        {filteredItems.length === 0 ? (
          <div className="flex h-full items-start justify-start px-2 py-3">
            {hasSearchFilter ? (
              <SidebarEmptyState
                icon={<Search className="h-4.5 w-4.5" />}
                label={t('Filtered View')}
                title={t('No matches')}
                description={t('Try a broader search or clear the current filter.')}
                meta={t('Filter: {{query}}', {
                  query: searchQuery.trim() || t('Search query'),
                })}
                actions={
                  <Button
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    variant="outline"
                    size="sm"
                    className="control-action-button control-action-button-secondary h-8 rounded-lg px-3 text-sm"
                  >
                    {t('Clear Search')}
                  </Button>
                }
              />
            ) : (
              <SidebarEmptyState
                icon={<FolderGit2 className="h-4.5 w-4.5" />}
                label={t('Getting Started')}
                title={t('No temp sessions yet')}
                description={t('Create one to open a disposable workspace for quick experiments.')}
                actions={
                  <Button
                    onClick={onCreate}
                    variant="default"
                    size="sm"
                    className="control-action-button control-action-button-primary min-w-0 rounded-lg px-3.5 text-sm font-semibold tracking-[-0.01em]"
                  >
                    <Plus className="h-4 w-4" />
                    {t('New Temp Session')}
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredItems.map((item) => (
              <TemporaryWorkspaceItemRow
                key={item.id}
                item={item}
                isActive={activePath === item.path}
                onSelect={() => onSelect(item)}
                onRequestRename={() => onRequestRename(item.id)}
                onRequestDelete={() => onRequestDelete(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="control-sidebar-footer">
        <button
          type="button"
          className="control-sidebar-footer-action control-sidebar-footer-action-primary"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          {t('New Temp Session')}
        </button>
      </div>
    </aside>
  );
}

interface TemporaryWorkspaceItemRowProps {
  item: TempWorkspaceItem;
  isActive: boolean;
  onSelect: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}

function TemporaryWorkspaceItemRow({
  item,
  isActive,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: TemporaryWorkspaceItemRowProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const activities = useWorktreeActivityStore((s) => s.activities);
  const activity = activities[item.path] || { agentCount: 0, terminalCount: 0 };
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const displayPath = getDisplayPath(item.path);
  const useLtrPathDisplay = isWslUncPath(displayPath);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        className="control-tree-node group flex w-full flex-col gap-0.5 px-2 py-1 text-left"
        data-active={isActive ? 'worktree' : 'false'}
        aria-current={isActive ? 'page' : undefined}
      >
        <div className="relative z-10 flex w-full items-start gap-1.5">
          <span className="control-tree-glyph mt-0.5 h-4 w-4 shrink-0">
            <GitBranch className="control-tree-icon h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="control-tree-title min-w-0 flex-1 truncate">{item.title}</span>
              <span className="control-tree-flag control-tree-flag-main shrink-0">{t('Main')}</span>
            </div>
            <div
              className={cn(
                'control-tree-subtitle mt-px overflow-hidden whitespace-nowrap text-ellipsis [text-align:left] [unicode-bidi:plaintext]',
                useLtrPathDisplay ? '[direction:ltr]' : '[direction:rtl]'
              )}
              title={displayPath}
            >
              {displayPath}
            </div>
          </div>
        </div>
        {hasActivity && (
          <div className="control-tree-meta control-tree-meta-row relative z-10 mt-0.5 pl-[1.25rem]">
            {activity.agentCount > 0 && (
              <span className="control-tree-metric">
                <Sparkles className="h-3 w-3" />
                <span className="control-tree-metric-value">{activity.agentCount}</span>
              </span>
            )}
            {activity.agentCount > 0 && activity.terminalCount > 0 && (
              <span className="control-tree-separator">·</span>
            )}
            {activity.terminalCount > 0 && (
              <span className="control-tree-metric">
                <Terminal className="h-3 w-3" />
                <span className="control-tree-metric-value">{activity.terminalCount}</span>
              </span>
            )}
          </div>
        )}
      </button>

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
