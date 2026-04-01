import type { GitWorktree, TerminalSession } from '@shared/types';
import { getDisplayPath, getDisplayPathBasename } from '@shared/utils/path';
import {
  Activity,
  Bot,
  Copy,
  FolderGit2,
  FolderOpen,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabId } from '@/App/constants';
import type { Session } from '@/components/chat/SessionBar';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { toastManager } from '@/components/ui/toast';
import { useWorktreeListMultiple } from '@/hooks/useWorktree';
import { useI18n } from '@/i18n';
import { buildClipboardToastCopy } from '@/lib/feedbackCopy';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { defaultGlobalKeybindings, useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

interface RunningProjectsPopoverProps {
  onSelectWorktreeByPath: (worktreePath: string) => Promise<void> | void;
  onSwitchTab?: (tab: TabId) => void;
  showBadge?: boolean;
}

interface GroupedProject {
  path: string;
  repoPath: string;
  displayPath: string;
  repoName: string;
  branchName: string;
  worktree: GitWorktree | undefined;
  agents: Session[];
  terminals: TerminalSession[];
}

type SelectableItem =
  | { type: 'project'; project: GroupedProject }
  | { type: 'agent'; session: Session }
  | { type: 'terminal'; terminal: TerminalSession };

function getAgentSessionLabel(session: Session): string {
  return session.terminalTitle || session.name || session.agentId;
}

export function RunningProjectsPopover({
  onSelectWorktreeByPath,
  onSwitchTab,
  showBadge = true,
}: RunningProjectsPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuProject, setMenuProject] = useState<GroupedProject | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const runningProjectsKeybinding = useSettingsStore(
    (s) => s.globalKeybindings?.runningProjects ?? defaultGlobalKeybindings.runningProjects
  );

  const activities = useWorktreeActivityStore((s) => s.activities);
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const agentSessions = useAgentSessionsStore((s) => s.sessions);
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const setAgentActiveId = useAgentSessionsStore((s) => s.setActiveId);
  const setTerminalActive = useTerminalStore((s) => s.setActiveSession);

  const activeWorktreePaths = useMemo(() => {
    return Object.entries(activities)
      .filter(([, act]) => act.agentCount > 0 || act.terminalCount > 0)
      .map(([path]) => path);
  }, [activities]);

  const { worktreesMap } = useWorktreeListMultiple(activeWorktreePaths);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setMenuOpen(false);
      setSelectedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybinding(e, runningProjectsKeybinding)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [runningProjectsKeybinding]);

  const worktreeByPath = useMemo(() => {
    const map = new Map<string, GitWorktree>();
    for (const worktrees of Object.values(worktreesMap)) {
      for (const wt of sanitizeGitWorktrees(worktrees)) {
        map.set(wt.path, wt);
      }
    }
    return map;
  }, [worktreesMap]);

  const groupedProjects = useMemo<GroupedProject[]>(() => {
    return activeWorktreePaths.map((path) => {
      const worktree = worktreeByPath.get(path);
      const agents = agentSessions.filter((s) => s.cwd === path);
      const terminals = terminalSessions.filter((s) => s.cwd === path);
      const repoPath = agents[0]?.repoPath || path;
      return {
        path,
        repoPath,
        displayPath: getDisplayPath(path),
        repoName: getDisplayPathBasename(repoPath),
        branchName: worktree?.branch || getDisplayPathBasename(path),
        worktree,
        agents,
        terminals,
      };
    });
  }, [activeWorktreePaths, agentSessions, terminalSessions, worktreeByPath]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return groupedProjects;
    const query = searchQuery.toLowerCase();
    return groupedProjects.filter((project) => {
      if (project.repoName.toLowerCase().includes(query)) return true;
      if (project.branchName.toLowerCase().includes(query)) return true;
      if (project.displayPath.toLowerCase().includes(query)) return true;
      if (project.agents.some((a) => getAgentSessionLabel(a).toLowerCase().includes(query)))
        return true;
      if (
        project.terminals.some((terminal) =>
          (terminal.title || t('Terminal')).toLowerCase().includes(query)
        )
      )
        return true;
      return false;
    });
  }, [groupedProjects, searchQuery, t]);

  const selectableItems = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];
    for (const project of filteredProjects) {
      items.push({ type: 'project', project });
      for (const session of project.agents) {
        items.push({ type: 'agent', session });
      }
      for (const terminal of project.terminals) {
        items.push({ type: 'terminal', terminal });
      }
    }
    return items;
  }, [filteredProjects]);

  const totalRunning = groupedProjects.length;

  const handleSelectItem = useCallback(
    async (item: SelectableItem) => {
      switch (item.type) {
        case 'project':
          await onSelectWorktreeByPath(item.project.path);
          break;
        case 'agent':
          await onSelectWorktreeByPath(item.session.cwd);
          setAgentActiveId(item.session.cwd, item.session.id);
          onSwitchTab?.('chat');
          break;
        case 'terminal':
          await onSelectWorktreeByPath(item.terminal.cwd);
          setTerminalActive(item.terminal.id);
          onSwitchTab?.('terminal');
          break;
      }
      setOpen(false);
    },
    [onSelectWorktreeByPath, onSwitchTab, setAgentActiveId, setTerminalActive]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (menuOpen) return;

      const itemCount = selectableItems.length;
      if (itemCount === 0) return;

      const scrollToIndex = (index: number) => {
        requestAnimationFrame(() => {
          const el = listRef.current?.querySelector(`[data-index="${index}"]`);
          el?.scrollIntoView({ block: 'nearest' });
        });
      };

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev + 1) % itemCount;
            scrollToIndex(next);
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = (prev - 1 + itemCount) % itemCount;
            scrollToIndex(next);
            return next;
          });
          break;
        case 'Enter':
          e.preventDefault();
          {
            const currentIndex = Math.min(selectedIndex, itemCount - 1);
            const item = selectableItems[currentIndex];
            if (item) handleSelectItem(item);
          }
          break;
      }
    },
    [menuOpen, selectableItems, selectedIndex, handleSelectItem]
  );

  const getItemId = (item: SelectableItem): string => {
    switch (item.type) {
      case 'project':
        return `project-${item.project.path}`;
      case 'agent':
        return `agent-${item.session.id}`;
      case 'terminal':
        return `terminal-${item.terminal.id}`;
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, project: GroupedProject) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuProject(project);

    if (dialogRef.current) {
      const dialogRect = dialogRef.current.getBoundingClientRect();
      setMenuPosition({
        x: e.clientX - dialogRect.left,
        y: e.clientY - dialogRect.top,
      });
    } else {
      setMenuPosition({ x: e.clientX, y: e.clientY });
    }
    setMenuOpen(true);
  }, []);

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(getDisplayPath(path));
      const successCopy = buildClipboardToastCopy({ phase: 'success', subject: 'path' }, t);
      toastManager.add({
        type: 'success',
        title: successCopy.title,
        description: successCopy.description,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorCopy = buildClipboardToastCopy(
        { phase: 'error', subject: 'path', message: message || undefined },
        t
      );
      toastManager.add({
        type: 'error',
        title: errorCopy.title,
        description: errorCopy.description,
      });
    } finally {
      setMenuOpen(false);
    }
  };

  return (
    <>
      <span className="control-toolbar-badge-anchor">
        <button
          type="button"
          className="control-sidebar-toolbutton no-drag"
          data-open={open ? 'true' : 'false'}
          aria-pressed={open}
          aria-label={
            totalRunning > 0 ? `${t('Running Projects')} (${totalRunning})` : t('Running Projects')
          }
          title={t('Running Projects')}
          onClick={() => setOpen(true)}
        >
          <Activity className="h-4 w-4" />
        </button>
        {showBadge && totalRunning > 0 && (
          <span className="control-badge control-badge-live control-toolbar-badge control-toolbar-badge-green">
            {totalRunning}
          </span>
        )}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="sm:max-w-2xl p-0 overflow-visible" showCloseButton={false}>
          <div ref={dialogRef} className="relative">
            <div className="flex items-center gap-2 border-b border-border/60 bg-background/92 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('Search running projects...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="ui-type-panel-description h-8 w-full bg-transparent outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
              {filteredProjects.length === 0 ? (
                <div className="ui-type-panel-description py-6 text-center text-muted-foreground">
                  {searchQuery ? t('No matching results') : t('No running projects')}
                </div>
              ) : (
                <div className="space-y-1">
                  {selectableItems.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    const itemId = getItemId(item);

                    if (item.type === 'project') {
                      return (
                        <button
                          key={itemId}
                          type="button"
                          data-index={index}
                          className={cn(
                            'control-tree-node group relative flex w-full flex-col gap-0.5 px-2 py-1 text-left',
                            isSelected && 'ring-1 ring-inset ring-theme/12'
                          )}
                          onClick={() => handleSelectItem(item)}
                          onContextMenu={(e) => handleContextMenu(e, item.project)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          data-active={isSelected ? 'worktree' : 'false'}
                          title={item.project.displayPath}
                        >
                          <div className="control-tree-row">
                            <span className="control-tree-glyph h-4 w-4 shrink-0">
                              <FolderGit2 className="control-tree-icon h-4 w-4" />
                            </span>
                            <div className="control-tree-text-stack min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="control-tree-title min-w-0 flex-1 truncate">
                                  {item.project.branchName}
                                </span>
                                <div className="control-tree-meta control-tree-meta-inline ui-type-meta">
                                  {item.project.agents.length > 0 ? (
                                    <span className="control-tree-metric">
                                      <span className="control-tree-metric-value">
                                        {item.project.agents.length}
                                      </span>
                                      <span className="control-tree-metric-label">
                                        {t('agents')}
                                      </span>
                                    </span>
                                  ) : null}
                                  {item.project.agents.length > 0 &&
                                  item.project.terminals.length > 0 ? (
                                    <span className="control-tree-separator">·</span>
                                  ) : null}
                                  {item.project.terminals.length > 0 ? (
                                    <span className="control-tree-metric">
                                      <span className="control-tree-metric-value">
                                        {item.project.terminals.length}
                                      </span>
                                      <span className="control-tree-metric-label">
                                        {t('terminals')}
                                      </span>
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="control-tree-subtitle overflow-hidden whitespace-nowrap text-ellipsis [text-align:left] [unicode-bidi:plaintext]">
                                {item.project.repoName}
                                <span className="mx-1 text-current/45">·</span>
                                {item.project.displayPath}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    }

                    if (item.type === 'agent') {
                      return (
                        <button
                          key={itemId}
                          type="button"
                          data-index={index}
                          className={cn(
                            'ui-type-panel-description flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-8 text-muted-foreground transition-colors hover:bg-theme/8 hover:text-foreground',
                            isSelected && 'bg-theme/10 text-foreground'
                          )}
                          onClick={() => handleSelectItem(item)}
                          onMouseEnter={() => setSelectedIndex(index)}
                        >
                          <Bot className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">
                            {getAgentSessionLabel(item.session)}
                          </span>
                          <span className="control-badge shrink-0">{t('Agent')}</span>
                        </button>
                      );
                    }

                    return (
                      <button
                        key={itemId}
                        type="button"
                        data-index={index}
                        className={cn(
                          'ui-type-panel-description flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-8 text-muted-foreground transition-colors hover:bg-theme/8 hover:text-foreground',
                          isSelected && 'bg-theme/10 text-foreground'
                        )}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <Terminal className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {item.terminal.title || 'Terminal'}
                        </span>
                        <span className="control-badge shrink-0">{t('Terminal')}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {menuOpen && menuProject && (
              <>
                <div
                  className="fixed inset-0 z-50"
                  onClick={() => setMenuOpen(false)}
                  onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                  }}
                  role="presentation"
                />
                <div
                  ref={menuRef}
                  className="control-menu absolute z-50 min-w-40 rounded-lg p-1"
                  style={{ left: menuPosition.x, top: menuPosition.y }}
                >
                  {menuProject.agents.length > 0 && menuProject.terminals.length > 0 && (
                    <button
                      type="button"
                      className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                      onClick={() => {
                        setMenuOpen(false);
                        closeAgentSessions(menuProject.path);
                        closeTerminalSessions(menuProject.path);
                      }}
                    >
                      <X className="h-4 w-4" />
                      {t('Close All Sessions')}
                    </button>
                  )}

                  {menuProject.agents.length > 0 && (
                    <button
                      type="button"
                      className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                      onClick={() => {
                        setMenuOpen(false);
                        closeAgentSessions(menuProject.path);
                      }}
                    >
                      <X className="h-4 w-4" />
                      <Sparkles className="h-4 w-4" />
                      {t('Close Agent Sessions')}
                    </button>
                  )}

                  {menuProject.terminals.length > 0 && (
                    <button
                      type="button"
                      className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                      onClick={() => {
                        setMenuOpen(false);
                        closeTerminalSessions(menuProject.path);
                      }}
                    >
                      <X className="h-4 w-4" />
                      <Terminal className="h-4 w-4" />
                      {t('Close Terminal Sessions')}
                    </button>
                  )}

                  <div className="my-1 h-px bg-border" />

                  <button
                    type="button"
                    className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                    onClick={() => {
                      setMenuOpen(false);
                      window.electronAPI.shell.openPath(menuProject.path);
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t('Open folder')}
                  </button>

                  <button
                    type="button"
                    className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5"
                    onClick={() => handleCopyPath(menuProject.path)}
                  >
                    <Copy className="h-4 w-4" />
                    {t('Copy Path')}
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
