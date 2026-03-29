import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { AgentGroupEmptyState } from './AgentGroupEmptyState';
import { type Session, SessionBar } from './SessionBar';
import type { AgentGroup as AgentGroupType } from './types';

interface AgentGroupProps {
  group: AgentGroupType;
  repoPath?: string;
  sessions: Session[]; // All sessions for current worktree (filtered by groupSessionIds)
  enabledAgents: string[];
  customAgents: Array<{ id: string; name: string; command: string }>;
  agentSettings: Record<
    string,
    { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
  >;
  agentInfo: Record<string, { name: string; command: string }>;
  onSessionSelect: (sessionId: string) => void;
  onSessionClose: (sessionId: string) => void;
  onSessionNew: () => void;
  onSessionNewWithAgent: (agentId: string, agentCommand: string) => void;
  onSessionRename: (sessionId: string, name: string) => void;
  onSessionReorder: (fromIndex: number, toIndex: number) => void;
  onGroupClick: () => void;
  // Quick Terminal props
  quickTerminalOpen?: boolean;
  quickTerminalHasProcess?: boolean;
  onToggleQuickTerminal?: () => void;
}

export function AgentGroup({
  group,
  repoPath,
  sessions,
  enabledAgents,
  customAgents,
  agentSettings,
  agentInfo,
  onSessionSelect,
  onSessionClose,
  onSessionNew,
  onSessionNewWithAgent,
  onSessionRename,
  onSessionReorder,
  onGroupClick,
  quickTerminalOpen,
  quickTerminalHasProcess,
  onToggleQuickTerminal,
}: AgentGroupProps) {
  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  // Get sessions belonging to this group, preserving group.sessionIds order (for drag reorder)
  const groupSessions = useMemo(() => {
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    return group.sessionIds
      .map((id) => sessionMap.get(id))
      .filter((s): s is Session => s !== undefined);
  }, [sessions, group.sessionIds]);

  const activeSessionId = group.activeSessionId;
  const hasNoSessions = groupSessions.length === 0;

  useEffect(() => {
    if (!showAgentMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (agentMenuRef.current && !agentMenuRef.current.contains(target)) {
        setShowAgentMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showAgentMenu]);

  const handleSelectSession = useCallback(
    (id: string) => {
      onSessionSelect(id);
      onGroupClick();
    },
    [onSessionSelect, onGroupClick]
  );

  const handleToggleAgentMenu = useCallback(() => {
    setShowAgentMenu((current) => !current);
  }, []);

  // AgentGroup now only renders the session bar (floating) and empty state
  // AgentTerminals are rendered at AgentPanel level for stable mounting
  // This component should NOT block terminal clicks - use pointer-events carefully

  // Empty state - show when no sessions in this group
  if (hasNoSessions) {
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: click activates group
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center px-5 py-5 pointer-events-auto',
          !bgImageEnabled && 'bg-background'
        )}
        onClick={onGroupClick}
      >
        <AgentGroupEmptyState
          menuRef={agentMenuRef}
          showAgentMenu={showAgentMenu}
          enabledAgents={enabledAgents}
          customAgents={customAgents}
          agentSettings={agentSettings}
          agentInfo={agentInfo}
          onSessionNew={() => {
            setShowAgentMenu(false);
            onSessionNew();
          }}
          onSessionNewWithAgent={(agentId, agentCommand) => {
            setShowAgentMenu(false);
            onSessionNewWithAgent(agentId, agentCommand);
          }}
          onToggleAgentMenu={handleToggleAgentMenu}
        />
      </div>
    );
  }

  // Has sessions - only render floating session bar (does not block terminal)
  return (
    <SessionBar
      sessions={groupSessions}
      activeSessionId={activeSessionId}
      repoPath={repoPath}
      onSelectSession={handleSelectSession}
      onCloseSession={onSessionClose}
      onNewSession={onSessionNew}
      onNewSessionWithAgent={onSessionNewWithAgent}
      onRenameSession={onSessionRename}
      onReorderSessions={onSessionReorder}
      quickTerminalOpen={quickTerminalOpen}
      quickTerminalHasProcess={quickTerminalHasProcess}
      onToggleQuickTerminal={onToggleQuickTerminal}
    />
  );
}
