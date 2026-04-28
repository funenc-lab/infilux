import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_IDS_BY_PROVIDER,
  AI_PROVIDER_CATALOG,
  AI_PROVIDERS,
  BUILTIN_AGENT_CATALOG,
  BUILTIN_AGENT_IDS,
  getAIProviderDefaultModel,
  getBuiltinAgentCatalogEntry,
  resolveAgentCapabilityProfile,
} from '../types';

describe('agent catalog', () => {
  it('keeps AI provider models and defaults aligned with the shared catalog', () => {
    expect(Object.keys(AI_PROVIDER_CATALOG).sort()).toEqual([...AI_PROVIDERS].sort());

    for (const provider of AI_PROVIDERS) {
      const entry = AI_PROVIDER_CATALOG[provider];
      expect(AI_MODEL_IDS_BY_PROVIDER[provider]).toEqual(entry.models.map((model) => model.id));
      expect(getAIProviderDefaultModel(provider)).toBe(entry.defaultModel);
    }
  });

  it('describes built-in agent metadata from one extensible source', () => {
    expect(BUILTIN_AGENT_IDS).toEqual([
      'claude',
      'codex',
      'droid',
      'gemini',
      'auggie',
      'cursor',
      'opencode',
    ]);
    expect(BUILTIN_AGENT_CATALOG.codex).toMatchObject({
      command: 'codex',
      provider: 'codex-cli',
      capabilities: {
        agentFamily: 'codex',
        canEditCode: true,
        canReviewCode: true,
        hasStrongTestAffinity: true,
      },
    });
    expect(getBuiltinAgentCatalogEntry('cursor-hapi')).toMatchObject({
      id: 'cursor',
      command: 'cursor-agent',
      provider: 'cursor-cli',
    });
  });

  it('resolves known and custom capability profiles without renderer-specific data', () => {
    expect(resolveAgentCapabilityProfile('cursor-happy', 'cursor-agent')).toMatchObject({
      agentFamily: 'cursor',
      canEditCode: true,
      canReviewCode: true,
      completionSignal: 'marker',
    });
    expect(resolveAgentCapabilityProfile('internal-agent', '/opt/tools/internal-agent')).toEqual({
      agentFamily: 'custom',
      canEditCode: true,
      canReviewCode: false,
      canResearch: false,
      canHandleLargeContext: false,
      canDeepReason: false,
      hasStrongTestAffinity: false,
      completionSignal: 'marker',
    });
  });
});
