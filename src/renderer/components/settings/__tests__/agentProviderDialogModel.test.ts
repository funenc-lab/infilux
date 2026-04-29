import { describe, expect, it } from 'vitest';
import { canSaveProviderProfileDraft } from '../agent-provider/providerDialogModel';

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
});
