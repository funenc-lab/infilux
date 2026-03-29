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
  'control-action-button-primary min-w-[14rem] px-5 text-[15px] font-semibold tracking-[-0.01em]';
const EMPTY_STATE_SECONDARY_ACTION_CLASS_NAME =
  'control-action-button-secondary px-4 text-[15px] font-medium';
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
        'absolute inset-0 z-20 flex items-start justify-center px-6 pb-6 pt-12 sm:pt-16',
        !bgImageEnabled && 'bg-background'
      )}
    >
      <ConsoleEmptyState
        className="max-w-[min(60rem,100%)]"
        icon={<Bot className="h-5 w-5" />}
        eyebrow={t('Agent Console')}
        title={t('No agent sessions are attached to this worktree')}
        description={t(
          'Launch the default agent immediately or choose another profile to resume orchestration in this worktree.'
        )}
        chips={[{ label: getDisplayPathBasename(cwd), tone: 'strong' }]}
        details={[
          { label: t('Status'), value: emptyStateModel.statusLabel },
          { label: t('Default Agent'), value: defaultAgentLabel },
          { label: t('Profiles Ready'), value: String(enabledAgentCount) },
          {
            label: t('Next Step'),
            value: emptyStateModel.nextStepLabel,
          },
        ]}
        detailsLayout="compact"
        actions={
          <>
            <div
              ref={emptyStateAgentMenuRef}
              className="relative flex min-w-0 flex-wrap items-center gap-2"
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
                  'rounded-xl'
                )}
                style={buttonStyle}
              >
                <Plus className="h-4 w-4" />
                {emptyStateModel.primaryActionLabel}
              </Button>
              {emptyStateModel.showProfilePicker ? (
                <Button
                  variant="outline"
                  size="lg"
                  aria-label={t('Choose Profile')}
                  aria-haspopup="menu"
                  aria-expanded={showAgentMenu}
                  onClick={() => setShowAgentMenu((current) => !current)}
                  className={cn(
                    EMPTY_STATE_ACTION_BUTTON_CLASS_NAME,
                    EMPTY_STATE_SECONDARY_ACTION_CLASS_NAME,
                    'rounded-xl'
                  )}
                  style={buttonStyle}
                >
                  {t('Choose Profile')}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              ) : null}
              {showAgentMenu && emptyStateModel.showProfilePicker && profiles.length > 0 ? (
                <div
                  role="menu"
                  aria-label={t('Start with Profile')}
                  className="absolute left-0 top-full z-50 min-w-52 pt-2 text-left"
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
              <Settings className="h-4 w-4" />
              {t('Agent profiles')}
            </Button>
          </>
        }
      />
    </div>
  );
}
