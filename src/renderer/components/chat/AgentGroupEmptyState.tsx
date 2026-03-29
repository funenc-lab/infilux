import { Bot, ChevronDown, Plus } from 'lucide-react';
import type { RefObject } from 'react';
import { ConsoleEmptyState } from '@/components/layout/ConsoleEmptyState';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';

interface AgentGroupEmptyStateProps {
  menuRef: RefObject<HTMLDivElement | null>;
  showAgentMenu: boolean;
  enabledAgents: string[];
  customAgents: Array<{ id: string; name: string; command: string }>;
  agentSettings: Record<
    string,
    { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
  >;
  agentInfo: Record<string, { name: string; command: string }>;
  onSessionNew: () => void;
  onSessionNewWithAgent: (agentId: string, agentCommand: string) => void;
  onToggleAgentMenu: () => void;
}

export function AgentGroupEmptyState({
  menuRef,
  showAgentMenu,
  enabledAgents,
  customAgents,
  agentSettings,
  agentInfo,
  onSessionNew,
  onSessionNewWithAgent,
  onToggleAgentMenu,
}: AgentGroupEmptyStateProps) {
  const { t } = useI18n();

  return (
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
        <div ref={menuRef} className="relative">
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              aria-label={t('Choose session agent')}
              aria-haspopup="menu"
              aria-expanded={showAgentMenu}
              onClick={(event) => {
                event.stopPropagation();
                onToggleAgentMenu();
              }}
              className="control-action-button control-action-button-secondary h-9 rounded-xl px-3"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
          {showAgentMenu && enabledAgents.length > 0 && (
            <div
              role="menu"
              aria-label={t('Select Agent')}
              className="absolute left-1/2 top-full z-50 min-w-40 -translate-x-1/2 pt-2"
            >
              <div className="control-menu rounded-lg p-1">
                <div className="control-menu-label px-2 py-1 text-muted-foreground">
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
                    const customAgent = customAgents.find((agent) => agent.id === baseId);
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
                        }}
                        className="control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 whitespace-nowrap text-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        {isDefault ? (
                          <span className="control-chip control-chip-strong shrink-0">
                            {t('Default')}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
