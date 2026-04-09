import { describe, expect, it } from 'vitest';
import {
  CHAT_PANEL_INACTIVITY_THRESHOLD_OPTIONS,
  DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES,
  MAX_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES,
  MIN_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES,
  normalizeChatPanelInactivityThresholdMinutes,
  toChatPanelInactivityThresholdMs,
} from '../chatPanelInactivityThresholdPolicy';

describe('chatPanelInactivityThresholdPolicy', () => {
  it('exposes bounded inactivity threshold presets', () => {
    expect(CHAT_PANEL_INACTIVITY_THRESHOLD_OPTIONS).toEqual([1, 3, 5, 10, 20, 30]);
    expect(MIN_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES).toBe(1);
    expect(DEFAULT_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES).toBe(5);
    expect(MAX_CHAT_PANEL_INACTIVITY_THRESHOLD_MINUTES).toBe(30);
  });

  it('normalizes persisted values to bounded whole minutes', () => {
    expect(normalizeChatPanelInactivityThresholdMinutes(12.8)).toBe(12);
    expect(normalizeChatPanelInactivityThresholdMinutes('18')).toBe(18);
    expect(normalizeChatPanelInactivityThresholdMinutes(0)).toBe(1);
    expect(normalizeChatPanelInactivityThresholdMinutes(99)).toBe(30);
    expect(normalizeChatPanelInactivityThresholdMinutes('invalid')).toBe(5);
  });

  it('converts minutes to milliseconds using normalized thresholds', () => {
    expect(toChatPanelInactivityThresholdMs(5)).toBe(5 * 60 * 1000);
    expect(toChatPanelInactivityThresholdMs(99)).toBe(30 * 60 * 1000);
  });
});
