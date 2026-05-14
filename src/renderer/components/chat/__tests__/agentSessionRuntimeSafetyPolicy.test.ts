import { describe, expect, it } from 'vitest';
import {
  AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
  shouldDeferBackgroundAgentRuntimeMount,
} from '../agentSessionRuntimeSafetyPolicy';

const NOW = 1_700_000_000_000;

function buildInput(
  overrides: Partial<Parameters<typeof shouldDeferBackgroundAgentRuntimeMount>[0]> = {}
): Parameters<typeof shouldDeferBackgroundAgentRuntimeMount>[0] {
  return {
    agentId: 'codex',
    agentCommand: 'codex',
    createdAt: NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
    hasPendingCommand: false,
    isFocused: false,
    lastActivityAt: NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
    recovered: true,
    recoveryState: 'live',
    sessionActivityState: 'idle',
    now: NOW,
    ...overrides,
  };
}

describe('agentSessionRuntimeSafetyPolicy', () => {
  it('defers dormant recovered Codex sessions from passive background runtime mounts', () => {
    expect(shouldDeferBackgroundAgentRuntimeMount(buildInput())).toBe(true);
  });

  it('does not treat a recently active recovered Codex session as dormant', () => {
    expect(
      shouldDeferBackgroundAgentRuntimeMount(
        buildInput({
          lastActivityAt: NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS + 1,
        })
      )
    ).toBe(false);
  });

  it('allows focused recovered Codex sessions to mount immediately', () => {
    expect(
      shouldDeferBackgroundAgentRuntimeMount(
        buildInput({
          isFocused: true,
        })
      )
    ).toBe(false);
  });

  it('allows pending-command Codex sessions to mount so queued work can run', () => {
    expect(
      shouldDeferBackgroundAgentRuntimeMount(
        buildInput({
          hasPendingCommand: true,
        })
      )
    ).toBe(false);
  });

  it('does not defer non-Codex recovered sessions', () => {
    expect(
      shouldDeferBackgroundAgentRuntimeMount(
        buildInput({
          agentId: 'gemini',
          agentCommand: 'gemini',
        })
      )
    ).toBe(false);
  });
});
