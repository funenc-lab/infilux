import { Bot, ChevronDown, Plus, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ControlStateActionButton } from '@/components/layout/ControlStateActionButton';
import { ControlStateCard } from '@/components/layout/ControlStateCard';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AgentEmptyStateModel } from '../agentEmptyStateModel';
import {
  CHAT_ACTION_BUTTON_PRIMARY_CLASS_NAME,
  CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME,
  CHAT_MENU_ICON_BUTTON_CLASS_NAME,
  CHAT_MENU_ITEM_BASE_CLASS_NAME,
} from '../controlButtonStyles';

export interface AgentPanelEmptyStateProfileItem {
  agentId: string;
  command: string;
  isDefault: boolean;
  name: string;
}

interface AgentPanelEmptyStateProps {
  bgImageEnabled: boolean;
  buttonStyle: React.CSSProperties;
  cwd: string;
  defaultAgentLabel: string;
  emptyStateModel: AgentEmptyStateModel;
  enabledAgentCount: number;
  onOpenAgentSettings: () => void;
  onStartDefaultSession: () => void;
  onStartSessionWithAgent: (agentId: string, agentCommand: string) => void;
  profiles: AgentPanelEmptyStateProfileItem[];
}

const EMPTY_STATE_PRIMARY_ACTION_LABEL_CLASS_NAME = 'min-w-0 flex-1 truncate';
const EMPTY_STATE_SECONDARY_ACTION_CLASS_NAME = `${CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME} w-full justify-start gap-2.5 rounded-xl px-4 text-[15px] font-medium sm:w-auto sm:min-w-[11rem]`;
const EMPTY_STATE_ACTIONS_LAYOUT_CLASS_NAME =
  'flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center';
const EMPTY_STATE_SPLIT_ACTION_GROUP_CLASS_NAME =
  'flex w-full min-w-0 items-stretch overflow-hidden rounded-xl';
const EMPTY_STATE_SPLIT_ACTION_TOGGLE_CLASS_NAME = `${CHAT_ACTION_BUTTON_PRIMARY_CLASS_NAME} rounded-l-none border-l border-foreground/12 px-3`;
const EMPTY_STATE_SPLIT_ACTION_MENU_CLASS_NAME =
  'absolute left-0 right-0 top-full z-50 pt-2 text-left sm:left-auto sm:right-0 sm:min-w-52';
const EMPTY_STATE_PROFILE_MENU_ITEM_CLASS_NAME = `${CHAT_MENU_ITEM_BASE_CLASS_NAME} mt-1 flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground`;
const EMPTY_STATE_CONTEXT_FOOTER_CLASS_NAME =
  'flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-[0.76em] leading-5 text-muted-foreground/84';
const EMPTY_STATE_CONTEXT_ITEM_CLASS_NAME = 'flex min-w-0 items-start gap-2';
const EMPTY_STATE_CONTEXT_LABEL_CLASS_NAME =
  'shrink-0 font-semibold uppercase tracking-[0.14em] text-muted-foreground/66';
const EMPTY_STATE_CONTEXT_VALUE_CLASS_NAME = 'min-w-0 text-pretty text-foreground/80';

