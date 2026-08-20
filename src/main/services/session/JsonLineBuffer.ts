export const JSON_LINE_MAX_CHARS = 4 * 1024 * 1024;

export class JsonLineBufferOverflowError extends Error {
  constructor(maxChars: number) {
    super(`JSON line exceeds the ${maxChars}-character limit`);
    this.name = 'JsonLineBufferOverflowError';
  }
}

export class JsonLineBuffer {
  private pending = '';

  constructor(private readonly maxChars = JSON_LINE_MAX_CHARS) {
    if (!Number.isSafeInteger(maxChars) || maxChars <= 0) {
      throw new RangeError('JSON line maximum must be a positive safe integer');
    }
  }

  push(chunk: string): string[] {
    if (!chunk) {
      return [];
    }

    const combined = this.pending + chunk;
    const lines: string[] = [];
    let lineStart = 0;
    let lineEnd = combined.indexOf('\n');

    while (lineEnd >= 0) {
      const line = combined.slice(lineStart, lineEnd);
      if (line.length > this.maxChars) {
        this.reset();
        throw new JsonLineBufferOverflowError(this.maxChars);
      }
      lines.push(line);
      lineStart = lineEnd + 1;
      lineEnd = combined.indexOf('\n', lineStart);
    }

    this.pending = combined.slice(lineStart);
    if (this.pending.length > this.maxChars) {
      this.reset();
      throw new JsonLineBufferOverflowError(this.maxChars);
    }

    return lines;
  }

  reset(): void {
    this.pending = '';
  }
}
