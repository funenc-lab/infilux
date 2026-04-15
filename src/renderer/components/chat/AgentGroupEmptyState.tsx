import { supportsAgentCapabilityPolicyLaunch } from '@shared/utils/agentCapabilityPolicy';
import { Bot, ChevronDown, Plus, Settings2 } from 'lucide-react';
import type { RefObject } from 'react';
import { ConsoleEmptyState } from '@/components/layout/ConsoleEmptyState';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  CHAT_ACTION_BUTTON_PRIMARY_CLASS_NAME,
  CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME,
  CHAT_MENU_ITEM_BASE_CLASS_NAME,
} from './controlButtonStyles';

const AGENT_GROUP_EMPTY_STATE_ACTIONS_CLASS_NAME = 'flex flex-wrap items-center gap-2';
const AGENT_GROUP_EMPTY_STATE_PRIMARY_ACTION_CLASS_NAME = `${CHAT_ACTION_BUTTON_PRIMARY_CLASS_NAME} min-w-0 rounded-xl px-4 text-sm font-semibold tracking-[-0.01em]`;
const AGENT_GROUP_EMPTY_STATE_TOGGLE_ACTION_CLASS_NAME = `${CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME} h-9 rounded-xl px-3`;
const AGENT_GROUP_EMPTY_STATE_MENU_CONTAINER_CLASS_NAME =
  'absolute left-1/2 top-full z-50 min-w-40 -translate-x-1/2 pt-2';
const AGENT_GROUP_EMPTY_STATE_MENU_ITEM_CLASS_NAME = `${CHAT_MENU_ITEM_BASE_CLASS_NAME} mt-1 flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground`;
const AGENT_GROUP_EMPTY_STATE_MENU_UTILITY_BUTTON_CLASS_NAME =
  'control-icon-button flex h-9 w-9 shrink-0 items-center justify-center rounded-lg';

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
  onOpenLaunchOptions: (agentId: string, agentCommand: string) => void;
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
  onOpenLaunchOptions,
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
          <div className={AGENT_GROUP_EMPTY_STATE_ACTIONS_CLASS_NAME}>
            <Button
              variant="default"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onSessionNew();
              }}
              className={AGENT_GROUP_EMPTY_STATE_PRIMARY_ACTION_CLASS_NAME}
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
              className={AGENT_GROUP_EMPTY_STATE_TOGGLE_ACTION_CLASS_NAME}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
          {showAgentMenu && enabledAgents.length > 0 && (
            <div
              role="menu"
              aria-label={t('Select Agent')}
              className={AGENT_GROUP_EMPTY_STATE_MENU_CONTAINER_CLASS_NAME}
            >
              <div className="control-menu rounded-2xl p-2">
                <div className="control-menu-label px-1 py-1 text-muted-foreground">
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

                    const agentCommand =
                      customAgent?.command ?? agentInfo[baseId]?.command ?? 'claude';

                    return (
                      <div key={agentId} className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSessionNewWithAgent(agentId, agentCommand);
                          }}
                          className={cn(
                            AGENT_GROUP_EMPTY_STATE_MENU_ITEM_CLASS_NAME,
                            'mt-0 flex-1 justify-start'
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          {isDefault ? (
                            <span className="control-chip control-chip-strong shrink-0">
                              {t('Default')}
                            </span>
                          ) : null}
                        </button>
                        {supportsAgentCapabilityPolicyLaunch(agentId, agentCommand) ? (
                          <button
                            type="button"
                            aria-label={t('Skill & MCP')}
                            title={t('Skill & MCP')}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenLaunchOptions(agentId, agentCommand);
                            }}
                            className={AGENT_GROUP_EMPTY_STATE_MENU_UTILITY_BUTTON_CLASS_NAME}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
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
