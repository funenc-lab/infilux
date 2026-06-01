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
const DEFAULT_METADATA_CACHE_TTL_MS = 5_000;
const METADATA_SCAN_BUCKET_MS = 60_000;

interface LiveSubagentLookup {
  listLive(request: ListLiveAgentSubagentsRequest): Promise<ListLiveAgentSubagentsResult>;
}

interface CachedLiveLookup {
  key: string;
  promise: Promise<ListLiveAgentSubagentsResult>;
}

interface CachedSessionFileLookup {
  expiresAt: number;
  promise: Promise<string | null>;
}

interface CachedSessionMetaRecordsLookup {
  expiresAt: number;
  promise: Promise<CodexSessionMetaRecord[]>;
  startMs: number;
}

interface CodexSessionMetadataAccess {
  findCodexSessionFileByThreadId: typeof findCodexSessionFileByThreadId;
  readCodexSessionMeta: typeof readCodexSessionMeta;
  readCodexSessionMetaRecords: typeof readCodexSessionMetaRecords;
}

interface CodexSessionSubagentServiceOptions {
  cacheTtlMs?: number;
  metadata?: Partial<CodexSessionMetadataAccess>;
  now?: () => number;
}

type ListSessionAgentSubagentsRequestWithLiveSnapshot = ListSessionAgentSubagentsRequest & {
  liveItems?: LiveAgentSubagent[];
  generatedAt?: number;
};

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
  private readonly cacheTtlMs: number;
  private inFlightLiveLookup: CachedLiveLookup | null = null;
  private readonly metadata: CodexSessionMetadataAccess;
  private metadataRecordsLookup: CachedSessionMetaRecordsLookup | null = null;
  private readonly now: () => number;
  private readonly sessionFileLookupByThreadId = new Map<string, CachedSessionFileLookup>();

  constructor(
    private readonly liveLookup: LiveSubagentLookup,
    private readonly sessionsDir = CODEX_SESSIONS_DIR,
    options: CodexSessionSubagentServiceOptions = {}
  ) {
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? DEFAULT_METADATA_CACHE_TTL_MS);
    this.metadata = {
      findCodexSessionFileByThreadId,
      readCodexSessionMeta,
      readCodexSessionMetaRecords,
      ...options.metadata,
    };
    this.now = options.now ?? Date.now;
  }

  async listSession(
    request: ListSessionAgentSubagentsRequestWithLiveSnapshot
  ): Promise<ListSessionAgentSubagentsResult> {
    if (!request.providerSessionId) {
      return {
        items: [],
        generatedAt: Date.now(),
      };
    }

    const liveResult =
      request.liveItems !== undefined
        ? {
            items: request.liveItems,
            generatedAt: request.generatedAt ?? Date.now(),
          }
        : await this.listLiveForSessionRequest(request);
    const liveItemsByThread = buildLiveItemsByThread(liveResult.items, request.providerSessionId);

    const rootSessionFile = await this.findSessionFileByThreadId(request.providerSessionId);
    if (!rootSessionFile) {
      return {
        items: [...liveItemsByThread.values()].sort(
          (left, right) => right.lastSeenAt - left.lastSeenAt
        ),
        generatedAt: this.now(),
      };
    }

    const [rootMeta, rootFileStat] = await Promise.all([
      this.metadata.readCodexSessionMeta(rootSessionFile),
      stat(rootSessionFile).catch(() => null),
    ]);
    const nowMs = this.now();
    const rootRecord =
      rootMeta === null
        ? null
        : {
            filePath: rootSessionFile,
            fileMtimeMs: rootFileStat?.mtimeMs ?? nowMs,
            meta: rootMeta,
          };
    const scanStartMs = resolveRootScanStartMs(rootRecord, nowMs);
    const allRecords = await this.readSessionMetaRecords(scanStartMs, nowMs);
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
      generatedAt: this.now(),
    };
  }

  private findSessionFileByThreadId(threadId: string): Promise<string | null> {
    const nowMs = this.now();
    const cached = this.sessionFileLookupByThreadId.get(threadId);
    if (cached && cached.expiresAt > nowMs) {
      return cached.promise;
    }

    const promise = this.metadata.findCodexSessionFileByThreadId(this.sessionsDir, threadId);
    this.sessionFileLookupByThreadId.set(threadId, {
      expiresAt: nowMs + this.cacheTtlMs,
      promise,
    });
    void promise.catch(() => {
      const current = this.sessionFileLookupByThreadId.get(threadId);
      if (current?.promise === promise) {
        this.sessionFileLookupByThreadId.delete(threadId);
      }
    });
    return promise;
  }

  private async readSessionMetaRecords(
    startMs: number,
    endMs: number
  ): Promise<CodexSessionMetaRecord[]> {
    const nowMs = this.now();
    const cached = this.metadataRecordsLookup;
    if (cached && cached.expiresAt > nowMs && cached.startMs <= startMs) {
      const records = await cached.promise;
      return filterRecordsByScanWindow(records, startMs, endMs);
    }

    const bucketedStartMs = Math.floor(startMs / METADATA_SCAN_BUCKET_MS) * METADATA_SCAN_BUCKET_MS;
    const promise = this.metadata.readCodexSessionMetaRecords(
      this.sessionsDir,
      bucketedStartMs,
      endMs
    );
    this.metadataRecordsLookup = {
      expiresAt: nowMs + this.cacheTtlMs,
      promise,
      startMs: bucketedStartMs,
    };
    void promise.catch(() => {
      if (this.metadataRecordsLookup?.promise === promise) {
        this.metadataRecordsLookup = null;
      }
    });

    const records = await promise;
    return filterRecordsByScanWindow(records, startMs, endMs);
  }

  private async listLiveForSessionRequest(
    request: ListSessionAgentSubagentsRequest
  ): Promise<ListLiveAgentSubagentsResult> {
    const liveRequest = {
      cwds: request.cwd ? [request.cwd] : undefined,
      maxIdleMs: request.maxIdleMs ?? DEFAULT_LIVE_IDLE_MS,
    };
    const lookupKey = JSON.stringify(liveRequest);
    const existingLookup = this.inFlightLiveLookup;
    if (existingLookup?.key === lookupKey) {
      return existingLookup.promise;
    }

    const promise = this.liveLookup.listLive(liveRequest).finally(() => {
      if (this.inFlightLiveLookup?.promise === promise) {
        this.inFlightLiveLookup = null;
      }
    });
    this.inFlightLiveLookup = {
      key: lookupKey,
      promise,
    };
    return promise;
  }
}

function filterRecordsByScanWindow(
  records: CodexSessionMetaRecord[],
  startMs: number,
  endMs: number
): CodexSessionMetaRecord[] {
  return records.filter((record) => {
    const timestamp = resolveCodexSessionMetaTimestamp(record);
    return timestamp >= startMs && timestamp <= endMs;
  });
}
