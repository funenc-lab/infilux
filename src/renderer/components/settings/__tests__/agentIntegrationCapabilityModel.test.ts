import { describe, expect, it } from 'vitest';
import { resolveAgentIntegrationCapabilityModel } from '../agentIntegrationCapabilityModel';

describe('agent integration capability model', () => {
  it('describes provider-specific integration capabilities without implying universal support', () => {
    const model = resolveAgentIntegrationCapabilityModel();

    expect(model.supportedProviderLabels).toEqual(['Claude Code']);
    expect(model.unsupportedProviderLabels).toEqual(['Codex CLI', 'Cursor CLI', 'Gemini CLI']);
    expect(model.capabilities.map((capability) => capability.id)).toEqual([
      'editor-context',
      'completion-notification',
      'question-notification',
      'status-telemetry',
    ]);
    expect(
      model.capabilities.every(
        (capability) =>
          capability.supportedProviderLabels.join(', ') === 'Claude Code' &&
          capability.unsupportedProviderLabels.length === 3
      )
    ).toBe(true);
  });
});
