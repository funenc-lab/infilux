import { describe, expect, it } from 'vitest';
import { resolveAgent } from '../agentResolution';

describe('resolveAgent', () => {
  it('does not fall back unknown agent commands to Claude', () => {
    const agent = resolveAgent('my-agent', { 'my-agent': { enabled: true } }, []);

    expect(agent).toMatchObject({
      agentId: 'my-agent',
      command: 'my-agent',
      name: 'my-agent',
    });
  });

  it('keeps custom agent commands explicit', () => {
    const agent = resolveAgent(
      'custom-reviewer',
      { 'custom-reviewer': { enabled: true, isDefault: true } },
      [{ id: 'custom-reviewer', name: 'Reviewer', command: 'reviewer-cli' }]
    );

    expect(agent).toMatchObject({
      agentId: 'custom-reviewer',
      command: 'reviewer-cli',
      isDefault: true,
      name: 'Reviewer',
    });
  });
});
