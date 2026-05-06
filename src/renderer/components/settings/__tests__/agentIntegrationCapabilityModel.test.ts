import { describe, expect, it } from 'vitest';
import {
  findAgentIntegrationCapability,
  resolveAgentIntegrationCapabilityModel,
} from '../agentIntegrationCapabilityModel';

describe('agent integration capability model', () => {
  it('describes provider-specific integration capabilities without implying universal support', () => {
    const model = resolveAgentIntegrationCapabilityModel();

    expect(model.providers).toEqual([
      { providerId: 'claude-code', label: 'Claude Code' },
      { providerId: 'codex-cli', label: 'Codex CLI' },
      { providerId: 'cursor-cli', label: 'Cursor CLI' },
      { providerId: 'gemini-cli', label: 'Gemini CLI' },
    ]);
    expect(model.totalCapabilityCount).toBe(6);
    expect(model.supportedProviderLabels).toEqual([
      'Claude Code',
      'Codex CLI',
      'Cursor CLI',
      'Gemini CLI',
    ]);
    expect(model.unsupportedProviderLabels).toEqual([]);
    expect(model.fullCoverageProviderLabels).toEqual(['Claude Code']);
    expect(model.partialCoverageProviderLabels).toEqual(['Codex CLI', 'Cursor CLI', 'Gemini CLI']);
    expect(model.noCoverageProviderLabels).toEqual([]);
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
        supportedCapabilityCount: 6,
        unsupportedCapabilityCount: 0,
        coveragePercent: 100,
        tone: 'complete',
      },
      {
        label: 'Codex CLI',
        supportedCapabilityCount: 3,
        unsupportedCapabilityCount: 3,
        coveragePercent: 50,
        tone: 'partial',
      },
      {
        label: 'Cursor CLI',
        supportedCapabilityCount: 2,
        unsupportedCapabilityCount: 4,
        coveragePercent: 33,
        tone: 'partial',
      },
      {
        label: 'Gemini CLI',
        supportedCapabilityCount: 3,
        unsupportedCapabilityCount: 3,
        coveragePercent: 50,
        tone: 'partial',
      },
    ]);
    expect(model.capabilities.map((capability) => capability.id)).toEqual([
      'provider-config-detection',
      'provider-switching',
      'editor-context',
      'completion-notification',
      'question-notification',
      'status-telemetry',
    ]);
    expect(model.capabilities[0]).toMatchObject({
      id: 'provider-config-detection',
      supportedProviderCount: 4,
      supportedProviderLabels: ['Claude Code', 'Codex CLI', 'Cursor CLI', 'Gemini CLI'],
      unsupportedProviderLabels: [],
    });
    expect(model.capabilities[1]).toMatchObject({
      id: 'provider-switching',
      supportedProviderCount: 3,
      supportedProviderLabels: ['Claude Code', 'Codex CLI', 'Gemini CLI'],
      unsupportedProviderLabels: ['Cursor CLI'],
    });
    expect(
      model.capabilities[1].providerStatuses.map(({ label, supported }) => ({
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
      model.capabilities[2].providerStatuses.map(({ label, supported }) => ({ label, supported }))
    ).toEqual([
      { label: 'Claude Code', supported: true },
      { label: 'Codex CLI', supported: false },
      { label: 'Cursor CLI', supported: false },
      { label: 'Gemini CLI', supported: false },
    ]);
    expect(
      findAgentIntegrationCapability(model, 'editor-context')?.supportedProviderLabels
    ).toEqual(['Claude Code']);
    expect(
      findAgentIntegrationCapability(model, 'completion-notification')?.supportedProviderLabels
    ).toEqual(['Claude Code', 'Codex CLI', 'Cursor CLI', 'Gemini CLI']);
  });

  it('resolves capabilities by id for provider-scoped settings controls', () => {
    const model = resolveAgentIntegrationCapabilityModel();

    expect(
      findAgentIntegrationCapability(model, 'editor-context')?.supportedProviderLabels
    ).toEqual(['Claude Code']);
    expect(
      findAgentIntegrationCapability(model, 'completion-notification')?.unsupportedProviderLabels
    ).toEqual([]);
    expect(findAgentIntegrationCapability(model, 'status-telemetry')?.supportedProviderCount).toBe(
      1
    );
  });
});
