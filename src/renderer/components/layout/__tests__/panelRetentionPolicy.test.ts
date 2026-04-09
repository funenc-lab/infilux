import { describe, expect, it } from 'vitest';
import { toChatPanelInactivityThresholdMs } from '@/stores/settings/chatPanelInactivityThresholdPolicy';
import {
  CHAT_PANEL_INACTIVITY_THRESHOLD_MS,
  resolveChatPanelRetentionState,
  shouldRetainPanel,
} from '../panelRetentionPolicy';

describe('panelRetentionPolicy', () => {
  it('always retains the active panel', () => {
    expect(
      shouldRetainPanel({
        tabId: 'chat',
        activeTab: 'chat',
      })
    ).toBe(true);
    expect(
      shouldRetainPanel({
        tabId: 'terminal',
        activeTab: 'terminal',
      })
    ).toBe(true);
    expect(
      shouldRetainPanel({
        tabId: 'file',
        activeTab: 'file',
      })
    ).toBe(true);
  });

  it('classifies recent idle chat sessions as warm and stale ones as cold', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);

    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        latestActivityAt: now - CHAT_PANEL_INACTIVITY_THRESHOLD_MS + 1000,
        now,
      })
    ).toBe('warm');
    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        latestActivityAt: now - CHAT_PANEL_INACTIVITY_THRESHOLD_MS - 1000,
        now,
      })
    ).toBe('cold');
  });

  it('defaults session history without a runtime timestamp to warm retention', () => {
    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        latestActivityAt: null,
      })
    ).toBe('warm');
  });

  it('respects custom inactivity thresholds from settings', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);
    const latestActivityAt = now - toChatPanelInactivityThresholdMs(8);

    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        latestActivityAt,
        now,
        inactivityThresholdMs: toChatPanelInactivityThresholdMs(10),
      })
    ).toBe('warm');

    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        latestActivityAt,
        now,
        inactivityThresholdMs: toChatPanelInactivityThresholdMs(5),
      })
    ).toBe('cold');
  });

  it('retains chat while the retention state is warm or hot', () => {
    expect(
      shouldRetainPanel({
        tabId: 'chat',
        activeTab: 'source-control',
        chatRetentionState: 'warm',
      })
    ).toBe(true);
    expect(
      shouldRetainPanel({
        tabId: 'chat',
        activeTab: 'source-control',
        chatRetentionState: 'hot',
      })
    ).toBe(true);
    expect(
      shouldRetainPanel({
        tabId: 'chat',
        activeTab: 'source-control',
        chatRetentionState: 'cold',
      })
    ).toBe(false);
  });

  it('retains terminal only while terminal tabs still exist', () => {
    expect(
      shouldRetainPanel({
        tabId: 'terminal',
        activeTab: 'chat',
        terminalCount: 2,
      })
    ).toBe(true);
    expect(
      shouldRetainPanel({
        tabId: 'terminal',
        activeTab: 'chat',
        terminalCount: 0,
      })
    ).toBe(false);
  });

  it('retains file only while editor tabs still exist', () => {
    expect(
      shouldRetainPanel({
        tabId: 'file',
        activeTab: 'chat',
        fileTabCount: 3,
      })
    ).toBe(true);
    expect(
      shouldRetainPanel({
        tabId: 'file',
        activeTab: 'chat',
        fileTabCount: 0,
      })
    ).toBe(false);
  });
});
