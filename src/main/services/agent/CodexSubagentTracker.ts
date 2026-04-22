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
import { normalizeWorkspaceKey } from '@shared/utils/workspace';
import {
  CODEX_SESSIONS_DIR,
  findCodexSessionFileByThreadId,
  formatCodexAgentType,
  readCodexSessionMeta,
  readCodexSessionMetaRecords,
} from './codexSessionMetadata';

const CODEX_TUI_LOG_PATH = path.join(os.homedir(), '.codex', 'log', 'codex-tui.log');
const DEFAULT_MAX_IDLE_MS = 45_000;
const MAX_LOG_READ_WINDOW_BYTES = 8 * 1024 * 1024;
const MAX_TRACKED_STATE_RETENTION_MS = 15 * 60 * 1_000;

function normalizeSubagentCwdKey(cwd: string): string {
  return normalizeWorkspaceKey(cwd, process.platform === 'darwin' ? 'darwin' : 'linux');
}

interface CodexThreadContext {
  threadId: string;
  rootThreadId: string;
  cwd?: string;
  lastSeenAt: number;
  lastToolName?: string;
}

interface PendingSpawnDescriptor {
  agentType?: string;
  summary?: string;
  timestampMs: number;
}

interface CodexTrackedSubagent {
  id: string;
  threadId: string;
  rootThreadId: string;
  parentThreadId: string;
  cwd?: string;
  label: string;
  agentType?: string;
  summary?: string;
  lastSeenAt: number;
  lastToolName?: string;
}

interface CodexSessionSubagentMeta {
  threadId: string;
  parentThreadId: string;
  cwd?: string;
  agentType?: string;
  agentNickname?: string;
  timestampMs: number;
}

interface CodexSessionSubagentMetaRecord {
  filePath: string;
  fileMtimeMs: number;
  meta: CodexSessionSubagentMeta;
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
  return formatCodexAgentType(agentType);
}

