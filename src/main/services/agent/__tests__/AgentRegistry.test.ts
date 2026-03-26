import { describe, expect, it } from 'vitest';

describe('AgentRegistry', () => {
  it('exposes builtin agents and supports registration lifecycle operations', async () => {
    const { AgentRegistry, BUILTIN_AGENTS } = await import('../AgentRegistry');

    const registry = new AgentRegistry();
    expect(registry.list()).toEqual(BUILTIN_AGENTS);
    expect(registry.get('claude')).toEqual(BUILTIN_AGENTS[0]);
    expect(registry.get('missing')).toBeUndefined();

    const customAgent = {
      id: 'custom',
      name: 'Custom Agent',
      description: 'Custom integration',
      icon: 'custom',
      binary: 'custom-agent',
      capabilities: {
        chat: true,
        codeEdit: false,
        terminal: false,
        fileRead: true,
        fileWrite: false,
      },
    };

    registry.register(customAgent);
    expect(registry.get('custom')).toEqual(customAgent);
    expect(registry.list()).toContainEqual(customAgent);

    registry.unregister('custom');
    expect(registry.get('custom')).toBeUndefined();
  });

  it('accepts custom builtin agents for isolated registries', async () => {
    const { AgentRegistry } = await import('../AgentRegistry');

    const builtin = {
      id: 'only-one',
      name: 'Only One',
      description: 'Single builtin',
      icon: 'single',
      binary: 'single',
      capabilities: {
        chat: false,
        codeEdit: true,
        terminal: true,
        fileRead: true,
        fileWrite: true,
      },
    };

    const registry = new AgentRegistry([builtin]);

    expect(registry.list()).toEqual([builtin]);
    expect(registry.get('only-one')).toEqual(builtin);
  });
});
