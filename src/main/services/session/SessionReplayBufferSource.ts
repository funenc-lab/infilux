export function getSessionReplayBufferRuntimeSource(): string {
  // Both generated runtimes provide the terminal parser and UTF-16 boundary helpers.
  return `
class SessionReplayBuffer {
  constructor(maxCodeUnits, initialValue = '') {
    this.maxCodeUnits = maxCodeUnits;
    this.chunks = [];
    this.startChunkIndex = 0;
    this.startOffset = 0;
    this.retainedLength = 0;
    this.pendingParserState = 'text';
    this.replace(initialValue);
  }

  get length() {
    return this.retainedLength;
  }

  append(value) {
    if (!value) return;

    if (this.pendingParserState !== 'text') {
      this.replaceWithInitialParserState(value, this.pendingParserState);
      return;
    }

    if (value.length >= this.maxCodeUnits) {
      const lastChunk = this.chunks[this.chunks.length - 1];
      if (
        value.length === this.maxCodeUnits && lastChunk &&
        isHighSurrogate(lastChunk.charCodeAt(lastChunk.length - 1)) &&
        isLowSurrogate(value.charCodeAt(0))
      ) {
        value = value.slice(1);
      }
      this.replaceWithInitialParserState(value, this.resolveRetainedParserState());
      return;
    }

    this.chunks.push(value);
    this.retainedLength += value.length;
    this.trimToCapacity();
  }

  replace(value) {
    this.replaceWithInitialParserState(value, 'text');
  }

  toString() {
    if (this.retainedLength === 0) return '';

    const firstChunk = this.chunks[this.startChunkIndex];
    if (this.startChunkIndex === this.chunks.length - 1) {
      return firstChunk.slice(this.startOffset);
    }

    return [firstChunk.slice(this.startOffset), ...this.chunks.slice(this.startChunkIndex + 1)].join('');
  }

  replaceWithInitialParserState(value, initialParserState) {
    this.chunks.length = 0;
    this.startChunkIndex = 0;
    this.startOffset = 0;
    this.pendingParserState = 'text';

    let tail = takeTerminalReplayTail(value, this.maxCodeUnits, initialParserState);
    const safeStart = value.length - tail.length;
    if (
      safeStart > 0 && isLowSurrogate(tail.charCodeAt(0)) &&
      isHighSurrogate(value.charCodeAt(safeStart - 1))
    ) {
      tail = tail.slice(1);
    }
    if (!tail) {
      this.retainedLength = 0;
      this.pendingParserState = resolveTerminalReplayParserState(value, initialParserState);
      return;
    }

    this.chunks.push(tail);
    this.retainedLength = tail.length;
  }

  trimToCapacity() {
    const overflow = this.retainedLength - this.maxCodeUnits;
    if (overflow <= 0) return;

    const safeDiscard = this.resolveSafeDiscardCount(overflow);
    const lastDiscardedCodeUnit = this.discard(safeDiscard.count);
    if (this.retainedLength === 0 && safeDiscard.endState !== 'text') {
      this.pendingParserState = safeDiscard.endState;
      return;
    }
    const nextCodeUnit = this.getFirstCodeUnit();
    if (
      lastDiscardedCodeUnit !== null && nextCodeUnit !== null &&
      isHighSurrogate(lastDiscardedCodeUnit) && isLowSurrogate(nextCodeUnit)
    ) {
      this.discard(1);
    }
  }

  discard(count) {
    let remaining = count;
    let lastDiscardedCodeUnit = null;

    while (remaining > 0 && this.startChunkIndex < this.chunks.length) {
      const chunk = this.chunks[this.startChunkIndex];
      const available = chunk.length - this.startOffset;
      const consumed = Math.min(remaining, available);
      lastDiscardedCodeUnit = chunk.charCodeAt(this.startOffset + consumed - 1);
      this.startOffset += consumed;
      this.retainedLength -= consumed;
      remaining -= consumed;

      if (this.startOffset === chunk.length) {
        this.chunks[this.startChunkIndex] = '';
        this.startChunkIndex += 1;
        this.startOffset = 0;
      }
    }

    this.compactDiscardedChunks();
    return lastDiscardedCodeUnit;
  }

  resolveSafeDiscardCount(minimumCount) {
    let chunkIndex = this.startChunkIndex;
    let chunkOffset = this.startOffset;
    let consumed = 0;
    let state = 'text';

    while (consumed < minimumCount || state !== 'text') {
      const chunk = this.chunks[chunkIndex];
      if (!chunk) return { count: consumed, endState: state };

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

  resolveRetainedParserState() {
    let state = 'text';
    for (let chunkIndex = this.startChunkIndex; chunkIndex < this.chunks.length; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      const startOffset = chunkIndex === this.startChunkIndex ? this.startOffset : 0;
      for (let index = startOffset; index < chunk.length; index += 1) {
        state = advanceTerminalReplayParserState(state, chunk.charCodeAt(index));
      }
    }
    return state;
  }

  getFirstCodeUnit() {
    const chunk = this.chunks[this.startChunkIndex];
    return chunk ? chunk.charCodeAt(this.startOffset) : null;
  }

  compactDiscardedChunks() {
    if (this.startChunkIndex === 0) return;
    if (this.startChunkIndex === this.chunks.length) {
      this.chunks.length = 0;
      this.startChunkIndex = 0;
      return;
    }
    if (this.startChunkIndex >= 32 && this.startChunkIndex * 2 >= this.chunks.length) {
      this.chunks.splice(0, this.startChunkIndex);
      this.startChunkIndex = 0;
    }
  }
}
`;
}
