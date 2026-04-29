import { describe, expect, it } from 'vitest';
import { resolveAgentToolRoutingModel } from '../agentToolRoutingModel';

describe('agent tool routing model', () => {
  it('builds generic AI tool options from builtin, wrapped, and custom agents', () => {
    const model = resolveAgentToolRoutingModel({
      agentSettings: {
        claude: { enabled: true, isDefault: false },
        codex: { enabled: true, isDefault: true, customPath: '/opt/codex/bin/codex' },
        gemini: { enabled: false, isDefault: false },
        'codex-happy': { enabled: true, isDefault: false },
        'custom-reviewer': { enabled: true, isDefault: false },
      },
      agentDetectionStatus: {
        claude: { installed: true },
        codex: { installed: true },
        'custom-reviewer': { installed: false },
      },
      customAgents: [
        {
          id: 'custom-reviewer',
          name: 'Review CLI',
          command: 'review-cli',
        },
      ],
      hapiEnabled: false,
      happyEnabled: true,
    });

    expect(model.defaultAgentId).toBe('codex');
    expect(model.defaultOption).toMatchObject({
      agentId: 'codex',
      baseAgentId: 'codex',
      label: 'Codex',
      providerLabel: 'Codex CLI',
      runtimeLabel: 'Native',
      command: '/opt/codex/bin/codex',
      commandSource: 'custom-path',
      status: 'installed',
    });
    expect(model.options.map((option) => option.agentId)).toEqual([
      'claude',
      'codex',
      'codex-happy',
      'custom-reviewer',
    ]);
    expect(model.options.find((option) => option.agentId === 'codex-happy')).toMatchObject({
      label: 'Codex (Happy)',
      runtimeLabel: 'Happy',
      providerLabel: 'Codex CLI',
      status: 'installed',
    });
    expect(model.options.find((option) => option.agentId === 'custom-reviewer')).toMatchObject({
      label: 'Review CLI',
      providerLabel: 'Custom CLI',
      command: 'review-cli',
      commandSource: 'custom-agent',
      status: 'not-installed',
    });
  });

  it('falls back to the first enabled tool when no enabled default is available', () => {
    const model = resolveAgentToolRoutingModel({
      agentSettings: {
        claude: { enabled: false, isDefault: true },
        gemini: { enabled: true, isDefault: false },
      },
      agentDetectionStatus: {},
      customAgents: [],
      hapiEnabled: false,
      happyEnabled: false,
    });

    expect(model.defaultAgentId).toBe('gemini');
    expect(model.defaultOption).toMatchObject({
      agentId: 'gemini',
      providerLabel: 'Gemini CLI',
      status: 'not-detected',
    });
  });
});
