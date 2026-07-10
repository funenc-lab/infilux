export const SESSION_OUTPUT_BATCH_DELAY_MS = 16;
export const SESSION_OUTPUT_BATCH_CHAR_LIMIT = 64 * 1024;

type PendingSessionOutput = {
  data: string;
  timer: ReturnType<typeof setTimeout>;
};

type SessionOutputBatcherOptions = {
  deliver: (windowId: number, sessionId: string, data: string) => void;
  delayMs?: number;
  maxChars?: number;
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

export class SessionOutputBatcher {
  private readonly pendingByWindowId = new Map<number, Map<string, PendingSessionOutput>>();
  private readonly delayMs: number;
  private readonly maxChars: number;

  constructor(private readonly options: SessionOutputBatcherOptions) {
    this.delayMs = options.delayMs ?? SESSION_OUTPUT_BATCH_DELAY_MS;
    this.maxChars = options.maxChars ?? SESSION_OUTPUT_BATCH_CHAR_LIMIT;
  }

  enqueue(windowId: number, sessionId: string, data: string): void {
    if (!data) {
      return;
    }

    let remainingData = data;
    while (remainingData.length > 0) {
      const pending = this.pendingByWindowId.get(windowId)?.get(sessionId);
      if (pending) {
        const availableChars = this.maxChars - pending.data.length;
        if (availableChars <= 0) {
          this.flush(windowId, sessionId);
          continue;
        }

        const nextChunk = takeBoundedChunk(remainingData, availableChars);
        if (nextChunk.length > availableChars) {
          this.flush(windowId, sessionId);
          continue;
        }
        pending.data += nextChunk;
        remainingData = remainingData.slice(nextChunk.length);
        if (pending.data.length === this.maxChars) {
          this.flush(windowId, sessionId);
        }
        continue;
      }

      if (remainingData.length >= this.maxChars) {
        const nextChunk = takeBoundedChunk(remainingData, this.maxChars);
        remainingData = remainingData.slice(nextChunk.length);
        this.options.deliver(windowId, sessionId, nextChunk);
        continue;
      }

      const timer = setTimeout(() => {
        this.flush(windowId, sessionId);
      }, this.delayMs);
      const bySessionId = this.getPendingBySessionId(windowId);
      bySessionId.set(sessionId, { data: remainingData, timer });
      return;
    }
  }

  flush(windowId: number, sessionId: string): boolean {
    const bySessionId = this.pendingByWindowId.get(windowId);
    if (!bySessionId) {
      return false;
    }

    const pending = bySessionId.get(sessionId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    bySessionId.delete(sessionId);
    if (bySessionId.size === 0) {
      this.pendingByWindowId.delete(windowId);
    }

    this.options.deliver(windowId, sessionId, pending.data);
    return true;
  }

  flushSession(sessionId: string, windowIds: Iterable<number>): void {
    for (const windowId of windowIds) {
      this.flush(windowId, sessionId);
    }
  }

  discard(windowId: number, sessionId: string): void {
    const bySessionId = this.pendingByWindowId.get(windowId);
    if (!bySessionId) {
      return;
    }

    const pending = bySessionId.get(sessionId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    bySessionId.delete(sessionId);
    if (bySessionId.size === 0) {
      this.pendingByWindowId.delete(windowId);
    }
  }

  discardWindow(windowId: number): void {
    const bySessionId = this.pendingByWindowId.get(windowId);
    if (!bySessionId) {
      return;
    }

    for (const pending of bySessionId.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingByWindowId.delete(windowId);
  }

  getDiagnostics(): { pendingBatchCount: number; pendingCharCount: number } {
    let pendingBatchCount = 0;
    let pendingCharCount = 0;

    for (const bySessionId of this.pendingByWindowId.values()) {
      for (const pending of bySessionId.values()) {
        pendingBatchCount += 1;
        pendingCharCount += pending.data.length;
      }
    }

    return { pendingBatchCount, pendingCharCount };
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
