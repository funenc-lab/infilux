import { stat } from 'node:fs/promises';
import type {
  ListLiveAgentSubagentsRequest,
  ListLiveAgentSubagentsResult,
  ListSessionAgentSubagentsRequest,
  ListSessionAgentSubagentsResult,
  LiveAgentSubagent,
} from '@shared/types';
import {
  CODEX_SESSIONS_DIR,
  type CodexSessionMetaRecord,
  findCodexSessionFileByThreadId,
  formatCodexAgentType,
  readCodexSessionMeta,
  readCodexSessionMetaRecords,
  resolveCodexSessionMetaTimestamp,
} from './codexSessionMetadata';

const DEFAULT_LIVE_IDLE_MS = 15 * 60 * 1_000;
const MAX_SESSION_SCAN_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

interface LiveSubagentLookup {
  listLive(request: ListLiveAgentSubagentsRequest): Promise<ListLiveAgentSubagentsResult>;
}

function buildSubagentLabel(
  agentType: string | undefined,
  sequence: number,
  agentNickname?: string
) {
  const nickname = agentNickname?.trim();
  if (nickname) {
    return nickname;
  }

  return `${formatCodexAgentType(agentType)} ${sequence}`;
}

function resolveRootScanStartMs(rootRecord: CodexSessionMetaRecord | null, nowMs: number): number {
  if (!rootRecord) {
    return Math.max(0, nowMs - MAX_SESSION_SCAN_WINDOW_MS);
  }

  const rootTimestamp = resolveCodexSessionMetaTimestamp(rootRecord);
  if (rootTimestamp <= 0) {
    return Math.max(0, nowMs - MAX_SESSION_SCAN_WINDOW_MS);
  }

  return Math.max(rootTimestamp, nowMs - MAX_SESSION_SCAN_WINDOW_MS);
}

function buildLiveItemsByThread(
  items: LiveAgentSubagent[],
  providerSessionId: string
): Map<string, LiveAgentSubagent> {
  return new Map(
    items
      .filter((item) => item.rootThreadId === providerSessionId)
      .map((item) => [item.threadId, item] as const)
  );
}

function belongsToRootThread(
  record: CodexSessionMetaRecord,
  rootThreadId: string,
  recordsByThread: Map<string, CodexSessionMetaRecord>,
  membershipCache: Map<string, boolean>
): boolean {
  const cached = membershipCache.get(record.meta.threadId);
  if (cached !== undefined) {
    return cached;
  }

  const visited = new Set<string>([record.meta.threadId]);
  let current: CodexSessionMetaRecord | undefined = record;

  while (current?.meta.parentThreadId) {
    const parentThreadId = current.meta.parentThreadId;
    if (parentThreadId === rootThreadId) {
      membershipCache.set(record.meta.threadId, true);
      return true;
    }

    if (visited.has(parentThreadId)) {
      break;
    }

    visited.add(parentThreadId);
    current = recordsByThread.get(parentThreadId);
  }

  membershipCache.set(record.meta.threadId, false);
  return false;
}

function mergeSessionSubagentItems(
  records: CodexSessionMetaRecord[],
  liveItemsByThread: Map<string, LiveAgentSubagent>,
  providerSessionId: string
): LiveAgentSubagent[] {
  const sequenceByThreadId = new Map<string, number>();
  records.forEach((record, index) => {
    sequenceByThreadId.set(record.meta.threadId, index + 1);
  });

  const merged: LiveAgentSubagent[] = records.map((record) => {
    const liveItem = liveItemsByThread.get(record.meta.threadId);
    const sequence = sequenceByThreadId.get(record.meta.threadId) ?? 1;
    const fallbackTimestamp = resolveCodexSessionMetaTimestamp(record);

    return {
      id: record.meta.threadId,
      provider: 'codex' as const,
      threadId: record.meta.threadId,
      rootThreadId: providerSessionId,
      parentThreadId: record.meta.parentThreadId ?? providerSessionId,
      cwd: liveItem?.cwd ?? record.meta.cwd ?? '',
      label:
        liveItem?.label ??
        buildSubagentLabel(record.meta.agentType, sequence, record.meta.agentNickname),
      agentType: liveItem?.agentType ?? record.meta.agentType,
      summary: liveItem?.summary,
      lastSeenAt: liveItem?.lastSeenAt ?? fallbackTimestamp,
      status: liveItem?.status ?? 'completed',
    };
  });

  const seenThreadIds = new Set(merged.map((item) => item.threadId));
  for (const liveItem of liveItemsByThread.values()) {
    if (!seenThreadIds.has(liveItem.threadId)) {
      merged.push(liveItem);
    }
  }

  return merged.sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

export class CodexSessionSubagentService {
  constructor(
    private readonly liveLookup: LiveSubagentLookup,
    private readonly sessionsDir = CODEX_SESSIONS_DIR
  ) {}

  async listSession(
    request: ListSessionAgentSubagentsRequest
  ): Promise<ListSessionAgentSubagentsResult> {
    if (!request.providerSessionId) {
      return {
        items: [],
        generatedAt: Date.now(),
      };
    }

    const liveResult = await this.liveLookup.listLive({
      cwds: request.cwd ? [request.cwd] : undefined,
      maxIdleMs: request.maxIdleMs ?? DEFAULT_LIVE_IDLE_MS,
    });
    const liveItemsByThread = buildLiveItemsByThread(liveResult.items, request.providerSessionId);

    const rootSessionFile = await findCodexSessionFileByThreadId(
      this.sessionsDir,
      request.providerSessionId
    );
    if (!rootSessionFile) {
      return {
        items: [...liveItemsByThread.values()].sort(
          (left, right) => right.lastSeenAt - left.lastSeenAt
        ),
        generatedAt: Date.now(),
      };
    }

    const [rootMeta, rootFileStat] = await Promise.all([
      readCodexSessionMeta(rootSessionFile),
      stat(rootSessionFile).catch(() => null),
    ]);
    const nowMs = Date.now();
    const rootRecord =
      rootMeta === null
        ? null
        : {
            filePath: rootSessionFile,
            fileMtimeMs: rootFileStat?.mtimeMs ?? nowMs,
            meta: rootMeta,
          };
    const scanStartMs = resolveRootScanStartMs(rootRecord, nowMs);
    const allRecords = await readCodexSessionMetaRecords(this.sessionsDir, scanStartMs, nowMs);
    const recordsByThread = new Map(allRecords.map((record) => [record.meta.threadId, record]));
    const membershipCache = new Map<string, boolean>();
    const sessionRecords = allRecords.filter(
      (record) =>
        record.meta.threadId !== request.providerSessionId &&
        record.meta.parentThreadId &&
        belongsToRootThread(record, request.providerSessionId, recordsByThread, membershipCache)
    );

    return {
      items: mergeSessionSubagentItems(
        sessionRecords,
        liveItemsByThread,
        request.providerSessionId
      ),
      generatedAt: Date.now(),
    };
  }
}
