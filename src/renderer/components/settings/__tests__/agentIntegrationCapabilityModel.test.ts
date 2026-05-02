import { describe, expect, it } from 'vitest';
import { resolveAgentIntegrationCapabilityModel } from '../agentIntegrationCapabilityModel';

describe('agent integration capability model', () => {
  it('describes provider-specific integration capabilities without implying universal support', () => {
    const model = resolveAgentIntegrationCapabilityModel();

    expect(model.providers).toEqual([
      { providerId: 'claude-code', label: 'Claude Code' },
      { providerId: 'codex-cli', label: 'Codex CLI' },
      { providerId: 'cursor-cli', label: 'Cursor CLI' },
      { providerId: 'gemini-cli', label: 'Gemini CLI' },
    ]);
    expect(model.totalCapabilityCount).toBe(5);
    expect(model.supportedProviderLabels).toEqual(['Claude Code', 'Codex CLI', 'Gemini CLI']);
    expect(model.unsupportedProviderLabels).toEqual(['Cursor CLI']);
    expect(model.fullCoverageProviderLabels).toEqual(['Claude Code']);
    expect(model.partialCoverageProviderLabels).toEqual(['Codex CLI', 'Gemini CLI']);
    expect(model.noCoverageProviderLabels).toEqual(['Cursor CLI']);
    expect(
      model.providerCoverages.map(
        ({
          label,
          supportedCapabilityCount,
          unsupportedCapabilityCount,
          coveragePercent,
          tone,
        }) => ({
          label,
          supportedCapabilityCount,
          unsupportedCapabilityCount,
          coveragePercent,
          tone,
        })
      )
    ).toEqual([
      {
        label: 'Claude Code',
        supportedCapabilityCount: 5,
        unsupportedCapabilityCount: 0,
        coveragePercent: 100,
        tone: 'complete',
      },
      {
        label: 'Codex CLI',
        supportedCapabilityCount: 1,
        unsupportedCapabilityCount: 4,
        coveragePercent: 20,
        tone: 'partial',
      },
      {
        label: 'Cursor CLI',
        supportedCapabilityCount: 0,
        unsupportedCapabilityCount: 5,
        coveragePercent: 0,
        tone: 'pending',
      },
      {
        label: 'Gemini CLI',
        supportedCapabilityCount: 1,
        unsupportedCapabilityCount: 4,
        coveragePercent: 20,
        tone: 'partial',
      },
    ]);
    expect(model.capabilities.map((capability) => capability.id)).toEqual([
      'provider-switching',
      'editor-context',
      'completion-notification',
      'question-notification',
      'status-telemetry',
    ]);
    expect(model.capabilities[0]).toMatchObject({
      id: 'provider-switching',
      supportedProviderCount: 3,
      supportedProviderLabels: ['Claude Code', 'Codex CLI', 'Gemini CLI'],
      unsupportedProviderLabels: ['Cursor CLI'],
    });
    expect(
      model.capabilities[0].providerStatuses.map(({ label, supported }) => ({
        label,
        supported,
      }))
    ).toEqual([
      { label: 'Claude Code', supported: true },
      { label: 'Codex CLI', supported: true },
      { label: 'Cursor CLI', supported: false },
      { label: 'Gemini CLI', supported: true },
    ]);
    expect(
      model.capabilities[1].providerStatuses.map(({ label, supported }) => ({
        label,
        supported,
      }))
    ).toEqual([
      { label: 'Claude Code', supported: true },
      { label: 'Codex CLI', supported: false },
      { label: 'Cursor CLI', supported: false },
      { label: 'Gemini CLI', supported: false },
    ]);
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
