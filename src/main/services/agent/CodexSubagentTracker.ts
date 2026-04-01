import { createReadStream, type Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ListLiveAgentSubagentsRequest,
  ListLiveAgentSubagentsResult,
  LiveAgentSubagent,
  LiveAgentSubagentStatus,
} from '@shared/types';

const CODEX_TUI_LOG_PATH = path.join(os.homedir(), '.codex', 'log', 'codex-tui.log');
const DEFAULT_MAX_IDLE_MS = 45_000;
const MAX_LOG_READ_WINDOW_BYTES = 8 * 1024 * 1024;

interface CodexThreadContext {
  threadId: string;
  rootThreadId: string;
  cwd?: string;
  lastSeenAt: number;
}

interface PendingSpawnDescriptor {
  agentType?: string;
  summary?: string;
}

interface CodexTrackedSubagent {
  id: string;
  threadId: string;
  parentThreadId: string;
  cwd?: string;
  label: string;
  agentType?: string;
  summary?: string;
  lastSeenAt: number;
  lastToolName?: string;
}

export interface CodexSubagentTrackerState {
  offset: number;
  remainder: string;
  threadContexts: Map<string, CodexThreadContext>;
  pendingSpawnsByRoot: Map<string, PendingSpawnDescriptor[]>;
  childSequencesByRoot: Map<string, number>;
  subagentsByThread: Map<string, CodexTrackedSubagent>;
}

interface ParsedCodexLogLine {
  timestampMs: number;
  rootThreadId: string;
  currentThreadId: string;
  parentThreadId: string;
  toolName?: string;
  payload?: Record<string, unknown>;
}

