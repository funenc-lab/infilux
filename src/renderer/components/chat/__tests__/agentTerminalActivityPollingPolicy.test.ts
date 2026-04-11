import { describe, expect, it } from 'vitest';
import {
  ACTIVE_AGENT_ACTIVITY_POLL_INTERVAL_MS,
  BACKGROUND_AGENT_ACTIVITY_POLL_INTERVAL_MS,
  resolveAgentTerminalActivityPollIntervalMs,
} from '../agentTerminalActivityPollingPolicy';

describe('agent terminal activity polling policy', () => {
  it('keeps foreground terminals on the fast poll interval', () => {
    expect(resolveAgentTerminalActivityPollIntervalMs({ isActive: true })).toBe(
      ACTIVE_AGENT_ACTIVITY_POLL_INTERVAL_MS
    );
  });

  it('slows hidden retained terminals to the background poll interval', () => {
    expect(resolveAgentTerminalActivityPollIntervalMs({ isActive: false })).toBe(
      BACKGROUND_AGENT_ACTIVITY_POLL_INTERVAL_MS
    );
  });
});
