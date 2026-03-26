import type { TFunction } from '@/i18n';

export interface AgentEmptyStateModel {
  primaryActionLabel: string;
  primaryActionIntent: 'start-default-agent' | 'open-agent-settings';
  showProfilePicker: boolean;
  statusLabel: string;
  nextStepLabel: string;
}

export function buildAgentEmptyStateModel({
  defaultAgentLabel,
  enabledAgentCount,
  t,
}: {
  defaultAgentLabel: string;
  enabledAgentCount: number;
  t: TFunction;
}): AgentEmptyStateModel {
  if (enabledAgentCount <= 0) {
    return {
      primaryActionLabel: t('Configure Agents'),
      primaryActionIntent: 'open-agent-settings',
      showProfilePicker: false,
      statusLabel: t('No runnable agent profiles'),
      nextStepLabel: t('Enable or detect an agent profile before starting a session'),
    };
  }

  return {
    primaryActionLabel: t('Start {{agent}}', { agent: defaultAgentLabel }),
    primaryActionIntent: 'start-default-agent',
    showProfilePicker: enabledAgentCount > 1,
    statusLabel: t('No active sessions'),
    nextStepLabel: t('Start {{agent}} now or choose another profile', {
      agent: defaultAgentLabel,
    }),
  };
}