function safeJsonParse(value: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function summarizeSpawnMessage(message: unknown): string | undefined {
  if (typeof message !== 'string') {
    return undefined;
  }

  const summary = message
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return summary?.slice(0, 140);
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

function nextChildSequence(state: CodexSubagentTrackerState, rootThreadId: string): number {
  const next = (state.childSequencesByRoot.get(rootThreadId) ?? 0) + 1;
  state.childSequencesByRoot.set(rootThreadId, next);
  return next;
}

function parseCodexLogLine(line: string): ParsedCodexLogLine | null {
  const timestampMatch = line.match(/^(\S+)/);
  const sessionLoopMatches = [...line.matchAll(/session_loop\{thread_id=([^}]+)\}/g)];

  if (!timestampMatch || sessionLoopMatches.length === 0) {
    return null;
  }

  const timestampMs = Date.parse(timestampMatch[1]);
  const threadIds = sessionLoopMatches.map((match) => match[1]);
  const rootThreadId = threadIds[0];
  const currentThreadId = threadIds[threadIds.length - 1];
  const parentThreadId = threadIds.length > 1 ? threadIds[threadIds.length - 2] : rootThreadId;
  const toolCallMarker = 'ToolCall: ';
  const toolCallIndex = line.indexOf(toolCallMarker);

  if (toolCallIndex < 0) {
    return {
      timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
      rootThreadId,
      currentThreadId,
      parentThreadId,
    };
  }

  const toolSegment = line.slice(toolCallIndex + toolCallMarker.length);
  const spaceIndex = toolSegment.indexOf(' ');

  if (spaceIndex < 0) {
    return {
      timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
      rootThreadId,
      currentThreadId,
      parentThreadId,
    };
  }

  const toolName = toolSegment.slice(0, spaceIndex);
  const trailingThreadIndex = toolSegment.lastIndexOf(' thread_id=');
  const payloadText =
    trailingThreadIndex >= 0
      ? toolSegment.slice(spaceIndex + 1, trailingThreadIndex)
      : toolSegment.slice(spaceIndex + 1);

  return {
    timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
    rootThreadId,
    currentThreadId,
    parentThreadId,
    toolName,
    payload: safeJsonParse(payloadText),
  };
}

function ensureThreadContext(
  state: CodexSubagentTrackerState,
  threadId: string,
  rootThreadId: string,
  timestampMs: number
): CodexThreadContext {
  const existing = state.threadContexts.get(threadId);

  if (existing) {
    existing.lastSeenAt = Math.max(existing.lastSeenAt, timestampMs);
    return existing;
  }

  const created: CodexThreadContext = {
    threadId,
    rootThreadId,
    lastSeenAt: timestampMs,
  };
  state.threadContexts.set(threadId, created);
  return created;
}

function attachPendingSpawn(
  state: CodexSubagentTrackerState,
  rootThreadId: string
): PendingSpawnDescriptor | undefined {
  const queue = state.pendingSpawnsByRoot.get(rootThreadId);
  if (!queue || queue.length === 0) {
    return undefined;
  }

  const next = queue.shift();
  if (queue.length === 0) {
    state.pendingSpawnsByRoot.delete(rootThreadId);
  }

  return next;
}

function ensureSubagent(
  state: CodexSubagentTrackerState,
  parentThreadId: string,
  rootThreadId: string,
  childThreadId: string,
  timestampMs: number
): CodexTrackedSubagent {
  const existing = state.subagentsByThread.get(childThreadId);
  if (existing) {
    existing.lastSeenAt = Math.max(existing.lastSeenAt, timestampMs);
    return existing;
  }

  const pendingSpawn = attachPendingSpawn(state, rootThreadId);
  const sequence = nextChildSequence(state, rootThreadId);
  const labelPrefix = formatAgentType(pendingSpawn?.agentType);
  const created: CodexTrackedSubagent = {
    id: childThreadId,
    threadId: childThreadId,
    parentThreadId,
    label: `${labelPrefix} ${sequence}`,
    agentType: pendingSpawn?.agentType,
    summary: pendingSpawn?.summary,
    lastSeenAt: timestampMs,
  };

  state.subagentsByThread.set(childThreadId, created);
  return created;
}

function inferSubagentStatus(
  item: CodexTrackedSubagent,
  now: number,
  maxIdleMs: number
): LiveAgentSubagentStatus {
  if (item.lastToolName === 'wait' || item.lastToolName === 'wait_agent') {
    return 'waiting';
  }

  if (now - item.lastSeenAt > maxIdleMs * 0.5) {
    return 'stale';
  }

  return 'running';
}

export function createEmptyCodexSubagentTrackerState(): CodexSubagentTrackerState {
  return {
    offset: 0,
    remainder: '',
    threadContexts: new Map(),
    pendingSpawnsByRoot: new Map(),
    childSequencesByRoot: new Map(),
    subagentsByThread: new Map(),
  };
}

function resetTrackerStateContents(state: CodexSubagentTrackerState): void {
  state.remainder = '';
  state.threadContexts.clear();
  state.pendingSpawnsByRoot.clear();
  state.childSequencesByRoot.clear();
  state.subagentsByThread.clear();
}

export function resolveCodexLogReadWindow(
  offset: number,
  size: number,
  maxWindowBytes = MAX_LOG_READ_WINDOW_BYTES
): { start: number; resetState: boolean } {
  if (size <= offset) {
    return { start: size, resetState: false };
  }

  const windowStart = Math.max(0, size - maxWindowBytes);
  if (offset < windowStart) {
    return { start: windowStart, resetState: true };
  }

  return { start: offset, resetState: false };
}

export function applyCodexLogLine(
  state: CodexSubagentTrackerState,
  line: string
): CodexSubagentTrackerState {
  const parsed = parseCodexLogLine(line);
  if (!parsed) {
    return state;
  }

  const rootContext = ensureThreadContext(
    state,
    parsed.rootThreadId,
    parsed.rootThreadId,
    parsed.timestampMs
  );
  const currentContext = ensureThreadContext(
    state,
    parsed.currentThreadId,
    parsed.rootThreadId,
    parsed.timestampMs
  );

  const candidateCwd =
    typeof parsed.payload?.workdir === 'string'
      ? parsed.payload.workdir
      : typeof parsed.payload?.cwd === 'string'
        ? parsed.payload.cwd
        : undefined;

  if (candidateCwd) {
    currentContext.cwd = candidateCwd;
    if (!rootContext.cwd) {
      rootContext.cwd = candidateCwd;
    }
  }

  if (parsed.toolName === 'spawn_agent') {
    const queue = state.pendingSpawnsByRoot.get(parsed.rootThreadId) ?? [];
    queue.push({
      agentType:
        typeof parsed.payload?.agent_type === 'string' ? parsed.payload.agent_type : undefined,
      summary: summarizeSpawnMessage(parsed.payload?.message),
    });
    state.pendingSpawnsByRoot.set(parsed.rootThreadId, queue);
  }

  if (parsed.currentThreadId !== parsed.rootThreadId) {
    const subagent = ensureSubagent(
      state,
      parsed.parentThreadId,
      parsed.rootThreadId,
      parsed.currentThreadId,
      parsed.timestampMs
    );
    subagent.lastSeenAt = Math.max(subagent.lastSeenAt, parsed.timestampMs);
    subagent.cwd = candidateCwd ?? currentContext.cwd ?? rootContext.cwd ?? subagent.cwd;
    if (parsed.toolName) {
      subagent.lastToolName = parsed.toolName;
    }
  }

  return state;
}

export function buildLiveCodexSubagents(
  state: CodexSubagentTrackerState,
  request: ListLiveAgentSubagentsRequest & { now?: number }
): LiveAgentSubagent[] {
  const now = request.now ?? Date.now();
  const maxIdleMs = request.maxIdleMs ?? DEFAULT_MAX_IDLE_MS;
  const cwdFilter = request.cwds ? new Set(request.cwds) : null;

  return [...state.subagentsByThread.values()]
    .filter((item) => now - item.lastSeenAt <= maxIdleMs)
    .map((item) => ({
      id: item.id,
      provider: 'codex' as const,
      threadId: item.threadId,
      parentThreadId: item.parentThreadId,
      cwd:
        item.cwd ??
        state.threadContexts.get(item.parentThreadId)?.cwd ??
        state.threadContexts.get(item.threadId)?.cwd ??
        '',
      label: item.label,
      agentType: item.agentType,
      summary: item.summary,
      lastSeenAt: item.lastSeenAt,
      status: inferSubagentStatus(item, now, maxIdleMs),
    }))
    .filter((item) => item.cwd && (!cwdFilter || cwdFilter.has(item.cwd)))
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

async function readAppendedLogChunk(
  filePath: string,
  offset: number,
  size: number
): Promise<string> {
  if (size <= offset) {
    return '';
  }

  return await new Promise<string>((resolve, reject) => {
    let buffer = '';
    const stream = createReadStream(filePath, {
      encoding: 'utf8',
      start: offset,
      end: size - 1,
    });

    stream.on('data', (chunk) => {
      buffer += chunk;
    });
    stream.on('end', () => resolve(buffer));
    stream.on('error', reject);
  });
}

export class CodexSubagentTracker {
  private readonly state = createEmptyCodexSubagentTrackerState();
  private readonly logPath: string;

  constructor(logPath = CODEX_TUI_LOG_PATH) {
    this.logPath = logPath;
  }

  async listLive(
    request: ListLiveAgentSubagentsRequest = {}
  ): Promise<ListLiveAgentSubagentsResult> {
    await this.refresh();

    return {
      items: buildLiveCodexSubagents(this.state, request),
      generatedAt: Date.now(),
    };
  }

  private async refresh(): Promise<void> {
    let fileStat: Stats;

    try {
      fileStat = await stat(this.logPath);
    } catch {
      this.state.offset = 0;
      this.state.remainder = '';
      return;
    }

    if (fileStat.size < this.state.offset) {
      this.state.offset = 0;
      resetTrackerStateContents(this.state);
    }

    const readWindow = resolveCodexLogReadWindow(this.state.offset, fileStat.size);
    if (readWindow.resetState) {
      resetTrackerStateContents(this.state);
    }

    const chunk = await readAppendedLogChunk(this.logPath, readWindow.start, fileStat.size);
    this.state.offset = fileStat.size;

    if (!chunk) {
      return;
    }

    const combined = this.state.remainder + chunk;
    const lines = combined.split('\n');
    this.state.remainder = lines.pop() ?? '';

    for (const line of lines) {
      applyCodexLogLine(this.state, line);
    }
  }
}

export const codexSubagentTracker = new CodexSubagentTracker();
