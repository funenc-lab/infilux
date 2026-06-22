import { motion } from 'framer-motion';
import { MessageSquare, Settings } from 'lucide-react';
import type { CSSProperties, ElementType } from 'react';
import type { TabId } from '@/App/constants';
import { OpenInMenu } from '@/components/app/OpenInMenu';
import { AppResourceStatusPopover } from '@/components/layout/AppResourceStatusPopover';
import { TokenUsagePopover } from '@/components/layout/TokenUsagePopover';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  type FloatingToolbarRevealFrame,
  resolveFloatingToolbarRevealFrame,
} from './floatingToolbarRevealPolicy';

const isMac = typeof window !== 'undefined' && window.electronAPI?.env?.platform === 'darwin';

export interface MainContentTopbarTab {
  id: Exclude<TabId, 'settings'>;
  icon: ElementType;
  label: string;
}

interface MainContentTopbarProps {
  bgImageEnabled: boolean;
  needsTrafficLightPadding: boolean;
  floatingToolbarEnabled: boolean;
  fileSidebarCollapsed: boolean;
  onExpandFileSidebar?: () => void;
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

function getFloatingToolbarRevealStyle(
  toolbarRevealFrame: FloatingToolbarRevealFrame
): CSSProperties {
  return {
    '--control-floating-toolbar-trigger-width': `${toolbarRevealFrame.triggerWidth}px`,
    '--control-floating-toolbar-panel-width': `${toolbarRevealFrame.panelWidth}px`,
    '--control-floating-toolbar-edge-gap': `${toolbarRevealFrame.floatingGap}px`,
  } as CSSProperties;
}

export function MainContentTopbar({
  bgImageEnabled,
  needsTrafficLightPadding,
  floatingToolbarEnabled,
  fileSidebarCollapsed,
  onExpandFileSidebar,
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
  const toolbarRevealFrame = resolveFloatingToolbarRevealFrame({ floatingToolbarEnabled });
  const headerButtonClass = toolbarRevealFrame.floating
    ? 'control-floating-toolbar-action'
    : 'control-topbar-action';

  const renderTabs = (floating: boolean) => (
    <div className={floating ? 'control-floating-toolbar-tabs' : 'control-topbar-tabs'}>
      {tabs.map((tab, index) => {
        const isDropTarget = dropTargetIndex === index;
        const isDragging = draggedIndex === index;
        const isActive = activeTab === tab.id;

        return (
          <div
            key={tab.id}
            draggable={Boolean(onTabReorder)}
            onDragStart={onTabReorder ? (event) => onDragStart(event, index, tab.label) : undefined}
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
                className={
                  floating
                    ? 'absolute inset-y-2 -left-1 w-0.5 rounded-full bg-primary'
                    : 'absolute inset-x-2 -top-1 h-0.5 rounded-full bg-primary'
                }
                transition={springFast}
              />
            ) : null}
            <button
              type="button"
              data-active={isActive ? 'true' : 'false'}
              aria-label={floating ? tab.label : undefined}
              title={tab.label}
              onClick={() => {
                if (tab.id === 'file' && fileSidebarCollapsed) {
                  onExpandFileSidebar?.();
                }
                onTabChange(tab.id);
              }}
              className={floating ? 'control-floating-toolbar-tab' : 'control-topbar-tab'}
            >
              {isActive ? (
                <motion.div
                  layoutId={floating ? 'floating-toolbar-tab-highlight' : 'main-tab-highlight'}
                  className={
                    floating ? 'control-floating-toolbar-tab-surface' : 'control-topbar-tab-surface'
                  }
                  transition={springFast}
                />
              ) : null}
              <span
                className={
                  floating ? 'control-floating-toolbar-tab-icon' : 'control-topbar-tab-icon'
                }
              >
                <tab.icon className="h-3.5 w-3.5" />
              </span>
              <span className={floating ? 'sr-only' : 'control-topbar-tab-label'}>{tab.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderActions = (floating: boolean) => (
    <div
      className={
        floating ? 'control-floating-toolbar-actions-cluster' : 'control-topbar-actions-cluster'
      }
    >
      {isMac ? (
        <>
          <TokenUsagePopover className={headerButtonClass} />
          <AppResourceStatusPopover className={headerButtonClass} />
        </>
      ) : null}
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
          className={cn(headerButtonClass, !floating && 'h-8 rounded-lg border-0 px-3')}
          data-priority="primary"
          aria-label={t('Review')}
          title={t('Review')}
        >
          <MessageSquare className="h-4 w-4" />
          {floating ? <span className="sr-only">{t('Review')}</span> : t('Review')}
        </Button>
      ) : null}
      {showOpenInToolbar ? (
        <OpenInMenu path={openInPath} activeTab={activeTab} compact={floating} />
      ) : null}
    </div>
  );

  if (toolbarRevealFrame.floating) {
    return (
      <div
        className="control-floating-toolbar-rail no-drag"
        data-floating-toolbar-reveal="active"
        style={getFloatingToolbarRevealStyle(toolbarRevealFrame)}
      >
        <aside
          id="floating-main-toolbar"
          className="control-floating-toolbar-panel"
          aria-label={t('Toolbar')}
          role="toolbar"
        >
          <div
            className="control-floating-toolbar-nav"
            role="tablist"
            aria-label={t('Main sections')}
          >
            {renderTabs(true)}
          </div>
          {renderActions(true)}
        </aside>
      </div>
    );
  }

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
            <div className="min-w-0 flex-1 overflow-hidden">{renderTabs(false)}</div>
          </div>

          {renderActions(false)}
        </div>
      </div>
    </header>
  );
}
