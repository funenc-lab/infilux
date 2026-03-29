import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AgentSubagentTranscriptEntry,
  GetAgentSubagentTranscriptRequest,
  GetAgentSubagentTranscriptResult,
} from '@shared/types';

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

interface CodexSessionMeta {
  threadId: string;
  cwd?: string;
  parentThreadId?: string;
  agentNickname?: string;
  agentType?: string;
}

interface ParsedTranscriptEnvelope {
  meta: CodexSessionMeta;
  entries: AgentSubagentTranscriptEntry[];
}

interface TranscriptMessageContentPart {
  type?: string;
  text?: string;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatAgentType(agentType?: string): string {
  if (!agentType) {
    return 'Subagent';
  }

  return agentType
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildTranscriptLabel(meta: CodexSessionMeta): string {
  const roleLabel = formatAgentType(meta.agentType);
  return meta.agentNickname ? `${meta.agentNickname} · ${roleLabel}` : roleLabel;
}

function extractMessageText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .flatMap((part) => {
      if (!part || typeof part !== 'object') {
        return [];
      }

      const typedPart = part as TranscriptMessageContentPart;
      if (
        (typedPart.type === 'input_text' || typedPart.type === 'output_text') &&
        typeof typedPart.text === 'string'
      ) {
        return [typedPart.text.trim()];
      }

      return [];
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function summarizeToolArguments(argumentsText: unknown): string {
  if (typeof argumentsText !== 'string' || argumentsText.trim().length === 0) {
    return '';
  }

  const parsed = safeJsonParse(argumentsText);
  if (!parsed) {
    return argumentsText.trim().slice(0, 200);
  }

  const fields = ['cmd', 'message', 'q', 'path', 'workdir', 'question'];
  const values = fields
    .map((field) => parsed[field])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return values.join(' · ').slice(0, 200);
}

export function parseCodexSubagentTranscriptLines(lines: string[]): ParsedTranscriptEnvelope {
  let started = false;
  let entryIndex = 0;

  const meta: CodexSessionMeta = {
    threadId: '',
  };
  const entries: AgentSubagentTranscriptEntry[] = [];

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      continue;
    }

    const parsed = safeJsonParse(rawLine);
    if (!parsed) {
      continue;
    }

    if (parsed.type === 'session_meta' && parsed.payload && typeof parsed.payload === 'object') {
      const payload = parsed.payload as Record<string, unknown>;
      const source = payload.source as Record<string, unknown> | undefined;
      const subagent = source?.subagent as Record<string, unknown> | undefined;
      const threadSpawn = subagent?.thread_spawn as Record<string, unknown> | undefined;

      meta.threadId = typeof payload.id === 'string' ? payload.id : meta.threadId;
      meta.cwd = typeof payload.cwd === 'string' ? payload.cwd : meta.cwd;
      meta.parentThreadId =
        typeof threadSpawn?.parent_thread_id === 'string'
          ? threadSpawn.parent_thread_id
          : meta.parentThreadId;
      meta.agentNickname =
        typeof payload.agent_nickname === 'string' ? payload.agent_nickname : meta.agentNickname;
      meta.agentType =
        typeof payload.agent_role === 'string'
          ? payload.agent_role
          : typeof threadSpawn?.agent_role === 'string'
            ? threadSpawn.agent_role
            : meta.agentType;
      continue;
    }

    if (parsed.type === 'event_msg' && parsed.payload && typeof parsed.payload === 'object') {
      const payload = parsed.payload as Record<string, unknown>;
      if (payload.type === 'task_started') {
        started = true;
      }
      continue;
    }

    if (!started) {
      continue;
    }

    if (parsed.type !== 'response_item' || !parsed.payload || typeof parsed.payload !== 'object') {
      continue;
    }

    const payload = parsed.payload as Record<string, unknown>;
    const timestamp = parseTimestamp(parsed.timestamp);

    if (payload.type === 'message') {
      const role = payload.role;
      if (role !== 'assistant' && role !== 'developer' && role !== 'user') {
        continue;
      }

      const text = extractMessageText(payload.content);
      if (!text) {
        continue;
      }

      entries.push({
        id: `entry-${entryIndex++}`,
        timestamp,
        kind: 'message',
        role,
        text,
        phase: typeof payload.phase === 'string' ? payload.phase : undefined,
      });
      continue;
    }

    if (payload.type === 'function_call') {
      const toolName = typeof payload.name === 'string' ? payload.name : 'tool';
      const summary = summarizeToolArguments(payload.arguments);
      const text = summary ? `${toolName}: ${summary}` : toolName;

      entries.push({
        id: `entry-${entryIndex++}`,
        timestamp,
        kind: 'tool_call',
        role: 'assistant',
        text,
        toolName,
      });
    }
  }

  return { meta, entries };
}

async function findCodexSessionFileByThreadId(
  rootDir: string,
  threadId: string
): Promise<string | null> {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true, encoding: 'utf8' });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);

      if (entry.isDirectory()) {
        const nested = await findCodexSessionFileByThreadId(fullPath, threadId);
        if (nested) {
          return nested;
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(threadId)) {
        return fullPath;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export class CodexSubagentTranscriptService {
  constructor(private readonly sessionsDir = CODEX_SESSIONS_DIR) {}

  async getTranscript(
    request: GetAgentSubagentTranscriptRequest
  ): Promise<GetAgentSubagentTranscriptResult> {
    const sessionFile = await findCodexSessionFileByThreadId(this.sessionsDir, request.threadId);
    if (!sessionFile) {
      throw new Error(`Codex subagent transcript not found for thread ${request.threadId}`);
    }

    const rawContent = await readFile(sessionFile, 'utf8');
    const parsed = parseCodexSubagentTranscriptLines(rawContent.split('\n'));

    return {
      provider: 'codex',
      threadId: parsed.meta.threadId || request.threadId,
      parentThreadId: parsed.meta.parentThreadId,
      cwd: parsed.meta.cwd,
      label: buildTranscriptLabel(parsed.meta),
      agentType: parsed.meta.agentType,
      agentNickname: parsed.meta.agentNickname,
      entries: parsed.entries,
      generatedAt: Date.now(),
    };
  }
}

export const codexSubagentTranscriptService = new CodexSubagentTranscriptService();
