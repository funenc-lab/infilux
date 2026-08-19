export const SESSION_OUTPUT_BATCH_DELAY_MS = 16;
export const SESSION_OUTPUT_BATCH_CHAR_LIMIT = 64 * 1024;
export const SESSION_OUTPUT_PENDING_CHAR_LIMIT = 512 * 1024;

type PendingSessionOutput = {
  data: string;
  timer: ReturnType<typeof setTimeout>;
};

type SessionOutputBatcherOptions = {
  deliver: (windowId: number, sessionId: string, data: string) => void;
  requestResync?: (windowId: number, sessionId: string) => void;
  delayMs?: number;
  maxChars?: number;
  maxPendingChars?: number;
};

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function takeBoundedChunk(data: string, maxChars: number): string {
  let chunkLength = Math.min(data.length, maxChars);
  if (
    chunkLength < data.length &&
    isHighSurrogate(data.charCodeAt(chunkLength - 1)) &&
    isLowSurrogate(data.charCodeAt(chunkLength))
  ) {
    chunkLength = chunkLength === 1 ? Math.min(2, data.length) : chunkLength - 1;
  }

  return data.slice(0, chunkLength);
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Invalid ${name}: ${value}`);
  }
  return value;
}

export class SessionOutputBatcher {
  private readonly pendingByWindowId = new Map<number, Map<string, PendingSessionOutput>>();
  private readonly resyncSessionIdsByWindowId = new Map<number, Set<string>>();
  private readonly delayMs: number;
  private readonly maxChars: number;
  private readonly maxPendingChars: number;

  constructor(private readonly options: SessionOutputBatcherOptions) {
    this.delayMs = normalizePositiveInteger(
      options.delayMs ?? SESSION_OUTPUT_BATCH_DELAY_MS,
      'session output batch delay'
    );
    this.maxChars = normalizePositiveInteger(
      options.maxChars ?? SESSION_OUTPUT_BATCH_CHAR_LIMIT,
      'session output batch size'
    );
    this.maxPendingChars = normalizePositiveInteger(
      options.maxPendingChars ?? SESSION_OUTPUT_PENDING_CHAR_LIMIT,
      'session output pending size'
    );
    if (this.maxPendingChars < this.maxChars) {
      throw new RangeError('Session output pending size cannot be smaller than the batch size');
    }
  }

  enqueue(windowId: number, sessionId: string, data: string): void {
    if (!data || this.isResyncPending(windowId, sessionId)) {
      return;
    }

    const bySessionId = this.getPendingBySessionId(windowId);
    const pending = bySessionId.get(sessionId);
    const currentData = pending?.data ?? '';
    if (currentData.length + data.length > this.maxPendingChars) {
      this.requestResync(windowId, sessionId);
      return;
    }

    if (pending) {
      pending.data += data;
      return;
    }

    const timer = this.scheduleFlush(windowId, sessionId);
    bySessionId.set(sessionId, { data, timer });
  }

  flush(windowId: number, sessionId: string): boolean {
    const bySessionId = this.pendingByWindowId.get(windowId);
    const pending = bySessionId?.get(sessionId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    const chunk = takeBoundedChunk(pending.data, this.maxChars);
    pending.data = pending.data.slice(chunk.length);
    if (!pending.data) {
      bySessionId?.delete(sessionId);
      if (bySessionId?.size === 0) {
        this.pendingByWindowId.delete(windowId);
      }
    } else {
      pending.timer = this.scheduleFlush(windowId, sessionId);
    }

    this.options.deliver(windowId, sessionId, chunk);
    return true;
  }

  flushSession(sessionId: string, windowIds: Iterable<number>): void {
    for (const windowId of windowIds) {
      this.flush(windowId, sessionId);
    }
  }

  discard(windowId: number, sessionId: string): void {
    const bySessionId = this.pendingByWindowId.get(windowId);
    const pending = bySessionId?.get(sessionId);
    if (pending) {
      clearTimeout(pending.timer);
      bySessionId?.delete(sessionId);
      if (bySessionId?.size === 0) {
        this.pendingByWindowId.delete(windowId);
      }
    }

    const resyncSessionIds = this.resyncSessionIdsByWindowId.get(windowId);
    resyncSessionIds?.delete(sessionId);
    if (resyncSessionIds?.size === 0) {
      this.resyncSessionIdsByWindowId.delete(windowId);
    }
  }

  requestResync(windowId: number, sessionId: string): void {
    this.beginResync(windowId, sessionId);
  }

  acknowledgeResync(windowId: number, sessionId: string): void {
    const resyncSessionIds = this.resyncSessionIdsByWindowId.get(windowId);
    resyncSessionIds?.delete(sessionId);
    if (resyncSessionIds?.size === 0) {
      this.resyncSessionIdsByWindowId.delete(windowId);
    }
  }

  discardWindow(windowId: number): void {
    const bySessionId = this.pendingByWindowId.get(windowId);
    if (bySessionId) {
      for (const pending of bySessionId.values()) {
        clearTimeout(pending.timer);
      }
      this.pendingByWindowId.delete(windowId);
    }
    this.resyncSessionIdsByWindowId.delete(windowId);
  }

  getDiagnostics(): {
    pendingBatchCount: number;
    pendingCharCount: number;
    resyncSessionCount: number;
  } {
    let pendingBatchCount = 0;
    let pendingCharCount = 0;
    let resyncSessionCount = 0;

    for (const bySessionId of this.pendingByWindowId.values()) {
      for (const pending of bySessionId.values()) {
        pendingBatchCount += 1;
        pendingCharCount += pending.data.length;
      }
    }
    for (const sessionIds of this.resyncSessionIdsByWindowId.values()) {
      resyncSessionCount += sessionIds.size;
    }

    return { pendingBatchCount, pendingCharCount, resyncSessionCount };
  }

  private scheduleFlush(windowId: number, sessionId: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.flush(windowId, sessionId);
    }, this.delayMs);
  }

  private beginResync(windowId: number, sessionId: string): void {
    const bySessionId = this.pendingByWindowId.get(windowId);
    const pending = bySessionId?.get(sessionId);
    if (pending) {
      clearTimeout(pending.timer);
      bySessionId?.delete(sessionId);
      if (bySessionId?.size === 0) {
        this.pendingByWindowId.delete(windowId);
      }
    }

    const sessionIds = this.resyncSessionIdsByWindowId.get(windowId) ?? new Set<string>();
    if (sessionIds.has(sessionId)) {
      return;
    }
    sessionIds.add(sessionId);
    this.resyncSessionIdsByWindowId.set(windowId, sessionIds);
    this.options.requestResync?.(windowId, sessionId);
  }

  private isResyncPending(windowId: number, sessionId: string): boolean {
    return this.resyncSessionIdsByWindowId.get(windowId)?.has(sessionId) ?? false;
  }

  private getPendingBySessionId(windowId: number): Map<string, PendingSessionOutput> {
    const existing = this.pendingByWindowId.get(windowId);
    if (existing) {
      return existing;
    }

    const created = new Map<string, PendingSessionOutput>();
    this.pendingByWindowId.set(windowId, created);
    return created;
  }
}
