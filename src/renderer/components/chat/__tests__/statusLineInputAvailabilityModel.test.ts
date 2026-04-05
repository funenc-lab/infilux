import { describe, expect, it } from 'vitest';
import { getStatusLineInputAvailabilityPresentation } from '../statusLineInputAvailability';

describe('statusLineInputAvailability', () => {
  it('maps awaiting session to an informational pending presentation', () => {
    expect(getStatusLineInputAvailabilityPresentation('awaiting-session')).toEqual({
      labelKey: 'Awaiting Session',
      iconName: 'clock',
      itemClassName: 'text-info',
    });
  });

  it('maps reconnecting to a warning spinner presentation', () => {
    expect(getStatusLineInputAvailabilityPresentation('reconnecting')).toEqual({
      labelKey: 'Reconnecting',
      iconName: 'loader-circle',
      itemClassName: 'text-warning',
      iconClassName: 'animate-spin',
    });
  });

  it('maps disconnected to a destructive alert presentation', () => {
    expect(getStatusLineInputAvailabilityPresentation('disconnected')).toEqual({
      labelKey: 'Disconnected',
      iconName: 'alert-triangle',
      itemClassName: 'text-destructive',
    });
  });
});
