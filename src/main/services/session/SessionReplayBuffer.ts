import {
  advanceTerminalReplayParserState,
  isTerminalReplayBoundary,
  resolveTerminalReplayParserState,
  type TerminalReplayParserState,
  takeTerminalReplayTail,
} from '@shared/utils/terminalReplayTail';

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

export class SessionReplayBuffer {
  private readonly chunks: string[] = [];
  private startChunkIndex = 0;
  private startOffset = 0;
  private retainedLength = 0;
  private pendingParserState: TerminalReplayParserState = 'text';

  constructor(
    private readonly maxCodeUnits: number,
    initialValue = ''
  ) {
    this.replace(initialValue);
  }

  get length(): number {
    return this.retainedLength;
  }

  append(value: string): void {
    if (!value) {
      return;
    }

    if (!isTerminalReplayBoundary(this.pendingParserState)) {
      this.replaceWithInitialParserState(value, this.pendingParserState);
      return;
    }

    if (value.length >= this.maxCodeUnits) {
      this.replaceWithInitialParserState(value, this.resolveRetainedParserState());
      return;
    }

    this.chunks.push(value);
    this.retainedLength += value.length;
    this.trimToCapacity();
  }

  replace(value: string): void {
    this.replaceWithInitialParserState(value, 'text');
  }

  toString(): string {
    if (this.retainedLength === 0) {
      return '';
    }

    const firstChunk = this.chunks[this.startChunkIndex];
    if (this.startChunkIndex === this.chunks.length - 1) {
      return firstChunk.slice(this.startOffset);
    }

    return [
      firstChunk.slice(this.startOffset),
      ...this.chunks.slice(this.startChunkIndex + 1),
    ].join('');
  }

  private replaceWithInitialParserState(
    value: string,
    initialParserState: TerminalReplayParserState
  ): void {
    this.chunks.length = 0;
    this.startChunkIndex = 0;
    this.startOffset = 0;
    this.pendingParserState = 'text';

    const tail = takeTerminalReplayTail(value, this.maxCodeUnits, initialParserState);
    if (!tail) {
      this.retainedLength = 0;
      this.pendingParserState = resolveTerminalReplayParserState(value, initialParserState);
      return;
    }

    this.chunks.push(tail);
    this.retainedLength = tail.length;
  }

  private trimToCapacity(): void {
    const overflow = this.retainedLength - this.maxCodeUnits;
    if (overflow <= 0) {
      return;
    }

    const safeDiscard = this.resolveSafeDiscardCount(overflow);
    const lastDiscardedCodeUnit = this.discard(safeDiscard.count);
    if (this.retainedLength === 0 && !isTerminalReplayBoundary(safeDiscard.endState)) {
      this.pendingParserState = safeDiscard.endState;
      return;
    }
    const nextCodeUnit = this.getFirstCodeUnit();
    if (
      lastDiscardedCodeUnit !== null &&
      nextCodeUnit !== null &&
      isHighSurrogate(lastDiscardedCodeUnit) &&
      isLowSurrogate(nextCodeUnit)
    ) {
      this.discard(1);
    }
  }

  private discard(count: number): number | null {
    let remaining = count;
    let lastDiscardedCodeUnit: number | null = null;

    while (remaining > 0 && this.startChunkIndex < this.chunks.length) {
      const chunk = this.chunks[this.startChunkIndex];
      const available = chunk.length - this.startOffset;
      const consumed = Math.min(remaining, available);
      lastDiscardedCodeUnit = chunk.charCodeAt(this.startOffset + consumed - 1);
      this.startOffset += consumed;
      this.retainedLength -= consumed;
      remaining -= consumed;

      if (this.startOffset === chunk.length) {
        this.startChunkIndex += 1;
        this.startOffset = 0;
      }
    }

    this.compactDiscardedChunks();
    return lastDiscardedCodeUnit;
  }

  private resolveSafeDiscardCount(minimumCount: number): {
    count: number;
    endState: TerminalReplayParserState;
  } {
    let chunkIndex = this.startChunkIndex;
    let chunkOffset = this.startOffset;
    let consumed = 0;
    let state: TerminalReplayParserState = 'text';

    while (consumed < minimumCount || !isTerminalReplayBoundary(state)) {
      const chunk = this.chunks[chunkIndex];
      if (!chunk) {
        return { count: consumed, endState: state };
      }

      if (chunkOffset === chunk.length) {
        chunkIndex += 1;
        chunkOffset = 0;
        continue;
      }

      state = advanceTerminalReplayParserState(state, chunk.charCodeAt(chunkOffset));
      chunkOffset += 1;
      consumed += 1;
    }

    return { count: consumed, endState: state };
  }

  private resolveRetainedParserState(): TerminalReplayParserState {
    let state: TerminalReplayParserState = 'text';

    for (let chunkIndex = this.startChunkIndex; chunkIndex < this.chunks.length; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      const startOffset = chunkIndex === this.startChunkIndex ? this.startOffset : 0;

      for (let index = startOffset; index < chunk.length; index += 1) {
        state = advanceTerminalReplayParserState(state, chunk.charCodeAt(index));
      }
    }

    return state;
  }

  private getFirstCodeUnit(): number | null {
    const chunk = this.chunks[this.startChunkIndex];
    return chunk ? chunk.charCodeAt(this.startOffset) : null;
  }

  private compactDiscardedChunks(): void {
    if (this.startChunkIndex === 0) {
      return;
    }

    if (this.startChunkIndex === this.chunks.length) {
      this.chunks.length = 0;
      this.startChunkIndex = 0;
      return;
    }

    if (this.startChunkIndex >= 32) {
      this.chunks.splice(0, this.startChunkIndex);
      this.startChunkIndex = 0;
    }
  }
}
