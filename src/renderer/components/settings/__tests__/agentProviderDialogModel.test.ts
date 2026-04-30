import { describe, expect, it } from 'vitest';
import {
  buildProviderProfileFromDraft,
  canSaveProviderProfileDraft,
} from '../agent-provider/providerDialogModel';

describe('agent provider dialog model', () => {
  const completeDraft = {
    authToken: 'token',
    baseUrl: 'https://api.example.com',
    name: 'Example Provider',
  };

  it('allows manual provider profiles to be saved before switching adapter support exists', () => {
    expect(
      canSaveProviderProfileDraft({
        ...completeDraft,
        adapterSupportsProfiles: false,
        source: 'manual',
      })
    ).toBe(true);
  });

  it('keeps save-current guarded by real provider adapter support', () => {
    expect(
      canSaveProviderProfileDraft({
        ...completeDraft,
        adapterSupportsProfiles: false,
        source: 'current',
      })
    ).toBe(false);

    expect(
      canSaveProviderProfileDraft({
        ...completeDraft,
        adapterSupportsProfiles: true,
        source: 'current',
      })
    ).toBe(true);
  });

  it('requires profile identity and credential fields for every source', () => {
    expect(
      canSaveProviderProfileDraft({
        adapterSupportsProfiles: true,
        authToken: '',
        baseUrl: 'https://api.example.com',
        name: 'Example Provider',
        source: 'manual',
      })
    ).toBe(false);
  });

  it('builds editable profiles with the selected provider type', () => {
    expect(
      buildProviderProfileFromDraft({
        authToken: ' token ',
        baseUrl: ' https://api.openai.com/v1 ',
        defaultHaikuModel: 'claude-3-haiku',
        defaultOpusModel: 'claude-opus-4',
        defaultSonnetModel: 'claude-sonnet-4',
        existingProfile: {
          displayOrder: 7,
          enabled: false,
          id: 'profile-1',
        },
        generateId: () => 'new-profile',
        model: ' gpt-5.2 ',
        name: ' Codex Gateway ',
        providerId: 'codex-cli',
        smallFastModel: 'claude-3-haiku',
      })
    ).toEqual({
      authToken: 'token',
      baseUrl: 'https://api.openai.com/v1',
      displayOrder: 7,
      enabled: false,
      id: 'profile-1',
      model: 'gpt-5.2',
      name: 'Codex Gateway',
      providerId: 'codex-cli',
    });
  });
});
