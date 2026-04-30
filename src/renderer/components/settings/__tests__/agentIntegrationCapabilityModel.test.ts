import { describe, expect, it } from 'vitest';
import { resolveAgentIntegrationCapabilityModel } from '../agentIntegrationCapabilityModel';

describe('agent integration capability model', () => {
  it('describes provider-specific integration capabilities without implying universal support', () => {
    const model = resolveAgentIntegrationCapabilityModel();

    expect(model.supportedProviderLabels).toEqual(['Claude Code', 'Codex CLI', 'Gemini CLI']);
    expect(model.unsupportedProviderLabels).toEqual(['Cursor CLI']);
    expect(model.capabilities.map((capability) => capability.id)).toEqual([
      'provider-switching',
      'editor-context',
      'completion-notification',
      'question-notification',
      'status-telemetry',
    ]);
    expect(model.capabilities[0]).toMatchObject({
      id: 'provider-switching',
      supportedProviderLabels: ['Claude Code', 'Codex CLI', 'Gemini CLI'],
      unsupportedProviderLabels: ['Cursor CLI'],
    });
    expect(
      model.capabilities
        .slice(1)
        .every(
          (capability) =>
            capability.supportedProviderLabels.join(', ') === 'Claude Code' &&
            capability.unsupportedProviderLabels.length === 3
        )
    ).toBe(true);
  });
});
