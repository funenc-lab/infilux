import { Bot, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { ConsoleEmptyState } from '../layout/ConsoleEmptyState';
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
  const { t } = useI18n();
  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const [showAgentMenu, setShowAgentMenu] = useState(false);

  // Get sessions belonging to this group, preserving group.sessionIds order (for drag reorder)
  const groupSessions = useMemo(() => {
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    return group.sessionIds
      .map((id) => sessionMap.get(id))
      .filter((s): s is Session => s !== undefined);
  }, [sessions, group.sessionIds]);

  const activeSessionId = group.activeSessionId;
  const hasNoSessions = groupSessions.length === 0;

  const handleSelectSession = useCallback(
    (id: string) => {
      onSessionSelect(id);
      onGroupClick();
    },
    [onSessionSelect, onGroupClick]
  );

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
        <ConsoleEmptyState
          variant="embedded"
          className="max-w-[min(34rem,100%)]"
          icon={<Bot className="h-4.5 w-4.5" />}
          eyebrow={t('Agent Group')}
          title={t('No sessions in this agent group')}
          description={t(
            'Start a new agent session in this split to keep orchestration scoped to the current worktree context.'
          )}
          chips={[{ label: t('Awaiting Session'), tone: 'wait' }]}
          details={[
            { label: t('Status'), value: t('No agent sessions are attached') },
            { label: t('Profiles Ready'), value: String(enabledAgents.length) },
            { label: t('Next Step'), value: t('Create a session or choose an agent profile') },
          ]}
          detailsLayout="compact"
          actions={
            <div
              className="relative"
              onMouseEnter={() => setShowAgentMenu(true)}
              onMouseLeave={() => setShowAgentMenu(false)}
            >
              <Button
                variant="default"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onSessionNew();
                }}
                className="control-action-button control-action-button-primary min-w-0 rounded-xl px-4 text-sm font-semibold tracking-[-0.01em]"
              >
                <Plus className="h-4 w-4" />
                {t('New Session')}
              </Button>
              {showAgentMenu && enabledAgents.length > 0 && (
                <div className="absolute left-1/2 top-full z-50 min-w-40 -translate-x-1/2 pt-2">
                  <div className="rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      {t('Select Agent')}
                    </div>
                    {[...enabledAgents]
                      .sort((a, b) => {
                        const aDefault = agentSettings[a]?.isDefault ? 1 : 0;
                        const bDefault = agentSettings[b]?.isDefault ? 1 : 0;
                        return bDefault - aDefault;
                      })
                      .map((agentId) => {
                        const isHapi = agentId.endsWith('-hapi');
                        const isHappy = agentId.endsWith('-happy');
                        const baseId = isHapi
                          ? agentId.slice(0, -5)
                          : isHappy
                            ? agentId.slice(0, -6)
                            : agentId;
                        const customAgent = customAgents.find((a) => a.id === baseId);
                        const baseName = customAgent?.name ?? agentInfo[baseId]?.name ?? baseId;
                        const name = isHapi
                          ? `${baseName} (Hapi)`
                          : isHappy
                            ? `${baseName} (Happy)`
                            : baseName;
                        const isDefault = agentSettings[agentId]?.isDefault;
                        return (
                          <button
                            type="button"
                            key={agentId}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSessionNewWithAgent(
                                agentId,
                                customAgent?.command ?? agentInfo[baseId]?.command ?? 'claude'
                              );
                              setShowAgentMenu(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <span>{name}</span>
                            {isDefault && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {t('(default)')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          }
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
