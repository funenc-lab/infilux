import type {
  GetProjectTokenUsageRequest,
  ProjectTokenUsageSnapshot,
  ProjectTokenUsageSnapshotFreshness,
  ProjectTokenUsageUpdatedEvent,
} from '@shared/types/tokenUsage';
import {
  createProjectTokenUsageRequestKey,
  normalizeProjectTokenUsageRequest,
} from '@shared/utils/tokenUsage';
import { ClaudeUsageAdapter } from './ClaudeUsageAdapter';
import { CodexUsageAdapter } from './CodexUsageAdapter';
import { StaticUsageAdapter } from './StaticUsageAdapter';
import { buildProjectTokenUsageSnapshot } from './TokenUsageAccumulator';
import type { TokenUsageAdapter } from './TokenUsageTypes';

interface TokenUsageServiceOptions {
  cacheTtlMs?: number;
  now?: () => number;
}

interface CachedProjectUsageSnapshot {
  cachedAt: number;
  snapshot: ProjectTokenUsageSnapshot;
}

type ProjectUsageUpdatedListener = (event: ProjectTokenUsageUpdatedEvent) => void;

const DEFAULT_CACHE_TTL_MS = 60_000;

function createDefaultAdapters(): TokenUsageAdapter[] {
  return [
    new ClaudeUsageAdapter(),
    new CodexUsageAdapter(),
    new StaticUsageAdapter({
      providerId: 'gemini-cli',
      agentFamily: 'gemini',
      label: 'Gemini CLI',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'cursor-cli',
      agentFamily: 'cursor',
      label: 'Cursor CLI',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'droid',
      agentFamily: 'droid',
      label: 'Droid',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'auggie',
      agentFamily: 'auggie',
      label: 'Auggie',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'opencode',
      agentFamily: 'opencode',
      label: 'OpenCode',
      status: 'unsupported',
      reason: 'No stable token usage log was found for this provider.',
    }),
    new StaticUsageAdapter({
      providerId: 'custom',
      agentFamily: 'custom',
      label: 'Custom',
      status: 'unsupported',
      reason: 'Custom agents need a provider adapter before token usage can be trusted.',
    }),
  ];
}

export class TokenUsageService {
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly snapshotsByRequestKey = new Map<string, CachedProjectUsageSnapshot>();
  private readonly refreshesByRequestKey = new Map<string, Promise<ProjectTokenUsageSnapshot>>();
  private readonly projectUsageUpdatedListeners = new Set<ProjectUsageUpdatedListener>();

  constructor(
    private readonly adapters: TokenUsageAdapter[] = createDefaultAdapters(),
    options: TokenUsageServiceOptions = {}
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async getProjectUsage(
    request: GetProjectTokenUsageRequest = {}
  ): Promise<ProjectTokenUsageSnapshot> {
    const requestKey = this.createRequestKey(request);
    const cachedSnapshot = this.snapshotsByRequestKey.get(requestKey);

    if (!request.forceRefresh && cachedSnapshot) {
      const isStale = this.isCacheStale(cachedSnapshot);
      if (isStale) {
        this.startBackgroundRefresh(request, requestKey);
      }
      return this.withFreshness(cachedSnapshot.snapshot, {
        source: 'cache',
        cachedAt: cachedSnapshot.cachedAt,
        cacheTtlMs: this.cacheTtlMs,
        isStale,
        backgroundRefresh: isStale,
      });
    }

    return this.getOrCreateRefresh(request, requestKey);
  }

  onProjectUsageUpdated(listener: ProjectUsageUpdatedListener): () => void {
    this.projectUsageUpdatedListeners.add(listener);
    return () => {
      this.projectUsageUpdatedListeners.delete(listener);
    };
  }

  private async collectProjectUsage(
    request: GetProjectTokenUsageRequest,
    requestKey: string
  ): Promise<ProjectTokenUsageSnapshot> {
    const generatedAt = this.now();
    const normalizedRequest = normalizeProjectTokenUsageRequest(request);
    const results = await Promise.all(
      this.adapters.map((adapter) => adapter.collect(normalizedRequest))
    );
    const snapshot = buildProjectTokenUsageSnapshot(
      results.flatMap((result) => result.sessions),
      results.map((result) => result.status),
      request,
      generatedAt
    );
    this.snapshotsByRequestKey.set(requestKey, {
      cachedAt: generatedAt,
      snapshot,
    });
    const snapshotWithFreshness = this.withFreshness(snapshot, {
      source: 'scan',
      cachedAt: generatedAt,
      cacheTtlMs: this.cacheTtlMs,
      isStale: false,
      backgroundRefresh: false,
    });
    this.emitProjectUsageUpdated({
      request: this.normalizeRequestForEvent(request),
      snapshot: snapshotWithFreshness,
    });
    return snapshotWithFreshness;
  }

  private createRequestKey(request: GetProjectTokenUsageRequest): string {
    return createProjectTokenUsageRequestKey(request);
  }

  private getOrCreateRefresh(
    request: GetProjectTokenUsageRequest,
    requestKey: string
  ): Promise<ProjectTokenUsageSnapshot> {
    const currentRefresh = this.refreshesByRequestKey.get(requestKey);
    if (currentRefresh) {
      return currentRefresh;
    }

    const refresh = this.collectProjectUsage(request, requestKey).finally(() => {
      this.refreshesByRequestKey.delete(requestKey);
    });
    this.refreshesByRequestKey.set(requestKey, refresh);
    return refresh;
  }

  private isCacheStale(cachedSnapshot: CachedProjectUsageSnapshot): boolean {
    return this.now() - cachedSnapshot.cachedAt > this.cacheTtlMs;
  }

  private startBackgroundRefresh(request: GetProjectTokenUsageRequest, requestKey: string): void {
    if (this.refreshesByRequestKey.has(requestKey)) {
      return;
    }

    void this.getOrCreateRefresh(request, requestKey).catch(() => undefined);
  }

  private normalizeRequestForEvent(
    request: GetProjectTokenUsageRequest
  ): GetProjectTokenUsageRequest {
    return normalizeProjectTokenUsageRequest(request);
  }

  private emitProjectUsageUpdated(event: ProjectTokenUsageUpdatedEvent): void {
    for (const listener of this.projectUsageUpdatedListeners) {
      listener(event);
    }
  }

  private withFreshness(
    snapshot: ProjectTokenUsageSnapshot,
    freshness: ProjectTokenUsageSnapshotFreshness
  ): ProjectTokenUsageSnapshot {
    return {
      ...snapshot,
      freshness,
    };
  }
}

export const tokenUsageService = new TokenUsageService();
