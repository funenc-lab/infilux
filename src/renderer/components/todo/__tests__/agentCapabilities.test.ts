import { describe, expect, it } from 'vitest';
import {
  AUTO_EXECUTE_AGENT_AUTO_VALUE,
  resolveAgentCapabilities,
  resolveAutoExecuteAgentChoice,
} from '../agentCapabilities';
import type { TodoTask } from '../types';
import type { ResolvedAgent } from '../useEnabledAgents';

function agent(overrides: Partial<ResolvedAgent> & Pick<ResolvedAgent, 'agentId'>): ResolvedAgent {
  return {
    agentId: overrides.agentId,
    command: overrides.command ?? overrides.agentId,
    environment: overrides.environment ?? 'native',
    isDefault: overrides.isDefault ?? false,
    name: overrides.name ?? overrides.agentId,
  };
}

function task(overrides: Partial<TodoTask> & Pick<TodoTask, 'title'>): TodoTask {
  return {
    id: overrides.id ?? 'task-1',
    title: overrides.title,
    description: overrides.description ?? '',
    priority: overrides.priority ?? 'medium',
    status: overrides.status ?? 'todo',
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    order: overrides.order ?? 0,
    ...(overrides.agentId ? { agentId: overrides.agentId } : {}),
  };
}

describe('agent capabilities', () => {
  it('keeps manually selected agents ahead of automatic recommendations', () => {
    const choice = resolveAutoExecuteAgentChoice({
      agents: [
        agent({ agentId: 'claude', isDefault: true, name: 'Claude' }),
        agent({ agentId: 'gemini', name: 'Gemini' }),
      ],
      selectedAgentId: 'gemini',
      tasks: [task({ title: 'Fix failing unit tests' })],
    });

    expect(choice).toMatchObject({
      agent: expect.objectContaining({ agentId: 'gemini' }),
      mode: 'manual',
    });
  });

  it('recommends a stronger code agent for implementation-heavy task queues', () => {
    const choice = resolveAutoExecuteAgentChoice({
      agents: [
        agent({ agentId: 'claude', isDefault: true, name: 'Claude' }),
        agent({ agentId: 'codex', name: 'Codex' }),
        agent({ agentId: 'gemini', name: 'Gemini' }),
      ],
      selectedAgentId: AUTO_EXECUTE_AGENT_AUTO_VALUE,
      tasks: [
        task({
          title: 'Fix failing Vitest tests',
          description: 'Update TypeScript implementation and run pnpm test.',
        }),
      ],
    });

    expect(choice).toMatchObject({
      agent: expect.objectContaining({ agentId: 'codex' }),
      mode: 'recommended',
      reason: 'Code implementation fit',
    });
  });

  it('recognizes localized implementation-heavy task queues', () => {
    const choice = resolveAutoExecuteAgentChoice({
      agents: [
        agent({ agentId: 'claude', isDefault: true, name: 'Claude' }),
        agent({ agentId: 'codex', name: 'Codex' }),
        agent({ agentId: 'gemini', name: 'Gemini' }),
      ],
      selectedAgentId: AUTO_EXECUTE_AGENT_AUTO_VALUE,
      tasks: [
        task({
          title: '\u4fee\u590d\u6d4b\u8bd5\u5931\u8d25',
          description: '\u8c03\u6574\u5b9e\u73b0\u5e76\u8fd0\u884c\u9a8c\u8bc1',
        }),
      ],
    });

    expect(choice).toMatchObject({
      agent: expect.objectContaining({ agentId: 'codex' }),
      mode: 'recommended',
      reason: 'Code implementation fit',
    });
  });

  it('uses a task-level agent selection ahead of queue-level choices', () => {
    const choice = resolveAutoExecuteAgentChoice({
      agents: [
        agent({ agentId: 'codex', isDefault: true, name: 'Codex' }),
        agent({ agentId: 'gemini', name: 'Gemini' }),
      ],
      selectedAgentId: 'codex',
      tasks: [
        task({
          title: 'Research the latest API behavior',
          description: 'Compare current docs before implementation.',
          agentId: 'gemini',
        }),
      ],
    });

    expect(choice).toMatchObject({
      agent: expect.objectContaining({ agentId: 'gemini' }),
      mode: 'task',
      reason: 'Task agent selection',
    });
  });

  it('can ignore task-level selections for queue-level recommendations', () => {
    const choice = resolveAutoExecuteAgentChoice({
      agents: [
        agent({ agentId: 'claude', isDefault: true, name: 'Claude' }),
        agent({ agentId: 'codex', name: 'Codex' }),
        agent({ agentId: 'gemini', name: 'Gemini' }),
      ],
      selectedAgentId: AUTO_EXECUTE_AGENT_AUTO_VALUE,
      respectTaskAgentSelection: false,
      tasks: [
        task({
          title: 'Fix failing Vitest tests',
          description: 'Update TypeScript implementation and run pnpm test.',
        }),
        task({
          id: 'task-2',
          title: 'Update release checklist',
          description: 'Keep acceptance notes aligned.',
          agentId: 'gemini',
        }),
      ],
    });

    expect(choice).toMatchObject({
      agent: expect.objectContaining({ agentId: 'codex' }),
      mode: 'recommended',
      reason: 'Code implementation fit',
    });
  });

  it('gives unknown agents a conservative extensible capability profile', () => {
    const capabilities = resolveAgentCapabilities(agent({ agentId: 'internal-agent' }));

    expect(capabilities).toMatchObject({
      agentFamily: 'custom',
      canEditCode: true,
      completionSignal: 'marker',
    });
  });

  it('derives known agent capabilities from the shared catalog identity', () => {
    const capabilities = resolveAgentCapabilities(
      agent({
        agentId: 'cursor-hapi',
        command: 'cursor-agent',
      })
    );

    expect(capabilities).toMatchObject({
      agentFamily: 'cursor',
      canEditCode: true,
      canReviewCode: true,
      completionSignal: 'marker',
    });
  });
});
