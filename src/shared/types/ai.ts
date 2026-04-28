import { AI_PROVIDER_CATALOG } from './agentCatalog';
import type { TodoTaskContext } from './todo';

export type AIProvider = keyof typeof AI_PROVIDER_CATALOG;

export type ClaudeModelId = (typeof AI_PROVIDER_CATALOG)['claude-code']['models'][number]['id'];
export type CodexModelId = (typeof AI_PROVIDER_CATALOG)['codex-cli']['models'][number]['id'];
export type CursorModelId = (typeof AI_PROVIDER_CATALOG)['cursor-cli']['models'][number]['id'];
export type GeminiModelId = (typeof AI_PROVIDER_CATALOG)['gemini-cli']['models'][number]['id'];

export type ModelId = ClaudeModelId | CodexModelId | CursorModelId | GeminiModelId;

export const AI_PROVIDERS = Object.keys(AI_PROVIDER_CATALOG) as AIProvider[];

export const CLAUDE_MODEL_IDS = AI_PROVIDER_CATALOG['claude-code'].models.map(
  (model) => model.id
) as readonly ClaudeModelId[];
export const CODEX_MODEL_IDS = AI_PROVIDER_CATALOG['codex-cli'].models.map(
  (model) => model.id
) as readonly CodexModelId[];
export const CURSOR_MODEL_IDS = AI_PROVIDER_CATALOG['cursor-cli'].models.map(
  (model) => model.id
) as readonly CursorModelId[];
export const GEMINI_MODEL_IDS = AI_PROVIDER_CATALOG['gemini-cli'].models.map(
  (model) => model.id
) as readonly GeminiModelId[];

export const AI_MODEL_IDS_BY_PROVIDER: Record<AIProvider, readonly ModelId[]> = {
  'claude-code': CLAUDE_MODEL_IDS,
  'codex-cli': CODEX_MODEL_IDS,
  'cursor-cli': CURSOR_MODEL_IDS,
  'gemini-cli': GEMINI_MODEL_IDS,
};

export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface TodoPolishRequest {
  text: string;
  timeout: number;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  prompt?: string;
}

export interface TodoPolishResult {
  success: boolean;
  title?: string;
  description?: string;
  error?: string;
}

export type TodoGeneratedTaskPriority = 'low' | 'medium' | 'high';

export interface TodoGenerateAgentOption {
  agentId: string;
  name: string;
  command: string;
  isDefault?: boolean;
}

export interface TodoGenerateTasksRequest {
  text: string;
  timeout: number;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  prompt?: string;
  repoPath?: string;
  worktreePath?: string;
  context?: TodoTaskContext;
  agents?: TodoGenerateAgentOption[];
  maxTasks?: number;
}

export interface TodoGeneratedTaskDraft {
  title: string;
  description: string;
  priority: TodoGeneratedTaskPriority;
  agentId?: string;
  rationale?: string;
}

export interface TodoGenerateTasksResult {
  success: boolean;
  tasks?: TodoGeneratedTaskDraft[];
  error?: string;
}

export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && AI_PROVIDERS.includes(value as AIProvider);
}

export function isModelForProvider(provider: AIProvider, value: unknown): value is ModelId {
  return typeof value === 'string' && AI_MODEL_IDS_BY_PROVIDER[provider].includes(value as ModelId);
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORTS.includes(value as ReasoningEffort);
}
