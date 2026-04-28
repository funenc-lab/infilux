import type {
  AIProvider,
  ModelId,
  ReasoningEffort,
  TodoGenerateAgentOption,
  TodoGeneratedTaskDraft,
  TodoGenerateTasksRequest,
} from '@shared/types';
import { AUTO_EXECUTE_AGENT_AUTO_VALUE, resolveAutoExecuteAgentChoice } from './agentCapabilities';
import {
  buildTodoTaskExecutionContext,
  createTodoContextDirectory,
  createTodoContextFile,
  type TodoTaskContextFallback,
} from './todoTaskContext';
import type { TaskStatus, TodoTask, TodoTaskContext } from './types';
import type { ResolvedAgent } from './useEnabledAgents';

export interface BuildTodoGenerateContextOptions {
  repoPath: string;
  worktreePath?: string;
  activeFilePath?: string | null;
  requestText?: string;
}

export interface CreateTodoTaskInputFromDraftOptions {
  draft: TodoGeneratedTaskDraft;
  agents: ResolvedAgent[];
  context?: TodoTaskContext;
  status?: TaskStatus;
}

export interface TodoGenerateProviderSettings {
  timeout: number;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  prompt?: string;
}

export interface BuildTodoGenerateTasksRequestOptions {
  text: string;
  settings: TodoGenerateProviderSettings;
  repoPath: string;
  worktreePath?: string;
  context?: TodoTaskContext;
  agents?: readonly ResolvedAgent[];
  maxTasks?: number;
  prompt?: string;
}

export type GeneratedTodoTaskInput = Omit<TodoTask, 'createdAt' | 'id' | 'order' | 'updatedAt'>;

interface TodoContextMentionReferences {
  files?: TodoTaskContext['files'];
  directories?: TodoTaskContext['directories'];
}

const CONTEXT_SCOPE_MENTIONS = new Set(['project', 'repo', 'repository', 'worktree']);
const CURRENT_FILE_MENTION = 'current-file';

function normalizeMentionToken(rawToken: string): string | undefined {
  const token = rawToken
    .trim()
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\)+$/g, '');
  return token.length > 0 ? token : undefined;
}

export function extractTodoContextMentionFiles(
  text: string | undefined,
  activeFilePath?: string | null
): TodoTaskContext['files'] {
  return extractTodoContextMentionReferences(text, activeFilePath).files;
}

export function extractTodoContextMentionReferences(
  text: string | undefined,
  activeFilePath?: string | null
): TodoContextMentionReferences {
  const files: NonNullable<TodoTaskContext['files']> = [];
  const directories: NonNullable<TodoTaskContext['directories']> = [];
  const seenFiles = new Set<string>();
  const seenDirectories = new Set<string>();
  const source = text ?? '';
  const pattern = /(^|\s)@([^\s]+)/g;

  for (const match of source.matchAll(pattern)) {
    const token = normalizeMentionToken(match[2] ?? '');
    if (!token || CONTEXT_SCOPE_MENTIONS.has(token)) {
      continue;
    }

    const isDirectoryMention = token.endsWith('/') || token.endsWith('\\');
    const path = token === CURRENT_FILE_MENTION ? activeFilePath?.trim() : token;
    if (!path) {
      continue;
    }

    if (isDirectoryMention && token !== CURRENT_FILE_MENTION) {
      const directoryPath = path.replace(/[\\/]+$/g, '');
      if (directoryPath && !seenDirectories.has(directoryPath)) {
        seenDirectories.add(directoryPath);
        directories.push(createTodoContextDirectory(directoryPath));
      }
      continue;
    }

    if (seenFiles.has(path)) {
      continue;
    }

    seenFiles.add(path);
    files.push(createTodoContextFile(path));
  }

  return {
    ...(files.length > 0 ? { files } : {}),
    ...(directories.length > 0 ? { directories } : {}),
  };
}

export function buildTodoGenerateAgentOptions(
  agents: readonly ResolvedAgent[]
): TodoGenerateAgentOption[] {
  return agents.map((agent) => ({
    agentId: agent.agentId,
    name: agent.name,
    command: agent.command,
    isDefault: agent.isDefault,
  }));
}

export function buildTodoGenerateContext({
  activeFilePath,
  repoPath,
  requestText,
  worktreePath,
}: BuildTodoGenerateContextOptions): TodoTaskContext | undefined {
  const mentionedContext = extractTodoContextMentionReferences(requestText, activeFilePath);
  const fallback: TodoTaskContextFallback = {
    repoPath,
    ...(worktreePath ? { worktreePath } : {}),
    ...(mentionedContext.files ? { files: mentionedContext.files } : {}),
    ...(mentionedContext.directories ? { directories: mentionedContext.directories } : {}),
  };

  return buildTodoTaskExecutionContext({ context: undefined }, fallback);
}

export function buildTodoGenerateTasksRequest({
  agents,
  context,
  maxTasks,
  prompt,
  repoPath,
  settings,
  text,
  worktreePath,
}: BuildTodoGenerateTasksRequestOptions): TodoGenerateTasksRequest {
  const request: TodoGenerateTasksRequest = {
    text,
    timeout: settings.timeout,
    provider: settings.provider,
    model: settings.model,
  };

  if (settings.reasoningEffort !== undefined) {
    request.reasoningEffort = settings.reasoningEffort;
  }
  if (repoPath) {
    request.repoPath = repoPath;
  }
  if (worktreePath) {
    request.worktreePath = worktreePath;
  }
  if (context) {
    request.context = context;
  }
  if (agents) {
    request.agents = buildTodoGenerateAgentOptions(agents);
  }
  if (maxTasks !== undefined) {
    request.maxTasks = maxTasks;
  }

  const planningPrompt = prompt?.trim();
  if (planningPrompt) {
    request.prompt = planningPrompt;
  }

  return request;
}

export function resolveGeneratedTaskAgentId(
  draft: TodoGeneratedTaskDraft,
  agents: ResolvedAgent[]
): string | undefined {
  if (draft.agentId && agents.some((agent) => agent.agentId === draft.agentId)) {
    return draft.agentId;
  }

  const choice = resolveAutoExecuteAgentChoice({
    agents,
    selectedAgentId: AUTO_EXECUTE_AGENT_AUTO_VALUE,
    tasks: [
      {
        id: 'generated-draft',
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        status: 'todo',
        createdAt: 0,
        updatedAt: 0,
        order: 0,
      },
    ],
  });

  return choice.agent?.agentId;
}

export function createTodoTaskInputFromDraft({
  agents,
  context,
  draft,
  status = 'todo',
}: CreateTodoTaskInputFromDraftOptions): GeneratedTodoTaskInput {
  const agentId = resolveGeneratedTaskAgentId(draft, agents);

  return {
    title: draft.title,
    description: draft.description,
    priority: draft.priority,
    status,
    ...(agentId ? { agentId } : {}),
    ...(context ? { context } : {}),
  };
}
