export const XTERM_OUTPUT_WRITE_CHAR_LIMIT = 64 * 1024;
export const XTERM_OUTPUT_BACKLOG_HIGH_WATER_MARK = 4 * 1024 * 1024;
export const XTERM_OUTPUT_BACKLOG_LOW_WATER_MARK = 1 * 1024 * 1024;

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function getSafeChunkLength(value: string, startIndex: number, requestedLength: number): number {
  const availableLength = value.length - startIndex;
  const boundedLength = Math.min(requestedLength, availableLength);
  if (boundedLength === availableLength || boundedLength === 0) {
    return boundedLength;
  }

  const endIndex = startIndex + boundedLength;
  if (
    isHighSurrogate(value.charCodeAt(endIndex - 1)) &&
    isLowSurrogate(value.charCodeAt(endIndex))
  ) {
    return boundedLength === 1 ? Math.min(2, availableLength) : boundedLength - 1;
  }

  return boundedLength;
}

export class XtermOutputBuffer {
  private chunks: string[] = [];
  private headIndex = 0;
  private headOffset = 0;
  private pendingCharCount = 0;

  get charCount(): number {
    return this.pendingCharCount;
  }

  get hasPending(): boolean {
    return this.pendingCharCount > 0;
  }

  append(data: string): void {
    if (!data) {
      return;
    }

    this.chunks.push(data);
    this.pendingCharCount += data.length;
  }

  take(maxChars = XTERM_OUTPUT_WRITE_CHAR_LIMIT): string {
    if (!Number.isSafeInteger(maxChars) || maxChars <= 0 || !this.hasPending) {
      return '';
    }

    let remainingChars = maxChars;
    const output: string[] = [];

    while (remainingChars > 0 && this.headIndex < this.chunks.length) {
      const chunk = this.chunks[this.headIndex];
      if (chunk === undefined) {
        break;
      }

      const availableChars = chunk.length - this.headOffset;
      if (availableChars <= remainingChars) {
        output.push(this.headOffset === 0 ? chunk : chunk.slice(this.headOffset));
        this.pendingCharCount -= availableChars;
        this.headIndex += 1;
        this.headOffset = 0;
        remainingChars -= availableChars;

        const nextChunk = this.chunks[this.headIndex];
        if (
          remainingChars === 0 &&
          nextChunk !== undefined &&
          isHighSurrogate(chunk.charCodeAt(chunk.length - 1)) &&
          isLowSurrogate(nextChunk.charCodeAt(0))
        ) {
          output.push(nextChunk.slice(0, 1));
          this.pendingCharCount -= 1;
          if (nextChunk.length === 1) {
            this.headIndex += 1;
          } else {
            this.headOffset = 1;
          }
        }
        continue;
      }

      const chunkLength = getSafeChunkLength(chunk, this.headOffset, remainingChars);
      output.push(chunk.slice(this.headOffset, this.headOffset + chunkLength));
      this.headOffset += chunkLength;
      this.pendingCharCount -= chunkLength;
      remainingChars = 0;
    }

    this.compact();
    return output.join('');
  }

  clear(): void {
    this.chunks = [];
    this.headIndex = 0;
    this.headOffset = 0;
    this.pendingCharCount = 0;
  }

  private compact(): void {
    if (this.pendingCharCount === 0) {
      this.clear();
      return;
    }

    if (this.headIndex >= 64 && this.headIndex * 2 >= this.chunks.length) {
      this.chunks = this.chunks.slice(this.headIndex);
      this.headIndex = 0;
    }
  }
}