export function AgentPanelEmptyState({
  bgImageEnabled,
  buttonStyle,
  defaultAgentLabel,
  emptyStateModel,
  enabledAgentCount,
  onOpenAgentSettings,
  onStartDefaultSession,
  onStartSessionWithAgent,
  profiles,
}: AgentPanelEmptyStateProps) {
  const { t } = useI18n();
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const emptyStateAgentMenuRef = useRef<HTMLDivElement>(null);
  const showPrimaryMeta =
    emptyStateModel.primaryActionIntent === 'start-default-agent' && enabledAgentCount > 0;
  const requiresAgentConfiguration = emptyStateModel.primaryActionIntent === 'open-agent-settings';
  const emptyStateTitle = requiresAgentConfiguration
    ? t('No runnable agent profiles are available')
    : t('No agent sessions are attached to this worktree');
  const emptyStateDescription = requiresAgentConfiguration
    ? t('Configure or detect an agent profile before starting a session in this worktree.')
    : t('Start the default agent now, or choose another profile for this worktree.');

  useEffect(() => {
    if (!showAgentMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (emptyStateAgentMenuRef.current && !emptyStateAgentMenuRef.current.contains(target)) {
        setShowAgentMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showAgentMenu]);

  return (
    <div className={cn('absolute inset-0 z-20', !bgImageEnabled && 'bg-background')}>
      <ControlStateCard
        cardClassName="max-w-[min(54rem,100%)] overflow-visible"
        icon={<Bot className="h-5 w-5" />}
        eyebrow={t('Agent Console')}
        title={emptyStateTitle}
        description={emptyStateDescription}
        metaLabel={t('Next Step')}
        metaValue={emptyStateModel.nextStepLabel}
        footer={
          <div className={EMPTY_STATE_CONTEXT_FOOTER_CLASS_NAME}>
            <div className={EMPTY_STATE_CONTEXT_ITEM_CLASS_NAME}>
              <span className={EMPTY_STATE_CONTEXT_LABEL_CLASS_NAME}>{t('Status')}</span>
              <span className={EMPTY_STATE_CONTEXT_VALUE_CLASS_NAME}>
                {emptyStateModel.statusLabel}
              </span>
            </div>
            {showPrimaryMeta ? (
              <div className={EMPTY_STATE_CONTEXT_ITEM_CLASS_NAME}>
                <span className={EMPTY_STATE_CONTEXT_LABEL_CLASS_NAME}>{t('Default Agent')}</span>
                <span className={EMPTY_STATE_CONTEXT_VALUE_CLASS_NAME}>{defaultAgentLabel}</span>
              </div>
            ) : null}
          </div>
        }
        actions={
          <div className={EMPTY_STATE_ACTIONS_LAYOUT_CLASS_NAME}>
            <div
              ref={emptyStateAgentMenuRef}
              className="relative flex w-full min-w-0 items-stretch sm:w-auto"
            >
              <div
                className={cn(
                  emptyStateModel.showProfilePicker && EMPTY_STATE_SPLIT_ACTION_GROUP_CLASS_NAME
                )}
              >
                <ControlStateActionButton
                  onClick={() => {
                    if (emptyStateModel.primaryActionIntent === 'open-agent-settings') {
                      onOpenAgentSettings();
                    } else {
                      onStartDefaultSession();
                    }
                    setShowAgentMenu(false);
                  }}
                  className={cn(
                    emptyStateModel.showProfilePicker
                      ? 'w-full justify-start gap-2.5 rounded-r-none pr-3 sm:w-auto sm:min-w-[16rem]'
                      : 'w-full justify-start gap-2.5 sm:w-auto sm:min-w-[16rem]'
                  )}
                  style={buttonStyle}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span
                    className={EMPTY_STATE_PRIMARY_ACTION_LABEL_CLASS_NAME}
                    title={emptyStateModel.primaryActionLabel}
                  >
                    {emptyStateModel.primaryActionLabel}
                  </span>
                </ControlStateActionButton>
                {emptyStateModel.showProfilePicker ? (
                  <Button
                    variant="default"
                    size="lg"
                    aria-label={t('Choose Profile')}
                    aria-haspopup="menu"
                    aria-expanded={showAgentMenu}
                    onClick={() => setShowAgentMenu((current) => !current)}
                    className={cn(EMPTY_STATE_SPLIT_ACTION_TOGGLE_CLASS_NAME, 'text-[15px]')}
                    style={buttonStyle}
                  >
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', showAgentMenu && 'rotate-180')}
                    />
                  </Button>
                ) : null}
              </div>
              {showAgentMenu && emptyStateModel.showProfilePicker && profiles.length > 0 ? (
                <div
                  role="menu"
                  aria-label={t('Start with Profile')}
                  className={EMPTY_STATE_SPLIT_ACTION_MENU_CLASS_NAME}
                >
                  <div className="control-menu rounded-2xl p-2">
                    <div className="mb-1 flex min-w-0 items-center justify-between gap-2 px-1 py-1">
                      <span
                        className="control-menu-label min-w-0 flex-1 truncate pr-2 text-muted-foreground"
                        title={t('Start with Profile')}
                      >
                        {t('Start with Profile')}
                      </span>
                      <Tooltip>
                        <TooltipTrigger render={<span />}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAgentMenu(false);
                              onOpenAgentSettings();
                            }}
                            className={cn(CHAT_MENU_ICON_BUTTON_CLASS_NAME, 'rounded-xl')}
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipPopup side="right">{t('Agent profiles')}</TooltipPopup>
                      </Tooltip>
                    </div>
                    {profiles.map((profile) => (
                      <button
                        type="button"
                        key={profile.agentId}
                        onClick={() => {
                          onStartSessionWithAgent(profile.agentId, profile.command);
                          setShowAgentMenu(false);
                        }}
                        className={EMPTY_STATE_PROFILE_MENU_ITEM_CLASS_NAME}
                      >
                        <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                        {profile.isDefault ? (
                          <span className="control-chip control-chip-strong shrink-0">
                            {t('Default')}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="lg"
              onClick={onOpenAgentSettings}
              className={EMPTY_STATE_SECONDARY_ACTION_CLASS_NAME}
              style={buttonStyle}
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{t('Agent profiles')}</span>
            </Button>
          </div>
        }
      />
    </div>
  );
}
