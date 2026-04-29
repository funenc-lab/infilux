import type { TodoGeneratedTaskDraft } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  findTodoContextMention,
  mergeTodoContextMentionFile,
  mergeTodoContextMentionSelection,
  replaceTodoContextMention,
} from '../todoContextMentions';
import {
  buildTodoGenerateAgentOptions,
  buildTodoGenerateContext,
  buildTodoGenerateTasksRequest,
  createTodoTaskInputFromDraft,
  extractTodoContextMentionFiles,
  resolveGeneratedTaskAgentId,
} from '../todoGenerateTasks';
import { buildTodoTaskContextBlock } from '../todoTaskContext';
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

const codexAgent = agent({
  agentId: 'codex',
  command: 'codex',
  isDefault: true,
  name: 'Codex',
});

const geminiAgent = agent({
  agentId: 'gemini',
  command: 'gemini',
  name: 'Gemini',
});

describe('todo generated task helpers', () => {
  it('maps enabled agents into provider-neutral generation options', () => {
    expect(buildTodoGenerateAgentOptions([codexAgent, geminiAgent])).toEqual([
      {
        agentId: 'codex',
        command: 'codex',
        isDefault: true,
        name: 'Codex',
      },
      {
        agentId: 'gemini',
        command: 'gemini',
        isDefault: false,
        name: 'Gemini',
      },
    ]);
  });

  it('builds generation context from the active repository, worktree, and mentioned files', () => {
    expect(
      buildTodoGenerateContext({
        activeFilePath: '/repo/src/App.tsx',
        repoPath: '/repo',
        requestText: 'Plan this around @src/App.tsx and @src/main.ts.',
        worktreePath: '/repo/worktree',
      })
    ).toEqual({
      repoPath: '/repo',
      worktreePath: '/repo/worktree',
      files: [
        { path: 'src/App.tsx', label: 'App.tsx' },
        { path: 'src/main.ts', label: 'main.ts' },
      ],
    });
  });

  it('builds generation context from mentioned files and directories', () => {
    expect(
      buildTodoGenerateContext({
        activeFilePath: '/repo/src/current.ts',
        repoPath: '/repo',
        requestText:
          'Plan @src/renderer/components/todo/ with @src/App.tsx and @src/renderer/components/todo/.',
        worktreePath: '/repo/worktree',
      })
    ).toEqual({
      repoPath: '/repo',
      worktreePath: '/repo/worktree',
      files: [{ path: 'src/App.tsx', label: 'App.tsx' }],
      directories: [{ path: 'src/renderer/components/todo', label: 'todo' }],
    });
  });

  it('extracts @ mention files with dedupe, punctuation cleanup, and current-file support', () => {
    expect(
      extractTodoContextMentionFiles(
        'Use @src/App.tsx, @src/App.tsx and @current-file for the plan.',
        '/repo/src/current.ts'
      )
    ).toEqual([
      { path: 'src/App.tsx', label: 'App.tsx' },
      { path: '/repo/src/current.ts', label: 'current.ts' },
    ]);
  });

  it('keeps file context explicit when no @ mentions are present', () => {
    expect(
      buildTodoGenerateContext({
        activeFilePath: '/repo/src/App.tsx',
        repoPath: '/repo',
        requestText: 'Plan this workflow',
        worktreePath: '/repo/worktree',
      })
    ).toEqual({
      repoPath: '/repo',
      worktreePath: '/repo/worktree',
    });
  });

  it('uses valid AI task assignments before falling back to local capability matching', () => {
    const assignedDraft: TodoGeneratedTaskDraft = {
      agentId: 'gemini',
      description: 'Compare docs before implementation.',
      priority: 'medium',
      title: 'Research API options',
    };
    const implementationDraft: TodoGeneratedTaskDraft = {
      description: 'Implement the workflow and run tests.',
      priority: 'high',
      title: 'Implement workflow',
    };

    expect(resolveGeneratedTaskAgentId(assignedDraft, [codexAgent, geminiAgent])).toBe('gemini');
    expect(resolveGeneratedTaskAgentId(implementationDraft, [codexAgent, geminiAgent])).toBe(
      'codex'
    );
  });

  it('creates todo store input with context and resolved agent assignment', () => {
    const draft: TodoGeneratedTaskDraft = {
      description: 'Implement the workflow and run tests.',
      priority: 'high',
      title: 'Implement workflow',
    };

    expect(
      createTodoTaskInputFromDraft({
        agents: [codexAgent],
        context: { repoPath: '/repo', worktreePath: '/repo/worktree' },
        draft,
      })
    ).toEqual({
      agentId: 'codex',
      context: { repoPath: '/repo', worktreePath: '/repo/worktree' },
      description: 'Implement the workflow and run tests.',
      priority: 'high',
      status: 'todo',
      title: 'Implement workflow',
    });
  });

  it('detects and replaces todo context mentions without matching emails', () => {
    expect(findTodoContextMention('Update @src/App', 15)).toEqual({
      query: 'src/App',
      start: 7,
    });
    expect(findTodoContextMention('Fix: @src/App', 13)).toEqual({
      query: 'src/App',
      start: 5,
    });
    expect(findTodoContextMention('Check（@src/App', 14)).toEqual({
      query: 'src/App',
      start: 6,
    });
    expect(findTodoContextMention('email dev@example.com', 17)).toBeNull();

    expect(replaceTodoContextMention('Update @src/App please', 15, 'src/App.tsx')).toEqual({
      nextCursor: 19,
      nextText: 'Update @src/App.tsx please',
    });
  });

  it('merges selected mention files into task context with dedupe', () => {
    expect(
      mergeTodoContextMentionFile([{ path: 'src/App.tsx', label: 'App.tsx' }], {
        name: 'App.tsx',
        path: '/repo/src/App.tsx',
        relativePath: 'src/App.tsx',
        score: 900,
      })
    ).toEqual([{ path: 'src/App.tsx', label: 'App.tsx' }]);

    expect(
      mergeTodoContextMentionFile([], {
        name: 'main.ts',
        path: '/repo/src/main.ts',
        relativePath: 'src/main.ts',
        score: 900,
      })
    ).toEqual([{ path: 'src/main.ts', label: 'main.ts' }]);
  });

  it('merges selected mention files and directories into separate context lists', () => {
    expect(
      mergeTodoContextMentionSelection(
        {
          directories: [{ path: 'src/renderer/components/todo', label: 'todo' }],
          files: [{ path: 'src/App.tsx', label: 'App.tsx' }],
        },
        {
          kind: 'directory',
          name: 'todo',
          path: '/repo/src/renderer/components/todo',
          relativePath: 'src/renderer/components/todo',
          score: 900,
        }
      )
    ).toEqual({
      directories: [{ path: 'src/renderer/components/todo', label: 'todo' }],
      files: [{ path: 'src/App.tsx', label: 'App.tsx' }],
    });

    expect(
      mergeTodoContextMentionSelection(
        {
          directories: [],
          files: [],
        },
        {
          kind: 'file',
          name: 'main.ts',
          path: '/repo/src/main.ts',
          relativePath: 'src/main.ts',
          score: 900,
        }
      )
    ).toEqual({
      directories: [],
      files: [{ path: 'src/main.ts', label: 'main.ts' }],
    });
  });

  it('renders directory context in task execution prompts', () => {
    expect(
      buildTodoTaskContextBlock({
        repoPath: '/repo',
        directories: [{ path: 'src/renderer/components/todo', label: 'todo' }],
      })
    ).toContain('Related directories:\n- src/renderer/components/todo (todo)');
  });

  it('renders task dependencies in task execution prompts', () => {
    expect(
      buildTodoTaskContextBlock({
        dependencyTaskIds: ['api', 'release'],
      })
    ).toContain('Task dependencies:\n- api\n- release');
  });

  it('renders manual approval gates in task execution prompts', () => {
    expect(
      buildTodoTaskContextBlock({
        executionGate: {
          requiresApproval: true,
        },
      } as Parameters<typeof buildTodoTaskContextBlock>[0])
    ).toContain('Execution gates:\n- Manual approval: pending');

    expect(
      buildTodoTaskContextBlock({
        executionGate: {
          approvedAt: 123,
          requiresApproval: true,
        },
      } as Parameters<typeof buildTodoTaskContextBlock>[0])
    ).toContain('Execution gates:\n- Manual approval: approved');
  });

  it('builds AI task generation requests without reusing the polish prompt', () => {
    expect(
      buildTodoGenerateTasksRequest({
        agents: [codexAgent],
        context: { repoPath: '/repo', worktreePath: '/repo/worktree' },
        maxTasks: 6,
        repoPath: '/repo',
        settings: {
          model: 'haiku',
          prompt: 'Return a single {title, description} object.',
          provider: 'claude-code',
          reasoningEffort: 'medium',
          timeout: 60,
        },
        text: 'Create implementation tasks',
        worktreePath: '/repo/worktree',
      })
    ).toEqual({
      agents: [
        {
          agentId: 'codex',
          command: 'codex',
          isDefault: true,
          name: 'Codex',
        },
      ],
      context: { repoPath: '/repo', worktreePath: '/repo/worktree' },
      maxTasks: 6,
      model: 'haiku',
      provider: 'claude-code',
      reasoningEffort: 'medium',
      repoPath: '/repo',
      text: 'Create implementation tasks',
      timeout: 60,
      worktreePath: '/repo/worktree',
    });
  });
});
