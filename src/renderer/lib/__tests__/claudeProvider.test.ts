import type { ClaudeProvider } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearClaudeProviderSwitch,
  consumeClaudeProviderSwitch,
  isClaudeProviderMatch,
  markClaudeProviderSwitch,
} from '../claudeProvider';

const provider: ClaudeProvider = {
  id: 'provider-1',
  name: 'Primary',
  baseUrl: ' https://api.example.com ',
  authToken: ' secret-token ',
  model: 'claude-opus',
  smallFastModel: 'claude-haiku',
  defaultSonnetModel: 'claude-sonnet',
  defaultOpusModel: 'claude-opus',
  defaultHaikuModel: 'claude-haiku',
};

describe('claudeProvider', () => {
  beforeEach(() => {
    clearClaudeProviderSwitch();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T00:00:00Z'));
  });

  afterEach(() => {
    clearClaudeProviderSwitch();
    vi.useRealTimers();
  });

  it('matches providers using normalized credentials and default models only', () => {
    expect(
      isClaudeProviderMatch(provider, {
        baseUrl: 'https://api.example.com',
        authToken: 'secret-token',
        model: 'another-model',
        smallFastModel: 'another-fast-model',
        defaultSonnetModel: 'claude-sonnet',
        defaultOpusModel: 'claude-opus',
        defaultHaikuModel: 'claude-haiku',
      })
    ).toBe(true);

    expect(
      isClaudeProviderMatch(provider, {
        baseUrl: 'https://api.example.com',
        authToken: 'secret-token',
        defaultSonnetModel: 'different-sonnet',
        defaultOpusModel: 'claude-opus',
        defaultHaikuModel: 'claude-haiku',
      })
    ).toBe(false);

    expect(isClaudeProviderMatch(provider, null)).toBe(false);
    expect(
      isClaudeProviderMatch(provider, {
        baseUrl: '   ',
        authToken: 'secret-token',
      })
    ).toBe(false);
  });

  it('consumes a recent matching provider switch and clears it after success', () => {
    markClaudeProviderSwitch(provider);

    expect(
      consumeClaudeProviderSwitch({
        baseUrl: 'https://api.example.com',
        authToken: 'secret-token',
        defaultSonnetModel: 'claude-sonnet',
        defaultOpusModel: 'claude-opus',
        defaultHaikuModel: 'claude-haiku',
      })
    ).toBe(true);

    expect(
      consumeClaudeProviderSwitch({
        baseUrl: 'https://api.example.com',
        authToken: 'secret-token',
        defaultSonnetModel: 'claude-sonnet',
        defaultOpusModel: 'claude-opus',
        defaultHaikuModel: 'claude-haiku',
      })
    ).toBe(false);
  });

  it('keeps unmatched switches pending but drops expired switches', () => {
    markClaudeProviderSwitch(provider);

    expect(
      consumeClaudeProviderSwitch({
        baseUrl: 'https://api.example.com',
        authToken: 'wrong-token',
        defaultSonnetModel: 'claude-sonnet',
        defaultOpusModel: 'claude-opus',
        defaultHaikuModel: 'claude-haiku',
      })
    ).toBe(false);

    expect(
      consumeClaudeProviderSwitch({
        baseUrl: 'https://api.example.com',
        authToken: 'secret-token',
        defaultSonnetModel: 'claude-sonnet',
        defaultOpusModel: 'claude-opus',
        defaultHaikuModel: 'claude-haiku',
      })
    ).toBe(true);

    markClaudeProviderSwitch(provider);
    vi.advanceTimersByTime(5001);

    expect(
      consumeClaudeProviderSwitch({
        baseUrl: 'https://api.example.com',
        authToken: 'secret-token',
        defaultSonnetModel: 'claude-sonnet',
        defaultOpusModel: 'claude-opus',
        defaultHaikuModel: 'claude-haiku',
      })
    ).toBe(false);
  });
});
