import type { TodoGenerateAgentOption } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { buildTodoGeneratePrompt, parseTodoGenerateOutput } from '../todo-generate';

const agents: TodoGenerateAgentOption[] = [
  {
    agentId: 'codex',
    command: 'codex',
    isDefault: true,
    name: 'Codex',
  },
  {
    agentId: 'gemini',
    command: 'gemini',
    name: 'Gemini',
  },
];

describe('todo task generation AI helper', () => {
  it('parses fenced JSON task drafts and keeps valid agent assignments', () => {
    const parsed = parseTodoGenerateOutput(
      `\`\`\`json
{
  "tasks": [
    {
      "title": "Add IPC contract",
      "description": "Add the channel and verify preload routing.",
      "priority": "high",
      "agentId": "codex",
      "rationale": "Implementation task"
    }
  ]
}
\`\`\``,
      agents
    );

    expect(parsed).toEqual([
      {
        title: 'Add IPC contract',
        description: 'Add the channel and verify preload routing.',
        priority: 'high',
        agentId: 'codex',
        rationale: 'Implementation task',
      },
    ]);
  });

  it('filters invalid agent assignments and normalizes invalid priorities', () => {
    const parsed = parseTodoGenerateOutput(
      JSON.stringify({
        tasks: [
          {
            title: 'Review docs',
            description: 'Compare the plan with current docs.',
            priority: 'urgent',
            agentId: 'unknown-agent',
          },
        ],
      }),
      agents
    );

    expect(parsed).toEqual([
      {
        title: 'Review docs',
        description: 'Compare the plan with current docs.',
        priority: 'medium',
      },
    ]);
  });

  it('clamps the maximum generated task count', () => {
    const rawTasks = Array.from({ length: 14 }, (_, index) => ({
      title: `Task ${index + 1}`,
      description: `Do task ${index + 1}.`,
      priority: 'low',
    }));

    const parsed = parseTodoGenerateOutput(JSON.stringify({ tasks: rawTasks }), agents, 99);

    expect(parsed).toHaveLength(12);
    expect(parsed?.at(-1)?.title).toBe('Task 12');
  });

  it('builds a provider-neutral prompt with repository, worktree, file, and agent context', () => {
    const prompt = buildTodoGeneratePrompt({
      text: 'Plan the AI todo workflow',
      timeout: 60,
      provider: 'codex-cli',
      model: 'gpt-5.2',
      repoPath: '/repo/main',
      worktreePath: '/repo/worktrees/ai-todo',
      context: {
        repoPath: '/repo/context',
        worktreePath: '/repo/worktrees/context',
        files: [{ path: 'src/renderer/components/todo/KanbanBoard.tsx' }],
        directories: [{ path: 'src/renderer/components/todo' }],
      },
      agents,
      maxTasks: 4,
    });

    expect(prompt).toContain('1 to 4 objects');
    expect(prompt).toContain('Repository: /repo/context');
    expect(prompt).toContain('Worktree: /repo/worktrees/context');
    expect(prompt).toContain('- src/renderer/components/todo/KanbanBoard.tsx');
    expect(prompt).toContain('Related directories:');
    expect(prompt).toContain('- src/renderer/components/todo');
    expect(prompt).toContain('- codex: Codex (codex default)');
    expect(prompt).toContain('- gemini: Gemini (gemini)');
    expect(prompt).toContain('Plan the AI todo workflow');
  });
});
