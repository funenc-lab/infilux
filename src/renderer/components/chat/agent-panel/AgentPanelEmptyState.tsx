import { getDisplayPathBasename } from '@shared/utils/path';
import { Bot, ChevronDown, Plus, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ConsoleEmptyState } from '@/components/layout/ConsoleEmptyState';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AgentEmptyStateModel } from '../agentEmptyStateModel';

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

const EMPTY_STATE_ACTION_BUTTON_CLASS_NAME =
  'control-action-button inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl';
const EMPTY_STATE_PRIMARY_ACTION_CLASS_NAME =
  'control-action-button-primary min-h-[3.75rem] flex-1 justify-start gap-3.5 px-5 py-3 text-left whitespace-normal';
const EMPTY_STATE_PRIMARY_ACTION_ICON_CLASS_NAME =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/6 ring-1 ring-foreground/10';
const EMPTY_STATE_PRIMARY_ACTION_CONTENT_CLASS_NAME =
  'flex min-w-0 flex-1 flex-col items-start gap-1';
const EMPTY_STATE_PRIMARY_ACTION_TITLE_ROW_CLASS_NAME = 'flex w-full items-center gap-2';
const EMPTY_STATE_PRIMARY_ACTION_TITLE_CLASS_NAME =
  'min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]';
const EMPTY_STATE_PRIMARY_ACTION_META_BADGE_CLASS_NAME =
  'inline-flex shrink-0 items-center rounded-full border border-foreground/12 bg-foreground/6 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/72';
const EMPTY_STATE_PRIMARY_ACTION_SUPPORTING_CLASS_NAME =
  'min-w-0 truncate text-xs leading-none text-foreground/70';
const EMPTY_STATE_SECONDARY_ACTION_CLASS_NAME =
  'control-action-button-secondary min-h-[3.75rem] w-full justify-start gap-3 px-5 text-[15px] font-medium text-left sm:w-auto sm:min-w-[14rem]';
const EMPTY_STATE_SECONDARY_ACTION_ICON_CLASS_NAME =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-foreground ring-1 ring-border/60';
const EMPTY_STATE_ACTIONS_LAYOUT_CLASS_NAME =
  'flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-center';
const EMPTY_STATE_SPLIT_ACTION_GROUP_CLASS_NAME =
  'flex w-full min-w-0 items-stretch overflow-hidden rounded-xl';
const EMPTY_STATE_SPLIT_ACTION_TOGGLE_CLASS_NAME =
  'control-action-button-primary min-h-12 min-w-0 rounded-l-none border-l border-foreground/12 px-3 text-[15px]';
const EMPTY_STATE_SPLIT_ACTION_MENU_CLASS_NAME =
  'absolute left-0 right-0 top-full z-50 pt-2 text-left sm:left-auto sm:right-0 sm:min-w-52';
const EMPTY_STATE_PROFILE_MENU_ITEM_CLASS_NAME =
  'control-menu-item mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-foreground whitespace-nowrap';

export function AgentPanelEmptyState({
  bgImageEnabled,
  buttonStyle,
  cwd,
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
    <div
      className={cn(
        'absolute inset-0 z-20 flex items-start justify-center px-6 pb-6 pt-24 sm:pt-28',
        !bgImageEnabled && 'bg-background'
      )}
    >
      <ConsoleEmptyState
        className="mx-auto max-w-[min(48rem,100%)]"
        icon={<Bot className="h-5 w-5" />}
        eyebrow={t('No active sessions')}
        title={t('No agent sessions are attached to this worktree')}
        description={t(
          'Launch the default agent immediately or choose another profile to resume orchestration in this worktree.'
        )}
        chips={[{ label: getDisplayPathBasename(cwd), tone: 'strong' }]}
        details={[
          { label: t('Status'), value: emptyStateModel.statusLabel },
          { label: t('Default Agent'), value: defaultAgentLabel },
          {
            label: t('Next Step'),
            value: emptyStateModel.nextStepLabel,
          },
        ]}
        detailsLayout="compact"
        actions={
          <div className={EMPTY_STATE_ACTIONS_LAYOUT_CLASS_NAME}>
            <div
              ref={emptyStateAgentMenuRef}
              className="relative flex w-full items-stretch justify-center sm:w-auto"
            >
              <div
                className={cn(
                  emptyStateModel.showProfilePicker && EMPTY_STATE_SPLIT_ACTION_GROUP_CLASS_NAME
                )}
              >
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => {
                    if (emptyStateModel.primaryActionIntent === 'open-agent-settings') {
                      onOpenAgentSettings();
                    } else {
                      onStartDefaultSession();
                    }
                    setShowAgentMenu(false);
                  }}
                  className={cn(
                    EMPTY_STATE_ACTION_BUTTON_CLASS_NAME,
                    EMPTY_STATE_PRIMARY_ACTION_CLASS_NAME,
                    emptyStateModel.showProfilePicker
                      ? 'flex-1 rounded-r-none pr-4 sm:min-w-[18rem] sm:flex-none'
                      : 'min-w-[16rem] sm:min-w-[18rem]'
                  )}
                  style={buttonStyle}
                >
                  <span className={EMPTY_STATE_PRIMARY_ACTION_ICON_CLASS_NAME}>
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className={EMPTY_STATE_PRIMARY_ACTION_CONTENT_CLASS_NAME}>
                    <span className={EMPTY_STATE_PRIMARY_ACTION_TITLE_ROW_CLASS_NAME}>
                      <span className={EMPTY_STATE_PRIMARY_ACTION_TITLE_CLASS_NAME}>
                        {emptyStateModel.primaryActionLabel}
                      </span>
                      {showPrimaryMeta ? (
                        <span className={EMPTY_STATE_PRIMARY_ACTION_META_BADGE_CLASS_NAME}>
                          {t('Default')}
                        </span>
                      ) : null}
                    </span>
                    {showPrimaryMeta ? (
                      <span className={EMPTY_STATE_PRIMARY_ACTION_SUPPORTING_CLASS_NAME}>
                        {defaultAgentLabel}
                      </span>
                    ) : null}
                  </span>
                </Button>
                {emptyStateModel.showProfilePicker ? (
                  <Button
                    variant="default"
                    size="lg"
                    aria-label={t('Choose Profile')}
                    aria-haspopup="menu"
                    aria-expanded={showAgentMenu}
                    onClick={() => setShowAgentMenu((current) => !current)}
                    className={cn(
                      EMPTY_STATE_ACTION_BUTTON_CLASS_NAME,
                      EMPTY_STATE_SPLIT_ACTION_TOGGLE_CLASS_NAME
                    )}
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
                            className="control-icon-button flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
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
              className={cn(
                EMPTY_STATE_ACTION_BUTTON_CLASS_NAME,
                EMPTY_STATE_SECONDARY_ACTION_CLASS_NAME,
                'rounded-xl'
              )}
              style={buttonStyle}
            >
              <span className={EMPTY_STATE_SECONDARY_ACTION_ICON_CLASS_NAME}>
                <Settings className="h-4 w-4" />
              </span>
              <span className="truncate">{t('Agent profiles')}</span>
            </Button>
          </div>
        }
      />
    </div>
  );
}
