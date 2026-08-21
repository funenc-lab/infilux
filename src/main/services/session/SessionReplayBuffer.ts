import { takeUtf16Tail } from '@shared/utils/utf16Tail';

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

    if (value.length >= this.maxCodeUnits) {
      this.replace(value);
      return;
    }

    this.chunks.push(value);
    this.retainedLength += value.length;
    this.trimToCapacity();
  }

  replace(value: string): void {
    this.chunks.length = 0;
    this.startChunkIndex = 0;
    this.startOffset = 0;

    const tail = takeUtf16Tail(value, this.maxCodeUnits);
    if (!tail) {
      this.retainedLength = 0;
      return;
    }

    this.chunks.push(tail);
    this.retainedLength = tail.length;
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

  private trimToCapacity(): void {
    const overflow = this.retainedLength - this.maxCodeUnits;
    if (overflow <= 0) {
      return;
    }

    const lastDiscardedCodeUnit = this.discard(overflow);
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
