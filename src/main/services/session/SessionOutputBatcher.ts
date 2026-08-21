export const SESSION_OUTPUT_BATCH_DELAY_MS = 16;
export const SESSION_OUTPUT_BATCH_CHAR_LIMIT = 64 * 1024;
export const SESSION_OUTPUT_PENDING_CHAR_LIMIT = 512 * 1024;
export const SESSION_OUTPUT_WINDOW_CHAR_LIMIT = 128 * 1024;

type PendingSessionOutput = {
  data: string;
};

type SessionOutputBatcherOptions = {
  deliver: (windowId: number, sessionId: string, data: string) => void;
  requestResync?: (windowId: number, sessionId: string) => void;
  delayMs?: number;
  maxChars?: number;
  maxPendingChars?: number;
  maxWindowChars?: number;
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
  private readonly resyncDirtySessionIdsByWindowId = new Map<number, Set<string>>();
  private readonly flushTimersByWindowId = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly nextSessionIdByWindowId = new Map<number, string>();
  private pendingBatchCount = 0;
  private pendingCharCount = 0;
  private resyncSessionCount = 0;
  private deliveredBatchCount = 0;
  private deliveredCharCount = 0;
  private resyncCount = 0;
  private maxPendingCharCount = 0;
  private readonly delayMs: number;
  private readonly maxChars: number;
  private readonly maxPendingChars: number;
  private readonly maxWindowChars: number;

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
    this.maxWindowChars = normalizePositiveInteger(
      options.maxWindowChars ?? SESSION_OUTPUT_WINDOW_CHAR_LIMIT,
      'session output window size'
    );
    if (this.maxPendingChars < this.maxChars) {
      throw new RangeError('Session output pending size cannot be smaller than the batch size');
    }
  }

  enqueue(windowId: number, sessionId: string, data: string): void {
    if (!data) {
      return;
    }
    if (this.isResyncPending(windowId, sessionId)) {
      this.markResyncDirty(windowId, sessionId);
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
    } else {
      bySessionId.set(sessionId, { data });
      this.pendingBatchCount += 1;
    }
    this.pendingCharCount += data.length;
    this.maxPendingCharCount = Math.max(this.maxPendingCharCount, this.pendingCharCount);
    this.scheduleFlush(windowId);
  }

  flush(windowId: number, sessionId: string): boolean {
    const didFlush = this.flushSessionChunk(windowId, sessionId, this.maxChars) > 0;
    this.scheduleOrDiscardWindow(windowId);
    return didFlush;
  }

  flushSession(sessionId: string, windowIds: Iterable<number>): void {
    for (const windowId of windowIds) {
      while (this.flushSessionChunk(windowId, sessionId, this.maxChars) > 0) {
        // Exit events must preserve all output that was accepted before the exit.
      }
      this.scheduleOrDiscardWindow(windowId);
    }
  }

  discard(windowId: number, sessionId: string): void {
    this.removePendingSessionOutput(windowId, sessionId);
    this.scheduleOrDiscardWindow(windowId);

    this.clearResyncState(windowId, sessionId);
  }

  requestResync(windowId: number, sessionId: string): void {
    this.beginResync(windowId, sessionId, true);
  }

  acknowledgeResync(windowId: number, sessionId: string): void {
    const resyncSessionIds = this.resyncSessionIdsByWindowId.get(windowId);
    const hadResyncPending = resyncSessionIds?.delete(sessionId) ?? false;
    if (hadResyncPending) {
      this.resyncSessionCount -= 1;
    }
    if (resyncSessionIds?.size === 0) {
      this.resyncSessionIdsByWindowId.delete(windowId);
    }

    const dirtySessionIds = this.resyncDirtySessionIdsByWindowId.get(windowId);
    const receivedOutputWhileResyncing = dirtySessionIds?.delete(sessionId) ?? false;
    if (dirtySessionIds?.size === 0) {
      this.resyncDirtySessionIdsByWindowId.delete(windowId);
    }

    if (hadResyncPending && receivedOutputWhileResyncing) {
      this.beginResync(windowId, sessionId);
    }
  }

  discardWindow(windowId: number): void {
    this.clearWindowTimer(windowId);
    const pendingBySessionId = this.pendingByWindowId.get(windowId);
    if (pendingBySessionId) {
      this.pendingBatchCount -= pendingBySessionId.size;
      for (const pending of pendingBySessionId.values()) {
        this.pendingCharCount -= pending.data.length;
      }
      this.pendingByWindowId.delete(windowId);
    }
    this.nextSessionIdByWindowId.delete(windowId);
    const resyncSessionIds = this.resyncSessionIdsByWindowId.get(windowId);
    if (resyncSessionIds) {
      this.resyncSessionCount -= resyncSessionIds.size;
      this.resyncSessionIdsByWindowId.delete(windowId);
    }
    this.resyncDirtySessionIdsByWindowId.delete(windowId);
  }

  isResyncPending(windowId: number, sessionId: string): boolean {
    return this.resyncSessionIdsByWindowId.get(windowId)?.has(sessionId) ?? false;
  }

  getDiagnostics(): {
    pendingBatchCount: number;
    pendingCharCount: number;
    resyncSessionCount: number;
    deliveredBatchCount: number;
    deliveredCharCount: number;
    resyncCount: number;
    maxPendingCharCount: number;
  } {
    return {
      pendingBatchCount: this.pendingBatchCount,
      pendingCharCount: this.pendingCharCount,
      resyncSessionCount: this.resyncSessionCount,
      deliveredBatchCount: this.deliveredBatchCount,
      deliveredCharCount: this.deliveredCharCount,
      resyncCount: this.resyncCount,
      maxPendingCharCount: this.maxPendingCharCount,
    };
  }

  private flushWindow(windowId: number): void {
    const bySessionId = this.pendingByWindowId.get(windowId);
    if (!bySessionId || bySessionId.size === 0) {
      this.scheduleOrDiscardWindow(windowId);
      return;
    }

    const sessionIds = [...bySessionId.keys()];
    const preferredSessionId = this.nextSessionIdByWindowId.get(windowId);
    const preferredIndex = preferredSessionId ? sessionIds.indexOf(preferredSessionId) : -1;
    const startIndex = preferredIndex >= 0 ? preferredIndex : 0;
    let remainingChars = this.maxWindowChars;

    for (let offset = 0; offset < sessionIds.length && remainingChars > 0; offset += 1) {
      const index = (startIndex + offset) % sessionIds.length;
      const sessionId = sessionIds[index];
      const maxChunkChars = Math.min(this.maxChars, remainingChars);
      const deliveredChars = this.flushSessionChunk(windowId, sessionId, maxChunkChars);
      if (deliveredChars === 0) {
        continue;
      }

      remainingChars -= deliveredChars;
      this.nextSessionIdByWindowId.set(
        windowId,
        this.findNextPendingSessionId(bySessionId, sessionIds, index)
      );
    }

    this.scheduleOrDiscardWindow(windowId);
  }

  private flushSessionChunk(windowId: number, sessionId: string, maxChars: number): number {
    const bySessionId = this.pendingByWindowId.get(windowId);
    const pending = bySessionId?.get(sessionId);
    if (!pending) {
      return 0;
    }

    const chunk = takeBoundedChunk(pending.data, maxChars);
    pending.data = pending.data.slice(chunk.length);
    this.pendingCharCount -= chunk.length;
    if (!pending.data) {
      bySessionId?.delete(sessionId);
      this.pendingBatchCount -= 1;
    }

    this.deliveredBatchCount += 1;
    this.deliveredCharCount += chunk.length;
    this.options.deliver(windowId, sessionId, chunk);
    return chunk.length;
  }

  private findNextPendingSessionId(
    bySessionId: Map<string, PendingSessionOutput>,
    sessionIds: string[],
    currentIndex: number
  ): string {
    for (let offset = 1; offset <= sessionIds.length; offset += 1) {
      const nextSessionId = sessionIds[(currentIndex + offset) % sessionIds.length];
      if (bySessionId.has(nextSessionId)) {
        return nextSessionId;
      }
    }
    return sessionIds[currentIndex];
  }

  private scheduleFlush(windowId: number): void {
    if (this.flushTimersByWindowId.has(windowId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.flushTimersByWindowId.delete(windowId);
      this.flushWindow(windowId);
    }, this.delayMs);
    this.flushTimersByWindowId.set(windowId, timer);
  }

  private scheduleOrDiscardWindow(windowId: number): void {
    const bySessionId = this.pendingByWindowId.get(windowId);
    if (bySessionId && bySessionId.size > 0) {
      this.scheduleFlush(windowId);
      return;
    }

    this.clearWindowTimer(windowId);
    this.pendingByWindowId.delete(windowId);
    this.nextSessionIdByWindowId.delete(windowId);
  }

  private clearWindowTimer(windowId: number): void {
    const timer = this.flushTimersByWindowId.get(windowId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimersByWindowId.delete(windowId);
    }
  }

  private beginResync(windowId: number, sessionId: string, markDirtyWhenPending = false): void {
    this.removePendingSessionOutput(windowId, sessionId);
    this.scheduleOrDiscardWindow(windowId);

    const sessionIds = this.resyncSessionIdsByWindowId.get(windowId) ?? new Set<string>();
    if (sessionIds.has(sessionId)) {
      if (markDirtyWhenPending) {
        this.markResyncDirty(windowId, sessionId);
      }
      return;
    }
    sessionIds.add(sessionId);
    this.resyncSessionCount += 1;
    this.resyncCount += 1;
    this.resyncSessionIdsByWindowId.set(windowId, sessionIds);
    this.options.requestResync?.(windowId, sessionId);
  }

  private markResyncDirty(windowId: number, sessionId: string): void {
    const dirtySessionIds = this.resyncDirtySessionIdsByWindowId.get(windowId) ?? new Set<string>();
    dirtySessionIds.add(sessionId);
    this.resyncDirtySessionIdsByWindowId.set(windowId, dirtySessionIds);
  }

  private clearResyncState(windowId: number, sessionId: string): void {
    const resyncSessionIds = this.resyncSessionIdsByWindowId.get(windowId);
    if (resyncSessionIds?.delete(sessionId)) {
      this.resyncSessionCount -= 1;
    }
    if (resyncSessionIds?.size === 0) {
      this.resyncSessionIdsByWindowId.delete(windowId);
    }

    const dirtySessionIds = this.resyncDirtySessionIdsByWindowId.get(windowId);
    dirtySessionIds?.delete(sessionId);
    if (dirtySessionIds?.size === 0) {
      this.resyncDirtySessionIdsByWindowId.delete(windowId);
    }
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

  private removePendingSessionOutput(
    windowId: number,
    sessionId: string
  ): PendingSessionOutput | null {
    const bySessionId = this.pendingByWindowId.get(windowId);
    const pending = bySessionId?.get(sessionId);
    if (!pending) {
      return null;
    }

    bySessionId?.delete(sessionId);
    this.pendingBatchCount -= 1;
    this.pendingCharCount -= pending.data.length;
    return pending;
  }
}