function buildSubagentLabel(
  agentType: string | undefined,
  sequence: number,
  agentNickname?: string
): string {
  const nickname = agentNickname?.trim();
  if (nickname) {
    return nickname;
  }

  return `${formatAgentType(agentType)} ${sequence}`;
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
    if (existing.rootThreadId === existing.threadId && rootThreadId !== existing.threadId) {
      existing.rootThreadId = rootThreadId;
    }
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

function resolveCanonicalRootThreadId(state: CodexSubagentTrackerState, threadId: string): string {
  return (
    state.subagentsByThread.get(threadId)?.rootThreadId ??
    state.threadContexts.get(threadId)?.rootThreadId ??
    threadId
  );
}

function toCodexSessionSubagentMeta(meta: {
  threadId: string;
  parentThreadId?: string;
  cwd?: string;
  agentType?: string;
  agentNickname?: string;
  timestampMs: number;
}): CodexSessionSubagentMeta | null {
  if (!meta.parentThreadId) {
    return null;
  }

  return {
    threadId: meta.threadId,
    parentThreadId: meta.parentThreadId,
    cwd: meta.cwd,
    agentType: meta.agentType,
    agentNickname: meta.agentNickname,
    timestampMs: meta.timestampMs,
  };
}

export function applyCodexSessionSubagentMeta(
  state: CodexSubagentTrackerState,
  meta: CodexSessionSubagentMeta
): CodexSubagentTrackerState {
  const rootThreadId = resolveCanonicalRootThreadId(state, meta.parentThreadId);
  const parentContext = ensureThreadContext(
    state,
    meta.parentThreadId,
    rootThreadId,
    meta.timestampMs
  );
  const childContext = ensureThreadContext(state, meta.threadId, rootThreadId, meta.timestampMs);
  childContext.rootThreadId = rootThreadId;
  if (meta.cwd) {
    childContext.cwd = meta.cwd;
  }

  const lastSeenAt = Math.max(meta.timestampMs, childContext.lastSeenAt, parentContext.lastSeenAt);
  const agentType = meta.agentType;
  const existing = state.subagentsByThread.get(meta.threadId);

  if (existing) {
    existing.rootThreadId = rootThreadId;
    existing.parentThreadId = meta.parentThreadId;
    existing.cwd = meta.cwd ?? childContext.cwd ?? existing.cwd;
    existing.agentType = agentType ?? existing.agentType;
    existing.lastSeenAt = Math.max(existing.lastSeenAt, lastSeenAt);
    existing.lastToolName = childContext.lastToolName ?? existing.lastToolName;
    if (meta.agentNickname?.trim()) {
      existing.label = meta.agentNickname.trim();
    }
    return state;
  }

  const pendingSpawn = attachPendingSpawn(state, rootThreadId);
  const resolvedAgentType = agentType ?? pendingSpawn?.agentType;
  const sequence = nextChildSequence(state, rootThreadId);
  state.subagentsByThread.set(meta.threadId, {
    id: meta.threadId,
    threadId: meta.threadId,
    rootThreadId,
    parentThreadId: meta.parentThreadId,
    cwd: meta.cwd ?? childContext.cwd,
    label: buildSubagentLabel(resolvedAgentType, sequence, meta.agentNickname),
    agentType: resolvedAgentType,
    summary: pendingSpawn?.summary,
    lastSeenAt,
    lastToolName: childContext.lastToolName,
  });

  return state;
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
    rootThreadId,
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

function resolveTrackedStateRetentionMs(maxIdleMs: number): number {
  return Math.max(1, Math.min(maxIdleMs, MAX_TRACKED_STATE_RETENTION_MS));
}

export function pruneCodexSubagentTrackerState(
  state: CodexSubagentTrackerState,
  now: number,
  retentionMs: number
): void {
  const cutoff = now - Math.max(1, retentionMs);

  for (const [rootThreadId, queue] of state.pendingSpawnsByRoot.entries()) {
    const retained = queue.filter((item) => item.timestampMs >= cutoff);
    if (retained.length === 0) {
      state.pendingSpawnsByRoot.delete(rootThreadId);
      continue;
    }
    state.pendingSpawnsByRoot.set(rootThreadId, retained);
  }

  const referencedThreadIds = new Set<string>();
  const retainedRootThreadIds = new Set<string>(state.pendingSpawnsByRoot.keys());

  for (const [threadId, subagent] of state.subagentsByThread.entries()) {
    if (subagent.lastSeenAt < cutoff) {
      state.subagentsByThread.delete(threadId);
      continue;
    }

    referencedThreadIds.add(subagent.threadId);
    referencedThreadIds.add(subagent.parentThreadId);
    referencedThreadIds.add(subagent.rootThreadId);
    retainedRootThreadIds.add(subagent.rootThreadId);
  }

  for (const [threadId, context] of state.threadContexts.entries()) {
    if (context.lastSeenAt >= cutoff) {
      retainedRootThreadIds.add(context.rootThreadId);
      continue;
    }

    if (referencedThreadIds.has(threadId) || retainedRootThreadIds.has(context.rootThreadId)) {
      continue;
    }

    state.threadContexts.delete(threadId);
  }

  for (const rootThreadId of state.childSequencesByRoot.keys()) {
    if (!retainedRootThreadIds.has(rootThreadId)) {
      state.childSequencesByRoot.delete(rootThreadId);
    }
  }
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

  if (parsed.toolName) {
    currentContext.lastToolName = parsed.toolName;
  }

  if (parsed.toolName === 'spawn_agent') {
    const queue = state.pendingSpawnsByRoot.get(parsed.rootThreadId) ?? [];
    queue.push({
      agentType:
        typeof parsed.payload?.agent_type === 'string' ? parsed.payload.agent_type : undefined,
      summary: summarizeSpawnMessage(parsed.payload?.message),
      timestampMs: parsed.timestampMs,
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
  const cwdFilter = request.cwds
    ? new Set(request.cwds.filter(Boolean).map((cwd) => normalizeSubagentCwdKey(cwd)))
    : null;

  return [...state.subagentsByThread.values()]
    .filter((item) => now - item.lastSeenAt <= maxIdleMs)
    .map((item) => ({
      id: item.id,
      provider: 'codex' as const,
      threadId: item.threadId,
      rootThreadId: item.rootThreadId,
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
    .filter((item) => item.cwd && (!cwdFilter || cwdFilter.has(normalizeSubagentCwdKey(item.cwd))))
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
  private readonly sessionsDir: string;
  private readonly sessionFileByThreadId = new Map<string, string>();

  constructor(logPath = CODEX_TUI_LOG_PATH, sessionsDir = CODEX_SESSIONS_DIR) {
    this.logPath = logPath;
    this.sessionsDir = sessionsDir;
  }

  async listLive(
    request: ListLiveAgentSubagentsRequest = {}
  ): Promise<ListLiveAgentSubagentsResult> {
    await this.refresh();
    pruneCodexSubagentTrackerState(
      this.state,
      Date.now(),
      resolveTrackedStateRetentionMs(request.maxIdleMs ?? DEFAULT_MAX_IDLE_MS)
    );

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
      resetTrackerStateContents(this.state);
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

    if (chunk) {
      const combined = this.state.remainder + chunk;
      const lines = combined.split('\n');
      this.state.remainder = lines.pop() ?? '';

      for (const line of lines) {
        applyCodexLogLine(this.state, line);
      }
    }

    await this.hydrateSubagentsFromSessionFiles();
  }

  private async hydrateSubagentsFromSessionFiles(): Promise<void> {
    const cutoff = Date.now() - MAX_TRACKED_STATE_RETENTION_MS;
    const recentMetaRecords: CodexSessionSubagentMetaRecord[] = (
      await readCodexSessionMetaRecords(this.sessionsDir, cutoff)
    ).flatMap((record) => {
      const meta = toCodexSessionSubagentMeta(record.meta);
      return meta ? [{ ...record, meta }] : [];
    });

    for (const record of recentMetaRecords) {
      this.sessionFileByThreadId.set(record.meta.threadId, record.filePath);
      applyCodexSessionSubagentMeta(this.state, record.meta);
    }

    const candidates = [...this.state.threadContexts.values()]
      .filter(
        (context) =>
          context.lastSeenAt >= cutoff && !this.state.subagentsByThread.has(context.threadId)
      )
      .sort((left, right) => left.lastSeenAt - right.lastSeenAt);

    for (const context of candidates) {
      const sessionFile = await this.resolveSessionFilePath(context.threadId);
      if (!sessionFile) {
        continue;
      }

      const meta = await readCodexSessionMeta(sessionFile);
      const subagentMeta = meta ? toCodexSessionSubagentMeta(meta) : null;
      if (!subagentMeta) {
        continue;
      }

      applyCodexSessionSubagentMeta(this.state, subagentMeta);
    }
  }

  private async resolveSessionFilePath(threadId: string): Promise<string | null> {
    const cached = this.sessionFileByThreadId.get(threadId);
    if (cached) {
      return cached;
    }

    const resolved = await findCodexSessionFileByThreadId(this.sessionsDir, threadId);
    if (resolved) {
      this.sessionFileByThreadId.set(threadId, resolved);
    }

    return resolved;
  }
}

export const codexSubagentTracker = new CodexSubagentTracker();
