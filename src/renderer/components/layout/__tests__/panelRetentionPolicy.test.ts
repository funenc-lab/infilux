import { describe, expect, it } from 'vitest';
import { shouldRetainPanel } from '../panelRetentionPolicy';

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

  it('retains chat only while agent sessions still exist', () => {
    expect(
      shouldRetainPanel({
        tabId: 'chat',
        activeTab: 'source-control',
        agentSessionCount: 1,
      })
    ).toBe(true);
    expect(
      shouldRetainPanel({
        tabId: 'chat',
        activeTab: 'source-control',
        agentSessionCount: 0,
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
