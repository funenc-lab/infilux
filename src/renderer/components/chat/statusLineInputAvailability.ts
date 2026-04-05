import type { AgentInputAvailability } from './agentInputAvailability';

export type StatusLineInputAvailabilityIconName = 'alert-triangle' | 'clock' | 'loader-circle';

export interface StatusLineInputAvailabilityPresentation {
  labelKey: 'Awaiting Session' | 'Reconnecting' | 'Disconnected';
  iconName: StatusLineInputAvailabilityIconName;
  itemClassName: string;
  iconClassName?: string;
}

export function getStatusLineInputAvailabilityPresentation(
  availability: Exclude<AgentInputAvailability, 'ready'>
): StatusLineInputAvailabilityPresentation {
  switch (availability) {
    case 'awaiting-session':
      return {
        labelKey: 'Awaiting Session',
        iconName: 'clock',
        itemClassName: 'text-info',
      };
    case 'reconnecting':
      return {
        labelKey: 'Reconnecting',
        iconName: 'loader-circle',
        itemClassName: 'text-warning',
        iconClassName: 'animate-spin',
      };
    case 'disconnected':
      return {
        labelKey: 'Disconnected',
        iconName: 'alert-triangle',
        itemClassName: 'text-destructive',
      };
  }
}
