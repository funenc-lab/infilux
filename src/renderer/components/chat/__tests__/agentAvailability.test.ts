import { describe, expect, it, vi } from 'vitest';
import {
  probeRemoteAgentAvailability,
  resolvePersistedInstalledAgents,
  resolveRemoteInstalledAgents,
} from '../agentAvailability';

describe('resolvePersistedInstalledAgents', () => {
  it('keeps the default agent available without detection when trusted', () => {
    const installedAgents = resolvePersistedInstalledAgents({
      agentSettings: {
        claude: { enabled: true, isDefault: true },
        codex: { enabled: true, isDefault: false },
      },
      agentDetectionStatus: {
        codex: { installed: true },
      },
      hapiEnabled: true,
      happyEnabled: true,
      trustDefaultAgent: true,
    });

    expect([...installedAgents]).toEqual(['claude', 'codex']);
  });

  it('does not trust default detection when runtime requires real probing', () => {
    const installedAgents = resolvePersistedInstalledAgents({
      agentSettings: {
        claude: { enabled: true, isDefault: true },
      },
      agentDetectionStatus: {},
      hapiEnabled: true,
      happyEnabled: true,
      trustDefaultAgent: false,
    });

    expect(installedAgents.size).toBe(0);
  });
});

describe('probeRemoteAgentAvailability', () => {
  it('reports a missing remote CLI before launching a native agent', async () => {
    const detectCli = vi.fn().mockResolvedValue({ installed: false });

    const result = await probeRemoteAgentAvailability(
      {
        agentId: 'claude',
        agentSettings: {
          claude: { enabled: true, isDefault: true },
        },
        customAgents: [],
        hapiEnabled: true,
        happyEnabled: true,
      },
      {
        detectCli,
        checkHapi: vi.fn(),
        checkHappy: vi.fn(),
      }
    );

    expect(result).toEqual({
      available: false,
      environment: 'native',
      baseId: 'claude',
      reason: 'agent-missing',
    });
    expect(detectCli).toHaveBeenCalledWith('claude', undefined, undefined);
  });

  it('blocks hapi agents when the remote wrapper is not installed', async () => {
    const detectCli = vi.fn();
    const checkHapi = vi.fn().mockResolvedValue({ installed: false });

    const result = await probeRemoteAgentAvailability(
      {
        agentId: 'codex-hapi',
        agentSettings: {
          codex: { enabled: true, isDefault: false },
        },
        customAgents: [],
        hapiEnabled: true,
        happyEnabled: true,
      },
      {
        detectCli,
        checkHapi,
        checkHappy: vi.fn(),
      }
    );

    expect(result).toEqual({
      available: false,
      environment: 'hapi',
      baseId: 'codex',
      reason: 'hapi-missing',
    });
    expect(checkHapi).toHaveBeenCalledTimes(1);
    expect(detectCli).not.toHaveBeenCalled();
  });
});

describe('resolveRemoteInstalledAgents', () => {
  it('only keeps agents that are actually available on the remote host', async () => {
    const detectCli = vi.fn(async (agentId: string) => ({
      installed: agentId !== 'codex',
    }));
    const checkHapi = vi.fn().mockResolvedValue({ installed: true });
    const checkHappy = vi.fn().mockResolvedValue({ installed: false });

    const installedAgents = await resolveRemoteInstalledAgents(
      {
        enabledAgentIds: ['claude', 'codex', 'claude-hapi', 'claude-happy'],
        agentSettings: {
          claude: { enabled: true, isDefault: true },
          codex: { enabled: true, isDefault: false },
          'claude-hapi': { enabled: true, isDefault: false },
          'claude-happy': { enabled: true, isDefault: false },
        },
        customAgents: [],
        hapiEnabled: true,
        happyEnabled: true,
      },
      {
        detectCli,
        checkHapi,
        checkHappy,
      }
    );

    expect([...installedAgents]).toEqual(['claude', 'claude-hapi']);
    expect(checkHapi).toHaveBeenCalledTimes(1);
    expect(checkHappy).toHaveBeenCalledTimes(1);
  });
});
