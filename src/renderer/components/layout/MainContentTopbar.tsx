import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, GitBranch, MessageSquare, PanelLeft, Settings } from 'lucide-react';
import type { ElementType } from 'react';
import type { TabId } from '@/App/constants';
import { OpenInMenu } from '@/components/app/OpenInMenu';
import { RunningProjectsPopover } from '@/components/layout/RunningProjectsPopover';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';

type LayoutMode = 'columns' | 'tree';

export interface MainContentTopbarTab {
  id: Exclude<TabId, 'settings'>;
  icon: ElementType;
  label: string;
}

interface MainContentTopbarProps {
  bgImageEnabled: boolean;
  needsTrafficLightPadding: boolean;
  hasCollapsedPanels: boolean;
  repositoryCollapsed: boolean;
  worktreeCollapsed: boolean;
  fileSidebarCollapsed: boolean;
  layoutMode: LayoutMode;
  onExpandRepository?: () => void;
  onExpandWorktree?: () => void;
  onExpandFileSidebar?: () => void;
  onSwitchWorktree?: (worktreePath: string) => void;
  onSwitchTab?: (tab: TabId) => void;
  tabs: MainContentTopbarTab[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  draggedIndex: number | null;
  dropTargetIndex: number | null;
  onDragStart: (event: React.DragEvent, index: number, label: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent, index: number) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent, index: number) => void;
  isSettingsActive: boolean;
  onToggleSettings?: () => void;
  activeSessionId: string | null;
  reviewRootPath?: string;
  onOpenReview: () => void;
  showOpenInToolbar: boolean;
  openInPath?: string;
}

export function MainContentTopbar({
  bgImageEnabled,
  needsTrafficLightPadding,
  hasCollapsedPanels,
  repositoryCollapsed,
  worktreeCollapsed,
  fileSidebarCollapsed,
  layoutMode,
  onExpandRepository,
  onExpandWorktree,
  onExpandFileSidebar,
  onSwitchWorktree,
  onSwitchTab,
  tabs,
  activeTab,
  onTabChange,
  onTabReorder,
  draggedIndex,
  dropTargetIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isSettingsActive,
  onToggleSettings,
  activeSessionId,
  reviewRootPath,
  onOpenReview,
  showOpenInToolbar,
  openInPath,
}: MainContentTopbarProps) {
  const { t } = useI18n();
  const headerButtonClass = 'control-topbar-action';

  return (
    <header
      data-background={bgImageEnabled ? 'transparent' : 'surface'}
      className={cn(
        'control-topbar-header shrink-0 drag-region',
        needsTrafficLightPadding && 'pl-[80px]'
      )}
    >
      <div className="control-topbar no-drag">
        <div className="control-topbar-main">
          <div className="control-topbar-nav">
            <AnimatePresence mode="popLayout">
              {hasCollapsedPanels ? (
                <motion.div
                  key="toolbar-panels"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex items-center gap-2 overflow-hidden"
                >
                  {repositoryCollapsed && onSwitchWorktree && onSwitchTab ? (
                    <RunningProjectsPopover
                      onSelectWorktreeByPath={onSwitchWorktree}
                      onSwitchTab={onSwitchTab}
                      showBadge={false}
                    />
                  ) : null}
                  <Menu>
                    <MenuTrigger
                      render={
                        <button
                          type="button"
                          className={headerButtonClass}
                          title={t('Panels')}
                          aria-label={t('Panels')}
                        >
                          <PanelLeft className="h-4 w-4" />
                        </button>
                      }
                    />
                    <MenuPopup align="start" sideOffset={8} className="min-w-[190px]">
                      {layoutMode === 'tree' ? (
                        onExpandRepository ? (
                          <MenuItem onClick={onExpandRepository}>
                            <FolderOpen className="h-4 w-4" />
                            {t('Expand Sidebar')}
                          </MenuItem>
                        ) : null
                      ) : (
                        <>
                          {repositoryCollapsed && onExpandRepository ? (
                            <MenuItem onClick={onExpandRepository}>
                              <FolderOpen className="h-4 w-4" />
                              {t('Expand Repository')}
                            </MenuItem>
                          ) : null}
                          {worktreeCollapsed && onExpandWorktree ? (
                            <MenuItem onClick={onExpandWorktree}>
                              <GitBranch className="h-4 w-4" />
                              {t('Expand Worktree')}
                            </MenuItem>
                          ) : null}
                        </>
                      )}
                      {fileSidebarCollapsed && onExpandFileSidebar ? (
                        <MenuItem onClick={onExpandFileSidebar}>
                          <PanelLeft className="h-4 w-4" />
                          {t('Expand File Sidebar')}
                        </MenuItem>
                      ) : null}
                    </MenuPopup>
                  </Menu>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="control-topbar-tabs">
                {tabs.map((tab, index) => {
                  const isDropTarget = dropTargetIndex === index;
                  const isDragging = draggedIndex === index;
                  const isActive = activeTab === tab.id;

                  return (
                    <div
                      key={tab.id}
                      draggable={Boolean(onTabReorder)}
                      onDragStart={
                        onTabReorder ? (event) => onDragStart(event, index, tab.label) : undefined
                      }
                      onDragEnd={onTabReorder ? onDragEnd : undefined}
                      onDragOver={onTabReorder ? (event) => onDragOver(event, index) : undefined}
                      onDragLeave={onTabReorder ? onDragLeave : undefined}
                      onDrop={onTabReorder ? (event) => onDrop(event, index) : undefined}
                      aria-grabbed={isDragging}
                      aria-disabled={!onTabReorder}
                      className={cn(
                        'relative flex items-center',
                        isDragging && 'opacity-50',
                        onTabReorder && 'cursor-grab active:cursor-grabbing'
                      )}
                    >
                      {isDropTarget && !isDragging ? (
                        <motion.div
                          layoutId="tab-drop-indicator"
                          className="absolute inset-x-2 -top-1 h-0.5 rounded-full bg-primary"
                          transition={springFast}
                        />
                      ) : null}
                      <button
                        type="button"
                        data-active={isActive ? 'true' : 'false'}
                        onClick={() => {
                          if (tab.id === 'file' && fileSidebarCollapsed) {
                            onExpandFileSidebar?.();
                          }
                          onTabChange(tab.id);
                        }}
                        className="control-topbar-tab"
                      >
                        {isActive ? (
                          <motion.div
                            layoutId="main-tab-highlight"
                            className="control-topbar-tab-surface"
                            transition={springFast}
                          />
                        ) : null}
                        <span className="control-topbar-tab-icon">
                          <tab.icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="control-topbar-tab-label">{tab.label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="control-topbar-actions-cluster">
            <button
              type="button"
              data-active={isSettingsActive ? 'true' : 'false'}
              aria-label={t('Settings')}
              aria-pressed={isSettingsActive}
              className={headerButtonClass}
              onClick={onToggleSettings}
              title={t('Settings')}
            >
              <Settings className="h-4 w-4" />
            </button>
            {activeSessionId && reviewRootPath ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenReview}
                className="control-topbar-action h-8 rounded-lg border-0 px-3"
                data-priority="primary"
              >
                <MessageSquare className="h-4 w-4" />
                {t('Review')}
              </Button>
            ) : null}
            {showOpenInToolbar ? <OpenInMenu path={openInPath} activeTab={activeTab} /> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
