import path from 'node:path';
import type {
  GetAgentSubagentTranscriptRequest,
  GetAgentSubagentTranscriptResult,
  ListLiveAgentSubagentsRequest,
  ListLiveAgentSubagentsResult,
  ListSessionAgentSubagentsRequest,
  ListSessionAgentSubagentsResult,
  LiveAgentSubagent,
} from '@shared/types';
import { CodexSessionSubagentService } from './CodexSessionSubagentService';
import { CodexSubagentTracker } from './CodexSubagentTracker';
import { CodexSubagentTranscriptService } from './CodexSubagentTranscriptService';

export interface CodexRuntimeSubagentHomeProvider {
  listActiveRuntimeHomePaths(): readonly string[];
}

interface CodexRuntimeSubagentReaders {
  live: CodexSubagentTracker;
  session: CodexSessionSubagentService;
  transcript: CodexSubagentTranscriptService;
}

function mergeSubagentItems(
  results: readonly { items: LiveAgentSubagent[] }[]
): LiveAgentSubagent[] {
  const itemsByThreadId = new Map<string, LiveAgentSubagent>();

  for (const result of results) {
    for (const item of result.items) {
      const existing = itemsByThreadId.get(item.threadId);
      if (!existing || item.lastSeenAt >= existing.lastSeenAt) {
        itemsByThreadId.set(item.threadId, item);
      }
    }
  }

  return [...itemsByThreadId.values()].sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

export class CodexRuntimeSubagentService {
  private readonly readersByRuntimeHomePath = new Map<string, CodexRuntimeSubagentReaders>();

  constructor(private readonly homeProvider: CodexRuntimeSubagentHomeProvider) {}

  async listLive(
    request: ListLiveAgentSubagentsRequest = {}
  ): Promise<ListLiveAgentSubagentsResult> {
    const readers = this.getActiveReaders();
    if (readers.length === 0) {
      return {
        items: [],
        generatedAt: Date.now(),
      };
    }

    const results = await Promise.all(readers.map((reader) => reader.live.listLive(request)));
    return {
      items: mergeSubagentItems(results),
      generatedAt: Date.now(),
    };
  }

  async listSession(
    request: ListSessionAgentSubagentsRequest
  ): Promise<ListSessionAgentSubagentsResult> {
    const readers = this.getActiveReaders();
    if (readers.length === 0) {
      return {
        items: [],
        generatedAt: Date.now(),
      };
    }

    const results = await Promise.all(readers.map((reader) => reader.session.listSession(request)));
    return {
      items: mergeSubagentItems(results),
      generatedAt: Date.now(),
    };
  }

  async getTranscript(
    request: GetAgentSubagentTranscriptRequest
  ): Promise<GetAgentSubagentTranscriptResult> {
    for (const reader of this.getActiveReaders()) {
      try {
        return await reader.transcript.getTranscript(request);
      } catch {
        // A thread belongs to exactly one active runtime home. Continue until it is found.
      }
    }

    throw new Error(`Codex subagent transcript not found for thread ${request.threadId}`);
  }

  private getActiveReaders(): CodexRuntimeSubagentReaders[] {
    const activeRuntimeHomePaths = new Set(
      this.homeProvider
        .listActiveRuntimeHomePaths()
        .map((runtimeHomePath) => path.resolve(runtimeHomePath))
    );

    for (const runtimeHomePath of this.readersByRuntimeHomePath.keys()) {
      if (!activeRuntimeHomePaths.has(runtimeHomePath)) {
        this.readersByRuntimeHomePath.delete(runtimeHomePath);
      }
    }

    return [...activeRuntimeHomePaths].map((runtimeHomePath) => {
      const existingReaders = this.readersByRuntimeHomePath.get(runtimeHomePath);
      if (existingReaders) {
        return existingReaders;
      }

      const sessionsDir = path.join(runtimeHomePath, 'sessions');
      const live = new CodexSubagentTracker(
        path.join(runtimeHomePath, 'log', 'codex-tui.log'),
        sessionsDir
      );
      const readers = {
        live,
        session: new CodexSessionSubagentService(live, sessionsDir),
        transcript: new CodexSubagentTranscriptService(sessionsDir),
      };
      this.readersByRuntimeHomePath.set(runtimeHomePath, readers);
      return readers;
    });
  }
}
