import type {
  AgentSubagentTranscriptEntry,
  GetAgentSubagentTranscriptRequest,
  GetAgentSubagentTranscriptResult,
} from '@shared/types';
import {
  CODEX_SESSIONS_DIR,
  findCodexSessionFileByThreadId,
  formatCodexAgentType,
} from './codexSessionMetadata';
import { closeFileLineReader, createFileLineReader } from './fileLineReader';

const DEFAULT_MAX_TRANSCRIPT_ENTRIES = 200;

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
  truncated: boolean;
  omittedEntryCount: number;
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
  return formatCodexAgentType(agentType);
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

interface ParseCodexSubagentTranscriptOptions {
  maxEntries?: number;
}

interface TranscriptCollector {
  meta: CodexSessionMeta;
  entries: AgentSubagentTranscriptEntry[];
  started: boolean;
  capturing: boolean;
  entryIndex: number;
  omittedEntryCount: number;
  maxEntries: number;
}

function createTranscriptCollector(
  options: ParseCodexSubagentTranscriptOptions = {}
): TranscriptCollector {
  return {
    meta: {
      threadId: '',
    },
    entries: [],
    started: false,
    capturing: false,
    entryIndex: 0,
    omittedEntryCount: 0,
    maxEntries: Math.max(1, options.maxEntries ?? DEFAULT_MAX_TRANSCRIPT_ENTRIES),
  };
}

function pushTranscriptEntry(
  collector: TranscriptCollector,
  entry: Omit<AgentSubagentTranscriptEntry, 'id'>
): void {
  collector.entries.push({
    ...entry,
    id: `entry-${collector.entryIndex++}`,
  });

  if (collector.entries.length > collector.maxEntries) {
    collector.entries.shift();
    collector.omittedEntryCount += 1;
  }
}

function isBootstrapTranscriptText(text: string): boolean {
  return (
    text.includes('# AGENTS.md instructions') ||
    text.includes('<INSTRUCTIONS>') ||
    text.includes('<environment_context>')
  );
}

function consumeTranscriptLine(collector: TranscriptCollector, rawLine: string): void {
  const trimmedLine = rawLine.trim();
  if (!trimmedLine) {
    return;
  }

  const parsed = safeJsonParse(trimmedLine);
  if (!parsed) {
    return;
  }

  if (parsed.type === 'session_meta' && parsed.payload && typeof parsed.payload === 'object') {
    const payload = parsed.payload as Record<string, unknown>;
    const source = payload.source as Record<string, unknown> | undefined;
    const subagent = source?.subagent as Record<string, unknown> | undefined;
    const threadSpawn = subagent?.thread_spawn as Record<string, unknown> | undefined;

    collector.meta.threadId = typeof payload.id === 'string' ? payload.id : collector.meta.threadId;
    collector.meta.cwd = typeof payload.cwd === 'string' ? payload.cwd : collector.meta.cwd;
    collector.meta.parentThreadId =
      typeof threadSpawn?.parent_thread_id === 'string'
        ? threadSpawn.parent_thread_id
        : collector.meta.parentThreadId;
    collector.meta.agentNickname =
      typeof payload.agent_nickname === 'string'
        ? payload.agent_nickname
        : collector.meta.agentNickname;
    collector.meta.agentType =
      typeof payload.agent_role === 'string'
        ? payload.agent_role
        : typeof threadSpawn?.agent_role === 'string'
          ? threadSpawn.agent_role
          : collector.meta.agentType;
    return;
  }

  if (parsed.type === 'event_msg' && parsed.payload && typeof parsed.payload === 'object') {
    const payload = parsed.payload as Record<string, unknown>;
    if (payload.type === 'task_started') {
      collector.started = true;
    }
    return;
  }

  if (!collector.started) {
    return;
  }

  if (parsed.type !== 'response_item' || !parsed.payload || typeof parsed.payload !== 'object') {
    return;
  }

  const payload = parsed.payload as Record<string, unknown>;
  const timestamp = parseTimestamp(parsed.timestamp);

  if (payload.type === 'message') {
    const role = payload.role;
    if (role !== 'assistant' && role !== 'developer' && role !== 'user') {
      return;
    }

    const text = extractMessageText(payload.content);
    if (!text) {
      return;
    }

    if (!collector.capturing) {
      if (role !== 'user' || isBootstrapTranscriptText(text)) {
        return;
      }

      collector.capturing = true;
    }

    pushTranscriptEntry(collector, {
      timestamp,
      kind: 'message',
      role,
      text,
      phase: typeof payload.phase === 'string' ? payload.phase : undefined,
    });
    return;
  }

  if (payload.type === 'function_call') {
    if (!collector.capturing) {
      return;
    }

    const toolName = typeof payload.name === 'string' ? payload.name : 'tool';
    const summary = summarizeToolArguments(payload.arguments);
    const text = summary ? `${toolName}: ${summary}` : toolName;

    pushTranscriptEntry(collector, {
      timestamp,
      kind: 'tool_call',
      role: 'assistant',
      text,
      toolName,
    });
  }
}

function finalizeCollector(collector: TranscriptCollector): ParsedTranscriptEnvelope {
  return {
    meta: collector.meta,
    entries: collector.entries,
    truncated: collector.omittedEntryCount > 0,
    omittedEntryCount: collector.omittedEntryCount,
  };
}

export function parseCodexSubagentTranscriptLines(
  lines: string[],
  options: ParseCodexSubagentTranscriptOptions = {}
): ParsedTranscriptEnvelope {
  const collector = createTranscriptCollector(options);

  for (const rawLine of lines) {
    consumeTranscriptLine(collector, rawLine);
  }

  return finalizeCollector(collector);
}

async function parseCodexSubagentTranscriptFile(
  filePath: string,
  options: ParseCodexSubagentTranscriptOptions = {}
): Promise<ParsedTranscriptEnvelope> {
  const collector = createTranscriptCollector(options);
  const reader = createFileLineReader(filePath);

  try {
    for await (const rawLine of reader.lineReader) {
      consumeTranscriptLine(collector, rawLine);
    }
  } finally {
    await closeFileLineReader(reader);
  }

  return finalizeCollector(collector);
}

export class CodexSubagentTranscriptService {
  constructor(
    private readonly sessionsDir = CODEX_SESSIONS_DIR,
    private readonly maxTranscriptEntries = DEFAULT_MAX_TRANSCRIPT_ENTRIES
  ) {}

  async getTranscript(
    request: GetAgentSubagentTranscriptRequest
  ): Promise<GetAgentSubagentTranscriptResult> {
    const sessionFile = await findCodexSessionFileByThreadId(this.sessionsDir, request.threadId);
    if (!sessionFile) {
      throw new Error(`Codex subagent transcript not found for thread ${request.threadId}`);
    }

    const parsed = await parseCodexSubagentTranscriptFile(sessionFile, {
      maxEntries: this.maxTranscriptEntries,
    });

    return {
      provider: 'codex',
      threadId: parsed.meta.threadId || request.threadId,
      parentThreadId: parsed.meta.parentThreadId,
      cwd: parsed.meta.cwd,
      label: buildTranscriptLabel(parsed.meta),
      agentType: parsed.meta.agentType,
      agentNickname: parsed.meta.agentNickname,
      entries: parsed.entries,
      truncated: parsed.truncated,
      omittedEntryCount: parsed.omittedEntryCount,
      generatedAt: Date.now(),
    };
  }
}

export const codexSubagentTranscriptService = new CodexSubagentTranscriptService();
