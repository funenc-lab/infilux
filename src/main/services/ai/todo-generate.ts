import type {
  TodoGenerateAgentOption,
  TodoGeneratedTaskDraft,
  TodoGeneratedTaskPriority,
  TodoGenerateTasksRequest,
  TodoGenerateTasksResult,
} from '@shared/types';
import { parseCLIOutput, spawnCLI } from './providers';

export type TodoGenerateTasksOptions = TodoGenerateTasksRequest;
export type { TodoGenerateTasksResult };

const PRIORITIES: readonly TodoGeneratedTaskPriority[] = ['low', 'medium', 'high'];
const DEFAULT_MAX_TASKS = 6;
const MAX_GENERATED_TASKS = 12;

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```\w*\s*[\r\n]+([\s\S]*?)[\r\n]+\s*```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed
    .replace(/^```\w*\s*[\r\n]*/, '')
    .replace(/[\r\n]*\s*```\s*$/, '')
    .trim();
}

function parseJsonObject(raw: string): unknown {
  const cleaned = stripCodeFence(raw);

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizePriority(value: unknown): TodoGeneratedTaskPriority {
  return typeof value === 'string' && PRIORITIES.includes(value as TodoGeneratedTaskPriority)
    ? (value as TodoGeneratedTaskPriority)
    : 'medium';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMaxTasks(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_TASKS;
  }

  return Math.max(1, Math.min(MAX_GENERATED_TASKS, Math.floor(value)));
}

function buildAgentList(agents: readonly TodoGenerateAgentOption[] | undefined): string {
  if (!agents?.length) {
    return '- No enabled agents. Leave agentId empty.';
  }

  return agents
    .map((agent) => {
      const defaultLabel = agent.isDefault ? ' default' : '';
      return `- ${agent.agentId}: ${agent.name} (${agent.command}${defaultLabel})`;
    })
    .join('\n');
}

export function buildTodoGeneratePrompt(options: TodoGenerateTasksOptions): string {
  const maxTasks = normalizeMaxTasks(options.maxTasks);
  const promptTemplate =
    options.prompt ||
    `You are an AI task planning assistant inside a multi-agent development app.

Split the user's request into concrete todo tasks for AI coding agents. Each task must be independently actionable, scoped, and verifiable.

Output a JSON object with exactly one field named "tasks". "tasks" must be an array of 1 to {maxTasks} objects.
Each task object must contain:
- "title": concise action title, max 72 characters.
- "description": implementation-ready details with acceptance criteria and validation expectations.
- "priority": one of "low", "medium", or "high".
- "agentId": optional id from the available agents list when one agent is clearly best.
- "rationale": short reason for the suggested agent or task split.

Do not invent files that are not present in the provided context. Do not include markdown, comments, or explanation outside the JSON object.

Repository: {repoPath}
Worktree: {worktreePath}
Related files:
{files}
Related directories:
{directories}

Available agents:
{agents}

User request:
{text}`;

  const files =
    options.context?.files?.length && options.context.files.length > 0
      ? options.context.files.map((file) => `- ${file.path}`).join('\n')
      : '- None';
  const directories =
    options.context?.directories?.length && options.context.directories.length > 0
      ? options.context.directories.map((directory) => `- ${directory.path}`).join('\n')
      : '- None';

  return promptTemplate
    .replace(/\{text\}/g, () => options.text)
    .replace(/\{maxTasks\}/g, () => String(maxTasks))
    .replace(/\{repoPath\}/g, () => options.context?.repoPath ?? options.repoPath ?? 'Unknown')
    .replace(
      /\{worktreePath\}/g,
      () => options.context?.worktreePath ?? options.worktreePath ?? 'Unknown'
    )
    .replace(/\{files\}/g, () => files)
    .replace(/\{directories\}/g, () => directories)
    .replace(/\{agents\}/g, () => buildAgentList(options.agents));
}

export function parseTodoGenerateOutput(
  raw: string,
  agents: readonly TodoGenerateAgentOption[] | undefined,
  maxTasks?: number
): TodoGeneratedTaskDraft[] | null {
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const tasks = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) {
    return null;
  }

  const allowedAgentIds = new Set((agents ?? []).map((agent) => agent.agentId));
  const result: TodoGeneratedTaskDraft[] = [];
  const limit = normalizeMaxTasks(maxTasks);

  for (const item of tasks) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const title = normalizeOptionalString(record.title);
    const description = normalizeOptionalString(record.description);
    if (!title || !description) {
      continue;
    }

    const agentId = normalizeOptionalString(record.agentId);
    const rationale = normalizeOptionalString(record.rationale);
    result.push({
      title,
      description,
      priority: normalizePriority(record.priority),
      ...(agentId && allowedAgentIds.has(agentId) ? { agentId } : {}),
      ...(rationale ? { rationale } : {}),
    });

    if (result.length >= limit) {
      break;
    }
  }

  return result.length > 0 ? result : null;
}

export async function generateTodoTasks(
  options: TodoGenerateTasksOptions
): Promise<TodoGenerateTasksResult> {
  const prompt = buildTodoGeneratePrompt(options);

  return new Promise((resolve) => {
    const timeoutMs = options.timeout * 1000;
    const { proc, kill } = spawnCLI({
      provider: options.provider,
      model: options.model,
      prompt,
      cwd: options.worktreePath || options.repoPath || process.cwd(),
      reasoningEffort: options.reasoningEffort,
      outputFormat: 'json',
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      kill();
      resolve({ success: false, error: 'timeout' });
    }, timeoutMs);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
        return;
      }

      const result = parseCLIOutput(options.provider, stdout);
      if (!result.success || !result.text) {
        resolve({ success: false, error: result.error || 'Unknown error' });
        return;
      }

      const parsed = parseTodoGenerateOutput(result.text, options.agents, options.maxTasks);
      if (!parsed) {
        resolve({ success: false, error: 'Failed to parse AI output as task JSON' });
        return;
      }

      resolve({ success: true, tasks: parsed });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ success: false, error: err.message });
    });
  });
}
