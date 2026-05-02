import type { AgentProviderProfile } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  buildAgentProviderDetectionState,
  buildAgentProviderProfileListSummary,
  resolveDefaultProviderSelection,
} from '../agent-provider/providerListModel';

const profiles: AgentProviderProfile[] = [
  {
    id: 'claude-provider',
    name: 'Claude',
    providerId: 'claude-code',
    baseUrl: 'https://api.anthropic.com',
    authToken: 'token',
  },
  {
    id: 'codex-provider',
    name: 'Codex',
    providerId: 'codex-cli',
    baseUrl: 'https://api.openai.com/v1',
    authToken: 'token',
  },
  {
    id: 'gemini-provider',
    name: 'Gemini',
    providerId: 'gemini-cli',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authToken: 'token',
  },
];

describe('agent provider list model', () => {
  it('summarizes saved, switchable, and adapter-pending provider profiles', () => {
    expect(
      buildAgentProviderProfileListSummary(profiles, [
        { providerId: 'claude-code', supportsProfiles: true },
        { providerId: 'codex-cli', supportsProfiles: true },
        { providerId: 'gemini-cli', supportsProfiles: false },
      ])
    ).toEqual({
      savedCount: 3,
      switchableCount: 2,
      waitingForAdapterCount: 1,
    });
  });

  it('treats unknown provider capabilities as waiting for an adapter', () => {
    expect(buildAgentProviderProfileListSummary(profiles, [])).toEqual({
      savedCount: 3,
      switchableCount: 0,
      waitingForAdapterCount: 3,
    });
  });

  it('describes detected provider config state per provider', () => {
    expect(
      buildAgentProviderDetectionState({
        activeProfileName: 'Codex',
        hasAuthToken: true,
        hasDetectedConfig: true,
        supportsProfiles: true,
      })
    ).toEqual({
      action: 'saved',
      statusKey: 'Provider profile already saved as {{name}}',
      statusValues: { name: 'Codex' },
    });

    expect(
      buildAgentProviderDetectionState({
        hasAuthToken: true,
        hasDetectedConfig: true,
        supportsProfiles: true,
      })
    ).toEqual({
      action: 'save',
      statusKey: 'Current config not saved',
    });

    expect(
      buildAgentProviderDetectionState({
        hasAuthToken: false,
        hasDetectedConfig: true,
        supportsProfiles: true,
      })
    ).toEqual({
      action: 'preview',
      statusKey: 'Detected CLI config is missing required provider credentials.',
    });

    expect(
      buildAgentProviderDetectionState({
        hasAuthToken: true,
        hasDetectedConfig: true,
        supportsProfiles: false,
      })
    ).toEqual({
      action: 'preview',
      statusKey: 'Provider profile switching is not available for this AI tool yet.',
    });
  });

  it('defaults provider selection to the first supported detected system config', () => {
    expect(
      resolveDefaultProviderSelection(
        [
          {
            providerId: 'claude-code',
            supported: true,
            extracted: null,
          },
          {
            providerId: 'codex-cli',
            supported: true,
            extracted: {
              baseUrl: 'https://api.openai.com/v1',
              authToken: 'codex-token',
            },
          },
        ],
        'claude-code',
        false
      )
    ).toBe('codex-cli');
  });

  it('prefers complete system credentials over an earlier partial detected config', () => {
    expect(
      resolveDefaultProviderSelection(
        [
          {
            providerId: 'claude-code',
            supported: true,
            extracted: {
              baseUrl: 'https://api.anthropic.com',
            },
          },
          {
            providerId: 'gemini-cli',
            supported: true,
            extracted: {
              baseUrl: 'https://generativelanguage.googleapis.com',
              authToken: 'gemini-token',
            },
          },
        ],
        'claude-code',
        false
      )
    ).toBe('gemini-cli');
  });

  it('preserves explicit provider selection when the user has already chosen one', () => {
    expect(
      resolveDefaultProviderSelection(
        [
          {
            providerId: 'codex-cli',
            supported: true,
            extracted: {
              baseUrl: 'https://api.openai.com/v1',
              authToken: 'codex-token',
            },
          },
        ],
        'gemini-cli',
        true
      )
    ).toBe('gemini-cli');
  });
});
