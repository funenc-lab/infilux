import { describe, expect, it } from 'vitest';
import { toChatPanelInactivityThresholdMs } from '@/stores/settings/chatPanelInactivityThresholdPolicy';
import {
  CHAT_PANEL_INACTIVITY_THRESHOLD_MS,
  resolveChatPanelRetentionState,
  resolveCurrentChatPanelRetentionState,
  shouldRetainPanel,
  shouldRetainSessionBackedChatPanel,
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

  it('classifies idle chat sessions from the inactive-panel timestamp', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);

    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        idleSinceAt: now - CHAT_PANEL_INACTIVITY_THRESHOLD_MS + 1000,
        now,
      })
    ).toBe('warm');
    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        idleSinceAt: now - CHAT_PANEL_INACTIVITY_THRESHOLD_MS - 1000,
        now,
      })
    ).toBe('cold');
  });

  it('defaults mounted chat panels without an inactive timestamp to warm retention', () => {
    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        idleSinceAt: null,
      })
    ).toBe('warm');
  });

  it('respects custom inactivity thresholds from settings after the panel becomes inactive', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);
    const idleSinceAt = now - toChatPanelInactivityThresholdMs(8);

    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        idleSinceAt,
        now,
        inactivityThresholdMs: toChatPanelInactivityThresholdMs(10),
      })
    ).toBe('warm');

    expect(
      resolveChatPanelRetentionState({
        sessionCount: 1,
        idleSinceAt,
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

  it('keeps the current chat panel warm while sessions still exist', () => {
    expect(
      resolveCurrentChatPanelRetentionState({
        retentionState: 'cold',
        sessionCount: 1,
        retainSessionBackedPanels: true,
      })
    ).toBe('warm');
    expect(
      resolveCurrentChatPanelRetentionState({
        retentionState: 'hot',
        sessionCount: 1,
        retainSessionBackedPanels: true,
      })
    ).toBe('hot');
    expect(
      resolveCurrentChatPanelRetentionState({
        retentionState: 'cold',
        sessionCount: 0,
        retainSessionBackedPanels: true,
      })
    ).toBe('cold');
  });

  it('keeps session-backed chat panels retained even after idle cooldown expires', () => {
    expect(
      shouldRetainSessionBackedChatPanel({
        retentionState: 'cold',
        sessionCount: 1,
        retainSessionBackedPanels: true,
      })
    ).toBe(true);
    expect(
      shouldRetainSessionBackedChatPanel({
        retentionState: 'warm',
        sessionCount: 0,
        retainSessionBackedPanels: true,
      })
    ).toBe(true);
    expect(
      shouldRetainSessionBackedChatPanel({
        retentionState: 'cold',
        sessionCount: 0,
        retainSessionBackedPanels: true,
      })
    ).toBe(false);
    expect(
      shouldRetainSessionBackedChatPanel({
        retentionState: 'cold',
        sessionCount: 1,
        retainSessionBackedPanels: false,
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
