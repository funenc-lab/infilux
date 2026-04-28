import { AI_PROVIDER_CATALOG, AI_PROVIDERS } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_OPTIONS_BY_PROVIDER,
  AI_PROVIDER_OPTIONS,
  getDefaultModel,
  getModelLabel,
} from '../aiProviderOptions';

describe('AI settings provider options', () => {
  it('builds provider and model options from the shared agent catalog', () => {
    expect(AI_PROVIDER_OPTIONS.map((option) => option.value)).toEqual([...AI_PROVIDERS]);

    for (const provider of AI_PROVIDERS) {
      const catalogEntry = AI_PROVIDER_CATALOG[provider];
      expect(AI_MODEL_OPTIONS_BY_PROVIDER[provider]).toEqual(
        catalogEntry.models.map((model) => ({
          value: model.id,
          label: model.label,
        }))
      );
      expect(getDefaultModel(provider)).toBe(catalogEntry.defaultModel);
    }
  });

  it('falls back to the raw model id when a stale setting references an unknown model', () => {
    expect(getModelLabel('claude-code', 'retired-model')).toBe('retired-model');
  });
});
