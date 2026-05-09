import { describe, expect, it } from 'vitest';
import {
  AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS,
  shouldShowAgentStartupOverlayForVisibility,
} from '../agentStartupVisibilityPolicy';

const NOW = 1_700_000_000_000;

function buildInput(
  overrides: Partial<Parameters<typeof shouldShowAgentStartupOverlayForVisibility>[0]> = {}
): Parameters<typeof shouldShowAgentStartupOverlayForVisibility>[0] {
  return {
    createdAt: NOW,
    hasPendingCommand: false,
    hasRenderableContent: false,
    isActive: false,
    isFirstOutputPending: false,
    isLoading: true,
    isReadinessPending: false,
    isTerminalActivationPending: false,
    isVisible: true,
    lastActivityAt: NOW,
    now: NOW,
    ...overrides,
  };
}

describe('agentStartupVisibilityPolicy', () => {
  it('does not show startup loading for recently active visible sessions unless the user selects them', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          lastActivityAt: NOW - AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS + 1,
        })
      )
    ).toBe(false);
  });

  it('does not treat ten minutes of background time as long inactivity', () => {
    expect(AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS).toBe(30 * 60 * 1000);
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          lastActivityAt: NOW - 10 * 60 * 1000,
        })
      )
    ).toBe(false);
  });

  it('shows startup loading immediately for the active session', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          isActive: true,
        })
      )
    ).toBe(true);
  });

  it('does not cover active sessions that already have renderable terminal content', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          hasRenderableContent: true,
          isActive: true,
        })
      )
    ).toBe(false);
  });

  it('does not cover pending-command sessions that already have renderable terminal content', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          hasPendingCommand: true,
          hasRenderableContent: true,
          isVisible: false,
        })
      )
    ).toBe(false);
  });

  it('shows startup loading for visible sessions after a long inactivity window', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          lastActivityAt: NOW - AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS,
        })
      )
    ).toBe(true);
  });

  it('does not treat an old creation timestamp as inactivity for passive visible sessions', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          createdAt: NOW - AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS,
          lastActivityAt: undefined,
        })
      )
    ).toBe(false);
  });

  it('treats first-output waits like other startup work instead of always showing them', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          isFirstOutputPending: true,
          isLoading: false,
          lastActivityAt: NOW,
        })
      )
    ).toBe(false);

    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          isFirstOutputPending: true,
          isLoading: false,
          lastActivityAt: NOW - AGENT_STARTUP_RECOVERY_INACTIVITY_THRESHOLD_MS,
        })
      )
    ).toBe(true);
  });

  it('keeps pending command sessions visible so queued work does not look inert', () => {
    expect(
      shouldShowAgentStartupOverlayForVisibility(
        buildInput({
          hasPendingCommand: true,
          isVisible: false,
        })
      )
    ).toBe(true);
  });
});
