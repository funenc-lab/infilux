import { describe, expect, it } from 'vitest';
import { buildAgentEmptyStateModel } from '../agentEmptyStateModel';

describe('buildAgentEmptyStateModel', () => {
  it('prioritizes launching the default agent when runnable profiles exist', () => {
    const t = (key: string, params?: Record<string, string | number>) => {
      if (key === 'Start {{agent}}') return `Start ${params?.agent}`;
      if (key === 'Start {{agent}} now or choose another profile') {
        return `Start ${params?.agent} now or choose another profile`;
      }
      return key;
    };

    const model = buildAgentEmptyStateModel({
      defaultAgentLabel: 'Claude',
      enabledAgentCount: 3,
      t,
    });

    expect(model.primaryActionLabel).toBe('Start Claude');
    expect(model.primaryActionIntent).toBe('start-default-agent');
    expect(model.showProfilePicker).toBe(true);
    expect(model.statusLabel).toBe('No active sessions');
    expect(model.nextStepLabel).toBe('Start Claude now or choose another profile');
  });

  it('falls back to agent setup when no runnable profiles exist', () => {
    const t = (key: string) => key;

    const model = buildAgentEmptyStateModel({
      defaultAgentLabel: 'Claude',
      enabledAgentCount: 0,
      t,
    });

    expect(model.primaryActionLabel).toBe('Configure Agents');
    expect(model.primaryActionIntent).toBe('open-agent-settings');
    expect(model.showProfilePicker).toBe(false);
    expect(model.statusLabel).toBe('No runnable agent profiles');
    expect(model.nextStepLabel).toBe('Enable or detect an agent profile before starting a session');
  });
});
